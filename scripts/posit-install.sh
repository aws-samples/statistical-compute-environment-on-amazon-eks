#!/bin/bash

source "./scripts/utils.sh"
###
# Deployment script to be run post CDK install to configure the EKS cluster to run POSIT
# The script does the following:
# 1. Prep the cluster with namespaces and config
# 2. Install Traefik as the ingress proxy for access to the POSIT web interfaces
# 3. Setup the required PV's for the POSIT suite
# 4. Install and configure the workbench helm
# 5. Install and configure the package manager helm
# 6. Install and configure the connect helm
###

# ---- Functions
load_secrets() {
    local secret_name="$1"
    local secret_value=$(aws secretsmanager get-secret-value --secret-id $secret_name --query SecretString --output text)
    
    # Check if the command executed successfully
    if [ $? -eq 0 ]; then
        echo $secret_value
    else
        echo "Failed to retrieve secret value for $secret_name"
    fi
}

# Function to check the status of the load balancer
check_load_balancer_status() {
    lb_status=$(aws elbv2 describe-load-balancers --names 'posit-sce-alb' --query 'LoadBalancers[0].State.Code' --output text)
    
    # Check if the load balancer is active
    if [ "$lb_status" == "active" ]; then
        echo "Load balancer is active."
    else
        echo "Load balancer is not yet active. Waiting for it to become active..."
        sleep 20
        check_load_balancer_status
    fi
}

set_defaults() {
    export EKS_CLUSTER_NAME='REPLACE'
    export EFS_ID='REPLACE'
    export WORKBENCH_USER_STORAGE='100'
    export WORKBENCH_SHARED_STORAGE='500'
    export CONNECT_SHARED_STORAGE='250'
    export PACKMAN_SHARED_STORAGE='250'
}
configure_efs() {
  local access_point_name="$1"
  local path="$2"
  efs_info=$(aws efs describe-file-systems --file-system-id "$EFS_ID" 2>&1)
  
  if [ $? -eq 0 ]; then
      # Check if the access point already exists
      result=$(aws efs describe-access-points --file-system-id "$EFS_ID" \
              --query "AccessPoints[?Tags[?Key=='Name' && Value=='$access_point_name']].AccessPointId" \
              --output text)
      if [ -n "$result" ]; then
          echo "$result"
      else
          echo "Access point does not exist. Re-run CDK deploy."
          exit
      fi
  else
      # EFS filesystem does not exist
      echo "EFS filesystem $EFS_ID does not exist. Exiting..."
      exit
  fi
}


# 0. Setup local environment
BLUE="\e[34m"
NC="\e[0m"

set_defaults
export_env_from_file "./.env"
RDS_PARAMS=$(load_secrets $POSTGRES_SECRET)

# 1.1 Configure EKS Cluster
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Configuring the EKS cluster (Max. 10 seconds)${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"
if ! aws eks update-kubeconfig --name $EKS_CLUSTER_NAME; then exit; fi
envsubst < scripts/manifests/namespaces.yaml | kubectl apply -f -

# 1.2 Add helm repos
helm repo add rstudio https://helm.rstudio.com
helm repo add traefik https://traefik.github.io/charts
helm repo add eks https://aws.github.io/eks-charts
helm repo add autoscaler https://kubernetes.github.io/autoscaler

# 2. Install AWS LB Controller
# The helm install command automatically applies the CRDs, but helm upgrade doesn't.
kubectl apply -f https://raw.githubusercontent.com/aws/eks-charts/master/stable/aws-load-balancer-controller/crds/crds.yaml
envsubst < scripts/manifests/aws-lb-controller-sa.yaml | kubectl apply -f -
region=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[0].[RegionName]' --output text) 
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$EKS_CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=$region \
  --set vpcId=$VPC_ID

kubectl wait --namespace kube-system --for=condition=available deployment/aws-load-balancer-controller --timeout=1m
sleep 5

# 3. Install Proxy
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Installing Traefik Proxy (Max. 10 seconds)${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.0/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml

envsubst < scripts/manifests/traefik.yaml | kubectl apply -f -
kubectl wait --namespace traefik --for=condition=available deployment/traefik --timeout=1m

# 4. Create Ingress (creates LB)
envsubst < scripts/manifests/aws-lb-controller-ingress.yaml | kubectl apply -f -
check_load_balancer_status

export LB=$(kubectl get ingress traefik -n traefik -o json | jq -r ".status.loadBalancer.ingress[0].hostname")
if $domain; then
    export DOMAIN=$domain
else 
    export DOMAIN=$LB
fi

# 5. Setup POSIT PV's
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Configuring EFS and the Persistent Volumes (Max. 100 seconds)${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"

export efs_ap_workbench_shared=$(configure_efs Workbench_Shared "/workbench/shared")
export efs_ap_workbench_user=$(configure_efs Workbench_User "/workbench/user")
export efs_ap_connect=$(configure_efs Connect "/connect")
export efs_ap_packman=$(configure_efs Packman "/packman")

envsubst < ./scripts/manifests/posit-pv-workbench-shared.yaml | kubectl apply -n posit-workbench -f -
envsubst < ./scripts/manifests/posit-pv-workbench-user.yaml | kubectl apply  -n posit-workbench -f -
envsubst < ./scripts/manifests/posit-pv-connect.yaml | kubectl apply  -n posit-connect -f -
envsubst < ./scripts/manifests/posit-pv-packagemanager.yaml | kubectl apply  -n posit-packman -f -

#6. Prepping DB
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Preparing the DB (Max. 60 seconds) ${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"
kubectl config set-context --current --namespace=default
export POSTGRES_CONNECTION_URI=$(jq -r '"postgresql://\(.username)@\(.host):\(.port)/\(.dbname)?sslmode=allow"' <<< "$RDS_PARAMS")
export POSTGRES_PASSWORD=$(jq -r '.password' <<< "$RDS_PARAMS")
export PGUSER=$(jq -r '.username' <<< "$RDS_PARAMS")
export PGHOST=$(jq -r '.host' <<< "$RDS_PARAMS")
export PGDB=$(jq -r '.dbname' <<< "$RDS_PARAMS")

envsubst < ./scripts/manifests/cluster-psql.yaml | kubectl apply -f -
sleep 30
envsubst < ./scripts/manifests/cluster-psql.yaml | kubectl delete -f -


#6. Install Workbench
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Installing & configuring the Workbench helm chart (Max. 30 seconds) ${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"
kubectl config set-context --current --namespace=posit-workbench
envsubst < ./scripts/manifests/posit-helm-workbench.yaml | helm upgrade --install rstudio-workbench-prod rstudio/rstudio-workbench \
    --set license.key="${PWB_LICENSE}" \
    --set config.secret.'database\.conf'.password="${POSTGRES_PASSWORD}" \
    -f -

#7. Install Connect
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Installing & configuring the Connect helm chart (Max. 30 seconds) ${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"
kubectl config set-context --current --namespace=posit-connect
envsubst < ./scripts/manifests/posit-helm-connect.yaml | helm upgrade --install rstudio-connect-prod rstudio/rstudio-connect \
    --set license.key="${PCO_LICENSE}" \
    --set config.Postgres.Password="${POSTGRES_PASSWORD}" \
    -f -

#8. Install Packman
printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Installing & configuring the Package Manager helm chart (Max. 30 seconds) ${NC} \n"
printf "${BLUE}------------------------------------------------------${NC} \n"
kubectl config set-context --current --namespace=posit-packman

envsubst < ./scripts/manifests/posit-helm-packman.yaml | helm upgrade --install rstudio-pm-prod rstudio/rstudio-pm  \
    --set license.key="${PPM_LICENSE}" \
    --set config.Postgres.Password="${POSTGRES_PASSWORD}" \
    --set config.Postgres.UsageDataPassword="${POSTGRES_PASSWORD}" \
    -f -

#9. Create Ingress Routes
envsubst < ./scripts/manifests/posit-ingress-rules.yaml | kubectl apply -f -
envsubst < ./scripts/manifests/cluster-autoscaler.yaml | helm upgrade --install cluster-autoscaler autoscaler/cluster-autoscaler -n kube-system -f -

printf "${BLUE}------------------------------------------------------${NC} \n"
printf "${BLUE}Posit is sussesfully installed!${NC} \n"
printf "${BLUE}Access it via: http://${DOMAIN} ${NC} \n"
printf "${BLUE}------------------------------------------------------${NC}\n "

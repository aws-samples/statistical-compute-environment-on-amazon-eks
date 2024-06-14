#!/bin/bash

source "./scripts/utils.sh"

export_env_from_file "./.env"

if ! aws eks update-kubeconfig --name $EKS_CLUSTER_NAME; then exit; fi

#Uninstall POSIT
kubectl config set-context --current --namespace=posit-workbench
helm uninstall rstudio-workbench-prod
kubectl delete pvc --all 
kubectl delete pv efs-pv-workbench-shared
kubectl delete pv efs-pv-workbench-user
kubectl config set-context --current --namespace=posit-connect
helm uninstall rstudio-connect-prod
kubectl delete pvc --all 
kubectl delete pv efs-pv-connect
kubectl config set-context --current --namespace=posit-packman
helm uninstall rstudio-pm-prod
kubectl delete pvc --all 
kubectl delete pv efs-pv-packman

sleep 5

#Uninstall Traefik Proxy
kubectl config set-context --current --namespace=traefik
kubectl delete ingress traefik
kubectl delete service traefik
kubectl delete deployment traefik

sleep 2 

#Uninstall scaling and LB
kubectl config set-context --current --namespace=kube-system
helm uninstall cluster-autoscaler
helm uninstall aws-load-balancer-controller

#Clear namespaces
kubectl delete namespace posit-workbench
kubectl delete namespace posit-connect
kubectl delete namespace posit-packman
kubectl delete namespace traefik



#!/bin/bash

source "./scripts/utils.sh"

filter_outuput_and_set_env() {
    local output="$1"
    local output_key=$(echo "$output" | cut -d '=' -f 1)
    local output_value=$(echo "$output" | cut -d '=' -f 2)
    case "$output_key" in
        "EfsFileSystemId")
            echo "Updating EFS_ID in .env"
            update_env "EFS_ID" "$output_value"
            ;;
        "PostgresSecret")
            echo "Updating POSTGRES_SECRET in .env"
            update_env "POSTGRES_SECRET" "$output_value"
            ;;
        "PositSceClusterName")
            echo "Updating POSIT_SCE_CLUSTER_NAME in .env"
            update_env "EKS_CLUSTER_NAME" "$output_value"
            ;;
        "AlbControllerRoleArn")
            echo "Updating ALB_CONTROLLER_ROLE_ARN in .env"
            update_env "ALB_CONTROLLER_ROLE_ARN" "$output_value"
            ;;
        "VPCId")
            echo "Updating VPC_ID in .env"
            update_env "VPC_ID" "$output_value"
            ;;
        "AlbSg")
            echo "Updating LB_SG in .env"
            update_env "LB_SG" "$output_value"
            ;;
    esac
}

update_env() {
    local key=$1
    local value=$2
    local file_path="./.env"
    local escaped_value=$(echo "$value" | sed 's/[&/\]/\\&/g')

    # Determine if we are on macOS or not
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed_opt="-i ''"
    else
        sed_opt="-i"
    fi

    # Check if the key exists in the file
    if grep -q "^$key=" "$file_path"; then
        # Key exists, update it
        # Using eval to correctly handle the sed option variable
        eval "sed $sed_opt 's/^$key=.*/$key=$escaped_value/' \"$file_path\""
    else
        # Key does not exist, add it
        echo "$key=$value" >> "$file_path"
    fi
}

list_stack_outputs() {
    local main_stack_name=$1
    local nested_stacks
    local outputs
    local all_outputs=()

    # Get list of nested stacks
    nested_stacks=$(aws cloudformation describe-stack-resources --stack-name "$main_stack_name" --query 'StackResources[?ResourceType==`AWS::CloudFormation::Stack`].PhysicalResourceId' --output text)

    # Check if there are nested stacks
    if [ -z "$nested_stacks" ]; then
        echo "No nested stacks found."
        return 1
    fi

    # Loop through nested stacks
    for stack_id in $nested_stacks; do
        # Get parameters of each nested stack
        outputs=$(aws cloudformation describe-stacks --stack-name "$stack_id" --query 'Stacks[0].Outputs')

        if [ -z "$outputs" ] || [ "$outputs" == "null" ]; then
            continue
        fi

        # Loop through parameters and append to the array
        for output in $(echo "${outputs}" | jq -r '.[] | @base64'); do
            _jq() {
                echo ${output} | base64 --decode | jq -r ${1}
            }

            # Extract parameter key and value
            output_key=$(_jq '.OutputKey')
            output_value="$(_jq '.OutputValue')"

            # Append parameter to the array
            all_outputs+=("${output_key}=${output_value}")
        done
    done

    # Return the result set
    echo "${all_outputs[@]}"
}

update_env_from_stack_outputs(){
  local stack=$1
  echo "Reading stack outputs ..."
  outputs=$(list_stack_outputs $stack)
  if [ $? -eq 0 ]; then
    echo "Iterating over parameters:"
    for param in $outputs; do
        filter_outuput_and_set_env "$param" 
    done
  else
    echo "Error occurred." >&2
  fi
}

action=$1

# Read stack outputs and update .env file
update_env_from_stack_outputs $action
export_env_from_file "./.env"
# kubectl config
aws eks update-kubeconfig --name $EKS_CLUSTER_NAME

# Deploy metrics server
echo "Deploying Metrics Server"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Using the Amazon EC2 instance metadata server version 2 (IMDSv2)
echo "Enabling IMDSv2 for cluster nodes ..."
cluster_nodes=$(aws ec2 describe-instances \
--filter Name=tag-key,Values="aws:eks:cluster-name" Name=tag-value,Values="$EKS_CLUSTER_NAME" \
--query "Reservations[*].Instances[*].[InstanceId]" --output text)
for node in $cluster_nodes; do
  echo "Enabling IMDSv2 for $node"
  aws ec2 modify-instance-metadata-options \
  --instance-id $node \
  --http-put-response-hop-limit 2 \
  --http-tokens required \
  1>/dev/null 2>&1 
done
echo "IMDSv2 enabled for all nodes"

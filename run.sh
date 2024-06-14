#!/bin/bash

gather_parameters_deploy() {
    read -p "Deployment identifier [posit-sce]: " stack_name
    stack_name=${stack_name:-posit-sce}
    export ssl=false
    export domain=false
    echo "Do you want to use a custom domain name?"
    if read_yes_no; then
        read -p "What is the FQDN: " domain
        export domain=$domain
        echo "POSIT will be setup for usage with $domain"
        echo "Please follow the documentation in the README file to configure your own domain"
    else
        echo "Do you want to enable HTTPS with a generated SSL cert?"
        if read_yes_no; then
            export ssl=true
        fi
    fi
}


gather_parameters_destroy() {
    read -p "Deployment identifier [posit-sce]: " stack_name
    stack_name=${stack_name:-posit-sce}
}

read_yes_no() {
    local response
    while true; do
        read -p "Please enter y/n: " response
        case "$response" in
            [Yy]) return 0 ;;
            [Nn]) return 1 ;;
            *) echo "Invalid input. Please enter y or n." ;;
        esac
    done
}

welcome() {
  clear
  echo "    ____  ____  _____ __________                  ___ _       _______    ________ _______ "
  echo "   / __ \/ __ \/ ___//  _/_  __/  ____  ____     /   | |     / / ___/   / ____/ //_/ ___/ "
  echo "  / /_/ / / / /\__ \ / /  / /    / __ \/ __ \   / /| | | /| / /\__ \   / __/ / ,<  \__ \  "
  echo " / ____/ /_/ /___/ // /  / /    / /_/ / / / /  / ___ | |/ |/ /___/ /  / /___/ /| |___/ /  "
  echo "/_/    \____//____/___/ /_/     \____/_/ /_/  /_/  |_|__/|__//____/  /_____/_/ |_/____/   "
  echo "                                                                                          "
  echo "Welcome to the POSIT on AWS EKS installer!" 
  echo "Please follow the guided setup which will deploy the POSIT suite into AWS EKS."
  echo "References to any details can be found on the blogpost:"
  echo "https://blog.amazonaws.com/hcls/posit-on-aws-eks"
  echo " "
}

check_command() {
    local command_to_check="$1"

    if ! command -v "$command_to_check" &> /dev/null
    then
        echo "Error: $command_to_check is not installed." >&2
        exit 1
    fi
}

check_aws_authentication() {
    # Try to get the AWS identity information
    aws_identity=$(aws sts get-caller-identity --output text --query 'Account' 2>&1)
    current_region=$(aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]')
    if [[ $? -eq 0 ]]; then
        echo "AWS CLI is authenticated."
        echo "Account Number: $aws_identity"
        echo "The selected AWS Region is: $current_region"
    else
        echo "Error: AWS CLI is not authenticated or AWS STS service is not reachable." >&2
        echo "Details: $aws_identity"
        exit 1
    fi

    # Ask for user confirmation to proceed
    read -p "Do you want to proceed? (y/n) " -n 1 -r
    echo    # Move to a new line
    if [[ ! $REPLY =~ ^[Yy]$ ]]
    then
        echo "Exiting...."
        [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle both script and sourcing
    fi
    export AWS_REGION=$current_region
}

if [ $# -ne 1 ]; then
    echo "Usage: $0 [deploy|destroy]"
    exit 1
fi

if [ "$1" != "deploy" ] && [ "$1" != "destroy" ]; then
    echo "Invalid action. Usage: $0 [deploy|destroy]"
    exit 1
fi

# Set the action
action=$1
welcome
check_command "xargs"
check_command "kubectl"
check_command "aws"
check_command "helm"
check_command "envsubst"
check_command "jq"
check_command "cdk"

# Gather parameter information based on the action
if [ "$action" == "deploy" ]; then
    echo "You have chosen to deploy POSIT on AWS EKS."
    echo "This script will run through the following tasks to deploy the solution:"
    echo "1. Deploy all infrastructure using infrastructure as code with the AWS CDK"
    echo "2. Prep POSIT and AWS EKS install"
    echo "3. Configure POSIT and networking so its ready for use"
    echo " "
    gather_parameters_deploy
    check_aws_authentication
    echo " "
    #Deploy the CDK stack
    #Ensure the region is bootstrapped
    echo "[ ] 1.1 Bootstrapping AWS CDK... [Takes up to 3 min]"
    cdk bootstrap >> /dev/null
    echo "[ ] 1.2 Deploying infrastructure using AWS CDK... [Takes up to 30 min]"
    cdk deploy --require-approval never --context clusterName=$stack_name --context stackName=$stack_name
    echo "[ ] 2. Configuring POSIT and networking... [Takes up to 1 min]"
    source ./scripts/post-cdk-hook.sh $stack_name
    echo "[ ] 3. Deploying POSIT containers adn configuration [Takes up to 5 min]"
    source ./scripts/posit-install.sh
    echo "[ ] 4. Configure domain / SSL if needed [Takes up to 1 min]"
    if $ssl; then
      source ./scripts/cert-install.sh
    fi

elif [ "$action" == "destroy" ]; then
    echo "You have chosen to destroy your current installation of POSIT on AWS EKS."
    gather_parameters_destroy
    check_aws_authentication

    #Empty the kube resources.
    echo "[ ] 1. Cleaning out all EKS deployments... [Takes up to 1 min]"
    source ./scripts/kube-reset.sh

    echo "Please confirm you want to destroy the infrastructure, this is irreversible"
    if read_yes_no; then
        #Delete the CDK stack
        echo "[ ] 2. Destroying infrastructure using AWS CDK... [Takes up to 30 min]"
        cdk destroy --force --context stackName=$stack_name
    fi
fi

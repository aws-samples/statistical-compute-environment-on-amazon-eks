# POSIT SCE on AWS EKS

This repository provides a simple and automated way to install the POSIT toolchain on AWS EKS (Elastic Kubernetes Service) for SCE (Statistical Compute Environment). The solution includes a one-click deployment and destroy option, making it easy to set up and tear down the POSIT-SCE environment on AWS EKS for enterprise use.

## Features

- **One-Click Deploy**: Deploy the POSIT-SCE toolchain on AWS EKS with a single command.
- **One-Click Destroy**: Easily tear down the POSIT-SCE environment on AWS EKS with a single command.
- **Enterprise-Ready**: The solution is designed and configured for enterprise use, ensuring scalability, security, and compliance.
- **Automated Setup**: The deployment process automates the installation and configuration of the POSIT toolchain, saving time and reducing manual effort.
- **Customizable**: The solution can be customized to meet specific requirements, such as resource allocation, networking, and security settings.

## Prerequisites

Before deploying the POSIT-SCE on AWS EKS, ensure you have the following prerequisites:

- AWS Command Line Interface (CLI) installed and configured with appropriate permissions.
- AWS Cloud Development Kit (CDK) is installed 
- An AWS account with sufficient permissions to create and manage EKS clusters, EC2 instances, and related resources.
- Homebrew, Kubernetes CLI (KubeCTL), Helm and Node installed.
- [Windows Only] A installed and configured WSL (Windows Subversion Linux)

## Getting Started

1. Clone this repository
2. Install the required dependencies:

    ```bash
    # Install dependencies if applicable
    brew install node
    brew install awscli
    brew install aws-cdk
    brew install kubernetes-cli
    brew install helm
    
    #Install node modules
    npm install
   ```

   Be sure to authenticate the AWS CLI, please see [this link](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) for guidance. Make sure to note down the (or one of) the IAM Role ARN's the CLI has assumed or that the IAM user has been assigned. 
   This role is required in the setup to provide administrative rights to the current session for configuration of the Kubernetes cluster. 
   You can find out which user or role is assumed via the following command:
   ```
   aws sts get-caller-identity
   ```
   &nbsp;

3. Deploy the POSIT-SCE on AWS EKS:
    Configure the POSIT licenses, with your license keys
    You can reach out to POSIT team [here]((mailto:info@posit.co)).

    ```bash
    # Edit the .env file to include the license keys.
    PWB_LICENSE=xxx
    PCO_LICENSE=xxx
    PPM_LICENSE=xxx
    ```

   ```bash
   # One-click deploy command
   bash ./run.sh deploy
   ```

   Note: If you are running authenticated to the CLI using an assumed role - specify the ARN of the role that has been assumed where prompted to accept the role ARN.

   This script will run all required commands for the setup.
   The entire deployment is idem-potent and the initial configuration takes ~40 minutes.
   &nbsp;


### Destroy the POSIT-SCE environment:

   ```bash
   # One-click destroy command
   bash ./run.sh destroy
   ```

   This command will initially reset the EKS cluster and provide the option to also destroy the infrastructure stack. If you make changes to the infrastructure outside of the CDK stack you might get destroy errors as there are untracked dependencies.

## FAQ

How do I deploy the solution to a different AWS region
: Change the region by running the ```export AWS_REGION=xxx``` command before the deploy script. Replace xxx with your region like us-east-1 or eu-west-1. 

How can I make changes to the deployment
: All components of the solution are idempotent, meaning you can make a change to the CDK, install scripts and .env file and re-run the deploy script. As long as there are no breaking changes they will propagate to your deployment.

Will the solution auto-scale?
: Currently the EKS cluster will scale horizontally with M5.XLARGE and M5.8XLARGE instances using Cluster Autoscaler. You can change this in the CDK deployment code. 

Can I use my own domain name?
: Yes! The setup will ask you for the FQDN and configure posit accordingly. You will have to manually add the HTTPS listener to the Load Balancer as it requires your SSL certificate for SSL termination and configure your DNS settings to point to the LB.

Can I use my own domain name?
: Yes! The setup will ask you for the FQDN and configure posit accordingly. You will have to manually add the HTTPS listener to the Load Balancer as it requires your SSL certificate for SSL termination and configure your DNS settings to point to the LB.


## Support
For any issue/ support contact lind mainteners team.


## Known Issues
Currently you have to run the  bash ./run.sh deploy twice to get the Application Load Balancer deployed.


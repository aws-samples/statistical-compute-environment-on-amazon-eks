#!/bin/bash
source "./scripts/utils.sh"

# Define your domain
export_env_from_file "./.env"
if ! aws eks update-kubeconfig --name $EKS_CLUSTER_NAME; then exit; fi
export LB_NAME="${EKS_CLUSTER_NAME}-alb"

# Check if ACM certificate exists for the domain
certificate_arn=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" --output text)

if [ -n "$certificate_arn" ]; then
    echo "Certificate already exists for $DOMAIN with ARN: $certificate_arn"
else
    echo "Certificate doesn't exist for $DOMAIN. Generating one..."
    openssl genrsa -out "$LB_NAME.key" 2048
    openssl req -new -key "$LB_NAME.key" -out "$LB_NAME.csr" -subj "/CN=$DOMAIN"
    openssl x509 -req -days 365 -in "$LB_NAME.csr" -signkey "$LB_NAME.key" -out "$LB_NAME.crt"
    aws acm import-certificate --certificate fileb://"$LB_NAME.crt" --private-key fileb://"$LB_NAME.key"

    rm "$DOMAIN.key" "$DOMAIN.csr" "$DOMAIN.crt"
    echo "Certificate has been generated and added to ACM for $DOMAIN"
fi

#Get ALB from domain name
certificate_arn=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" --output text)
alb=$(aws elbv2 describe-load-balancers --names $LB_NAME --query 'LoadBalancers[0].LoadBalancerArn' --output text)

#Get data, copy HTTP Rule directly
https_listener=$(aws elbv2 describe-listeners --load-balancer-arn $alb --query "Listeners[?Protocol=='HTTPS'].ListenerArn" --output text)
http_listener=$(aws elbv2 describe-listeners --load-balancer-arn $alb --query "Listeners[?Protocol=='HTTP'].ListenerArn" --output text)
target_group=$(aws elbv2 describe-rules --listener-arn $http_listener --query "Rules[?Actions[?Type=='forward']]" --output json | jq ".[0].Actions[0].TargetGroupArn")


if [[ -n "$https_listener" ]]; then
    aws elbv2 delete-listener --listener-arn "$https_listener"
fi

echo "Creating listener"
aws elbv2 create-listener \
    --load-balancer-arn "$alb" \
    --protocol HTTPS \
    --port 443 \
    --ssl-policy ELBSecurityPolicy-2016-08 \
    --certificates CertificateArn="$certificate_arn" \
    --default-actions Type=fixed-response,FixedResponseConfig="{MessageBody='404 Not Found',StatusCode=404,ContentType='text/plain'}" \
    --query 'Listeners[0].ListenerArn' \
    --output text >> /dev/null
sleep 1
https_listener=$(aws elbv2 describe-listeners --load-balancer-arn $alb --query "Listeners[?Protocol=='HTTPS'].ListenerArn" --output text)
aws elbv2 create-rule \
    --listener-arn $https_listener \
    --priority 1 \
    --conditions Field=path-pattern,Values='/*' \
    --actions Type=forward,TargetGroupArn="$target_group" >> /dev/null
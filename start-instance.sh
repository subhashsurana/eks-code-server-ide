#!/bin/bash
set -e

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--stack-name STACK] [--app-name APP] [--env ENV]"
      echo "Environment variables can also be used: STACK_NAME, APP_NAME, ENV"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Set defaults from environment variables or use defaults
STACK_NAME=${STACK_NAME:-${1:-"EksCodeServerIdeStackV2"}}
APP_NAME=${APP_NAME:-"code-server-ide"}
ENV=${ENV:-"dev"}

# Get dynamic values
ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}
REGION=${AWS_DEFAULT_REGION:-$(aws configure get region)}

echo "Configuration:"
echo "  Stack Name: $STACK_NAME"
echo "  App Name: $APP_NAME"
echo "  Environment: $ENV"
echo "  Account ID: $ACCOUNT_ID"
echo "  Region: $REGION"
echo ""

echo "Getting instance ID..."
INSTANCE_ID=$(aws ssm get-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-id" --query 'Parameter.Value' --output text)
echo "Instance ID: $INSTANCE_ID"

echo "Checking current state..."
CURRENT_STATE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].State.Name' --output text)
echo "Current state: $CURRENT_STATE"

# Function to update CloudFront origin
update_cloudfront_origin() {
    echo "Getting current instance DNS..."
    INSTANCE_DNS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicDnsName' --output text)
    
    if [ "$INSTANCE_DNS" = "None" ] || [ -z "$INSTANCE_DNS" ]; then
        echo "Warning: Instance has no public DNS name"
        return 1
    fi
    
    echo "Instance DNS: $INSTANCE_DNS"
    
    echo "Getting CloudFront distribution ID..."
    DIST_ID=$(aws cloudformation describe-stack-resources --stack-name $STACK_NAME --query 'StackResources[?ResourceType==`AWS::CloudFront::Distribution`].PhysicalResourceId' --output text)
    
    if [ -z "$DIST_ID" ] || [ "$DIST_ID" = "None" ]; then
        echo "Warning: Could not get CloudFront distribution ID from stack resources"
        return 1
    fi
    
    echo "Distribution ID: $DIST_ID"
    
    echo "Getting current CloudFront origin..."
    CURRENT_ORIGIN=$(aws cloudfront get-distribution-config --id $DIST_ID --query 'DistributionConfig.Origins.Items[0].DomainName' --output text)
    echo "Current origin: $CURRENT_ORIGIN"
    
    if [ "$CURRENT_ORIGIN" = "$INSTANCE_DNS" ]; then
        echo "CloudFront origin is already up to date"
        return 0
    fi
    
    echo "Updating CloudFront origin from $CURRENT_ORIGIN to $INSTANCE_DNS..."
    
    # Get distribution config and ETag
    DIST_CONFIG=$(aws cloudfront get-distribution-config --id $DIST_ID)
    ETAG=$(echo $DIST_CONFIG | jq -r '.ETag')
    
    # Update the origin domain name
    UPDATED_CONFIG=$(echo $DIST_CONFIG | jq --arg dns "$INSTANCE_DNS" '.DistributionConfig.Origins.Items[0].DomainName = $dns | .DistributionConfig')
    
    # Update the distribution
    aws cloudfront update-distribution --id $DIST_ID --distribution-config "$UPDATED_CONFIG" --if-match $ETAG > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "CloudFront origin updated successfully"
        echo "Note: CloudFront changes may take 5-15 minutes to propagate"
    else
        echo "Failed to update CloudFront origin"
        return 1
    fi
}

if [ "$CURRENT_STATE" = "stopped" ]; then
    echo "Starting instance..."
    aws ec2 start-instances --instance-ids $INSTANCE_ID
    echo "Waiting for instance to be running..."
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID
    echo "Instance started successfully!"
    
    echo "Updating CloudFront origin with new instance DNS..."
    update_cloudfront_origin
    
    echo "Getting CloudFront URL..."
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text)
    echo "IDE URL: $CLOUDFRONT_URL"
    echo "Note: It may take 2-3 minutes for services to start after instance boot."
elif [ "$CURRENT_STATE" = "running" ]; then
    echo "Instance is already running!"
    echo "Checking if CloudFront origin needs updating..."
    update_cloudfront_origin
    
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text)
    echo "IDE URL: $CLOUDFRONT_URL"
else
    echo "Instance is in $CURRENT_STATE state. Please wait or check AWS console."
fi
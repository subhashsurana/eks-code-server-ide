# EKS Code-Server IDE - Key Commands Reference

## Environment Variables
```bash
# Set these for consistent usage across commands
export STACK_NAME="EksCodeServerIdeStackV2"
export AUTO_SHUTDOWN_STACK="EksCodeServerIdeAutoShutdownStack"
export APP_NAME="code-server-ide"
export ENV="dev"

# Dynamic values (fetched automatically)
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=$(aws configure get region)

# Or set manually if needed
# export ACCOUNT_ID="325635966203"
# export REGION="us-west-2"
```

## Deployment Commands

### Stack Deployment
```bash
# Deploy config stack
npm run deploy:config

# Deploy main IDE stack
npm run deploy:main

# Deploy auto-shutdown stack
npm run deploy:auto-shutdown

# Clear CDK context and redeploy
cdk context --clear && npm run deploy:main
```

### Stack Management
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].StackStatus'

# Get stack outputs
aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs'

# Destroy stacks (reverse order)
npm run destroy:auto-shutdown
cdk destroy $STACK_NAME
cdk --app 'npx ts-node --prefer-ts-exts bin/config-app.ts' destroy
```

## Instance Management

### Get Instance Information
```bash
# Get current instance ID from SSM
export INSTANCE_ID=$(aws ssm get-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-id" --query 'Parameter.Value' --output text)

# Check instance status
aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].{State:State.Name,PublicIP:PublicIpAddress,PublicDNS:PublicDnsName}' --output table

# Connect via SSM Session Manager
aws ssm start-session --target $INSTANCE_ID
```

### Start/Stop Instance
```bash
# Start stopped instance
aws ec2 start-instances --instance-ids $INSTANCE_ID

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Stop running instance
aws ec2 stop-instances --instance-ids $INSTANCE_ID

# Wait for instance to be stopped
aws ec2 wait instance-stopped --instance-ids $INSTANCE_ID

# Check instance state
aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].State.Name' --output text
```

### Service Status on Instance
```bash
# Check services via SSM
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" --parameters 'commands=["systemctl status code-server@ec2-user --no-pager", "systemctl status caddy --no-pager", "netstat -tlnp | grep -E \":(80|8889)\""]'

# Get command results (replace COMMAND_ID)
aws ssm get-command-invocation --command-id COMMAND_ID --instance-id $INSTANCE_ID --query 'StandardOutputContent' --output text
```

## Password Management

### Retrieve Password
```bash
# Get password from Secrets Manager
export SECRET_NAME="$STACK_NAME-password"
aws secretsmanager get-secret-value --secret-id $SECRET_NAME --query 'SecretString' --output text | jq -r '.password'

# Test secret access from instance
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" --parameters 'commands=["aws secretsmanager get-secret-value --secret-id '$SECRET_NAME' --query SecretString --output text | jq -r .password"]'
```

### Fix Password Configuration
```bash
# Reset code-server password (replace PASSWORD with actual password)
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" --parameters 'commands=["sudo -u ec2-user bash -c \"PASSWORD=YOUR_PASSWORD_HERE; SALT=\\$(openssl rand -hex 16); HASH=\\$(echo -n \\$PASSWORD | argon2 \\$SALT -l 32 -e); printf \\\"cert: false\\\\nauth: password\\\\nhashed-password: \\\\\\\"\\$HASH\\\\\\\"\\\\nbind-addr: 127.0.0.1:8889\\\\n\\\" > ~/.config/code-server/config.yaml\"", "systemctl restart code-server@ec2-user"]'
```

## Auto-Shutdown Troubleshooting

### Check Auto-Shutdown Status
```bash
# Get Lambda function name
export LAMBDA_NAME=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `AutoShutdown`)].FunctionName' --output text)

# Check Lambda configuration
aws lambda get-function-configuration --function-name $LAMBDA_NAME --query 'Environment.Variables'

# Check EventBridge rule
aws events list-rules --query 'Rules[?contains(Name, `AutoShutdown`)].{Name:Name,State:State,Schedule:ScheduleExpression}' --output table

# Get recent Lambda logs
export LOG_GROUP="/aws/lambda/$LAMBDA_NAME"
aws logs describe-log-streams --log-group-name $LOG_GROUP --order-by LastEventTime --descending --max-items 1 --query 'logStreams[0].logStreamName' --output text
```

### Manual Lambda Invocation
```bash
# Test auto-shutdown Lambda manually
aws lambda invoke --function-name $LAMBDA_NAME --payload '{}' /tmp/lambda-response.json && cat /tmp/lambda-response.json
```

## Parameter Store Management

### List All Parameters
```bash
# List all project parameters
aws ssm get-parameters-by-path --path "/$APP_NAME/$ACCOUNT_ID/$ENV" --recursive --query 'Parameters[].{Name:Name,Value:Value}' --output table

# Get specific parameter
aws ssm get-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-id" --query 'Parameter.Value' --output text
```

### Update Parameters
```bash
# Update instance volume size
aws ssm put-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-volume-size" --value "100" --overwrite

# Update instance type
aws ssm put-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-type" --value "t3.medium" --overwrite
```

## CDK Context Management

### Context Operations
```bash
# List cached context
cdk context --list

# Clear all context
cdk context --clear

# Remove specific context (replace with actual key)
cdk context --reset "ssm:account=$ACCOUNT_ID:parameterName=/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-id:region=$REGION"
```

## CloudFront Testing

### Test CloudFront URL
```bash
# Get CloudFront domain
export CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text | sed 's|https://||')

# Test CloudFront response
curl -I https://$CLOUDFRONT_DOMAIN

# Check CloudFront distribution
aws cloudfront get-distribution --id $(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?contains(OutputKey,`Distribution`)].OutputValue' --output text)
```

## Disk Space Management

### Check Disk Usage
```bash
# Check disk space on instance
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" --parameters 'commands=["df -h", "lsblk", "du -sh /home/ec2-user/*"]'
```

## Log Analysis

### Bootstrap Logs
```bash
# Check bootstrap log
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" --parameters 'commands=["tail -50 /var/log/bootstrap.log"]'

# Check code-server logs
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" --parameters 'commands=["journalctl -u code-server@ec2-user --no-pager -n 50"]'
```

### Lambda Logs
```bash
# Get Lambda bootstrap logs
aws logs filter-log-events --log-group-name "/aws/lambda/bootstrap-$STACK_NAME" --start-time $(date -d '1 hour ago' +%s)000

# Get auto-shutdown logs
aws logs filter-log-events --log-group-name $LOG_GROUP --start-time $(date -d '1 hour ago' +%s)000
```

## Development Commands

### Build and Test
```bash
# Build project
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Security scan
npm run security-scan

# Synthesize templates
npm run synth
```

### Validation
```bash
# Validate CDK templates
npm run validate

# Preview changes
cdk diff

# Check for drift
aws cloudformation detect-stack-drift --stack-name $STACK_NAME
```

## Quick Start Script

### Create instance start script
```bash
cat > start-instance.sh << 'EOF'
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

if [ "$CURRENT_STATE" = "stopped" ]; then
    echo "Starting instance..."
    aws ec2 start-instances --instance-ids $INSTANCE_ID
    echo "Waiting for instance to be running..."
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID
    echo "Instance started successfully!"
    
    echo "Getting CloudFront URL..."
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text)
    echo "IDE URL: $CLOUDFRONT_URL"
    echo "Note: It may take 2-3 minutes for services to start after instance boot."
elif [ "$CURRENT_STATE" = "running" ]; then
    echo "Instance is already running!"
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text)
    echo "IDE URL: $CLOUDFRONT_URL"
else
    echo "Instance is in $CURRENT_STATE state. Please wait or check AWS console."
fi
EOF

chmod +x start-instance.sh
```

## Quick Troubleshooting Script

### Create troubleshooting script
```bash
cat > troubleshoot.sh << 'EOF'
#!/bin/bash
set -e

# Set environment variables
export STACK_NAME="EksCodeServerIdeStackV2"
export ACCOUNT_ID="325635966203"
export REGION="us-west-2"
export APP_NAME="code-server-ide"
export ENV="dev"

echo "=== Stack Status ==="
aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].StackStatus'

echo "=== Instance Status ==="
INSTANCE_ID=$(aws ssm get-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-id" --query 'Parameter.Value' --output text)
aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].{State:State.Name,PublicDNS:PublicDnsName}'

echo "=== CloudFront URL ==="
aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text

echo "=== Password Secret ==="
SECRET_NAME="$STACK_NAME-password"
aws secretsmanager get-secret-value --secret-id $SECRET_NAME --query 'SecretString' --output text | jq -r '.password'

echo "=== Auto-Shutdown Status ==="
aws cloudformation describe-stacks --stack-name EksCodeServerIdeAutoShutdownStack --query 'Stacks[0].Outputs[?OutputKey==`AutoShutdownStatus`].OutputValue' --output text 2>/dev/null || echo "Auto-shutdown stack not deployed"
EOF

chmod +x troubleshoot.sh
```

## Usage

### Start Instance Script Options
```bash
# Use defaults (gets account/region dynamically)
./start-instance.sh

# Use environment variables
export STACK_NAME="MyCustomStack"
export APP_NAME="my-ide"
export ENV="prod"
./start-instance.sh

# Use command line arguments
./start-instance.sh --stack-name MyCustomStack --app-name my-ide --env prod

# Mix of environment variables and arguments (arguments override env vars)
export STACK_NAME="MyStack"
./start-instance.sh --env staging

# Get help
./start-instance.sh --help
```

### Other Usage
```bash
# Run troubleshooting script
./troubleshoot.sh

# Set environment variables for session
source <(cat << 'EOF'
export STACK_NAME="EksCodeServerIdeStackV2"
export APP_NAME="code-server-ide"
export ENV="dev"
# Account ID and region are fetched dynamically
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=$(aws configure get region)
export INSTANCE_ID=$(aws ssm get-parameter --name "/$APP_NAME/$ACCOUNT_ID/$ENV/compute/instance-id" --query 'Parameter.Value' --output text 2>/dev/null || echo "")
EOF
)

# Dynamic one-liner to start instance
aws ec2 start-instances --instance-ids $(aws ssm get-parameter --name "/code-server-ide/$(aws sts get-caller-identity --query Account --output text)/dev/compute/instance-id" --query 'Parameter.Value' --output text) && echo "Instance starting..."
```
```
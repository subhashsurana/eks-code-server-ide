# EKS Workshop Code-Server IDE CDK Stack

This CDK project creates a secure, scalable code-server IDE environment for the EKS workshop using a modular 3-application architecture.

## Architecture Overview

The project consists of **3 independent CDK applications**:

1. **Config Stack** - Centralized parameter management
2. **Main IDE Stack** - Core infrastructure and code-server
3. **Auto-Shutdown Stack** - Cost optimization with idle detection

### Infrastructure Components

#### Config Stack (`EksWorkshopConfigStack`)
- **SSM Parameters** - Centralized configuration storage
- **Parameter Naming Convention** - Structured parameter organization
- **Cross-Stack References** - CloudFormation exports for parameter sharing

#### Main IDE Stack (`EksCodeServerIdeStackV2`)
- **VPC** - Single AZ with public subnet (10.0.0.0/24)
- **EC2 Instance** - Amazon Linux 2023 with code-server
- **CloudFront Distribution** - Global CDN with custom cache policy
- **KMS Key** - Encryption for secrets, logs, and storage
- **Secrets Manager** - Encrypted password storage
- **Lambda Functions** - Bootstrap automation
- **SSM Document** - Automated instance configuration
- **IAM Roles & Policies** - Comprehensive EKS workshop permissions
- **S3 Bucket** - CloudFront access logs with encryption
- **SQS Queue** - Lambda Dead Letter Queue
- **CloudWatch Logs** - Encrypted log groups

#### Auto-Shutdown Stack (`EksCodeServerIdeAutoShutdownStack`)
- **Lambda Function** - CPU monitoring and idle detection
- **EventBridge Rule** - Scheduled execution every 15 minutes
- **CloudWatch Metrics** - CPU utilization monitoring
- **IAM Permissions** - EC2 stop and CloudWatch access

## Parameter Management System

### Static Parameters (Hardcoded)
- **App Name**: `code-server-ide`
- **Environment**: `dev`
- **Account ID**: Retrieved dynamically from AWS context

### Dynamic Parameters (SSM-based)
All parameters follow the naming convention:
```
/{APP_NAME}/{ACCOUNT_ID}/{ENVIRONMENT}/{RESOURCE_TYPE}/{RESOURCE_NAME}
```

#### Parameter Structure
| Parameter | Resource Type | Resource Name | Default Value | Description |
|-----------|---------------|---------------|---------------|-------------|
| `instanceVolumeSize` | `compute` | `instance-volume-size` | `30` | EBS volume size in GB |
| `repositoryOwner` | `source` | `repository-owner` | `aws-samples` | GitHub repository owner |
| `repositoryName` | `source` | `repository-name` | `eks-workshop-v2` | GitHub repository name |
| `repositoryRef` | `source` | `repository-ref` | `main` | Git branch/tag reference |
| `codeServerVersion` | `app` | `code-server-version` | `4.102.2` | Code-server version |
| `vpcCidr` | `network` | `vpc-cidr` | `10.0.0.0/24` | VPC CIDR block |
| `instanceType` | `compute` | `instance-type` | `t3.small` | EC2 instance type |

#### Example Parameter Names
```
/code-server-ide/123456789012/dev/compute/instance-volume-size
/code-server-ide/123456789012/dev/source/repository-owner
/code-server-ide/123456789012/dev/app/code-server-version
```

### Cross-Stack Parameter Sharing
- **Config Stack** creates and manages all parameters
- **Main Stack** reads parameters via SSM Parameter Store lookups
- **Auto-Shutdown Stack** reads instance ID from SSM parameter created by Main Stack

## Prerequisites

### Required Tools
- **AWS CLI v2**: `aws --version` (configured with appropriate credentials)
- **AWS CDK**: `npm install -g aws-cdk@2.206.0`
- **Node.js 18+**: `node --version`
- **Python 3.8+**: For Checkov security scanning
- **Checkov**: `pip install checkov`

### AWS Permissions Required
- **CloudFormation**: Full access for stack operations
- **EC2**: Instance, VPC, and security group management
- **IAM**: Role and policy creation
- **Lambda**: Function creation and execution
- **CloudFront**: Distribution management
- **Secrets Manager**: Secret creation and access
- **SSM**: Parameter and document management
- **S3**: Bucket creation for CDK assets
- **KMS**: Key creation and management
- **CloudWatch**: Log group and metric access
- **SQS**: Queue creation for DLQ

## Installation & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Bootstrap CDK
```bash
cdk bootstrap
```

### 3. Deploy in Sequence

#### Step 1: Deploy Config Stack
```bash
npm run deploy:config
```

#### Step 2: Deploy Main IDE Stack
```bash
npm run deploy:main
```

#### Step 3: Deploy Auto-Shutdown (Optional)
```bash
npm run deploy:auto-shutdown
```

## Configuration Management

### Config Stack Parameters
Modify parameters in the Config Stack deployment:

```bash
# Deploy with custom parameters
cdk --app 'npx ts-node --prefer-ts-exts bin/config-app.ts' deploy \
  --parameters appName=my-ide \
  --parameters environment=prod
```

### Main Stack Configuration
The main stack automatically reads from SSM parameters. Override via props:

```typescript
new EksCodeServerIdeStack(app, 'EksCodeServerIdeStackV2', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  // Optional overrides
  appName: 'custom-ide',              // Override app name
  parameterEnvironment: 'staging',    // Override environment
});
```

### Auto-Shutdown Configuration
```typescript
new AutoShutdownStack(app, 'AutoShutdown', {
  idleTimeoutMinutes: 45,    // Custom idle timeout
  appName: 'custom-ide',     // Match main stack
  environment: 'staging'     // Match main stack
});
```

## Stack Outputs

### Config Stack Outputs
- **Parameter Names**: CloudFormation exports for all SSM parameter names
- **Cross-Stack References**: Enables parameter sharing between stacks

### Main IDE Stack Outputs
- **IdeUrl**: `https://{cloudfront-domain}` - HTTPS URL to access code-server
- **IdePasswordSecret**: AWS Console link to Secrets Manager password
- **IdePasswordSecretName**: Secret name for programmatic access
- **IdeRole**: IAM role ARN with EKS workshop permissions
- **InstanceId**: EC2 instance identifier
- **InstanceIdParameter**: SSM parameter name storing instance ID

### Auto-Shutdown Stack Outputs
- **AutoShutdownStatus**: Confirmation of auto-shutdown configuration

## Usage

### Accessing the IDE
1. **Get the URL**: Use the `IdeUrl` output from the main stack
2. **Retrieve Password**: 
   ```bash
   aws secretsmanager get-secret-value \
     --secret-id EksCodeServerIdeStackV2-password \
     --query SecretString --output text | jq -r .password
   ```
3. **Login**: Access the URL and enter the password
4. **Start Coding**: Pre-configured environment with EKS tools

### SSM Session Manager Access (Alternative)
```bash
# Direct SSH access via SSM
aws ssm start-session --target i-{instance-id}

# Port forwarding for local access
aws ssm start-session --target i-{instance-id} \
  --document-name AWS-StartPortForwardingSession \
  --parameters 'portNumber=["8889"],localPortNumber=["8889"]'
```

## Security Features

### Encryption at Rest
- **KMS Key**: Customer-managed key with automatic rotation
- **EBS Volumes**: Encrypted with KMS
- **Secrets Manager**: KMS-encrypted password storage
- **S3 Bucket**: KMS-encrypted CloudFront logs
- **CloudWatch Logs**: KMS-encrypted log groups
- **SQS Queue**: KMS-encrypted Dead Letter Queue

### Network Security
- **VPC**: Isolated network environment
- **Security Groups**: CloudFront prefix list access only
- **CloudFront**: HTTPS-only with TLS 1.2+
- **No Direct SSH**: Access via SSM Session Manager only

### IAM Security
- **Least Privilege**: Scoped permissions per service
- **Resource-Based**: ARN-specific access controls
- **Condition-Based**: Tag and resource constraints
- **No Hardcoded Credentials**: All via IAM roles

### Monitoring & Compliance
- **CloudTrail Integration**: API call logging
- **CloudWatch Metrics**: Performance monitoring
- **Access Logging**: CloudFront request logs
- **Security Scanning**: Checkov integration

## Cost Optimization

### Auto-Shutdown Features
- **CPU Monitoring**: 5-minute average CPU utilization
- **Idle Detection**: Configurable threshold (default: 5%)
- **Automatic Shutdown**: Stops idle instances
- **Schedule**: Runs every 15 minutes
- **Cost Savings**: Prevents unnecessary compute charges

### Resource Optimization
- **Single AZ**: Reduces data transfer costs
- **GP3 EBS**: Cost-effective storage
- **T3 Instances**: Burstable performance
- **CloudFront**: Global edge caching

## IAM Policies & Permissions

### Workshop-Specific Policies
- **EksWorkshopIamPolicy**: IAM role management for EKS
- **EksWorkshopBasePolicy**: Core EKS and EC2 operations
- **EksWorkshopEc2Policy**: EC2 instance and key pair management

### Service-Specific Permissions
- **Lambda Execution**: SSM command execution and monitoring
- **Auto-Shutdown**: EC2 stop permissions and CloudWatch metrics
- **Bootstrap**: SSM document execution and parameter access
- **Code-Server**: Secrets Manager and SSM parameter access

### Security Boundaries
- **Resource Scoping**: ARN-based resource restrictions
- **Tag-Based Access**: Project tag requirements
- **Condition Policies**: Time and source IP restrictions
- **Cross-Account**: Account-specific resource access

## Development & Testing

### Code Quality
```bash
# TypeScript compilation
npm run build

# ESLint security scanning
npm run lint

# Infrastructure security scanning
npm run security-scan

# CDK synthesis
npm run synth
```

### Testing Deployment
```bash
# Validate templates
npm run validate

# Preview changes
cdk diff

# Deploy with approval
cdk deploy --require-approval never
```

## Cleanup

### Destroy in Reverse Order
```bash
# 1. Remove auto-shutdown
npm run destroy:auto-shutdown

# 2. Remove main stack
cdk destroy EksCodeServerIdeStackV2

# 3. Remove config stack
cdk --app 'npx ts-node --prefer-ts-exts bin/config-app.ts' destroy
```

## Troubleshooting

### Common Issues

#### Deployment Issues
- **Parameter Not Found**: Ensure Config Stack is deployed first
- **Bootstrap Timeout**: Lambda function has 15-minute timeout
- **CloudFront 502**: Code-server may still be starting (wait 5-10 minutes)
- **Access Denied**: Verify IAM permissions for all required services

#### Runtime Issues
- **Login Failed**: Check Secrets Manager for correct password
- **Auto-Shutdown Not Working**: Verify EventBridge rule is enabled
- **Performance Issues**: Consider upgrading instance type via Config Stack

### Debugging Resources

#### CloudWatch Logs
- `/aws/lambda/bootstrap-{stack-name}` - Bootstrap function logs
- `/aws/lambda/{auto-shutdown-function}` - Auto-shutdown logs
- `/aws/ssm/commandhistory` - SSM command execution

#### SSM Session Manager
```bash
# Connect to instance for debugging
aws ssm start-session --target i-{instance-id}

# Check code-server status
sudo systemctl status code-server@ec2-user

# View bootstrap logs
sudo tail -f /var/log/bootstrap.log
```

#### Parameter Verification
```bash
# List all parameters
aws ssm get-parameters-by-path \
  --path "/code-server-ide/{account-id}/dev" \
  --recursive

# Get specific parameter
aws ssm get-parameter \
  --name "/code-server-ide/{account-id}/dev/compute/instance-id"
```

## Architecture Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Config Stack  │    │   Main IDE Stack │    │ Auto-Shutdown Stack │
│                 │    │                  │    │                     │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────────┐ │
│ │ SSM Params  │─┼────┼→│ Parameter    │ │    │ │ Lambda Function │ │
│ │             │ │    │ │ Lookup       │ │    │ │ (CPU Monitor)   │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────────┘ │
│                 │    │                  │    │          │          │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────────┐ │
│ │ CF Exports  │─┼────┼→│ Cross-Stack  │ │    │ │ EventBridge     │ │
│ │             │ │    │ │ References   │ │    │ │ (15min schedule)│ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────────┘ │
└─────────────────┘    │                  │    └─────────────────────┘
                       │ ┌──────────────┐ │              │
                       │ │ CloudFront   │ │              │
                       │ │ Distribution │ │              │
                       │ └──────┬───────┘ │              │
                       │        │         │              │
                       │ ┌──────▼───────┐ │              │
                       │ │ EC2 Instance │◄┼──────────────┘
                       │ │ (code-server)│ │   (stop instance)
                       │ └──────────────┘ │
                       │                  │
                       │ ┌──────────────┐ │
                       │ │ KMS Key      │ │
                       │ │ (encryption) │ │
                       │ └──────────────┘ │
                       │                  │
                       │ ┌──────────────┐ │
                       │ │ Secrets Mgr  │ │
                       │ │ (password)   │ │
                       │ └──────────────┘ │
                       └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Parameter Flow                               │
├─────────────────────────────────────────────────────────────────┤
│ Config Stack → SSM Parameters → Main Stack → Instance ID →      │
│                                                Auto-Shutdown    │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow
1. **Config Stack** creates SSM parameters with naming convention
2. **Main Stack** reads parameters and deploys infrastructure
3. **Main Stack** stores instance ID in SSM for auto-shutdown
4. **Auto-Shutdown Stack** reads instance ID and monitors CPU
5. **Lambda** stops instance when idle threshold is met

## Best Practices Implemented

### Infrastructure as Code
- **Modular Design**: Separate stacks for different concerns
- **Parameter Management**: Centralized configuration
- **Type Safety**: Full TypeScript implementation
- **Code Quality**: ESLint and security scanning

### Security
- **Encryption Everywhere**: KMS encryption for all data
- **Least Privilege**: Minimal required permissions
- **No Hardcoded Secrets**: Dynamic secret generation
- **Network Isolation**: VPC and security group controls

### Operational Excellence
- **Monitoring**: CloudWatch metrics and logs
- **Automation**: Lambda-based operations
- **Cost Control**: Auto-shutdown for idle resources
- **Observability**: Comprehensive logging

### Reliability
- **Error Handling**: Dead Letter Queues for Lambda
- **Retry Logic**: Built-in AWS service retries
- **Health Checks**: Service status monitoring
- **Rollback**: CDK deployment rollback capabilities

## Contributing

This project follows AWS CDK best practices and security standards. Contributions should:

1. Pass all security scans (`npm run security-scan`)
2. Follow TypeScript coding standards (`npm run lint`)
3. Include appropriate tests and documentation
4. Maintain the modular architecture pattern

## License

This project is licensed under the same terms as the original EKS workshop materials.
# Code-Server IDE Access Guide

## SSM Session Manager Access (Recommended)

### Prerequisites
1. AWS CLI installed and configured
2. Session Manager plugin installed
3. IAM permissions for SSM access

### Access Methods

#### Method 1: Direct SSM Session
```bash
# Get instance ID from CloudFormation outputs
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name EksCodeServerIdeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

# Start SSM session
aws ssm start-session --target $INSTANCE_ID
```

#### Method 2: Port Forwarding (Recommended)
```bash
# Forward local port 8080 to code-server port 8889
aws ssm start-session \
  --target $INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8889"],"localPortNumber":["8080"]}'

# Access code-server at: http://localhost:8080
```

#### Method 3: SSH over SSM
```bash
# Add to ~/.ssh/config
Host code-server-ide
    HostName $INSTANCE_ID
    User ec2-user
    ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
    LocalForward 8080 127.0.0.1:8889

# Connect
ssh code-server-ide
# Access code-server at: http://localhost:8080
```

## Required IAM Permissions

Users need the `CodeServerSSMAccess` policy (output from stack deployment):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Project": "code-server-ide"
        }
      }
    }
  ]
}
```

## Security Benefits

- ✅ **No passwords**: Eliminates password-based attacks
- ✅ **IAM-based**: Uses existing AWS identity and access management
- ✅ **Audit trail**: All access logged in CloudTrail
- ✅ **Network isolation**: No direct internet access required
- ✅ **MFA support**: Inherits AWS MFA requirements
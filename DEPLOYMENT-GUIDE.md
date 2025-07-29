# Deployment Guide: GitHub OAuth Setup

## Option 1: Two-Phase Deployment (Recommended)

### Phase 1: Initial Deployment
```bash
# Deploy without OAuth to get CloudFront URL
npm run deploy:main
```

### Phase 2: Get CloudFront URL
```bash
# Get the actual CloudFront domain
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name EksCodeServerIdeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' \
  --output text)

echo "Your CloudFront URL: $CLOUDFRONT_URL"
```

### Phase 3: Create GitHub OAuth App
1. Go to: https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   ```
   Application name: Code-Server IDE
   Homepage URL: [YOUR_CLOUDFRONT_URL]
   Authorization callback URL: [YOUR_CLOUDFRONT_URL]/oauth/callback
   ```
4. Save Client ID and Client Secret

### Phase 4: Update Stack with OAuth
```bash
# Update stack with GitHub OAuth
cdk deploy EksCodeServerIdeStack \
  --parameters githubClientId=your_github_client_id \
  --parameters githubClientSecret=your_github_client_secret \
  --parameters enableGitHubOAuth=true
```

## Option 2: Placeholder URL (Quick Start)

### Step 1: Create GitHub OAuth App with Placeholder
```
Homepage URL: https://placeholder.example.com
Callback URL: https://placeholder.example.com/oauth/callback
```

### Step 2: Deploy with OAuth
```bash
cdk deploy EksCodeServerIdeStack \
  --parameters githubClientId=your_client_id \
  --parameters githubClientSecret=your_client_secret \
  --parameters enableGitHubOAuth=true
```

### Step 3: Update GitHub OAuth App
```bash
# Get actual CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name EksCodeServerIdeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' \
  --output text)

echo "Update GitHub OAuth app URLs to: $CLOUDFRONT_URL"
```

### Step 4: Manually Update GitHub OAuth App
Go back to GitHub OAuth app settings and update:
- Homepage URL: [ACTUAL_CLOUDFRONT_URL]
- Callback URL: [ACTUAL_CLOUDFRONT_URL]/oauth/callback

## Authentication Fallback

If GitHub OAuth fails, the system automatically falls back to password authentication:
- Password stored in AWS Secrets Manager
- Access via CloudFront with password prompt
- Or use SSM Session Manager for direct access

## Verification

Test your setup:
```bash
# Check if OAuth is configured
aws ssm get-parameter --name "/code-server-ide/oauth/github-client-id" --query 'Parameter.Value' --output text

# Access your IDE
echo "Visit: $(aws cloudformation describe-stacks --stack-name EksCodeServerIdeStack --query 'Stacks[0].Outputs[?OutputKey==`IdeUrl`].OutputValue' --output text)"
```
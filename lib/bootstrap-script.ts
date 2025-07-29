export interface BootstrapParams {
  environment: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryRef: string;
  resourcesPrecreated: string;
  analyticsEndpoint: string;
  codeServerVersion: string;
  distributionDomainName: string;
  secretId: string;
  region: string;
}

export class BootstrapScript {
  static generate(params: BootstrapParams): string {
    return `#!/bin/bash
set -e

# Logging setup
exec > >(tee -a /var/log/bootstrap.log)
exec 2>&1
echo "Bootstrap started at $(date)"
echo "Parameters: environment=${params.environment}, region=${params.region}"

# System packages installation
echo "Installing system packages..."
yum update -y
yum install -y git tar gzip vim nodejs npm make gcc g++ argon2 jq

# Environment setup
export environment="${params.environment}"
export AWS_REGION="${params.region}"
export REPOSITORY_OWNER="${params.repositoryOwner}"
export REPOSITORY_NAME="${params.repositoryName}"
export REPOSITORY_REF="${params.repositoryRef}"
export RESOURCES_PRECREATED="${params.resourcesPrecreated}"
export ANALYTICS_ENDPOINT="${params.analyticsEndpoint}"

# Load workshop environment
echo "Loading workshop environment..."
if ! source <(curl -fsSL https://raw.githubusercontent.com/${params.repositoryOwner}/${params.repositoryName}/${params.repositoryRef}/hack/lib/common-env.sh); then
  echo "Warning: Failed to load workshop environment, continuing..."
fi

# Install and configure Caddy reverse proxy
echo "Setting up Caddy reverse proxy..."
dnf copr enable -y @caddy/caddy epel-9-x86_64
dnf install -y caddy
systemctl enable --now caddy

# Configure Caddy for CloudFront
if [ -n "${params.distributionDomainName}" ] && [ "${params.distributionDomainName}" != "" ]; then
  CLOUDFRONT_DOMAIN="${params.distributionDomainName}"
else
  # Fallback: resolve domain at runtime if not provided
  echo "Resolving CloudFront domain from stack outputs..."
  CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks --stack-name "${params.environment}" --query 'Stacks[0].Outputs[?OutputKey==\`IdeUrl\`].OutputValue' --output text 2>/dev/null | sed 's|https://||' || echo "localhost")
fi

echo "Using CloudFront domain: $CLOUDFRONT_DOMAIN"

tee /etc/caddy/Caddyfile <<EOF
http://$CLOUDFRONT_DOMAIN {
  reverse_proxy 127.0.0.1:8889
}
EOF

systemctl restart caddy

# Custom shell prompt
tee /etc/profile.d/custom_prompt.sh <<EOF
#!/bin/sh
export PROMPT_COMMAND='export PS1="\\\\u:\\\\w:$ "'
EOF

# Install workshop tools
echo "Installing workshop tools..."
if ! curl -fsSL https://raw.githubusercontent.com/${params.repositoryOwner}/${params.repositoryName}/${params.repositoryRef}/lab/scripts/installer.sh | bash; then
  echo "Warning: Failed to install workshop tools, continuing..."
fi

# Configure code-server for ec2-user
cat <<'EOT' | sudo -E -H -u ec2-user bash
${this.getCodeServerSetup(params)}
EOT

# Restart code-server service
systemctl restart code-server@ec2-user

echo "Bootstrap completed successfully at $(date)!"
echo "Bootstrap log available at /var/log/bootstrap.log"`;
  }

  private static getCodeServerSetup(params: BootstrapParams): string {
    return `set -e

echo "Setting up code-server..."
mkdir -p ~/environment

# Install code-server if not present
codeServer=$(dnf list installed code-server 2>/dev/null | wc -l)
if [ "$codeServer" -eq "0" ]; then
  curl -Ls -o /tmp/coder.rpm https://github.com/coder/code-server/releases/download/v${params.codeServerVersion}/code-server-${params.codeServerVersion}-amd64.rpm
  sudo rpm -U "/tmp/coder.rpm"
  sudo systemctl enable --now code-server@ec2-user
fi

# Configure password authentication
echo "Configuring password authentication..."

PASSWORD_SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id "${params.secretId}" --query 'SecretString' --output text 2>/dev/null || echo '{"password":"workshop123"}')
IDE_PASSWORD=$(echo "$PASSWORD_SECRET_VALUE" | jq -r '.password')
RANDOM_SALT=$(openssl rand -hex 16)
HASHED_PASSWORD=$(echo -n "$IDE_PASSWORD" | argon2 "$RANDOM_SALT" -l 32 -e)

mkdir -p ~/.config/code-server
tee ~/.config/code-server/config.yaml <<EOF
cert: false
auth: password
hashed-password: "$HASHED_PASSWORD"
bind-addr: 127.0.0.1:8889
EOF

echo "✅ Password authentication configured"

# VS Code settings
mkdir -p ~/.local/share/code-server/User
tee ~/.local/share/code-server/User/settings.json <<EOF
{
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false,
  "security.workspace.trust.enabled": false,
  "task.allowAutomaticTasks": "on",
  "telemetry.telemetryLevel": "off",
  "workbench.startupEditor": "terminal"
}
EOF

# Workspace settings
mkdir -p ~/environment/.vscode
tee ~/environment/.vscode/settings.json <<EOF
{
  "files.exclude": {
    "**/.*": true
  }
}
EOF

# Set default workspace
echo '{ "query": { "folder": "/home/ec2-user/environment" } }' > ~/.local/share/code-server/coder.json

# Run workshop setup scripts
echo "Running workshop setup scripts..."
if ! curl -fsSL https://raw.githubusercontent.com/${params.repositoryOwner}/${params.repositoryName}/${params.repositoryRef}/lab/scripts/setup.sh | bash; then
  echo "Warning: Failed to run setup script, continuing..."
fi

if ! curl -fsSL https://raw.githubusercontent.com/${params.repositoryOwner}/${params.repositoryName}/${params.repositoryRef}/lab/scripts/banner.sh | bash; then
  echo "Warning: Failed to run banner script, continuing..."
fi

# Install VS Code extensions
echo "Installing VS Code extensions..."
if command -v code-server >/dev/null 2>&1; then
  code-server --install-extension ms-kubernetes-tools.vscode-kubernetes-tools --force || echo "Warning: Failed to install Kubernetes extension"
  code-server --install-extension redhat.vscode-yaml --force || echo "Warning: Failed to install YAML extension"
else
  echo "Warning: code-server not found, skipping extension installation"
fi

echo "Code-server setup completed!"`;
  }
}
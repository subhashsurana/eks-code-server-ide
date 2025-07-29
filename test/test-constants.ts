export const TEST_CONSTANTS = {
  ACCOUNT: '123456789012',
  APP_NAME: 'code-server-ide',
  ENVIRONMENT: 'dev',
  REGIONS: {
    US_EAST_1: 'us-east-1',
    US_WEST_2: 'us-west-2'
  },
  VPC: {
    CIDR: '10.0.0.0/24'
  },
  INSTANCE: {
    TYPE: 't3.small',
    VOLUME_SIZE: 30,
    VOLUME_TYPE: 'gp3'
  },
  CLOUDFRONT_PREFIX_LISTS: {
    'us-east-1': 'pl-3b927c52',
    'us-west-2': 'pl-82a045eb'
  },
  LAMBDA: {
    RUNTIME: 'python3.12',
    HANDLER: 'index.lambda_handler',
    TIMEOUT: 900,
    MEMORY_SIZE: 256
  },
  AUTO_SHUTDOWN_LAMBDA: {
    RUNTIME: 'python3.12',
    HANDLER: 'auto-shutdown-handler.lambda_handler',
    TIMEOUT: 300
  },
  SECRET: {
    EXCLUDE_CHARS: '"@/\'',
    PASSWORD_LENGTH: 32
  },
  CODE_SERVER: {
    VERSION: '4.102.2'
  },
  SSM_PARAMETERS: {
    INSTANCE_VOLUME_SIZE: '/code-server-ide/123456789012/dev/compute/instance-volume-size',
    REPOSITORY_OWNER: '/code-server-ide/123456789012/dev/git/repository-owner',
    CODE_SERVER_VERSION: '/code-server-ide/123456789012/dev/application/code-server-version',
    VPC_CIDR: '/code-server-ide/123456789012/dev/network/vpc-cidr',
    INSTANCE_TYPE: '/code-server-ide/123456789012/dev/compute/instance-type'
  }
};
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ConfigProvider } from './config-provider';
import { WorkshopPolicies } from './workshop-policies';
import { BootstrapScript } from './bootstrap-script';
import { ParameterNaming } from './parameter-naming';


export interface EksCodeServerIdeStackProps extends cdk.StackProps {
  instanceVolumeSize?: number;
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryRef?: string;
  resourcesPrecreated?: string;
  analyticsEndpoint?: string;
  codeServerVersion?: string;
  environment?: string;
  vpcCidr?: string;
  appName?: string;
  parameterEnvironment?: string;
}

export class EksCodeServerIdeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EksCodeServerIdeStackProps) {
    super(scope, id, props);



    // Get configuration from SSM parameters (deployed separately)
    const ssmConfig = ConfigProvider.getConfigFromSSM(this);
    const instanceVolumeSize = props.instanceVolumeSize ?? ssmConfig.instanceVolumeSize;
    const repositoryOwner = props.repositoryOwner ?? ssmConfig.repositoryOwner;
    const repositoryName = props.repositoryName ?? ssmConfig.repositoryName;
    const repositoryRef = props.repositoryRef ?? ssmConfig.repositoryRef;
    const resourcesPrecreated = props.resourcesPrecreated ?? 'false';
    const analyticsEndpoint = props.analyticsEndpoint ?? '';
    const codeServerVersion = props.codeServerVersion ?? ssmConfig.codeServerVersion;


    // CloudFront prefix list mapping
    const prefixListMapping: { [key: string]: string } = {
      'ap-northeast-1': 'pl-58a04531',
      'ap-northeast-2': 'pl-22a6434b',
      'ap-south-1': 'pl-9aa247f3',
      'ap-southeast-1': 'pl-31a34658',
      'ap-southeast-2': 'pl-b8a742d1',
      'ca-central-1': 'pl-38a64351',
      'eu-central-1': 'pl-a3a144ca',
      'eu-north-1': 'pl-fab65393',
      'eu-west-1': 'pl-4fa04526',
      'eu-west-2': 'pl-93a247fa',
      'eu-west-3': 'pl-75b1541c',
      'sa-east-1': 'pl-5da64334',
      'us-east-1': 'pl-3b927c52',
      'us-east-2': 'pl-b6a144df',
      'us-west-1': 'pl-4ea04527',
      'us-west-2': 'pl-82a045eb'
    };

    // VPC
    const vpc = new ec2.Vpc(this, 'VPC', {
      ipAddresses: ec2.IpAddresses.cidr(this.node.tryGetContext('vpcCidr')),
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    });

    // Main Security Group
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'SG for IDE',
      allowAllOutbound: true
    });

    // Separate CloudFront Security Group to avoid rule limits
    const cloudFrontSG = new ec2.SecurityGroup(this, 'CloudFrontSecurityGroup', {
      vpc,
      description: 'CloudFront access to code-server',
      allowAllOutbound: false
    });

    // Add CloudFront access rule to separate SG
    const prefixListId = prefixListMapping[this.region];
    if (prefixListId) {
      cloudFrontSG.addIngressRule(
        ec2.Peer.prefixList(prefixListId),
        ec2.Port.tcp(80),
        'Allow Caddy from CloudFront'
      );
    }

    // Get latest Amazon Linux 2023 AM
    const ami = ec2.MachineImage.fromSsmParameter(
      '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64'
    );



    // SSM access available via Session Manager (no additional setup needed)

    // KMS key for encryption
    const kmsKey = new kms.Key(this, 'EksWorkshopIdeKey', {
      description: 'KMS key for EKS Workshop IDE encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Add CloudWatch Logs permissions to KMS key
    kmsKey.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
        'kms:DescribeKey'
      ],
      resources: ['*'],
      conditions: {
        ArnEquals: {
          'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/bootstrap-${this.stackName}`
        }
      }
    }));

    // Password Secret for code-server authentication
    const idePassword = new secretsmanager.Secret(this, 'EksWorkshopIdePassword', {
      secretName: `${this.stackName}-password`,
      encryptionKey: kmsKey,
      generateSecretString: {
        excludeCharacters: '"@/\'',
        excludePunctuation: true,
        generateStringKey: 'password',
        includeSpace: false,
        passwordLength: 32,
        secretStringTemplate: '{"password":""}'
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // IAM Role for EC2 Instance
    const ideRole = new iam.Role(this, 'EksWorkshopIdeRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('ec2.amazonaws.com'),
        new iam.ServicePrincipal('ssm.amazonaws.com')
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ],
      inlinePolicies: {
        'ssm-access': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'secretsmanager:GetSecretValue'
              ],
              resources: [
                idePassword.secretArn
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Decrypt',
                'kms:DescribeKey'
              ],
              resources: [
                kmsKey.keyArn
              ]
            })
          ]
        })
      }
    });

    // Add comprehensive IAM policies for EKS workshop
    WorkshopPolicies.addToRole(this, ideRole, this.stackName, this.account);



    // No Lambda role needed - using User Data instead

    // EC2 Instance (created first)
    const instance = new ec2.Instance(this, 'EksWorkshopIdeInstance', {
      vpc,
      instanceType: new ec2.InstanceType(ssmConfig.instanceType),
      machineImage: ami,
      securityGroup,
      role: ideRole,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(instanceVolumeSize, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
            encrypted: true
          })
        }
      ]
    });

    // Add CloudFront security group to instance
    instance.addSecurityGroup(cloudFrontSG);

    // Add Project tag for SSM access control
    cdk.Tags.of(instance).add('Project', 'code-server-ide');

    // CloudFront Cache Policy
    new cloudfront.CachePolicy(this, 'EksWorkshopIdeCachePolicy', {
      cachePolicyName: this.stackName,
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(1),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'Accept-Charset', 'Authorization', 'Origin', 'Accept',
        'Referer', 'Host', 'Accept-Language', 'Accept-Encoding', 'Accept-Datetime'
      ),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: false
    });

    // CloudFront Distribution (created with placeholder origin)
    const distribution = new cloudfront.Distribution(this, 'EksWorkshopIdeCloudFrontDistribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin('placeholder.example.com', {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      httpVersion: cloudfront.HttpVersion.HTTP1_1,
      enabled: true,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableLogging: true,
      logBucket: new s3.Bucket(this, 'CloudFrontLogsBucket', {
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: kmsKey,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true
      }),
      logFilePrefix: 'cloudfront-logs/'
    });
    
    // CloudFront automatically depends on instance via instancePublicDnsName reference

    // Store instance ID in SSM for separate auto-shutdown stack
    const appName = props.appName ?? 'code-server-ide';
    const parameterEnvironment = props.parameterEnvironment ?? 'dev';
    const naming = new ParameterNaming(appName, this.account, parameterEnvironment);
    new ssm.StringParameter(this, 'InstanceIdSSMParameter', {
      parameterName: naming.generateParameterName('compute', 'instance-id'),
      stringValue: instance.instanceId,
      description: 'EC2 instance ID for auto-shutdown'
    });
    
    // Parameter automatically depends on instance via instanceId reference

    // Auto-shutdown removed to avoid circular dependency

    // Minimal User Data - only SSM agent setup
    instance.addUserData(
      '#!/bin/bash',
      'yum update -y',
      'yum install -y amazon-ssm-agent',
      'systemctl enable amazon-ssm-agent',
      'systemctl start amazon-ssm-agent'
    );

    // SSM Document for bootstrap
    const ssmDocument = new ssm.CfnDocument(this, 'EksWorkshopIdeSSMDocument', {
      documentType: 'Command',
      documentFormat: 'YAML',
      content: {
        schemaVersion: '2.2',
        description: 'Bootstrap IDE Instance',
        parameters: {
          CloudFrontDomain: {
            type: 'String',
            description: 'CloudFront distribution domain name',
            default: ''
          }
        },
        mainSteps: [
          {
            action: 'aws:runShellScript',
            name: 'EksWorkshopIdebootstrap',
            inputs: {
              runCommand: [
                BootstrapScript.generate({
                  environment: this.stackName,
                  repositoryOwner,
                  repositoryName,
                  repositoryRef,
                  resourcesPrecreated,
                  analyticsEndpoint,
                  codeServerVersion,
                  distributionDomainName: '{{ CloudFrontDomain }}',  // Use SSM parameter substitution
                  secretId: idePassword.secretName,
                  region: this.region
                })
              ]
            }
          }
        ]
      }
    });

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'EksWorkshopIdeLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        'lambda-policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ssm:SendCommand',
                'ssm:GetCommandInvocation',
                'ssm:DescribeInstanceInformation',
                'ec2:DescribeInstances'
              ],
              resources: [
                `arn:aws:ssm:${this.region}:${this.account}:document/*`,
                `arn:aws:ec2:${this.region}:${this.account}:instance/*`,
                `arn:aws:ssm:${this.region}:${this.account}:*`,
                '*'  // EC2 DescribeInstances requires wildcard
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudfront:UpdateDistribution',
                'cloudfront:GetDistribution',
                'cloudfront:GetDistributionConfig'
              ],
              resources: ['*']  // CloudFront requires wildcard for distribution operations
            })
          ]
        })
      }
    });

    // DLQ for Lambda function
    const dlq = new sqs.Queue(this, 'BootstrapLambdaDLQ', {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
      retentionPeriod: cdk.Duration.days(14)
    });

    // Bootstrap Lambda Function
    const bootstrapFunction = new lambda.Function(this, 'EksWorkshopIdeBootstrapInstanceLambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'bootstrap-handler.lambda_handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      code: lambda.Code.fromAsset('lib/lambda'),
      deadLetterQueue: dlq,
      logGroup: new logs.LogGroup(this, 'BootstrapLambdaLogGroup', {
        logGroupName: `/aws/lambda/bootstrap-${this.stackName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    // Custom Resource to trigger bootstrap AFTER all resources are created
    new cdk.CustomResource(this, 'EksWorkshopIdeBootstrapInstanceLambda', {
      serviceToken: bootstrapFunction.functionArn,
      properties: {
        InstanceId: instance.instanceId,
        DocumentName: ssmDocument.ref,
        CloudFrontDomain: distribution.distributionDomainName,
        CloudFrontDistributionId: distribution.distributionId,
        // Force re-run with KMS permissions fix
        Timestamp: Date.now().toString()
      }
    });
    
    // Dependencies automatically enforced by property references

    // Outputs
    new cdk.CfnOutput(this, 'IdeUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'URL to access the code-server IDE'
    });

    new cdk.CfnOutput(this, 'IdePasswordSecret', {
      value: `https://console.aws.amazon.com/secretsmanager/secret?name=${idePassword.secretName}`,
      description: 'Link to the password secret in AWS Console'
    });

    new cdk.CfnOutput(this, 'IdePasswordSecretName', {
      value: idePassword.secretName,
      description: 'Name of the password secret'
    });

    new cdk.CfnOutput(this, 'IdeRole', {
      value: ideRole.roleArn,
      description: 'ARN of the IDE instance role'
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID'
    });

    new cdk.CfnOutput(this, 'InstanceIdParameter', {
      value: naming.generateParameterName('compute', 'instance-id'),
      description: 'SSM Parameter name for Instance ID'
    });

  }
}

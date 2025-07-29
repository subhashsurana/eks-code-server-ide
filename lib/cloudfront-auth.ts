import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class CloudFrontAuth extends Construct {
  public readonly authFunction: lambda.Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Lambda@Edge function for authentication
    this.authFunction = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    
    // Check for AWS signature in headers (from AWS CLI/SDK)
    const authHeader = headers.authorization?.[0]?.value;
    const dateHeader = headers['x-amz-date']?.[0]?.value;
    
    if (!authHeader || !dateHeader) {
        return {
            status: '401',
            statusDescription: 'Unauthorized',
            body: 'AWS authentication required. Use: aws ssm start-session with port forwarding',
            headers: {
                'content-type': [{ key: 'Content-Type', value: 'text/plain' }]
            }
        };
    }
    
    // Allow request to proceed
    return request;
};
      `),
      description: 'CloudFront authentication for code-server'
    });
  }
}
"""
Lambda function to bootstrap EC2 instance via SSM
Handles CloudFormation custom resource lifecycle
"""
from __future__ import print_function
import boto3
import json
import os
import time
import traceback
import cfnresponse
import logging

logger = logging.getLogger(__name__)

def lambda_handler(event, context):
    """
    Main Lambda handler for EC2 instance bootstrapping
    
    Args:
        event: CloudFormation custom resource event
        context: Lambda execution context
    """
    print(f"Event: {json.dumps(event, default=str)}")
    print(f"Context: {context}")
    
    response_data = {}
    status = cfnresponse.SUCCESS
    
    try:
        if event['RequestType'] == 'Delete':
            # Handle stack deletion - respond immediately
            print('Handling DELETE request - responding immediately')
            response_data = {'Success': 'Custom Resource removed'}
            cfnresponse.send(event, context, cfnresponse.SUCCESS, response_data, 'CustomResourcePhysicalID')
            return
        
        # Extract parameters
        instance_id = event['ResourceProperties']['InstanceId']
        ssm_document = event['ResourceProperties']['DocumentName']
        cloudfront_domain = event['ResourceProperties'].get('CloudFrontDomain', '')
        cloudfront_distribution_id = event['ResourceProperties'].get('CloudFrontDistributionId', '')
        
        print(f"Request type: {event['RequestType']}")
        print(f"Instance ID: {instance_id}")
        print(f"SSM document: {ssm_document}")
        print(f"CloudFront domain: {cloudfront_domain}")
        print(f"CloudFront distribution ID: {cloudfront_distribution_id}")
        
        # Initialize clients
        ssm = boto3.client('ssm')
        ec2 = boto3.client('ec2')
        cloudfront = boto3.client('cloudfront')
        
        command_id = None
        
        # For CREATE requests, send SSM command and update CloudFront
        # For UPDATE requests, only update CloudFront (don't re-bootstrap)
        if event['RequestType'] == 'Create':
            # Wait for instance to be ready for SSM
            print('Waiting for instance to be ready for SSM...')
            max_retries = 30
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    # Check if instance is running and SSM agent is ready
                    instances = ssm.describe_instance_information(
                        Filters=[
                            {
                                'Key': 'InstanceIds',
                                'Values': [instance_id]
                            }
                        ]
                    )
                    
                    if instances['InstanceInformationList']:
                        print(f'Instance {instance_id} is ready for SSM')
                        break
                    else:
                        print(f'Instance {instance_id} not ready for SSM, waiting... (attempt {retry_count + 1}/{max_retries})')
                        time.sleep(10)
                        retry_count += 1
                        
                except Exception as wait_error:
                    print(f'Error checking SSM readiness: {wait_error}')
                    time.sleep(10)
                    retry_count += 1
            
            if retry_count >= max_retries:
                raise Exception(f'Instance {instance_id} did not become ready for SSM within {max_retries * 10} seconds')
            
            # Send SSM command to instance
            print('Sending SSM command...')
            command_params = {}
            if cloudfront_domain:
                command_params['CloudFrontDomain'] = [cloudfront_domain]
                
            response = ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName=ssm_document,
                Parameters=command_params
            )
            
            command_id = response['Command']['CommandId']
            print(f"Command ID: {command_id}")
            
            # Don't wait for command completion to avoid Lambda timeout
            # Bootstrap will continue in background
            print('SSM command sent successfully - bootstrap will continue in background')
            print(f'Monitor command execution with: aws ssm get-command-invocation --command-id {command_id} --instance-id {instance_id}')
        
        elif event['RequestType'] == 'Update':
            print('UPDATE request - skipping SSM command, only updating CloudFront')
        
        # Update CloudFront distribution origin
        print(f'CloudFront distribution ID check: {cloudfront_distribution_id}')
        if cloudfront_distribution_id:
            try:
                print(f'Updating CloudFront distribution {cloudfront_distribution_id} origin...')
                
                # Get instance public DNS name
                instance_info = ec2.describe_instances(InstanceIds=[instance_id])
                instance_dns = instance_info['Reservations'][0]['Instances'][0]['PublicDnsName']
                print(f'Instance public DNS: {instance_dns}')
                
                # Get current distribution config
                dist_config_response = cloudfront.get_distribution_config(Id=cloudfront_distribution_id)
                dist_config = dist_config_response['DistributionConfig']
                etag = dist_config_response['ETag']
                
                # Update the origin domain name and port
                dist_config['Origins']['Items'][0]['DomainName'] = instance_dns
                dist_config['Origins']['Items'][0]['CustomOriginConfig']['HTTPPort'] = 80
                
                # Update the distribution
                cloudfront.update_distribution(
                    Id=cloudfront_distribution_id,
                    DistributionConfig=dist_config,
                    IfMatch=etag
                )
                
                print(f'CloudFront distribution updated successfully. Origin changed to: {instance_dns}')
                
            except Exception as cf_error:
                print(f'Warning: Failed to update CloudFront distribution: {cf_error}')
                # Don't fail the entire operation if CloudFront update fails
        
        if event['RequestType'] == 'Create':
            response_data = {
                'Success': f'Bootstrap command sent to instance: {instance_id}',
                'CommandId': command_id,
                'Message': 'Bootstrap is running in background'
            }
        else:
            response_data = {
                'Success': f'CloudFront distribution updated for instance: {instance_id}',
                'Message': 'CloudFront origin updated'
            }
        
    except Exception as e:
        status = cfnresponse.FAILED
        error_message = str(e)
        print(f"Error: {error_message}")
        print(traceback.format_exc())
        response_data = {'Error': error_message}
    
    finally:
        cfnresponse.send(event, context, status, response_data, 'CustomResourcePhysicalID')
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
            # Handle stack deletion
            response_data = {'Success': 'Custom Resource removed'}
            cfnresponse.send(event, context, status, response_data, 'CustomResourcePhysicalID')
            return
        
        # Extract parameters
        instance_id = event['ResourceProperties']['InstanceId']
        ssm_document = event['ResourceProperties']['DocumentName']
        cloudfront_domain = event['ResourceProperties'].get('CloudFrontDomain', '')
        
        print(f"Bootstrapping instance: {instance_id}")
        print(f"Using SSM document: {ssm_document}")
        print(f"CloudFront domain: {cloudfront_domain}")
        
        # Initialize clients
        ssm = boto3.client('ssm')
        ec2 = boto3.client('ec2')
        
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
        
        # Wait for command completion
        waiter = ssm.get_waiter('command_executed')
        print('Waiting for command execution...')
        
        waiter.wait(
            CommandId=command_id,
            InstanceId=instance_id,
            WaiterConfig={
                'Delay': 10,        # Check every 10 seconds
                'MaxAttempts': 60   # Wait up to 10 minutes
            }
        )
        
        print('Bootstrap command completed successfully')
        response_data = {
            'Success': f'Bootstrapping completed for instance: {instance_id}',
            'CommandId': command_id
        }
        
    except Exception as e:
        status = cfnresponse.FAILED
        error_message = str(e)
        print(f"Error: {error_message}")
        print(traceback.format_exc())
        response_data = {'Error': error_message}
    
    finally:
        cfnresponse.send(event, context, status, response_data, 'CustomResourcePhysicalID')
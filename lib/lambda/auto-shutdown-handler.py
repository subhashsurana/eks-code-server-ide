"""
Lambda function to check instance idle status and shutdown if needed
Monitors CPU utilization via CloudWatch metrics
"""
import boto3
import json
import os
from datetime import datetime, timedelta

def lambda_handler(event, context):
    """
    Check instance CPU utilization and shutdown if idle
    
    Environment Variables:
        INSTANCE_ID: EC2 instance ID to monitor
        IDLE_TIMEOUT_MINUTES: Minutes of idle time before shutdown
    """
    ec2 = boto3.client('ec2')
    cloudwatch = boto3.client('cloudwatch')
    
    instance_id = os.environ['INSTANCE_ID']
    idle_threshold = int(os.environ.get('IDLE_TIMEOUT_MINUTES', '30'))
    
    print(f'Checking idle status for instance: {instance_id}')
    print(f'Idle threshold: {idle_threshold} minutes')
    
    # Check CPU utilization for the idle threshold period
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(minutes=idle_threshold)
    
    try:
        response = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=300,  # 5 minutes
            Statistics=['Average']
        )
        
        if not response['Datapoints']:
            print('No CPU metrics available - instance may be stopped or just started')
            return {'status': 'no_metrics', 'action': 'none'}
        
        # Calculate average CPU over the period
        avg_cpu = sum(point['Average'] for point in response['Datapoints']) / len(response['Datapoints'])
        
        print(f'Average CPU utilization over {idle_threshold} minutes: {avg_cpu:.2f}%')
        
        # Shutdown if idle (CPU < 5% for the duration)
        if avg_cpu < 5.0:
            print(f'Instance {instance_id} is idle (CPU: {avg_cpu:.2f}%). Shutting down...')
            
            ec2.stop_instances(InstanceIds=[instance_id])
            
            return {
                'status': 'shutdown',
                'cpu_average': round(avg_cpu, 2),
                'idle_threshold': idle_threshold,
                'action': 'stopped_instance'
            }
        else:
            print(f'Instance {instance_id} is active (CPU: {avg_cpu:.2f}%). No action needed.')
            
            return {
                'status': 'active',
                'cpu_average': round(avg_cpu, 2),
                'idle_threshold': idle_threshold,
                'action': 'none'
            }
            
    except Exception as e:
        print(f'Error checking instance status: {str(e)}')
        return {
            'status': 'error',
            'error': str(e),
            'action': 'none'
        }
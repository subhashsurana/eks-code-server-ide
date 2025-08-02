"""
CloudFormation custom resource response module
"""
import json
import urllib3

SUCCESS = "SUCCESS"
FAILED = "FAILED"

http = urllib3.PoolManager()

def send(event, context, responseStatus, responseData, physicalResourceId=None, noEcho=False, reason=None):
    """
    Send response to CloudFormation custom resource
    """
    responseUrl = event['ResponseURL']

    print(f"Sending response to CloudFormation: {responseStatus}")

    responseBody = {
        'Status' : responseStatus,
        'Reason' : reason or f"See CloudWatch Log Stream: {context.log_stream_name}",
        'PhysicalResourceId' : physicalResourceId or context.log_stream_name,
        'StackId' : event['StackId'],
        'RequestId' : event['RequestId'],
        'LogicalResourceId' : event['LogicalResourceId'],
        'NoEcho' : noEcho,
        'Data' : responseData
    }

    json_responseBody = json.dumps(responseBody)

    print(f"Response body: {json_responseBody}")

    headers = {
        'content-type' : '',
        'content-length' : str(len(json_responseBody))
    }

    try:
        response = http.request('PUT', responseUrl, headers=headers, body=json_responseBody)
        print(f"Status code: {response.status}")
    except Exception as e:
        print(f"send(..) failed executing http.request(..): {e}")
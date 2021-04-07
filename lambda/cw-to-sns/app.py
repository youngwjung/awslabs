import boto3
import gzip
import json
import base64
import os


def lambda_handler(event, context):
    cw_data = event['awslogs']['data']
    compressed_payload = base64.b64decode(cw_data)
    uncompressed_payload = gzip.decompress(compressed_payload)
    payload = json.loads(uncompressed_payload)

    log_events = payload['logEvents']

    sns = boto3.client('sns')
    for log_event in log_events:
        response = sns.publish(
            TopicArn=os.environ['SNS_ARN'],
            Message=json.dumps({'default': json.dumps(log_event)}),
            MessageStructure='json'
        )

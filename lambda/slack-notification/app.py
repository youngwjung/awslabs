import json
import logging
import os

from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    logger.info("Event: " + str(event))

    account_id = event['account']
    event_time= event['time']
    asg_name = event['detail']['AutoScalingGroupName']
    event_name = event['detail-type']
    status = event['detail']['StatusCode']
    cause = event['detail']['Cause']
    slack_message = {
        'channel': os.environ['SLACK_CHANNEL'],
        'text': f'Account: {account_id} \n Time: {event_time} \n AutoScalingGroup: {asg_name} \n Event: {event_name} \n Status: {status} \n Caused by: {cause}'
    }

    req = Request(os.environ['WEBHOOK_URL'], json.dumps(slack_message).encode('utf-8'))
    try:
        response = urlopen(req)
        response.read()
        logger.info("Message posted to %s", slack_message['channel'])
    except HTTPError as e:
        logger.error("Request failed: %d %s", e.code, e.reason)
    except URLError as e:
        logger.error("Server connection failed: %s", e.reason)
import urllib
import json
import sys
import boto3
from urllib.request import urlopen
from urllib.parse import quote_plus


def on_event(event, context):
    request_type = event['RequestType']
    if request_type == 'Create':
        return on_create(event)
    else:
        return True


def on_create(event):
    sts = boto3.client('sts')
    account_id = sts.get_caller_identity().get('Account')

    props = event['ResourceProperties']
    print(event)

    assumed_role_object = sts.assume_role(
        RoleArn=f"arn:aws:iam::{account_id}:role/{props['RoleName']}",
        RoleSessionName=props['RoleSessionName'],
    )
    print(assumed_role_object)

    url_credentials = {}
    url_credentials['sessionId'] = assumed_role_object.get(
        'Credentials').get('AccessKeyId')
    url_credentials['sessionKey'] = assumed_role_object.get(
        'Credentials').get('SecretAccessKey')
    url_credentials['sessionToken'] = assumed_role_object.get(
        'Credentials').get('SessionToken')
    json_string_with_temp_credentials = json.dumps(url_credentials)

    request_parameters = "?Action=getSigninToken"
    request_parameters += "&Session=" + \
        quote_plus(json_string_with_temp_credentials)
    request_url = "https://signin.aws.amazon.com/federation" + request_parameters
    print(request_url)
    r = urlopen(request_url)
    signin_token = json.loads(r.read())

    request_parameters = "?Action=login"
    request_parameters += "&Issuer=awscloud.work"
    request_parameters += "&Destination=" + \
        quote_plus("https://console.aws.amazon.com/")
    request_parameters += "&SigninToken=" + signin_token["SigninToken"]
    request_url = "https://signin.aws.amazon.com/federation" + request_parameters

    return {"Data": {"SignInURL": request_url}}

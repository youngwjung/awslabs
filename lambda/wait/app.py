import time


def on_event(event, context):
    request_type = event['RequestType']
    if request_type == 'Create':
        return on_create(event)
    else:
        return True


def on_create(event):
    props = event['ResourceProperties']

    time.sleep(int(props['time']))

    return True

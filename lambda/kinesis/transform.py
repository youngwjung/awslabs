import base64
import json
print('Loading function')


def lambda_handler(event, context):
    output = []
    for record in event['records']:
        print(record['recordId'])
        payload = base64.b64decode(record['data']).decode('utf-8')
        reading = json.loads(payload)
        # Add additional column source
        reading['source'] = 'NYCTAXI'
        # Do custom processing on the payload here
        output_record = {
            'recordId': record['recordId'],
            'result': 'Ok',
            # 'data': base64.b64encode(payload.encode('utf-8')
            'data': base64.b64encode(json.dumps(reading).encode('UTF-8'))
        }
        output.append(output_record)
        print('Successfully processed {} records.'.format(
            len(event['records'])))
        return {'records': output}

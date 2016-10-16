import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

EXTERNAL_ROUTER = env['EXTERNAL_ROUTER']
EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s' % (EXTERNAL_SCHEME, EXTERNAL_ROUTER)

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

if 'APIGEE_TOKEN1' in env:
    TOKEN1 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN1 = f.read()
claims = json.loads(b64_decode(TOKEN1.split('.')[1]))
USER1 = claims['iss'] + '#' + claims['sub']

if 'APIGEE_TOKEN2' in env:
    TOKEN2 = env['APIGEE_TOKEN2']
else:
    with open('token2.txt') as f:
        TOKEN2 = f.read()
claims = json.loads(b64_decode(TOKEN2.split('.')[1]))
USER2 = claims['iss'] + '#' + claims['sub']

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
claims = json.loads(b64_decode(TOKEN3.split('.')[1]))
USER3 = claims['iss'] + '#' + claims['sub']

def main():
    
    # GET customer by name

    customer_url = urljoin(BASE_URL, '/customers;acme')
    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(customer_url, headers=headers)
    if r.status_code == 200:
        customer = r.json()
        customer_url2 = r.headers['Content-Location']
        print 'correctly retrieved customer: %s etag: %s' % (customer_url2, r.headers['etag'])
    else:
        print 'failed to retrieve customer %s %s %s' % (customer_url, r.status_code, r.text)
        return

    # POST DQS

    dqs = {
        'isA': 'DQS',
        'name': 'acme_prod_dqs',
        'customer': customer_url2
    }

    dqss_url = urljoin(BASE_URL, '/dqss') 

    headers = {'Content-Type': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(dqss_url, headers=headers, json=dqs)
    if r.status_code == 201:
        print 'correctly created DQS %s ' % (r.headers['Location'])
        acme_prod_dqs_url = urljoin(BASE_URL, r.headers['Location'])
    else:
        print 'failed to create DQS %s %s %s' % (dqss_url, r.status_code, r.text)
        return
    return

    # GET DQS

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(acme_prod_dqs_url, headers=headers)
    if r.status_code == 200:
        acme_prod_dqs_url2 = urljoin(BASE_URL, r.headers['Content-Location'])
        if acme_prod_dqs_url == acme_prod_dqs_url2:
            dqs = r.json()
            print 'correctly retrieved DQS: %s etag: %s' % (acme_prod_dqs_url, r.headers['etag'])
        else:
            print 'retrieved DQS at %s but Content-Location is wrong: %s' % (acme_prod_dqs_url, acme_prod_dqs_url2)
            return
    else:
        print 'failed to retrieve DQS %s %s %s' % (acme_prod_dqs_url, r.status_code, r.text)
        return
        
if __name__ == '__main__':
    main()
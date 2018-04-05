from flask import Flask, request, Response
import configparser
import json
import sys, os

from dispatcher import *
from protocols.rpc_protocols import *
from protocols.messages import *


app = Flask(__name__)
config = configparser.ConfigParser()
config.read('config.ini')

AMQP_Auth_Queue = config['AUTH']['AMQP_Queue']
AMQP_Tweet_Queue = config['TWEET']['AMQP_Queue']




# Check whether the JWT Token is valid.
def check_login(req):
    jwt_token = req.cookies.get('user-jwt')
    if not jwt_token:
        return (False, )
    dispatcher = RPCDispatcher()
    req = json.dumps({
        'action': RPC_Auth_Action.VALIDATE_JWT.name,
        'payload': {
            "jwt": jwt_token
        }, 
    })
    res = dispatcher.call(AMQP_Auth_Queue, req)
    res_format = json.loads(res)
    if res_format['status'] == STATUS_OK:
        return (True, res_format['payload']['username'])
    return (False, )


@app.route('/', methods=['GET'])
def hello():
    return 'Hello World!'


@app.route('/adduser', methods=['POST'])
def register():
    input_data = request.get_json()
    dispatcher = RPCDispatcher()
    req = json.dumps({
        'action': RPC_Auth_Action.REGISTER.name,
        'payload': input_data
    })
    res = dispatcher.call(AMQP_Auth_Queue, req)
    return Response(res, mimetype='application/json')


@app.route('/login', methods=['POST'])
def login():
    input_data = request.get_json()
    dispatcher = RPCDispatcher()
    req = json.dumps({
        'action': RPC_Auth_Action.LOG_IN.name,
        'payload': input_data,
    })
    res = dispatcher.call(AMQP_Auth_Queue, req)
    r = Response(res, mimetype='application/json')
    # Login Succeeded.
    res_dict = json.loads(str(res))
    if res_dict['status'] == STATUS_OK:
        r.set_cookie('user-jwt', res_dict['payload']['jwt'])
    return r


@app.route('/logout', methods=['POST'])
def logout():
    jwt = request.cookies.get('user-jwt')
    if jwt:
        r = Response(generate_message(STATUS_OK, SUCCESS_LOGOUT_MESSAGE))
        r.set_cookie('user-jwt', expires=0)
    else:
        r = Response(generate_message(STATUS_ERROR, ERROR_LOGOUT_NOT_YET_LOGIN_MESSAGE))
    return r


@app.route('/verify', methods=['POST'])
def verify():
    input_data = request.get_json()
    dispatcher = RPCDispatcher()
    req = json.dumps({
        'action': RPC_Auth_Action.VALIDATE.name,
        'payload': input_data
    })
    res = dispatcher.call(AMQP_Auth_Queue, req)
    return Response(res, mimetype='application/json')


@app.route('/additem', methods=['POST'])
def add_item():
    cookie = check_login(request)
    print(cookie)
    if cookie[0]:
        input_data = request.get_json()
        dispatcher = RPCDispatcher()
        req = json.dumps({
            'action': RPC_Witter_Action.ADD_ITEM.name,
            'payload': {
                'username': cookie[1],
                'content': input_data['content'],
                #'childType': input_data['childType']
            }
        })
        res = json.dumps(dispatcher.call(AMQP_Tweet_Queue, req))
        res_format = json.loads(res)
        return Response(res_format, mimetype='application/json')
    else:
        r = Response(generate_message(STATUS_ERROR, ERROR_POST_NO_USER))
    return r


@app.route('/item/<id>', methods=['GET'])
def get_item(id):
    tweet_id = id
    dispatcher = RPCDispatcher()
    req = json.dumps({
        'action': RPC_Witter_Action.GET_ITEM.name,
        'payload': {
            'id': tweet_id
        }
    })
    res = json.dumps(dispatcher.call(AMQP_Tweet_Queue, req))
    res_format = json.loads(res)
    return Response(res_format, mimetype='application/json')


@app.route('/search', methods=['POST'])
def search():
    input_data = request.get_json()
    dispatcher = RPCDispatcher()
    req = json.dumps({
        'action': RPC_Witter_Action.SEARCH.name,
        'payload': input_data
    })
    res = json.dumps(dispatcher.call(AMQP_Tweet_Queue, req))
    res_format = json.loads(res)
    return Response(res_format, mimetype='application/json')


if __name__ == "__main__":
    # Only for debugging while developing
    app.run(host='0.0.0.0', debug=True, port=80)
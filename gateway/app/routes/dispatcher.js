var amqp = require('amqplib/callback_api');

const AMQP_HOST = require('../config').amqp.AMQP_Host;
const AMQP_EXCHANGE = require('../config').amqp.AMQP_Exchange;
const AMQP_EXCHANGE_MODE = require('../config').amqp.AMQP_Exchange_Type;

var connection = null;

function startConnection(callback) {
    console.log('AMQP check: ' + amqp);
    console.log('AMQP_HOST check: ' + AMQP_HOST);
    console.log('connection check: ' + connection);

    amqp.connect(AMQP_HOST, function(err, conn) {
        if(err) {
            console.log('[AMQP Error] ' + err);
            return setTimeout(startConnection, 500);
        }

        console.log('[x] AMQP connection established.');
        
        //outdated function?
        conn.on('error', function(err) {
            if (err.message !== 'Connection closing') {
                console.error('[AMQP] Connection error', err.message);
            }
        });
        conn.on('close', function() {
            console.error('[AMQP] Reconnecting...');
            return setTimeout(startConnection, 100);
        });

        connection = conn;
        callback();
    });
}

function startChannel(service, payload, callback) {
    connection.createConfirmChannel(function(err, ch) {
        if(err) {
            console.log('[AMQP Error] ' + err);
            return setTimeout(startConnection, 100);
        }

        ch.consume('amq.rabbitmq.reply-to', function(msg) {
            console.log(' [.] Received %s', msg.content.toString());
            callback(msg.content.toString());
            ch.close();
        }, {noAck: false});
        
        ch.publish('', service, new Buffer(payload),
            {replyTo: 'amq.rabbitmq.reply-to', persistent: true});
    });
}

exports.dispatch = function(service, payload, callback) {
    if(connection == null) {
        startConnection(function() {
            startChannel(service, payload, callback);
        });
    }
    else {
        startChannel(service, payload, callback);
    }
}
const amqp = require('amqplib/callback_api');
const action = require('./worker');
const utils = require('./protocols/utils');

const AMQP_HOST = require('./config').amqp.AMQP_Host;
const AMQP_EXCHANGE = require('./config').amqp.AMQP_Exchange;
const AMQP_EXCHANGE_TYPE = require('./config').amqp.AMQP_Exchange_Type;
const AMQP_TWEET_QUEUE = require('./config').tweet.AMQP_Queue;
const TWEET_ACTION = require('./protocols/rpc_protocols').RPC_Tweet_Action;

const STATUS_OK = 'OK';
const STATUS_ERROR = 'error';

amqp.connect(AMQP_HOST, function(err, conn) {
    conn.createChannel(function(err, ch) {
        ch.assertExchange(AMQP_EXCHANGE, AMQP_EXCHANGE_TYPE, {durable: true});
        ch.assertQueue('', {durable: true, exclusive: false}, function(err, q) {

            ch.bindQueue(q.queue, AMQP_EXCHANGE, AMQP_TWEET_QUEUE);
            ch.prefetch(5);

            ch.consume(q.queue, function(msg) {
                var request = JSON.parse(msg.content.toString('utf8'));
                console.log(' [x] Received request: "%s"', JSON.stringify(request));
                
                sendTask(request, function(response) {
                    ch.sendToQueue(msg.properties.replyTo, new Buffer(response.toString()));
                }); 
                ch.ack(msg);
            });
        });
    });
});


function sendTask(req, callback) {
    switch(req.action) {
        case TWEET_ACTION.ADD_TWEET:
            action.addTweet(req.payload).then(callback);
            break;

        case TWEET_ACTION.GET_TWEET:
            action.getTweet(req.payload).then(callback);
            break;

        case TWEET_ACTION.DELETE_TWEET:
            action.deleteTweet(req.payload).then(callback);
            break;

        case TWEET_ACTION.LIKE_TWEET:
            action.likeTweet(req.payload).then(callback);
            break;

        case TWEET_ACTION.SEARCH:
            action.search(req.payload).then(callback);
            break;

        default:
            callback(utils.generateMessage(STATUS_ERROR, 'Action invalid'));
    }
}
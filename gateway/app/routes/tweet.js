const uuidv4 = require('uuid/v4');
var Memcached = require('memcached');
const utils = require('../protocols/utils');
const dispatcher = require('./dispatcher');
const auth = require('./auth');
const media = require('./media');

const AMQP_TWEET_QUEUE = require('../config').tweet.AMQP_Queue;
const RPC_TWEET_ACTION = require('../protocols/rpc_protocols').RPC_Tweet_Action;
const MCD_HOST = require('../config').memcached.Mcd_Host;
const SEARCH_LIMIT_DEFAULT = require('../config').tweet.Search_Limit_Default;
const SEARCH_LIMIT_MAX = require('../config').tweet.Search_Limit_Max;
const ERROR_NOT_YET_LOGIN_MESSAGE = require('../protocols/messages').ERROR_NOT_YET_LOGIN_MESSAGE;

const STATUS_OK = 'OK';
const STATUS_ERROR = 'error';

var mcd_options = {retries: 10, retry: 10000, poolSize: 50};
var memcached = new Memcached(MCD_HOST, mcd_options);


exports.post = function(req, res) {
    var counterLabel = uuidv4();
    console.time('ADD_TWEET' + ' - ' + counterLabel);

    var cookie = auth.checkLogin(req);
    if(cookie[0]) {
        var tweetId = uuidv4();
        var msg = {
            'action': RPC_TWEET_ACTION.ADD_TWEET,
            'payload': {
                'id': tweetId,
                'username': cookie[1],
                'content': req.body.content,
                'childType': req.body.childType,
                'parent': req.body.parent,
                'media': req.body.media == null ? [] : req.body.media
            }
        };
        dispatcher.dispatch(AMQP_TWEET_QUEUE, JSON.stringify(msg), (response) => {
            response = JSON.parse(response);
            memcached.add(utils.MCDtweetKey(response.item.id), response, 3600, function(err) {
                if(err) {
                    console.error('[Cache] Cache error:', err.message);
                }
                console.timeEnd('ADD_TWEET' + ' - ' + counterLabel);
            });
        });
        res.json({
            'status': STATUS_OK,
            'id': tweetId
        });
    }
    else {
        var response = utils.generateMessage(STATUS_ERROR, ERROR_NOT_YET_LOGIN_MESSAGE);
        res.json(response);
    }
}

exports.get = function(req, res) {
    var tweetId = req.params.id;
    memcached.get(utils.MCDtweetKey(tweetId), function(err, tweet) {
        if(err) {
            console.error('[Cache] Cache error:', err.message);
        }

        if(tweet != null) {
            console.log('[Cache] Cache hit');
            res.json(tweet);
        }
        else {
            console.log('[Cache] Cache miss');
            var msg = {
                'action': RPC_TWEET_ACTION.GET_TWEET,
                'payload': {
                    'id': tweetId
                }
            }
            dispatcher.dispatch(AMQP_TWEET_QUEUE, JSON.stringify(msg), (response) => {
                response = JSON.parse(response);
                if(response.status == STATUS_ERROR){
                    res.json(response);
                }
                else{
                    res.json(response);
                    memcached.add(utils.MCDtweetKey(response.item.id), response, 3600, function(err) {
                        if(err) {
                            console.error('[Cache] Cache error:', err.message);
                        }
                    });
                }
            });
        }
    });
}

exports.remove = function(req, res) {
    var cookie = auth.checkLogin(req);
    if(cookie[0]) {
        var tweetId = req.params.id;
        memcached.del(utils.MCDtweetKey(tweetId), function(err) {
            if(err) {
                console.error('[Cache] Cache error:', err.message);
            }
        });

        var msg = {
            'action': RPC_TWEET_ACTION.DELETE_TWEET,
            'payload': {
                'id': tweetId,
                'username': cookie[1]
            }
        }
        dispatcher.dispatch(AMQP_TWEET_QUEUE, JSON.stringify(msg), (response) => {
            //delete associate media if exists
            response = JSON.parse(response);
            if(response.media != null) {
                media.remove(response.media);
            }

            if(response.status == STATUS_OK)    res.status(200).json(response);
            else    res.status(400).json(response);
        });
    }
    else {
        var response = utils.generateMessage(STATUS_ERROR, ERROR_NOT_YET_LOGIN_MESSAGE);
        res.status(400).json(response);
    }
}

exports.like = function(req, res) {
    var cookie = auth.checkLogin(req);
    if(cookie[0]) {
        var tweetId = req.params.id;
        var msg = {
            'action': RPC_TWEET_ACTION.LIKE_TWEET,
            'payload': {
                'id': tweetId,
                'username': cookie[1],
                'like': req.body.like == null ? true : req.body.like
            }
        }
        // If the tweet is cached, invalidate it.
        dispatcher.dispatch(AMQP_TWEET_QUEUE, JSON.stringify(msg), (response) => {
            memcached.del(utils.MCDtweetKey(tweetId), function(err){
                if(err){
                    console.error('[Cache] Cache error:', err.message);
                }
            });
            res.json(JSON.parse(response));
        });
    }
    else {
        var response = utils.generateMessage(STATUS_ERROR, ERROR_NOT_YET_LOGIN_MESSAGE);
        res.json(response);
    }
}

exports.search = function(req, res) {
    var cookie = auth.checkLogin(req);
    var following = req.body.following == null ? true : req.body.following;
    
    if((cookie[0] && following) || (!following)) {
        var msg = {
            'action': RPC_TWEET_ACTION.SEARCH,
            'payload': {
                'username': (cookie[0] && following) ? cookie[1] : null,
                'timestamp': req.body.timestamp == null ? Math.floor(Date.now()/1000) : req.body.timestamp,
                'limit': req.body.limit == null ? SEARCH_LIMIT_DEFAULT :
                    (req.body.limit <= SEARCH_LIMIT_MAX) ? req.body.limit : SEARCH_LIMIT_MAX,
                'q': req.body.q,
                'target': req.body.username,
                'following': following,
                'rank': req.body.rank == null ? 'interest' : req.body.rank,
                'parent': req.body.parent,
                'replies': req.body.replies == null ? true : req.body.replies,
                'hasMedia': req.body.hasMedia == null ? false : req.body.hasMedia
            }
        }
        dispatcher.dispatch(AMQP_TWEET_QUEUE, JSON.stringify(msg), (response) => {
            res.json(JSON.parse(response));
        });
    }
    else {
        var response = utils.generateMessage(STATUS_ERROR, ERROR_NOT_YET_LOGIN_MESSAGE);
        res.json(response);
    }
}
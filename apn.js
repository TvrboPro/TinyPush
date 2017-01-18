var apn = require('apn');
var fs = require('fs');
var Promise = require('bluebird');
var zip = require('lodash.zip');

var defaults = {
	timeToLive: 60 * 60 * 24 * 2, // 48h
	concurrency: 50,
	sound: 'default'  // default ios sound
};
var apnProvider;
var handlers = [];

function init({apnKeyFile, apnKeyId, apnTeamId, apnProduction}, {timetoLive, concurrency, iosSound}){
	if(!apnKeyFile) throw new Error("An APN key file is needed");
	else if(!apnKeyId) throw new Error("An APN key ID is needed");
	else if(!apnTeamId) throw new Error("An APN team ID is needed");
	else if(!fs.existsSync(apnKeyFile)) throw new Error("The provided APN certificate file does not exist");

	if(timetoLive) defaults.timetoLive = Math.max(timetoLive, 60 * 60); // min 1h
	if(concurrency) defaults.concurrency = concurrency;
	if(iosSound) defaults.sound = iosSound;

	var apnConfig = {
		token: {
			key: apnKeyFile,
			keyId: apnKeyId,
			teamId: apnTeamId
		},
		production: apnProduction,
		fastMode: true
		// buffersNotifications:true
	};

	apnProvider = new apn.Provider(apnConfig);

	if(!apnProduction)
		console.log((new Date()).toJSON(), "| The APN client is running in SandBox Mode");
}

function send(pushTokens, message, payload, unreadBadges, sound, timeToLive){
	if(!pushTokens)
		return Promise.resolve([]);
	else if(typeof pushTokens == 'object' && !pushTokens.length)
		return Promise.resolve([]);

	// a single push token
	if(typeof pushTokens == 'string') {
		if(typeof unreadBadges == 'number')
			return sendOne(pushTokens, message, payload, unreadBadges || 0, sound, timeToLive);
		else if(typeof unreadBadges == 'object')
			return sendOne(pushTokens, message, payload, unreadBadges[0] || 0, sound, timeToLive);
		else
			return sendOne(pushTokens, message, payload, 0, sound, timeToLive);
	}
	// many push tokens
	else if(typeof pushTokens == 'object') {
		if(typeof unreadBadges == 'number') { // same unread counter for all
			return Promise.map(pushTokens, pushToken => {
				return sendOne(pushToken, message, payload, unreadBadges || 0, sound, timeToLive);
			}, {concurrency: defaults.concurrency});
		}
		else if(typeof unreadBadges == 'object') { // each push token with its unread counter
			let tuples = zip(pushTokens, unreadBadges);

			return Promise.map(tuples, tuple => {
				return sendOne(tuple[0], message, payload, tuple[1] || 0, sound, timeToLive);
			}, {concurrency: defaults.concurrency});
		}
		else
			return sendOne(pushTokens, message, payload, 0, sound, timeToLive);
	}
	// Invalid parameters
	else
		return Promise.reject(new Error("The first parameter must be a push token or an array of push tokens. Got", pushTokens));
}

function sendOne(pushToken, message, payload, unreadBadge, sound, timeToLive){
	if(!apnProvider)
		return Promise.reject(new Error("The APN notification system is not configured yet"));

	return Promise.try(function(){
		if(!pushToken) throw new Error("The provided push token is empty");
		else if(typeof pushToken != 'string') throw new Error("The push token must be a string. Got", pushToken);

		var notification = new apn.Notification();
		notification.topic = 'com.twins-app.app';

		if(timeToLive)
			notification.expiry = Math.floor(Date.now() / 1000) + Math.max(timeToLive, 60 * 60); // min 1h
		else
			notification.expiry = Math.floor(Date.now() / 1000) + defaults.timetoLive;  // 48h


		// TODO SOUND
		if(sound) // default if not
			notification.sound = sound; // "www/push.caf";  'ping.aiff'
		else
			notification.sound = defaults.sound;

		notification.badge = unreadBadge || 0;
		notification.truncateAtWordEnd = true;

		notification.alert = message || "";
		notification.priority = 10;  // 10 => asap, 5 => chillout

		// payload
		notification.payload = payload || {};

		if(JSON.stringify(notification).length >= 4096)
			throw new Error("The total payload size exceeds the allowed amount");

		return new Promise(function(resolve, reject){
			apnProvider.send(notification, pushToken).then(function(result) {
				if(!result) resolve({successful: 0, failed: 0});
				else if(result && result.sent && result.sent.length){
					resolve({successful: 1, failed: 0});
				}
				else if(result && result.failed && result.failed.length){
					resolve({successful: 0, failed: 1});
					onApnInvalidToken(result.failed.map(f => f.device));
				}
				else resolve({successful: 0, failed: 0});
			});
		});
	});
}

// subscribers
function onFeedback(handler){
	if(typeof handler !== 'function')
		throw new Error("Not a valid function");

	handlers.push(handler);
}

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

function onApnInvalidToken(tokens){
	setImmediate(function(){
		handlers.forEach(handler => {
			handler([/* no tokens to update on APN */], tokens);
		});
	});
}


module.exports = {
  init: init,
  send: send,
  sendOne: sendOne,
  onFeedback: onFeedback
};

var apn = require('apn');
var fs = require('fs');
var Promise = require('bluebird');
var zip = require('lodash.zip');

var defaults = {
	timeToLive: 60 * 60 * 24 * 2, // 48h
	concurrency: 50,
	sound: 'default'  // default ios sound
};
var apnConnection;
var apnFeedback;

var handlers = [];

function init(certFile, keyFile, production, {timetoLive, concurrency, iosSound}){
	if(!certFile) throw new Error("An APN certificate file is needed");
	else if(!keyFile) throw new Error("An APN key file is needed");
	else if(!fs.existsSync(certFile)) throw new Error("The provided APN certificate file does not exist");
	else if(!fs.existsSync(keyFile)) throw new Error("The provided APN key file does not exist");

	if(timetoLive) defaults.timetoLive = Math.max(timetoLive, 60 * 60); // min 1h
	if(concurrency) defaults.concurrency = concurrency;
	if(iosSound) defaults.sound = iosSound;

	var apnConfig = {
		// buffersNotifications:true,
		fastMode: true,
		cert: certFile,
		key: keyFile,
		production: production
	};

	var feedbackConfig = {
		cert: certFile,
		key: keyFile,
		production: production,
		batchFeedback: true,
		interval: 300
	};

	apnConnection = new apn.Connection(apnConfig);
	apnConnection.on('transmissionError', onApnTransmissionError);

	apnFeedback = new apn.Feedback(feedbackConfig)
	apnFeedback.on('feedback', onApnFeedback);

	if(!production)
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
	if(!apnConnection)
		return Promise.reject(new Error("The APN notification system is not configured yet"));

	return Promise.try(function(){
		if(!pushToken) throw new Error("The provided push token is empty");
		else if(typeof pushToken != 'string') throw new Error("The push token must be a string. Got", pushToken);

		var device = new apn.Device(pushToken);
		var notification = new apn.Notification();

		if(timeToLive)
			notification.expiry = Math.floor(Date.now() / 1000) + Math.max(timeToLive, 60 * 60); // min 1h
		else
			notification.expiry = Math.floor(Date.now() / 1000) + defaults.timetoLive;  // 48h


		// TODO SOUND
		if(sound) // default if not
			notification.sound = sound; // "www/push.caf";
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

		apnConnection.pushNotification(notification, device);
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

function onApnFeedback(deviceInfos) {
	if (deviceInfos.length == 0) return;
	var tokensToRemove = deviceInfos.map(deviceInfo => deviceInfo.device.token.toString('hex') );

	handlers.forEach(handler => {
		handler([/* no tokens to update on APN */], tokensToRemove);
	});
}

function onApnTransmissionError(errorCode, notification, recipient) {

	// Invalid token => remove device
  if(errorCode === 8 && recipient && recipient.token) {
    var token = recipient.token.toString('hex');

    handlers.forEach(handler => {
			handler([/* no tokens to update on APN */], [token]);
		});
  }
  else
		console.error((new Date()).toJSON(), "| APN transaction error:", errorCode, notification, recipient);
}


module.exports = {
  init: init,
  send: send,
  sendOne: sendOne,
  onFeedback: onFeedback
};

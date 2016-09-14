var apn = require('apn');
var fs = require('fs');
var Promise = require('bluebird');
var zip = require('lodash.zip');

var defaults = {
	timeToLive: 60 * 60 * 24 * 2 // 48h
};
var apnConnection;
var apnFeedback;

var feedbackHandlers = [];

function init(certFile, keyFile, production, defaultValues){
	if(!certFile) throw new Error("The provided APN certificate file is empty");
	else if(!keyFile) throw new Error("The provided APN key file is empty");
	else if(!fs.existsSync(certFile)) throw new Error("The provided APN certificate file does not exist");
	else if(!fs.existsSync(keyFile)) throw new Error("The provided APN key file does not exist");

	if(defaultValues.timetoLive)
		defaults.timetoLive = Math.max(defaultValues.timetoLive, 60 * 60); // min 1h

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
	apnConnection.on('transmissionError', onTransmissionError);

	apnFeedback = new apn.Feedback(feedbackConfig)
	apnFeedback.on('feedback', onFeedback);
}

function send(pushTokens, message, payload, timeToLive, unreadCounters, sound){
	if(!pushTokens)
		return Promise.resolve([]);
	else if(typeof pushTokens == 'object' && !pushTokens.length)
		return Promise.resolve([]);

	// a single push token
	if(typeof pushTokens == 'string') {
		if(typeof unreadCounters == 'number')
			return sendOne(pushTokens, message, payload, timeToLive, unreadCounters || 0, sound);
		else if(typeof unreadCounters == 'object')
			return sendOne(pushTokens, message, payload, timeToLive, unreadCounters[0] || 0, sound);
		else
			return sendOne(pushTokens, message, payload, timeToLive, 0, sound);
	}
	// many push tokens
	else if(typeof pushTokens == 'object') {
		if(typeof unreadCounters == 'number') { // same unread counter for all
			return Promise.map(pushTokens, pushToken => {
				return sendOne(pushToken, message, payload, timeToLive, unreadCounters || 0, sound);
			});
		}
		else if(typeof unreadCounters == 'object') { // each push token with its unread counter
			let tuples = zip(pushTokens, unreadCounters);

			return Promise.map(tuples, tuple => {
				return sendOne(tuple[0], message, payload, timeToLive, tuple[1] || 0, sound);
			});
		}
		else
			return sendOne(pushTokens, message, payload, timeToLive, 0, sound);
	}
	// Invalid parameters
	else
		return Promise.reject(new Error("The first parameter must be a push token or an array of push tokens. Got", pushTokens));
}

function sendOne(pushToken, message, payload, timeToLive, unreadCounter, sound){
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

		if(sound) // default if not
			notification.sound = sound; // "www/push.caf";

		notification.badge = unreadCounter || 0;
		notification.truncateAtWordEnd = true;

		notification.alert = message || "";
		notification.priority = 10;  // 10 => asap, 5 => chillout

		// payload
		notification.payload = payload || {};

		apnConnection.pushNotification(notification, device);
	});
}

function addFeedbackHandler(handler){
	if(typeof handler !== 'function') throw new Error("Not a valid function");

	feedbackHandlers.push(handler);
}

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

function onFeedback(deviceInfos) {
	if (deviceInfos.length == 0) return;
	var tokensToRemove = deviceInfos.map(deviceInfo => deviceInfo.device.token.toString('hex') );

	feedbackHandlers.forEach(function(handler){
		handler([/* no tokens to update */], tokensToRemove);
	});
}

function onTransmissionError(errorCode, notification, recipient) {
	// Invalid token => remove device
  if(errorCode === 8 && recipient.token) {
    var token = recipient.token.toString('hex');

    feedbackHandlers.forEach(function(handler){
			handler([/* no tokens to update */], [token]);
		});
  }
}


module.exports = {
    init: init,
    send: send,
    sendOne: sendOne,
    addFeedbackHandler: addFeedbackHandler
}

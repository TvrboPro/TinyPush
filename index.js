var Promise = require('bluebird');

var fcmPush = require('./fcm');
var gcmPush = require('./gcm');
var apnPush = require('./apn');

var useAPN = false;
var useFCM = false;
var useGCM = false;

var defaults = {
	concurrency: 50
};

function init({fcmKey, gcmKey, apnKeyFile, apnKeyId, apnTeamId, apnProduction}, defaultValues = {}){
	if(defaultValues.concurrency)
		defaults.concurrency = defaultValues.concurrency;

	// platforms

	if(fcmKey) {
		fcmPush.init(fcmKey, defaultValues);
		useFCM = true;
	}
	else if(gcmKey) {   // GCM is ignored when FCM is ON
		gcmPush.init(gcmKey, defaultValues);
		useGCM = true;
	}

	if(apnKeyFile && apnKeyId && apnTeamId) {
		apnPush.init({apnKeyFile, apnKeyId, apnTeamId, apnProduction}, defaultValues);
		useAPN = true;
	}

	console.log((new Date()).toJSON(), "| The push notifications service is set up");
}

// recipients => [{token: "...", platform: "ios", unread: 3}, ...]

function batch(recipients, message, payload){
	return Promise.map(recipients, recipient => {
		if(!recipient) return;
		let newPayload = Object.assign({}, payload);

		switch(recipient.platform){
			// by platform

			case 'fcm':
			case 'FCM':
				if(useFCM) return fcmPush.send(recipient.token, message, newPayload);
				else break;

			case 'gcm':
			case 'GCM':
				if(useGCM) return gcmPush.send(recipient.token, message, newPayload);
				else break;

			case 'apn':
			case 'APN':
				if(useAPN) return apnPush.sendOne(recipient.token, message, newPayload, recipient.unread);
				else break;

			// by arquitechture

			case 'android':
			case 'Android':
				if(useFCM)
					return fcmPush.send(recipient.token, message, newPayload);
				else if(useGCM)
					return gcmPush.send(recipient.token, message, newPayload);
				else
					break;

			case 'iphone':
			case 'iPhone':
			case 'ios':
			case 'iOS':
				if(useAPN)
					return apnPush.sendOne(recipient.token, message, newPayload, recipient.unread);
				else if(useFCM)
					return fcmPush.send(recipient.token, message, newPayload);
				else
					break;
		}
		throw new Error('The recipient\'s platform is not enabled:', recipient.platform);

	}, {concurrency: defaults.concurrency});
}

module.exports = {
	init,
	batch,
	fcm: {
		send: fcmPush.send,
		onFeedback: fcmPush.onFeedback
	},
	gcm: {
		send: gcmPush.send,
		onFeedback: gcmPush.onFeedback
	},
	apn: {
		send: apnPush.send,
		onFeedback: apnPush.onFeedback
	}
};

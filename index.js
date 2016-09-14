var Promise = require('bluebird');

var androidPush = require('./android');
var iosPush = require('./ios');

var defaults = {
	concurrency: 30
};


// androidPush.onFeedback(onDeviceError);
// iosPush.onFeedback(onDeviceError);

function init(keys = {}, defaultValues = {}){
	if(defaultValues.concurrency)
		defaults.concurrency = defaultValues.concurrency;

	// platforms
	androidPush.init(keys.gcmKey, defaultValues);
	iosPush.init(keys.apnCertFile, keys.apnKeyFile, keys.production, defaultValues);

	console.log((new Date()).toJSON(), "| The push notifications service is set up");
}

// recipients => [{token: "...", platform: "ios", unread: 3}, ...]

function batch(recipients, message, payload, timeToLive, sound){
	return Promise.map(recipients, recipient => {
			if(!recipient) return;

			switch(recipient.platform){
				case 'android':
				case 'Android':
					return androidPush.send(recipient.token, message, payload);

				case 'iphone':
				case 'iPhone':
				case 'ios':
				case 'iOS':
					return iosPush.sendOne(recipient.token, message, payload, recipient.unread, sound);

				default:
					throw new Error('The recipient\'s platform is not supported:', recipient.platform);
			}
	}, {concurrency: defaults.concurrency});
}

module.exports = {
	init,
	batch,
	android: {
		send: androidPush.send,
		onFeedback: androidPush.onFeedback
	},
	ios: {
		send: iosPush.send,
		onFeedback: iosPush.onFeedback
	}
};

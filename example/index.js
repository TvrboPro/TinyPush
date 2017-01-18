var push = require('../index.js');

// INIT

const fcmKey = "YOUR_FCM_KEY_HERE"
const keyFile = '/path/to/apn.pem'

push.init({fcmKey, apnCertFile: keyFile, apnKeyFile: keyFile, apnProduction: true})


// SAMPLE DATA

const message = "Hi from TinyPush";
const payload = { some: "value" };


const recipients = [
{
	token: 'AN_IOS_REGISTRATION_TOKEN',
	platform: 'ios',
	unread: 3
},
{
	token: "AN_ANDROID_REGISTRATION_TOKEN",
	platform: 'android'
}];


// FEEDBACK

push.fcm.onFeedback(gotFeedback);
push.gcm.onFeedback(gotFeedback);
push.apn.onFeedback(gotFeedback);

// HANDLER

function gotFeedback(tokensToUpdate, tokensToRemove){

	// Updated tokens. Android only
	// On iOS tokensToUpdate = []
	tokensToUpdate.forEach(entry => { // token is an object

		console.log("FROM", entry.from);
		console.log("TO", entry.to);

		// Update here your database
	});

	// Invalid tokens
	tokensToRemove.forEach(token => { // token is a string

		console.log("REMOVE", token);

		// Remove here from the database
	});
}


// GO

push.batch(recipients, message, payload).then(console.log).catch(console.error);

push.fcm.send([recipients[1].token], message, payload)
.then(res => {
	console.log(res); // would log: [ { successful: 1, failed: 0 } ]
})
.catch(err => {
	console.error(err); // Unable to connect
});

push.gcm.send([recipients[1].token], message, payload)
.then(res => {
	console.log(res); // would do nothing, as gcmKey was not provided
})
.catch(err => {
	console.error(err); // Unable to connect
});

push.apn.send([recipients[0].token], message, payload, [recipients[0].unread], 'default', 60 * 60 * 24)
.then(res => {
	console.log(res); // would log: [ { successful: 1, failed: 0 } ]
})
.catch(err => {
	console.error(err); // Unable to connect
});


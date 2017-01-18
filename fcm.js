var Promise = require('bluebird');
var FCM = require("fcm-node");
var zip = require('lodash.zip');
var fcmConnection;

var defaults = {
	appName: 'TinyPush',
	retryCount: 8,
	delayWhileIdle: false, // wait till the phone wakes from sleep
	checkPayloadSize: false, // throws an error if true and size > 2048
	simulate: false,
	concurrency: 50,
	sound: 'default'
};
var handlers = [];


function init(fcmKey, {appName, retryCount, delayWhileIdle, simulate, concurrency, androidSound}){
	if(!fcmKey) throw new Error("The provided FCM KEY is empty");

	if(appName) defaults.appName = appName;
	if(retryCount) defaults.retryCount = retryCount;
	if(delayWhileIdle) defaults.delayWhileIdle = delayWhileIdle;
	if(simulate) defaults.simulate = simulate;
	if(concurrency) defaults.concurrency = concurrency;
	if(androidSound) defaults.sound = androidSound;

	fcmConnection = new FCM(fcmKey);
}

function send(pushTokens, message, payload, sound){
	if(!fcmConnection)
		return Promise.reject(new Error("The FCM notification system is not configured yet"));
	else if(!pushTokens)
		return Promise.resolve([]);
	else if(typeof pushTokens == 'object' && !pushTokens.length)
		return Promise.resolve([]);
	else if(pushTokens.length > 1000)
		return Promise.reject(new Error("The amount of recipients exceeds the maximum allowed on FCM (1000)"));

	return new Promise((resolve, reject) => {
		var msg = {
			delayWhileIdle: defaults.delayWhileIdle,
			collapseKey: message || "(no message)", // group identical
			content_available: true,   // wake IOS app
			priority: 'normal',
			timeToLive: 60 * 60 * 24 * 7 * 2, // 2 weeks
			dryRun: defaults.simulate
		};
		if(typeof pushTokens == 'string') {
			msg.to = pushTokens;
		}
		else {
			msg.registration_ids = pushTokens;
		}
		if(message) {
			msg.notification = {
				title: defaults.appName,
				body: message,
				icon: "ic_launcher",
				sound: sound || defaults.sound
			}
		}
		if(payload){
			msg.data = payload;
		}

		// delivery
		fcmConnection.send(msg, (err, result) => {
			if(err) return reject(err || `The android notification to ${pushTokens} did not complete`);

			// RESULT (in case of error)
			// {
			//   multicast_id: 5215101923310065000,
			//   success: 0,
			//   failure: 1,
			//   canonical_ids: 0,
			//   results: [ { error: 'NotRegistered' } ]
			// }

			resolve(result);
		});
	})
	.then(response => {
		if(!response) return;

		// regrouping like [ [resultObj1, tokenStr1], [resultObj2, tokenStr2], ... ]
		const groupedResults = zip(response.results, pushTokens);

		// map like { ...result, token: "..." }
		return groupedResults.map(tuple => Object.assign({}, tuple[0], {token: tuple[1]}) );
	})
	.then(results => {
		var tokensToUpdate = [], tokensToRemove = [];

		const {successful, failed} = results.reduce((prev, result) => {
			// puchToken cleanup
			if(result.registration_id)
				tokensToUpdate.push({from: result.token, to: result.registration_id});
			else if(result.error === 'InvalidRegistration' || result.error === 'NotRegistered')
				tokensToRemove.push(result.token);
			else if(result.error === 'MismatchSenderId')
				throw new Error("FCM ERROR: Your Sender ID appears to be invalid");

			// count failures
			if(result.error) prev.failed++;
			else prev.successful++;

			return prev;
		}, {successful: 0, failed: 0});

		handlers.forEach(handler => {
			handler(tokensToUpdate, tokensToRemove);
		});

		return {successful, failed};
	});
}

function onFeedback(handler){
	if(typeof handler !== 'function')
		throw new Error("Not a valid function");

	handlers.push(handler);
}

module.exports = {
  init: init,
  send: send,
  onFeedback: onFeedback
};

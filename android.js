var Promise = require('bluebird');
var gcm = require("node-gcm");
var zip = require('lodash.zip');
var gcmConnection;

var defaults = {};
var feedbackHandlers = [];

function init(gcmKey, defaultValues){
	if(!gcmKey) throw new Error("The provided GCM KEY is empty");

	defaults.appName = defaultValues.appName || 'App';
	defaults.retryCount = defaultValues.retryCount || 7;
	defaults.delayWhileIdle = defaultValues.delayWhileIdle || false;
	defaults.simulate = defaultValues.simulate || false;

	gcmConnection = new gcm.Sender(gcmKey);
}

function send(pushTokens, message, payload){
	if(!gcmConnection)
		return Promise.reject(new Error("The Android notification system is not configured yet"));
	else if(!pushTokens)
		return Promise.resolve([]);
	else if(typeof pushTokens == 'object' && !pushTokens.length)
		return Promise.resolve([]);
	else if(pushTokens.length > 1000)
		return Promise.reject(new Error("The amount of recipients exceeds the maximum allowed on Android (1000)"));

	if(typeof pushTokens == 'string') {
		pushTokens = [ pushTokens ];
	}

	return new Promise((resolve, reject) => {
		var msg = {
			delayWhileIdle: defaults.delayWhileIdle,
			collapseKey: message || "(no message)", // group identical
			timeToLive: 60 * 60 * 24 * 28, // 4 weeks
			dryRun: defaults.simulate,
			notification: {
				title: defaults.appName,
				body: message,
				icon: "ic_launcher",
				sound: 'default'
			},
			data: payload || {}
		};

		// delivery
		gcmConnection.send(new gcm.Message(msg), {registrationTokens: pushTokens}, defaults.retryCount, (err, result) => {
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
	.then(res => {
		if(!res) return;

		// regrouping like [ [resultObj1, tokenStr1], [resultObj2, tokenStr2], ... ]
		const groupedResults = zip(res.results, pushTokens);

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

			// count failures
			if(result.error) prev.failed++;
			else prev.successful++;

			return prev;
		}, {successful: 0, failed: 0});

		feedbackHandlers.forEach(handler => {
			handler(tokensToUpdate, tokensToRemove);
		});

		return {successful, failed};
	});
}

function addFeedbackHandler(handler){
	if(typeof handler !== 'function')
		throw new Error("Not a valid function");

	feedbackHandlers.push(handler);
}

module.exports = {
    init: init,
    send: send,
    addFeedbackHandler: addFeedbackHandler
}

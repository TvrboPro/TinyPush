var Promise = require('bluebird');
var push = require('../index.js');

var Tag = require('../models/tag.js');
var User = require('../models/user.js');
var Submission = require('../models/submission.js');
var Message = require('../models/message.js');

var defaults = {
	PUSH_RETRY_INTERVAL: 60 * 30,
	SUBMISSION_CLEAN_INTERVAL: 60 * 60 * 24
};

// INIT

function init(){
	const keys = {
		gcmKey: "__YOUR_GCM_KEY_HERE__",
		apnCertFile: "/path/to/apn.p12",
		apnKeyFile: "/path/to/apn-key.p12",  // both may be in the same file
		production: true                     // false will use the sandbox mode
	};

	push.init(keys);

	// In case the server stopped and a submission was interrupted
	continueStaleSubmissions();

	// Periodic
	setInterval(resendFailedSubmissions, defaults.PUSH_RETRY_INTERVAL);
	resendFailedSubmissions();

	// AUTO CLEAN OLD
	setInterval(cleanSubmissions, defaults.SUBMISSION_CLEAN_INTERVAL);
	cleanSubmissions();

	// FEEDBACK
	push.android.onFeedback(onDeviceError);
	push.ios.onFeedback(onDeviceError);
}

////////////////////////////
// DELIVERY
////////////////////////////

function deliverSubmission(submission, messages){
	if(!messages) messages = [];
	return Promise.try(function(){
		if(!submission) throw "Could not access the submission database object";

		return Submission.findByIdAndUpdate(submission._id, {estat: 'sending'}).lean().exec()
	})
	.then(function(){
		if(messages && messages.length) return messages;
		return Message.find({submission: submission._id, sent: null, opened: null, retries: {$gt: 0}}).lean().exec()
	})
	.then(function(messages){
			if(!messages) throw new Error("Could not access the submission database object");
			var connectionErrors = 0;
			var payload = {type: submission.type, pushedId: submission.pushedId};

			return Promise.map(messages, function(message){
				if(!message) return;

				switch(message.platform){
					case 'android':
					case 'Android':
						return push.android.send([message.pushToken], submission.message, payload)
						.then(res => {
							if(res.failures) {
								return Message.findByIdAndUpdate(message._id, {sent: null, error: new Date(), retries: 0}).exec();
							}
							return Message.findByIdAndUpdate(message._id, {sent: new Date(), error: null}).lean().exec()
						})
						.catch(err => {
							connectionErrors++;
							return Message.findByIdAndUpdate(message._id, {sent: null, error: new Date(), $inc: {retries: -1}}).lean().exec();
						});

					case 'iphone':
					case 'iPhone':
					case 'ios':
					case 'iOS':
						return push.ios.send([message.pushToken], submission.message, payload)
						.then(() =>
							Message.findByIdAndUpdate(message._id, {sent: new Date(), error: null}).lean().exec()
						)
						.catch(err => {
							connectionErrors++;
							return Message.findByIdAndUpdate(message._id, {sent: null, error: new Date(), $inc: {retries: -1}}).lean().exec();
						});

					default:
						throw new Error('Unsupported platform');
				}
			}, {concurrency: 30})
			.then(function(){
				return connectionErrors;
			});
	})
	.then(function(connectionErrors){
		// DONE
		if(connectionErrors > 0)
			return Submission.findByIdAndUpdate(submission._id, {estat: 'incomplete'}).lean().exec();
		else
			return Submission.findByIdAndUpdate(submission._id, {estat: 'sent'}).lean().exec();
	});
}

function onDeviceError(tokensToUpdate, tokensToRemove){
	User.findAndRemove({pushToken: {$in: tokensToRemove}}).select('_id').lean().exec()
	.then(users => {
		// REMOVE FROM TAGS
		return Tag.update({}, {$pull: {subscribers: {$in: users.map(user => user._id)}}}, {multi: true})
	})
	.then(() => console.log("Removed user tokens", tokensToRemove) )
	.catch(err => console.error("tokenRemove Error", err) );

	Promise.map(tokensToUpdate, function(upd){
		return User.findOneAndRemove({pushToken: upd.from}, {pushToken: upd.to}).lean().exec();
	})
	.then(() => tokensToUpdate.length > 0 && console.log("Updated user tokens", tokensToUpdate) )
	.catch(err => console.error("tokenUpdate Error", err) );
}


////////////////////////////
// LIFECYCLE
////////////////////////////

function continueStaleSubmissions(){
	Submission.find({estat: 'sending'}).exec()
	.then(function(submissions){
		if(!submissions || typeof submissions != "object") return console.error("Submission.find returns", typeof submissions );

		return Promise.map(submissions, function(subm){
			console.log((new Date()).toJSON(), "| Starting submission", subm._id);

			return deliverSubmission(subm);
		});
	})
	.then(function(){
		console.log((new Date()).toJSON(), "| Push notifications server started [ OK ]");
	})
	.catch(function(err){
		return console.log("continueStaleSubmissions ERROR", err);
	});
}

function resendFailedSubmissions(){
	Submission.find({estat: 'incomplete'}).exec()
	.then(function(submissions){
		if(!submissions || typeof submissions != "object") return console.error("Submission.find returns", typeof submissions );
		else if(!submissions.length) return;

		return Promise.map(submissions, function(subm){
			console.log((new Date()).toJSON(), "| Trying to resend the submission", subm._id);

			return deliverSubmission(subm);
		}, {concurrency: 2})
		.then(function(){
			console.log((new Date()).toJSON(), "| Pending messages retried");
		});
	})
	.catch(function(err){
		return console.log("resendFailedSubmissions ERROR", err);
	});
}

function cleanSubmissions(){
	// REMOVE
	Submission.find({expirationDate: {$lt: new Date()}}).select('_id').exec()
	.then(function(subms){
		return Promise.map(subms, function(t){
			return Message.remove({submission: t._id});
		})
		.then(function(){
			return Submission.remove({_id: {$in: subms.map(function(subm){return subm._id;})}});
		});
	})
	.catch(function(err){
		return console.log("cleanSubmissions ERROR", err); // ??
	});
}

// INIT

init();

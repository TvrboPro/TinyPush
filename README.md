# TinyPush
TinyPush is a NodeJS module, providing simple access to push notifications delivery and feedback management

---

## Installation

This module requires **NodeJS v6** or newer.

To install in your project, run `npm install --save tiny-push`

## Init

To start the push engine, provide the GCM and APN keys:

```
var push = require('tiny-push');

const keys = {
	gcmKey: "__YOUR_GCM_KEY_HERE__",
	apnCertFile: "/path/to/apn.p12",
	apnKeyFile: "/path/to/apn-key.p12",  // both may be in the same file
	production: true                     // false will use the sandbox mode
};

push.init(keys);

```

The `keys` argument is required. 

To override the default values, call the init function as follows: 

```
var push = require('tiny-push');

const keys = {
	gcmKey: "__YOUR_GCM_KEY_HERE__",
	apnCertFile: "/path/to/apn.p12",
	apnKeyFile: "/path/to/apn-key.p12",  // both may be in the same file
	production: true                     // false will use the sandbox mode
};
const defaults = {
	concurrency: 100,             // max simultaneous connections
	
	// Android only
	appName: 'My Application',    // Used as title
	retryCount: 8,                // Retries before ignoring
	delayWhileIdle: false,        // Notify when the phone wakes
	checkPayloadSize: false,      // Throws an error if true and size > 2048
	simulate: false,              // Request without sending
	androidSound: 'default',

	// iOS only
	timeToLive: 60 * 60 * 24 * 2, // 48h
	iosSound: 'default'
};

push.init(keys, defaults);

```


The `defaults` parameter is optional. The values above are already the default ones. 

## Simple use case

If you just want to deliver some notification to a group of users:

```
let recipients = [
{
	token: '__REGISTRATION_TOKEN_HERE__', 
	platform: 'ios', 
	unread: 2        // iOS Badge
}, {
	token: pushToken, 
	platform: 'android'
}];

```

Then you can use the main `batch` method:

```
const message = "Hi from TinyPush";
const payload = { some: "value" };  // optional

push.batch(recipients, message, payload)
.then(res => {
	console.log(res); // would log: [ undefined, { successful: 1, failed: 0 } ]
})
.catch(err => {
	console.error(err); // Unable to connect
})
```

Android messages provide immediate results, whereas APN doesn't. However, both allow us to use the Feedback service. (See below).

## Platform specific

If you need to customize the notifications depending on the platform or have a large amount of requests, you may have to use the `send` function for Android and iOS:

### Android

```
const tokens = ["registration_token_1", "registration_token_2", ...];
const message = "Hi from TinyPush";
const payload = { some: "value" };
const androidSound: 'id_launch';

push.android.send(tokens, message, payload, androidSound)
.then(res => {
	console.log(res); // would log: [ { successful: 1, failed: 0 } ]
})
.catch(err => {
	console.error(err); // Unable to connect
})
```

### iOS

```

const tokens = ["registration_token_1", "registration_token_2", ...];
const badges = [2, 3, ...];
const message = "Hi from TinyPush";
const payload = { some: "value" };
const iosSound: 'ic_launcher';
const timeToLive = 60 * 60 * 24; // 1 day

push.ios.send(tokens, message, payload, badges, iosSound, timeToLive)
.then(() => {
	// Going here means that nothing went wrong
})
.catch(err => {
	console.error(err); // Unable to connect
})

```

The numbers in the `badges` array have a 1:1 correspondance with the `tokens` array. If `badges[10]` equals `2`, this means that the phone with the token `tokens[10]` will receive a notification with a badge of `2`.

On iPhone, if we reach the main `.then()` block, means that no connection error was encountered. However, this does not mean that all the transactions have completed as expected.

## Feedback

That's why TinyPush provides a simple way to be notified of updated or invalid registration tokens. 

In order to get feedback, you need to define a callback with the followins signature:

```
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
```
Now you can register your function as a callback:

```
push.android.onFeedback(gotFeedback);
push.ios.onFeedback(gotFeedback);
```
**NOTE:** Apple may eventually give some **false positives** of tokens to remove. You may want to double check a user's registration token before you decide to remove it from the database. 


# Credits
Jordi Moraleda

We Are Tvrbo
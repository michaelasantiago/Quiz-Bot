// Discord Master Object
const Discord = require('discord.js');
// File System Master Object
const FS = require('fs');
// Configurable bot variables
const config = readJson('./resources/config.json');
// Configurable quiz variables
const quizConfig = readJson('./resources/quizConfig.json');
// Configurable bot messages
const messages = readJson("./resources/messages.json");
// Client object
const client = new Discord.Client();
// Properties
var timer;
var curMsg;

var host = null;
var quiz = null;
/* quiz states
0: Inactive
1: Waiting for player sign-ups
2: Active (Between timeouts)
3: Waiting for answers
4: Waiting for late answers
*/
var quizState = 0;
/* pause states
0: Unpaused
1: Pausing at start of next loop
2: Paused
*/
var pauseState = 0;
var questions;
var correctAnswers;
var questionNum = 0;
var points = [];
var questions = [];
var player = null;
var canAltAction;

/* Static list of channels
std: Main channel for sending/reading
cur: Current channel for sending/reading
*/
const channels = {};

// Runs when first joining the server
client.on('ready', () => {
	console.log('Bot is now connected.');
	channels.std = findChannelByName(client.channels, config.defaultChannel);
	channels.cur = channels.std;
	channels.quiz = channels.std;
	// Loading default host
	loadHost(quizConfig.defaultHost);
	// Sending greeting message
	sendStd(messages.greeting);
});

// Runs upon seeing a message
client.on('message', (msg) => {
	curMsg = msg;
	adminCommands(msg);
	if (quizState === 0)
	{
		// Standard commands do not work during a quiz
		basicCommands(msg);
	}
	else
	{
		// Quiz commands
		quizCommands(msg);
	}
	curMsg = null;
});

/* Commands that can only be run by server admins and bot admins
msg: message holding the command
*/
function adminCommands(msg)
{
	if (checkCmd(msg, "resetAvatar"))
	{
		// Setting the avatar to the default
		console.log("Received reset avatar command.");
		setBotAvatarManual(msg, config.stdAvatar);
	}
}

/* Commands that all users can input
msg: message holding the command
*/
function basicCommands(msg)
{
	if (checkCmd(msg, "ping"))
	{
		// Ping
		console.log("Received ping command.");
		respondMsg(msg, custMsg(messages.ping));
	}
	else if (checkCmd(msg, "echo"))
	{
		// Echo
		console.log("Received echo command.");
		// Accumulating all text to echo (other than the command) in echoText
		var splitText = splitMsg(msg);
		var echoText = "";
		for (var i = 1; i < splitText.length; i++)
			echoText += splitText[i]+" ";
		// Responding with default text if extra text was not present
		if (echoText == "")
			echoText = custMsg(messages.ping);
		respondMsg(msg, echoText);
	}
	else if (checkCmd(msg, "timer"))
	{
		// Sets a timer for the specified time
		console.log("Received timer command.");
		var arg = splitMsg(msg)[1];
		if (arg === null || arg === undefined)
			timer = 10;
		else
			timer = parseInt(arg);
		respondMsg(msg, custMsg(messages.timer));
		setTimeout( () => respondMsg(msg, custMsg(messages.timerDone) ) , timer*1000);
	}
	else if (checkCmd(msg, "host"))
	{
		console.log("Received host command.");
		var args = splitMsg(msg);
		loadHost(args[1]);
		respondMsg(msg, custMsg(messages.host));
	}
	else if (checkCmd(msg, "quiz"))
	{
		// Initiating a quiz
		console.log("Received initiate quiz command.");
		var args = splitMsg(msg);
		try
		{
			// Cannot start quiz without a host
			if (host === null)
			{
				respondMsg(msg, custMsg(messages.needHost));
				throw ("Cannot start quiz: need host");
			}
			// Cannot start quiz if quiz is already in progress
			if (quizState != 0)
			{
				respondMsg(msg, custMsg(messages.quizActive) );
				throw ("Cannot start quiz; quiz already in progress.");
			}
			var path = config.quizPath+args[1]+".json";
			// Attempting to read quiz from file
			if (FS.existsSync(path))
				quiz = readJson(path);
			else
			{
				respondMsg(msg, custMsg(messages.quizNotFound));
				throw ("Cannot start quiz; quiz file not found.");
			}
			// Setting quiz channel to the one the request was made on
			channels.quiz = msg.channel;
			if (args.includes("-open") || quizConfig.signUpDuration <= 0)
			{
				// Open quizzes skip signups and start immediately
				startQuiz();
			}
			else
			{
				// Opening quiz signups
				quizState = 1;
				timer = quizConfig.signUpDuration;
				respondMsg(msg, custMsg(messages.signUp) );
				setTimeout(startQuiz, timer*1000);
			}
		}
		catch(err)
		{
			console.log(err);
			respondMsg(msg, messages.quizFail);
		}
	}
}

/* Commands handled during quizzes
msg: Message holding the command
*/
function quizCommands(msg)
{
	if (checkCmd(msg, "start") )
	{
		// Starting the quiz
		if (quizState === 1)
			startQuiz();
	}
}



/* Extracts a command from a message
msg: Message to check
cmd: Command name as string
*/
function checkCmd(msg, cmd)
{
	var msgCmd = splitMsg(msg);
	return (msgCmd[0] === (config.prefix+cmd));
}


/* Returns a split message into its arguments by spaces
msg: Message to split
*/
function splitMsg(msg)
{
	return msg.content.split(' ');
}

/* Loads a host, given their name
name: Name of file without the .json extension
*/
function loadHost(name)
{
	host = readJson(config.hostPath+name+".json");
	host.answersWinner = [];
	host.answersLoser = [];
	host.answersNormal = [];
	// Splitting answer responses into winner/loser/normal
	for (var i = 0; i < host.responses.answers.length; i++)
	{
		var curString = host.responses.answers[i];
		if (curString.includes("%POINTS_WINNER"))
			host.answersWinner.push(curString);
		else if (curString.includes("%POINTS_LOSER"))
			host.answersLoser.push(curString);
		else
			host.answersNormal.push(curString);
	}
	setBotAvatar(host.imagePath);
}

/* Begins a quiz, ending signups */
function startQuiz()
{
	config.allCaps = false;
	// Getting questions
	questions = quiz.questions;
	// Randomizing question order
	if (quizConfig.randomize)
		questions = shuffle(questions);
	questionNum = -1;
	canAltAction = false;
	quizMsg(host.intro);
	nextQuestion();
}
// Starting point for the quiz loop
function nextQuestion()
{
	// Setting quiz to "waiting for timeout" state
	quizState = 2;
	// Picking action
	if (questionNum < questions.length - 1)
	{
		// These actions are not performed after the last question
		if (canAltAction)
		{
			if (quizConfig.tallyFreq != -1 && points.length > 0 && questionNum >= 0 && (questionNum === 0 || questionNum % quizConfig.tallyFreq === 0))
			{
				// Tallying points
				canAltAction = false;
				timer = quizConfig.nextDelay;
				setTimeout(startTally, timer*1000);
				return;
			}
			else if (questionNum % quizConfig.commentFreq === 0)
			{
				// Commenting
				canAltAction = false;
				timer = quizConfig.nextDelay;
				setTimeout(quizComment, timer*1000);
				return;
			}
		}
		canAltAction = true;
		// Starting next question
		timer = quizConfig.questionDelay;
		setTimeout(startQuestion, timer*1000);
	}
	else
	{
		// Out of questions, performing final tally
		timer = quizConfig.nextDelay;
		setTimeout(startTally, timer);
	}
}

/* Starts tallying points */
function startTally()
{
	timer = doTally();
	if (questionNum < questions.length - 1)
	{
		// Returning to start of loop
		setTimeout(nextQuestion, timer + quizConfig.nextDelay);
	}
	else
	{
		console.log("Ending quiz");
		// Ending quiz
		setTimeout(endQuiz, timer + quizConfig.nextDelay);
	}
}

/* Performs the action of tallying (can be called separately without affecting the quiz) */
function doTally()
{
	quizMsgArr(host.responses.tally);
	timer = quizConfig.pointDelay;
	// Staggered announcements
	if (timer > 0)
	{
		console.log("Performing point tally.");
		points.forEach(function(points, player) {
			setTimeout( () => pointsMsg(points, player), timer)
			timer += quizConfig.pointDelay;
		});
	}
	else if (timer <= 0)
	{
		console.log("Performing quick tally.");
		// Condensed format for outputting points
		points.forEach(function(points, player) {
			quizMsg(player+"%POINTS");
		});
	}
	return timer;
}
/* Sends point tally for the specified player
points:  Points of player
player:  Player, as User
*/
function pointsMsg(points, player)
{
	player = player;
	// Selecting appropriate quiz messages
	var quizMessages = host.answersNormal;
	if (player == getWinner() && host.answersWinner.length > 0)
		quizMessages = host.answersWinner;
	else if (player == getLoser() && host.answersLoser.length > 0)
		quizMessages = host.answersLoser;
	quizMsgArr(quizMessages);
}

/* Writes a random quiz comment */
function quizComment()
{
	quizMsgArr(host.responses.comment)
	timer = quizConfig.nextDelay;
	setTimeout(nextQuestion, timer);
}

// Begins a question
function startQuestion()
{
	questionNum++;
	// Getting answers and shuffling their order
	answers = shuffle(quiz.questions[questionNum].answers);
	// Setting correct answers
	correctAnswers = [];
	for (var i = 0, j = 0; i < answers.length; i++)
		if (answers[i].correct)
			correctAnswers.push(answers[i].answerText);
	console.log(correctAnswers);
	// Introducing question
	quizMsgArr(host.responses.question);
	// Sending question
	quizMsg("[" + (questionNum + 1) + "]  " + questions[questionNum].questionText);
	// Accepting answers state
	state = 3;
	// Provides answers if answerDelay is configured appropriately
	if (quizConfig.answerDelay < quizConfig.questionDuration && quizConfig.answerDelay != -1)
	{
		timer = quizConfig.answerDelay;
		setTimeout( () => giveAnswers(questionNum), timer*1000);
	}
	// Setting question end timer
	timer = quizConfig.questionDuration;
	setTimeout( () => endQuestion(questionNum), timer*1000);
}

// Provides multiple-choice answers to a question, failing if the question has already been answered
function giveAnswers(num)
{
	// Stops if question has already been answered or advanced
	if (questionNum != num || state != 3)
		return;
	var answers = quiz.questions[num].answers;
	// Stops if there are no distractor answers to provide
	if (correctAnswers.length === answers.length)
		return;
	console.log(correctAnswers.length +" = " + answers.length);
	console.log(correctAnswers);
	quizMsgArr(host.responses.answers);
	for (var i = 0; i < answers.length; i++)
		quizMsg(answers[i].answerText);
}

// Ends a question, failing if the question has already been answered
function endQuestion(num)
{
	// Fails if question has already been answered or advanced
	if (questionNum != num || state != 3)
		return;
	quizMsgArr(host.responses.timeout);
	state = 2;
	nextQuestion();
}

// Ends the quiz
function endQuiz()
{
	quizMsg(host.congrats);
	quizMsg(host.close);
	quizState = 0;
	quiz = null;
}
/* Sets the bot's avatar to the specified image path in response to a message
msg: Message requesting change (necessary for response)
avatar: URL (local or online) to get image from
*/
function setBotAvatarManual(msg, avatar)
{
	try {
			var path = "./resources/images/"+avatar;
			// Setting the avatar
			var request = client.user.setAvatar(path);
			request.then( () => respondMsg(msg, custMsg(messages.setAvatar)), () => respondMsg(msg, failAvatar) );
	} catch(err) {
		console.log(err);
		respondMsg(msg, custMsg(messages.noAvatar))
	}
}
/* Sets the bot's avatar to the specified image path
avatar: URL (local or online) to get image from
*/
function setBotAvatar(avatar)
{
	try {
		var path = "./resources/images/"+avatar;
		if (FS.existsSync(path))
		{
			// Setting the avatar from local
			var request = client.user.setAvatar(path);
			request.then( () => console.log("Avatar has been changed."), () => console.log("Avatar could not be changed.") );
		}
		else
		{
			// Setting avatar from url
			var request = client.user.setAvatar(avatar);
			request.then( () => console.log("Avatar has been changed."), () => console.log("Avatar could not be changed.") );
		}
	} catch(err) {
		console.log(err);
	}
}
/* Sends text to the quiz channel, replacing tags with their variables
sendText: Text to send
*/
function quizMsg(sendText)
{
	// Customizes sendText by replacing tags with variables.
	if (player != null)
		sendText = sendText.replace("%PLAYER", player);
	sendText = sendText.replace("%WINNER", getWinner());
	sendText = sendText.replace("%LOSER", getLoser());
	sendText = sendText.replace("%QUIZ", quiz.title);
	sendText = sendText.replace("%SUBJECT", quiz.subject);
	sendText = sendText.replace("%TIME", timer + " seconds");
	if (player in points)
		sendText = sendText.replace("%POINTS", points[player]);
	if (getWinner() in points)
		sendText = sendText.replace("%POINTS_WINNER", points[getWinner()]);
	if (getLoser() in points)
		sendText = sendText.replace("%POINTS_LOSER", points[getLoser()]);
	sendMsg(channels.quiz, sendText);
}
/* Accepts an array of potential messages, picks one randomly, and sends it through quizMsg
quizMessages: Array of messages
*/
function quizMsgArr(quizMessages)
{
	var i = Math.floor(Math.random()*quizMessages.length);
	quizMsg(quizMessages[i]);
	return quizMessages[i];
}
/* Returns the current winning player as a User */
function getWinner()
{
	var high = 0, topPlayer;
	points.forEach(function(points, player)
	{
		if (points >= high)
		{
			high = points;
			topPlayer = player;
		}
	});
	return topPlayer;
}
/* Returns the current losing player as a User */
function getLoser()
{
	var low = null, botPlayer;
	points.forEach(function(points, player)
	{
		if (low === null || points < low)
		{
			low = points;
			botPlayer = player;
		}
	});
	return botPlayer;
}
function sendMsg(channel, sendText)
{
	if (sendText === undefined || sendText === "")
	{
		console.log("Error: No message to send.")
		return;
	}
	if (config.allCaps)
		sendText = sendText.toUpperCase();
	console.log("Sending message: \n"+sendText);
	if (channel === null)
		console.log("Error: Channel not found.");
	else
	{
		try {
			channel.send(sendText);
		} catch(err) {
			console.log("Message failed to send.\n"+err);
		}
	}
}

/* Sends text to the standard channel
sendText: Text to send
*/
function sendStd(sendText)
{
	sendMsg(channels.std, sendText);
}

/* Sends a message responding to a user in the channel a message was sent from
msg: Message to respond to
sendText: Text to respond with
*/
function respondMsg(msg, sendText)
{
	sendMsg(msg.channel, sendText);
}

/* Returns copy of the input string with keys replaced by variables
msg: message to replace the strings in
*/
function custMsg(text)
{
	var newText = text;
	if (curMsg !== null)
		newText = newText.replace("%USER", curMsg.author);
	newText = newText.replace("%ADMIN", config.admin);
	newText = newText.replace("%TIMER", timer+" seconds");
	newText = newText.replace("%PREFIX", config.prefix);
	if (host !== null)
		newText = newText.replace("%HOST", host.name);
	return newText;
}

/* Returns the channel with the specified name from the channel list
channels: Array of channels
name: Name of channel to find
*/
function findChannelByName(searchChannels, name)
{
	var retChannel = searchChannels.find(x => x.name === name);
	if (retChannel === null)
		return searchChannels.first;
	else
		return retChannel;
}

/* shuffles the contents of an array using the Fisher-Yates algorithm
arr: array to shuffle
*/
function shuffle(arr)
{
	var i, j, temp;
	for (i = arr.length - 1; i > 0; i--)
	{
		j = Math.floor(Math.random() * (i + 1))
		x = arr[i];
		arr[i] = arr[j];
		arr[j] = x;
	}
	return arr;
}

/* Reads a JSON file at path and returns a JSON object
path: Location of json file
*/
function readJson(path)
{
	var rawData = FS.readFileSync(path);
	var json = JSON.parse(rawData);
	return json;
}

/* Starts the bot */
function main()
{
	client.login(config.token);
}

main();
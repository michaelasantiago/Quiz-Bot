// Discord Master Object
const Discord = require('discord.js');
// File System Master Object
const FS = require('fs');
// Levenstein Master Object (for accepting fuzzy answers)
const leven = require('fast-levenshtein');
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

// Short list of number conversions for 1-10
const numberNames = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// Runs when first joining the server
client.on('ready', () => {
	console.log('Bot is now connected.');
	channels.std = findChannelByName(client.channels, config.defaultChannel);
	channels.cur = channels.std;
	channels.quiz = channels.std;
	// Loading default host
	loadHost(quizConfig.defaultHost);
	// Setting standard avatar
	setBotAvatar(config.stdAvatar);
	// Sending greeting message
	sendStd(messages.greeting);
});

// Runs upon seeing a message
client.on('message', (msg) => {
	// Does not read own messages
	if (msg.author.bot)
		return;
	curMsg = msg;
	adminCommands(msg);
	if (quizState === 0 || msg.channel != channels.quiz)
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
		respondMsg(msg, replaceTags(messages.ping));
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
			echoText = replaceTags(messages.echo);
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
		respondMsg(msg, replaceTags(messages.timer));
		setTimeout( () => respondMsg(msg, replaceTags(messages.timerDone) ) , timer*1000);
	}
	else if (checkCmd(msg, "host"))
	{
		console.log("Received host command.");
		var args = splitMsg(msg);
		loadHost(args[1]);
		respondMsg(msg, replaceTags(messages.host));
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
				respondMsg(msg, replaceTags(messages.needHost));
				throw ("Cannot start quiz: need host");
			}
			// Cannot start quiz if quiz is already in progress
			if (quizState != 0)
			{
				respondMsg(msg, replaceTags(messages.quizActive) );
				throw ("Cannot start quiz; quiz already in progress.");
			}
			var path = config.quizPath+args[1]+".json";
			// Attempting to read quiz from file
			if (FS.existsSync(path))
				quiz = readJson(path);
			else
			{
				respondMsg(msg, replaceTags(messages.quizNotFound));
				throw ("Cannot start quiz; quiz file not found.");
			}
			// Setting avatar to quiz host avatar
			setBotAvatar(host.imagePath);
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
				setQuizState(1);
				timer = quizConfig.signUpDuration;
				respondMsg(msg, replaceTags(messages.signUp) );
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
	// Answering
	if (quizState == 3 || quizState == 4)
	{
		answerQuestion(msg);
	}
}



/* Extracts a command from a message
msg: Message to check
cmd: Command name as string
*/
function checkCmd(msg, cmd)
{
	var msgCmd = splitMsg(msg)[0];
	msgCmd = msgCmd.toLowerCase();
	return (msgCmd === (config.prefix+cmd));
}


/* Returns a split message into its arguments by spaces
msg: Message to split
*/
function splitMsg(msg)
{
	return msg.content.split(' ');
}

/* Determines if a message answers the current question and awards points
msg:  Message containing potential answer
*/

function answerQuestion(msg)
{
	// Answer begins with valid prefix (unnecessary if prefix is "" or null)
	if (!quizConfig.prefix || msg.content.startsWith(quizConfig.prefix))
	{
		var playerAns = msg.content;
		// If prefix exists, remove it from the start of the string
		if (quizConfig.prefix)
		{
			playerAns = playerAns.substring(quizConfig.prefix.length, playerAns.length);
		}
		// Converting answer to lowercase for easier comparison
		playerAns = playerAns.toLowerCase();
		// Number of correct answers accumulated
		var corrects = 0;
		/*	This is a terrible and erroneous algorithm
			In the event where a question requires multiple answers and answers contain other answers, this can credit extra correct answers
		*/
		for (var i = 0; i < correctAnswers.length; i++)
		{
			// Accepting a "wordy" answer if the exact answer is included in the string or if the Levenshtein distance is appropriately low
			if (quiz.questions[questionNum].wordy || quizConfig.allowWordy)
			{
				if (checkAnswer(playerAns, correctAnswers[i]))
					corrects++;
			}
			else
			{
				// Only accepting exact answers
				if (playerAns == correctAnswers[i])
					corrects++;
			}
			
		}
		// Enough correct answers are obtained
		if (corrects >= quiz.questions[questionNum].requiredAnswers)
		{
			awardPoints = quiz.questions[questionNum].points;
			player = msg.author;
			console.log(points[player]);
			// Setting new players to 0 points
			if (points[player] == undefined)
				points[player] = 0;
			if (quizState == 3)
				points[player] += awardPoints;
			else
				points[player] += awardPoints*quizConfig.lateAnswerMult;
			console.log(player + " points = "+points[player]);
			// Instantly declaring answer if lateAnswerPeriod is zero or lateAnswerMult is zero
			if (quizConfig.lateAnswerPeriod <= 0 || lateAnswerMult <= 0)
			{
				declareCorrectAnswer(msg);
				timer = quizConfig.nextDelay;
				// Advancing to the next loop of the quiz
				setQuizState(2);
				setTimeout(nextQuestion, timer*1000);
			}
			else
			{
				// Beginning late answer period
				if (quizState == 3)
				{
					setTimeout(nextQuestion, quizConfig.lateAnswerPeriod*2);
					setQuizState(4);
				}
				// Delaying answer announcement
				timer = quizConfig.lateAnswerPeriod;
				setTimeout( () => declareCorrectAnswer(msg) , timer*1000);
			}
		}
	}
}

/* Checks an answer against a supplied answer, returning the answer if correct
playerAns:  The player's answer
correctAns:  The correct answer
*/
function checkAnswer(playerAns, correctAns, strict = false)
{
	if (strict)
	{
		// Strict answers must be solely the correct answer
		if (playerAns === correctAns)
			return playerAns;
	}
	else if (playerAns.includes(correctAns))
		return playerAns;
	return false;
	/* Allowing fuzzy answers-to be changed later
	 ||
	leven.get(playerAns, correctAnswers[i]) < correctAnswers[i].length*quizConfig.answerFuzz)*/
}
function declareCorrectAnswer(msg)
{
	player = msg.author;
	quizMsgCustArr(host.responses.correct);
}

/* Loads a host, given their name
name: Name of file without the .json extension
*/
function loadHost(name)
{
	host = readJson(config.hostPath + name + ".json");
	host.pointsWinner = [];
	host.pointsLoser = [];
	host.pointsNormal = [];
	// Splitting answer responses into winner/loser/normal
	for (var i = 0; i < host.responses.points.length; i++)
	{
		var curString = host.responses.points[i];
		if (curString.includes("%POINTS_WINNER"))
			host.pointsWinner.push(curString);
		else if (curString.includes("%POINTS_LOSER"))
			host.pointsLoser.push(curString);
		else
			host.pointsNormal.push(curString);
	}
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
	quizMsg(replaceTagsQuiz(host.intro));
	// Must start quiz by asking a question
	canAltAction = false;
	nextQuestion();
}
// Starting point for the quiz loop
function nextQuestion()
{
	// Setting quiz to "waiting for timeout" state
	setQuizState(2);
	// Picking action
	if (questionNum < questions.length - 1)
	{
		// These actions are not performed after the last question
		if (canAltAction)
		{
			if (quizConfig.tallyFreq != -1 && points.length > 0 && questionNum >= 0 && questionNum % quizConfig.tallyFreq === 1)
			{
				// Tallying points
				canAltAction = false;
				timer = quizConfig.nextDelay;
				setTimeout(startTally, timer*1000);
				return;
			}
			else if (questionNum % quizConfig.commentFreq === 1)
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
		setTimeout(startTally, timer*1000);
	}
}

/* Starts tallying points */
function startTally()
{
	// Skips tally if quizConfig.pointDelay is negative or if there are no players in points
	if (quizConfig.pointDelay >= 0 && Object.keys(points).length > 0)
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
	quizMsgCustArr(host.responses.tally);
	timer = quizConfig.pointDelay;
	var playerKeys = Object.keys(points);
	// Staggered announcements
	if (timer > 0)
	{
		console.log("Performing point tally.");
		for (var playerKey in playerKeys)
		{
			console.log("we made it into the foreach at least");
			setTimeout( () => pointsMsg(points[playerKey], playerKey), timer)
			timer += quizConfig.pointDelay;
		};
	}
	else if (timer === 0)
	{
		console.log("Performing quick tally.");
		// Condensed format for outputting points
		pointStr = "| ";
		for (var playerKey in playerKeys)
		{
			pointStr += playerKey + ": " + points[playerKey] + " | ";
		}
		quizMsg(pointStr);
	}
	return timer;
}
/* Sends point tally for the specified player
points:  Points of player
player:  Player, as User
*/
function pointsMsg(points, player)
{
	this.player = player;
	// Selecting appropriate quiz messages
	var quizMessages = host.pointsNormal;
	if (player == getWinner() && host.pointsWinner .length > 0)
		quizMessages = host.pointsWinner ;
	else if (player == getLoser() && host.pointsLoser.length > 0)
		quizMessages = host.pointsLoser;
	quizMsgCustArr(quizMessages);
}

/* Writes a random quiz comment */
function quizComment()
{
	quizMsgCustArr(host.responses.comment)
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
			correctAnswers.push(answers[i].answerText.toLowerCase());
	console.log(correctAnswers);
	// Introducing question
	quizMsgCustArr(host.responses.question);
	// Sending question
	quizMsg("[" + (questionNum + 1) + "]  " + questions[questionNum].questionText);
	// Accepting answers state
	setQuizState(3);
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
	if (questionNum != num || quizState != 3)
		return;
	var answers = quiz.questions[num].answers;
	// Stops if there are no distractor answers to provide
	if (correctAnswers.length === answers.length)
		return;
	console.log(correctAnswers.length +" = " + answers.length);
	console.log(correctAnswers);
	quizMsgCustArr(host.responses.answers);
	var answerStr = "";
	for (var i = 0; i < answers.length; i++)
		answerStr += answers[i].answerText + "\n";
	quizMsg(answerStr);
}

// Ends a question, failing if the question has already been answered
function endQuestion(num)
{
	// Fails if question has already been answered or advanced
	if (questionNum != num || quizState != 3)
		return;
	quizMsgCustArr(host.responses.timeout);
	setQuizState(2);
	nextQuestion();
}

// Ends the quiz
function endQuiz()
{
	quizMsg(replaceTagsQuiz(host.congrats));
	quizMsg(replaceTagsQuiz(host.close));
	setQuizState(0);
	quiz = null;
	quizMsg(messages.quizEnd);
	// Resetting to standard avatar
	setBotAvatar(config.stdAvatar);
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
			request.then( () => respondMsg(msg, replaceTags(messages.setAvatar)), () => respondMsg(msg, replaceTags(messages.failAvatar)));
	} catch(err) {
		console.log(err);
		respondMsg(msg, replaceTags(messages.noAvatar))
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
/* Sends text to the quiz channel
sendText: Text to send
*/
function quizMsg(sendText)
{
	// Customizes sendText by replacing tags with variables.
	sendMsg(channels.quiz, sendText);
}
/* Accepts an array of potential messages, picks one randomly, and sends it through quizMsg
quizMessages: Array of messages
*/
function quizMsgCustArr(quizMessages)
{
	// Selecting one valid string at random
	randMessages = shuffle(quizMessages);
	var text;
	for (var i = 0; i < randMessages.length; i++)
	{
		// Searching for a string that does not contain undefined keywords
		text = replaceTagsQuiz(randMessages[i]);
		if (text !== null)
			break;
	}
	if (text !== null)
		quizMsg(text);
	else
		return false;
	return true;
}
/* Swaps out keys in a quiz message with their appropriate variables and returns the resulting string.
If a key is present and cannot be swapped, rejects string and returns null
text: Base string to create modified string from
*/
function replaceTagsQuiz(text)
{
	newText = text;
	newText = validateAndReplace(newText, "%PLAYER", player);
	newText = validateAndReplace(newText, "%WINNER", getWinner());
	newText = validateAndReplace(newText, "%LOSER", getLoser());
	newText = validateAndReplace(newText, "%QUIZ", quiz.title);
	newText = validateAndReplace(newText, "%SUBJECT", quiz.subject);
	newText = validateAndReplace(newText, "%TIME", timer + " seconds");
	newText = validateAndReplace(newText, "%POINTS", points[player]);
	newText = validateAndReplace(newText, "%POINTS_WINNER", points[getWinner()]);
	newText = validateAndReplace(newText, "%POINTS_LOSER", points[getLoser()]);
	return newText;
}

/* Swaps out quiz key in the text for newStr and returns modified string.  If key is present and cannot be swapped, returns null
text:	Base string to create modified string from
key:	substring to replace
newStr:	string with which to replace substring
*/
function validateAndReplace(text, key, newStr)
{
	// Cannot modify null or empty text
	if (!text)
		return null;
	if (text.includes(key))
	{
		if (!newStr)
			return null;
		else
			return text.replace(key, newStr);
	}
	return text;
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
	if (sendText === undefined || sendText === "" || sendText === null)
	{
		console.log("Error: No message to send.")
		return;
	}
	// Converting text to all caps if specified in config (Does not take effect during quiz)
	if (config.allCaps && quiz === null)
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
text: message to replace the strings in
*/
function replaceTags(text)
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

/* Sets the quiz state.  See beginning of file for state descriptions
state: state to change, int
*/
function setQuizState(newState)
{
	// No need to change state if already in the current state
	if (newState === quizState)
		return;
	console.log(`Changing quiz state from ${quizState} to ${newState}.`);
	quizState = newState;
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
	// Does not work on nulls
	if (arr === null)
		return null;
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
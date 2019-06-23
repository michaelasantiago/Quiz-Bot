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

// I/O Helper Functions
const BotIO = require('./botIO.js');
// Command handling functions
const CommandHandler = require('commands.js');
// Quiz functions
const Quiz = require('./quiz.js');
// Client object
const client = new Discord.Client();
// I/O object
const IO = new BotIO.IO(config, messages);
// Commands object
const commands = CommandHandler.Commands(this, IO, messages)

// Properties
var timer;
var curMsg;

var host = null;
var quiz = null;

// Runs when first joining the server
client.on('ready', () => {
	console.log('Bot is now connected.');
	// Loading default host
	loadHost(quizConfig.defaultHost, false);
	// Setting standard avatar
	setBotAvatar(config.stdAvatar);
	// Sending greeting message
	IO.sendMsg(messages.greeting);
});

/* Commands
Each command takes a msg and an array of strings as args
msg: Message containing the command
args: Args associated with the command
*/

commands = {};

commands["ping"] = function(msg, args)
{
    IO.respondMsg(msg, replaceTags(messages.ping));
}
commands["ping"].type = "std";

commands["resetavatar"] = function(msg, args)
{
	setBotAvatarManual(msg, config.stdAvatar);
}
commands["resetavatar"].type = "std";

commands["echo"] = function(msg, args)
{
	// Echo
	// Accumulating all text to echo (other than the command) in echoText
	var splitText = splitMsg(msg);
	var echoText = "";
	for (var i = 1; i < splitText.length; i++)
		echoText += splitText[i]+" ";
	// Responding with default text if extra text was not present
	if (echoText == "")
		echoText = replaceTags(messages.echo);
	IO.respondMsg(msg, echoText);
}
commands["echo"].type = "std";

commands["timer"] = function(msg, args)
{
		// Sets a timer for the specified time
		if (!args[0])
			timer = 10;
		else
			timer = parseInt(args[0]);
		IO.respondMsg(msg, replaceTags(messages.timer));
		setTimeout( () => IO.respondMsg(msg, replaceTags(messages.timerDone) ) , timer*1000);
}
commands["timer"].type = "std";

// Quiz-related commands
commands["host"] = function(msg, args)
{
	var args = splitMsg(msg);
	loadHost(args[1], true);
	IO.respondMsg(msg, replaceTags(messages.host));
}
commands["host"].type = "std";

commands["quiz"] = function(msg, args)
{
	// Initiating a quiz
	try
	{
		// Cannot start quiz without a host
		if (host === null)
		{
			IO.respondMsg(msg, replaceTags(messages.needHost));
			throw ("Cannot start quiz: need host");
		}
		// Cannot start quiz if quiz is already in progress
		if (quizState != 0)
		{
			IO.respondMsg(msg, replaceTags(messages.quizActive) );
			throw ("Cannot start quiz; quiz already in progress.");
		}
		var path = config.quizPath+args[1]+".json";
		// Attempting to read quiz from file
		if (FS.existsSync(path))
			quiz = readJson(path);
		else
		{
			IO.respondMsg(msg, replaceTags(messages.quizNotFound));
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
			IO.respondMsg(msg, replaceTags(messages.signUp) );
			setTimeout(startQuiz, timer*1000);
		}
	}
	catch(err)
	{
		console.log(err);
		IO.respondMsg(msg, messages.quizFail);
	}
}
commands["quiz"].type = "std";
commands["start"] = function(msg, args)
{
		// Starting the quiz
		if (quiz.state === 1)
		startQuiz();
}
commands["start"].type = "std";

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

// Runs upon seeing a message
client.on('message', (msg) => {
	// Does not read own messages
	if (msg.author.bot)
		return;
	curMsg = msg;
	const args = msg.content.slice(config.prefix.length).split(" ");
	const cmd = args.shift().toLowerCase();
	// Checking command list
	for (var command in commands)
	{
		if (cmd === command)
		{
			// Checking if required privileges are met
			console.log("Received "+cmd+" command.");
			commands[command](msg, args);
		}
	}
	curMsg = null;
});

/* Loads a host, given their name
name: Name of file without the .json extension
changeAvatar: T/F Whether to load the new avatar
*/
function loadHost(name, changeAvatar)
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
	if (changeAvatar)
		setBotAvatar(host.imagePath);
}

/* Commands handled during quizzes
msg: Message holding the command
*/
function quizCommands(msg)
{
	if (checkCmd(msg, "start") )
	{

	}
	// Answering
	if (quizState == 3 || quizState == 4)
	{
		answerQuestion(msg);
	}
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
			request.then( () => IO.respondMsg(msg, replaceTags(messages.setAvatar)), () => IO.respondMsg(msg, replaceTags(messages.failAvatar)));
	} catch(err) {
		console.log(err);
		IO.respondMsg(msg, replaceTags(messages.noAvatar))
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

/* Reads a JSON file at path and returns a JSON object
path: Location of json file
*/
function readJson(path)
{
	var rawData = FS.readFileSync(path);
	var json = JSON.parse(rawData);
	json.myPath = path;
	return json;
}
/* Saves a given object as a JSON in its original loading location
obj: Object to save
*/
function saveJson(obj)
{
	var rawData = JSON.stringify(obj)
	FS.writeFileSync(obj.myPath, rawData)
}

/* Starts the bot */
function main()
{
	client.login(config.token);
}

main();
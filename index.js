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
const CommandHandler = require('./commands.js');
// Quiz functions
// const Quiz = require('./quiz.js');
// Client object
const client = new Discord.Client();
// I/O object
const IO = new BotIO.IO(config, messages);
// Commands object
const commands = new CommandHandler.Commands(this, client, IO, config, quizConfig, messages)

// Properties
this.host = null;
this.quiz = null;

// Runs when first joining the server
client.on('ready', () => {
	console.log('Bot is now connected.');
	// Loading default host
	loadHost(quizConfig.defaultHost, false);
	// Setting standard avatar
	setBotAvatar(config.stdAvatar);
	// Sending greeting message
	IO.sendMsg(IO.findChannelByName(client.channels, config.defaultChannel), messages.greeting);
});

// Runs upon seeing a message
client.on('message', (msg) => {
	// Does not read own messages
	if (msg.author.bot)
		return;
	curMsg = msg;
	const args = msg.content.slice(config.prefix.length).split(" ");
	const cmd = args.shift().toLowerCase();
	// Checking command list
	for (var command in commands.cmdDict)
	{
		if (cmd === command)
		{
			console.log("Received "+cmd+" command.");
			cmdFunc = commands.cmdDict[command];
			if (cmdFunc.type == "admin")
			{
				// Checking for privileges on admin commands
				if (msg.author.tag !== config.admin && msg.author.id !== msg.guild.owner.id)
				{
					console.log("Cannot execute command: " + msg.author.name + " does not have the privileges for this command.");
					break;
				}
			}
			else
			if (cmdFunc.type == "std")
			{
				// Checking to see if a std command can be accepted
				if (this.quiz && this.quiz.channel === msg.channel) 
				{
					console.log("Cannot execute command: standard commands do not work during quiz operation.");
					break;
				}
			}
			else if (cmdFunc.type == "quiz")
			{
				// Can only execute quiz functions during quizzes
				if (quiz === null || msg.channel === this.quiz.channel)
				{
					console.log("Cannot execute command: quiz commands are only available during quizzes.")
					break;
				}
			}
			commands.curMsg = msg;
			cmdFunc(msg, args);
		}
	}
	// Sending potential answers to quiz
	if (this.quiz != null)
	{
		console.log(msg.content + " received.");
		var state = this.quiz.getState();
		if (state == 3 || state == 4)
			quiz.answerQuestion(msg);
	}
	curMsg = null;
});

/* Loads a host, given their name
name: Name of file without the .json extension
changeAvatar?: Whether to load the new avatar
*/
function loadHost(name, changeAvatar)
{
	var host = readJson(config.hostPath + name + ".json");
	if (host === null)
		return null;
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
	this.host = host;
	return host;
}
this.loadHost = loadHost;

/* Ends the current quiz, dereferencing it and changing the avatar back to standard */
function endQuiz()
{
	console.log("Dereferencing quiz.");
	IO.sendMsg(quiz.channel, messages.quizEnd);
	setBotAvatar(config.stdAvatar);
	quiz = null;
}
this.endQuiz = endQuiz;
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
this.setBotAvatar = setBotAvatar;
/* Reads a JSON file at path and returns a JSON object
path: Location of json file
*/
function readJson(path)
{
	if (FS.existsSync(path))
		var rawData = FS.readFileSync(path);
	else
	{
		console.log(path + " does not exist.");
		return null;
	}
	var json = JSON.parse(rawData);
	json.myPath = path;
	return json;
}
this.readJson = readJson;
/* Saves a given object as a JSON in its original loading location
obj: Object to save
*/
function saveJson(obj)
{
	var path = obj.myPath;
	obj.myPath = undefined;
	var rawData = JSON.stringify(obj, null , '\t');
	obj.myPath = path;
	FS.writeFileSync(path, rawData)
}
this.saveJson = saveJson;

/* Starts the bot */
function main()
{
	client.login(config.token);
}

main();
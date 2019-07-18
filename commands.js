exports.Commands = function(botIn, clientIn, IOIn, configIn, quizConfigIn, messagesIn)
{
    // Importing Quiz for commands
    const QuizBuilder = require('./quiz.js');
    // File System Master Object
    const FS = require('fs');
    // Private variables
    const bot = botIn;
    const IO = IOIn;
    const client = clientIn;
    const messages = messagesIn;
    const config = configIn;
    const quizConfig = quizConfigIn;
    var timer = 0;
    var host = null;
    var configVar = null;
    var value = null;

    // Public variables
    this.cmdDict = {};
    this.curMsg = null;

    // Public functions

    // Ping
    this.cmdDict.ping = function(msg, args)
    {
        IO.respondMsg(msg, replaceTags(messages.ping));
    }
    this.cmdDict.ping.type = "std";

    // Echo
    this.cmdDict.echo = function(msg, args)
    {
        // Echo
        // Accumulating all text to echo (other than the command) in echoText
        var echoText = "";
        for (var i = 0; i < args.length; i++)
            echoText += args[i]+" ";
        // Responding with default text if extra text was not present
        if (echoText == "")
            echoText = replaceTags(messages.echo);
        IO.respondMsg(msg, echoText);
    }
    this.cmdDict.echo.type = "std";

    // Timer
    this.cmdDict.timer = function(msg, args)
    {
            // Sets a timer for the specified time
            if (args[0])
                timer = parseInt(args[0]);
            else
                timer = 10;
            IO.respondMsg(msg, replaceTags(messages.timer));
            let endTimerText = replaceTags(messages.timerDone);
            let timerMsg = msg;
            setTimeout( () => IO.respondMsg(timerMsg, endTimerText) , timer*1000);
    }
    this.cmdDict.timer.type = "std";

    // Admin commands

    // Stopping bot
    this.cmdDict.poweroff = function(msg, args)
    {
        console.log("Turning off bot...");
        IO.respondMsg(msg, replaceTags(messages.powerOff))
        setTimeout(() => {
            client.destroy();
            console.log("Terminating program.");
            process.exit();
        }, 3000);
    }
    this.cmdDict.poweroff.type = "admin";

    // Reset Avatar
    this.cmdDict.resetavatar = function(msg, args)
    {
        setBotAvatarManual(msg, config.stdAvatar);
    }
    this.cmdDict.resetavatar.type = "admin";

    // Set config values
    this.cmdDict.config = function(msg, args)
    {
        configure(config, msg, args[0], args[1]);
    }
    this.cmdDict.config.type = "admin";

    // Set quiz config values
    this.cmdDict.quizconfig = function(msg, args)
    {
        configure(quizConfig, msg, args[0], args[1])
    }
    this.cmdDict.quizconfig.type = "admin";

    // Show values of config/quizConfig/messages
    this.cmdDict.show = function(msg, args)
    {
        var obj;
        var objName = args[0].toLowerCase();
        if (args[0] == "config")
            obj = config;
        if (args[0] == "quizconfig")
            obj = quizConfig;
        if (args[0] == "messages")
            obj = messages;
        var text = "```json\n[" + args[0] + "]\n";
        for (var key in obj)
        {
            // Don't show myPath or Token
            if (key === "myPath" || key === "token")
                continue;
            text += key + ":\t\t" + obj[key] + "\n";
        }
        text += "```";
        IO.respondMsg(msg, text, false);
    }
    this.cmdDict.show.type = "admin";
 
    // Quiz-related commands

    // Change host
    this.cmdDict.host = function(msg, args)
    {
        if (FS.existsSync(config.hostPath + args[0] + ".json"))
        {
            host = bot.loadHost(args[0], true);
            IO.respondMsg(msg, replaceTags(messages.host));
        }
        else
            IO.respondMsg(msg, replaceTags(messages.hostNotFound));
    }
    this.cmdDict.host.type = "std";

    // Begin quiz
    this.cmdDict.quiz = function(msg, args)
    {
        host = bot.host;
        if (args.length == 0)
        {
            IO.respondMsg(msg, replaceTags(messages.needQuiz));
            return;
        }
        var quizData = null;
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
            if (bot.quiz != undefined)
            {
                if (bot.quiz.state != 0)
                {
                    IO.respondMsg(msg, replaceTags(messages.quizActive) );
                    throw ("Cannot start quiz; quiz already in progress.");
                }
            }
            var path = config.quizPath+args[0]+".json";
            // Attempting to read quiz from file
            if (FS.existsSync(path))
                quizData = bot.readJson(path);
            else
            {
                IO.respondMsg(msg, replaceTags(messages.quizNotFound));
                throw ("Cannot start quiz; quiz file not found.");
            }
        }
        catch(err)
        {
            console.log(err);
            IO.respondMsg(msg, messages.quizFail);
            return;
        }
        // Setting avatar to quiz host avatar
        bot.setBotAvatar(bot.host.imagePath);
        quiz = new QuizBuilder.Quiz(bot, IO, quizConfig, quizData, msg.channel);
        bot.quiz = quiz;
        // Beginning the quiz
        if (args.includes("-open") || quizConfig.signUpDuration <= 0)
        {
            // Open quizzes skip signups and start immediately
            quiz.open = true;
            IO.respondMsg(msg, replaceTags(messages.quizStart));
            quiz.run();
        }
        else
        {
            // Opening quiz signups
            quiz.setState(1);
            timer = quizConfig.signUpDuration;
            IO.respondMsg(msg, replaceTags(messages.signUp) );
            let asyncRun = ( (asyncQuiz) => setTimeout(asyncQuiz.run, timer*1000) );
            asyncRun(quiz);
        }
    }
    this.cmdDict.quiz.type = "std";

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
    /* Replaces the tags within the given text with existing variable values and returns the new string
    text: Text to replace tags within
    */
    function replaceTags(text)
    {
        var newText = text;
        if (curMsg !== null)
            newText = newText.replace("%USER", curMsg.author);
        newText = newText.replace("%ADMIN", config.admin);
        var replaceText = timer + " seconds";
        if (timer === 1)
            replaceText = timer + " second";
        newText = newText.replace("%TIMER", replaceText);
        newText = newText.replace("%PREFIX", config.prefix);
        if (host !== null)
            newText = newText.replace("%HOST", host.name);
        if (configVar !== null)
            newText = newText.replace("%VAR", configVar);
        if (value !== null)
            newText = newText.replace("%VAL", value);
        return newText;
    }
    /* Modifies the given config obj and saves it externally
    configObj:  Config to modify
    msg:        msg that ordered the modification
    varName:    Name of variable to modify
    newVal:     New value to set variable to
    */
    function configure(configObj, msg, varName, newVal)
    {
        configVar = varName;
        value = newVal;
        // Converting number strings to numbers
        if (!isNaN(value))
            value = parseInt(value);
        // Converting boolean strings to true/false
        if (value === "false")
            value = false;
        else if (value === "true")
            value = true;
        // Checking to see if property exists
        if (!configObj.hasOwnProperty(configVar))
        {
            IO.respondMsg(msg, replaceTags(messages.failConfig));
            return;
        }
        // Checking to see if property already has this value
        if (configObj[configVar] === value)
        {
            IO.respondMsg(msg, replaceTags(messages.oldConfig));
            return;
        }
        // Checking to see if someone other than botAdmin is modifying botAdmin
        if (configVar === "botAdmin" && configObj["botAdmin"] != msg.owner.tag)
        {
            IO.respondMsg(msg, replaceTags(messages.onlyBotAdmin));
            return;
        }
        configObj[configVar] = value;
        IO.respondMsg(msg, replaceTags(messages.setConfig), false);
        bot.saveJson(configObj);
    }
}
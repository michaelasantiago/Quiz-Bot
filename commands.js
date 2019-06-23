exports.Commands = function(bot, IOObj, messagesObj)
{
    var IO = IOObj;
    var messages = messagesObj;
    this.ping = function(msg, args)
    {
        IO.respondMsg(msg, replaceTags(messages.ping));
    }
    this.ping.type = "std";

    this.resetAvatar = function(msg, args)
    {
        setBotAvatarManual(msg, config.stdAvatar);
    }
    this.resetAvatar.type = "std";

    this.echo = function(msg, args)
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
        IO.respondMsg(msg, echoText);
    }
    this.echo.type = "std";

    this.timer = function(msg, args)
    {
            // Sets a timer for the specified time
            console.log("Received timer command.");
            var arg = splitMsg(msg)[1];
            if (arg === null || arg === undefined)
                timer = 10;
            else
                timer = parseInt(arg);
            IO.respondMsg(msg, replaceTags(messages.timer));
            setTimeout( () => IO.respondMsg(msg, replaceTags(messages.timerDone) ) , timer*1000);
    }
    this.timer.type = "std";

    // Quiz-related commands
    this.host = function(msg, args)
    {
        console.log("Received host command.");
        var args = splitMsg(msg);
        loadHost(args[1], true);
        IO.respondMsg(msg, replaceTags(messages.host));
    }
    this.host.type = "std";

    this.quiz = function(msg, args)
    {
        // Initiating a quiz
        console.log("Received initiate quiz command.");
        var args = splitMsg(msg);
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
    this.quiz.type = "std";

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
}
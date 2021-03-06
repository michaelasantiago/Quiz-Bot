// Constructor for a quiz object
exports.Quiz = function(botIn, IOIn, quizConfigIn, quizIn, channelIn)
{
	const bot = botIn;
	const IO = IOIn;
	const channel = channelIn;
	this.channel = channel;
	const quizConfig = quizConfigIn;

	// Whether this quiz accepts answers from all sources
	this.open = false;

	/* quiz states
	0: Inactive
	1: Waiting for player sign-ups
	2: Active (Between timeouts)
	3: Waiting for answers
	4: Waiting for late answers
	*/
	var state = 0;
	/* pause states
	0: Unpaused
	1: Pausing at start of next loop
	2: Paused
	*/
	var pauseState = 0;
	var correctAnswers;
	var questionNum = 0;
	var points = {};
	var player = null;
	var canAltAction;
	var timer = 0;

	// Loading common variables from quizObj
	const quizData = quizIn;
	var questions = quizIn.questions;

	// Short list of number conversions for 1-10
	const numberNames = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

	/* Begins a quiz, ending signups */
	this.run = function()
	{
		// Getting questions
		// Randomizing question order
		if (quizConfig.randomize)
			questions = shuffle(questions);
		questionNum = -1;
		quizMsgCustArr(host.responses.intro);
		// Must start quiz by asking a question
		canAltAction = false;
		nextRound();
	}
	// Starting point for the quiz loop
	function nextRound()
	{
		// Setting quiz to "waiting for timeout" state
		setState(2);
		// Picking action
		if (questionNum < questions.length - 1)
		{
			// These actions are not performed after the last question
			if (canAltAction)
			{
				if (quizConfig.tallyFreq != -1 && Object.keys(points).length > 0 && questionNum >= 0 && (questionNum % quizConfig.tallyFreq === 1))
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
			setTimeout(nextRound, timer + quizConfig.nextDelay);
		}
		else
		{
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
			for (var playerKey of playerKeys)
			{
				delayPointsMsg = (curKey, time) => setTimeout( () => pointsMsg(curKey), time);
				delayPointsMsg(playerKey, timer);
				timer += quizConfig.pointDelay;
			}
		}
		else if (timer === 0)
		{
			console.log("Performing quick tally.");
			// Condensed format for outputting points
			pointStr = "| ";
			for (var playerKey of playerKeys)
			{
				pointStr += playerKey + ": " + points[playerKey] + " | ";
			}
			quizMsg(pointStr);
		}
		return timer;
	}
	/* Sends point tally for the specified player
	points:  Points of player
	scoringPlayer:  Player, as User
	*/
	function pointsMsg(scoringPlayer)
	{
		player = scoringPlayer;
		// Selecting appropriate quiz messages
		var quizMessages = host.pointsNormal;
		if (player == getWinner() && host.pointsWinner.length > 0)
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
		setTimeout(nextRound, timer);
	}

	// Begins a question
	function startQuestion()
	{
		questionNum++;
		// Getting answers and shuffling their order
		answers = shuffle(questions[questionNum].answers);
		// Setting correct answers
		correctAnswers = [];
		wrongAnswers = [];
		for (var i = 0, j = 0; i < answers.length; i++)
		{
			if (answers[i].correct)
				correctAnswers.push(answers[i].answerText.toLowerCase());
			else
				wrongAnswers.push(answers[i].answerText.toLowerCase());
		}
		console.log(correctAnswers);
		// Introducing question
		quizMsgCustArr(host.responses.question);
		// Sending question
		quizMsg("[" + (questionNum + 1) + "]  " + questions[questionNum].questionText);
		// Accepting answers state
		setState(3);
		// Provides answers if answerDelay is configured appropriately
		if (quizConfig.answerDelay < quizConfig.questionDuration && quizConfig.answerDelay >= 0)
		{
			timer = quizConfig.answerDelay;
			delayGiveAnswers = (saveNum) => setTimeout( () => giveAnswers(saveNum), timer*1000);
			delayGiveAnswers(questionNum);
		}
		// Setting question end timer
		timer = quizConfig.questionDuration;
		console.log("Question " + (questionNum+1) + " duration: " + timer + " seconds");
		if (quizConfig.questionDuration > 0)
		{
			delayEndQuestion = (saveNum) => setTimeout( () => endQuestion(saveNum), timer*1000);
			delayEndQuestion(questionNum);
		}
	}

	// Provides multiple-choice answers to a question, failing if the question has already been answered
	function giveAnswers(num)
	{
		// Stops if question has already been answered or advanced
		if (questionNum != num || state != 3)
			return;
		var answers = questions[num].answers;
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
				playerAns = playerAns.substring(quizConfig.prefix.length, playerAns.length);
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
				if (questions[questionNum].wordy || quizConfig.allowWordy)
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
			if (corrects >= questions[questionNum].requiredAnswers)
			{
				awardPoints = questions[questionNum].points;
				player = msg.author;
				// Setting new players to 0 points
				if (points[player] == undefined)
					points[player] = 0;
				if (state == 3)
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
					setState(2);
					setTimeout(nextRound, timer*1000);
				}
				else
				{
					// Beginning late answer period
					if (state != 4)
					{
						setTimeout(nextRound, quizConfig.lateAnswerPeriod*2);
						setState(4);
					}
					// Delaying answer announcement
					timer = quizConfig.lateAnswerPeriod;
					delayDeclareCorrectAnswer = (playerMsg) => setTimeout( () => declareCorrectAnswer(playerMsg), timer*1000);
					delayDeclareCorrectAnswer(msg);
				}
			}
		}
	}
	this.answerQuestion = answerQuestion;
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

	// Times-out a question, failing if the question has already been answered
	function endQuestion(num)
	{
		// Fails if question has already been answered or advanced
		if (questionNum != num || state != 3)
			return;
		console.log("Ending question "+(num+1));
		quizMsgCustArr(host.responses.timeout);
		setState(2);
		nextRound();
	}

	// Ends the quiz
	function endQuiz()
	{
		console.log("Ending quiz...");
		// Sending congratulatory message
		quizMsgCustArr(host.responses.congrats);
		// Sending closing message
		quizMsgCustArr(host.responses.close);
		// Unsetting quiz
		setState(0);
		// Providing bot's end quiz message (not host's)
		bot.endQuiz();
	}

	/* Sends text to the quiz channel
	sendText: Text to send
	*/
	function quizMsg(sendText)
	{
		// Customizes sendText by replacing tags with variables.
		IO.sendMsg(channel, sendText, false);
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
		newText = validateAndReplace(newText, "%QUIZ", quizData.title);
		newText = validateAndReplace(newText, "%SUBJECT", quizData.subject);
		newText = validateAndReplace(newText, "%TIME", timer + " seconds");
		newText = validateAndReplace(newText, "%POINTS_WINNER", points[getWinner()]);
		newText = validateAndReplace(newText, "%POINTS_LOSER", points[getLoser()]);
		newText = validateAndReplace(newText, "%POINTS", points[player]);
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
			{
				var regex = new RegExp(key, 'g');
				return text.replace(regex, newStr);
			}
		}
		return text;
	}

	/* Returns the current winning player as a User */
	function getWinner()
	{
		var high = 0, topPlayer;
		var playerKeys = Object.keys(points);
		for (var playerKey of playerKeys)
		{
			if (points[playerKey] >= high)
			{
				high = points[playerKey];
				topPlayer = playerKey;
			}
		}
		return topPlayer;
	}
	/* Returns the current losing player as a User */
	function getLoser()
	{
		var low = null, botPlayer;
		var playerKeys = Object.keys(points);
		if (playerKeys.length < 2)
			return null;
		for (i = playerKeys.length - 1; i >= 0; i--)
		{
			var playerKey = playerKeys[i];
			if (low === null || points[playerKey] < low)
			{
				low = points[playerKey];
				botPlayer = playerKey;
			}
		};
		return botPlayer;
	}

	/* Sets the quiz state.  See beginning of file for state descriptions
	state: state to change, int
	*/
	function setState(newState)
	{
		// No need to change state if already in the current state
		if (newState === state)
			return;
		console.log(`Changing quiz state from ${state} to ${newState}.`);
		state = newState;
	}
	this.setState = setState;
	/* Returns the quiz state.  See beginning of file for state descriptions
	*/
	this.getState = function()
	{
		return state;
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
}
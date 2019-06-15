Admin commands
resetAvatar         Resets the bot's avatar to the default

User commands
ping                Replies to the ping on the ping's channel
echo                Echoes text on the ping's channel
timer <time>        Starts a timer for <time> seconds.
host <host>         Sets the quiz host to <host>.
quiz <quiz>         Initiates a quiz with the appropriate <quiz> name and loads the host with the appropriate <host> name
    -open           Makes the quiz open, allowing anyone to answer questions and get points

Quiz commands
start               Ends signups and begins the quiz

Configuration settings:

Bot Config [config.json]
token:          Discord's private key for the bot.
botAdmin:       Administrator for this bot (not related to channel administrator)
prefix:         The prefix that must follow all bot commands.
defaultChannel: The default channel that the bot outputs to.  Greets this channel upon logging in.
stdAvatar:      The standard avatar for the bot.
quizPath:       The directory where Quizzes are held.
hostPath:       The directory where Quiz Hosts are held.
allCaps:        Whether the bot auto-capitalizes all of its output text

Quiz Config [quizconfig.json]
(All times are in seconds)
defaultHost:        Host loaded on bot startup
signUpDuration:     Period in which users can sign up for a quiz.
                    Will be infinite (requiring manual starting)
questionDelay:      Time between questions in the quiz.
answerDelay:        Time between asking a question and providing multiple-choice answers.  Will cause problems if longer than questionDelay.
                    If set to -1, does not show multiple-choice answers.
nextDelay:          Time between events in the quiz that are not specified here.
questionDuration:   Time between asking a question and forcibly ending the question.
lateAnswerPeriod:   Time period after the correct answer where further correct answers are accepted.
                    Will not accept late answers if set to 0.
lateAnswerMult:     Multiplier (preferably between 0 and 1) for points on late answers.
                    Will not accept late answers if set to 0.
pointDelay:         Time between each message when displaying contestant points
                    If set to 0, shows all user points in a single message.
tallyFreq:          How frequently the host automatically does point tallies (how many questions between each tally)
                    If set to 0, automatically tallies after every question.  If set to -1, never automatically tallies.
commentFreq:        How frequently the host makes random comments (how many questions between each comment)
randomize:          If true, randomizes question order in the quiz.

Custom Messages [messages.json]
Keys:
[%USER]:        User that sent the command.
[%ADMIN]:       Current bot administrator
[%TIMER]:       Timer time, in seconds.
[%QUIZ]:        Quiz name.

greeting:       Greeting to say upon logging into a server.  Outputs to defaultChannel.
ping:           Message to say in response to a ping command.
echo:           Default message to say in response to an echo command.
setAvatar:      Message to say after successfully setting an avatar.
noAvatar:       Message to say after failing to find an avatar.
failAvatar:     Message to say after failing to upload an avatar.
timer:          Message to say upon starting a timer.
timerDone:      Message to say at the end of a timer.
needHost:       Message to say when quiz is attempted to start without a host.
quizFail:       Message to say after failing to start a quiz.
signUp:         Message to say when informing players that they can sign up for the quiz.
quizStart:      Message to say when beginning a quiz.
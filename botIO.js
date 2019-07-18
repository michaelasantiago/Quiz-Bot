// BOT I/O Module for sending messages to Discord and reading JSON files

// Constructor function for new IO object
exports.IO = function(configObj)
{
    config = configObj;
    /* Sends a message to the given channel
    channel: Channel to send message to
    sendText: Content of message
    useCaps?: Whether to use the config file's capitalization rules
    */
    this.sendMsg = function(channel, sendText, useCaps = true)
    {
        if (sendText === undefined || sendText === "" || sendText === null)
        {
            console.log("Error: No message to send.")
            return;
        }
        // Converting text to all caps if specified in config (and not specified to ignore in function call)
        if (config.allCaps && useCaps)
            sendText = sendText.toUpperCase();
        console.log("MSG: "+sendText);
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

    /* Sends a message responding to a user in the channel a message was sent from
    msg: Message to respond to
    sendText: Text to respond with
    useCaps?: Whether to use the config file's capitalization rules
    */
    this.respondMsg = function(msg, sendText, useCaps = true)
    {
        this.sendMsg(msg.channel, sendText, useCaps);
    }

    /* Returns the channel with the specified name from the channel list
    channels: Array of channels
    name: Name of channel to find
    */
    this.findChannelByName = function(searchChannels, name)
    {
        var retChannel = searchChannels.find(x => x.name === name);
        if (retChannel === null)
            return searchChannels.first;
        else
            return retChannel;
    }
}
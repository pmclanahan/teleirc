#!/usr/bin/env node

var config = require(process.env.HOME + "/.teleircConfig.js");
var spawn = require("child_process").spawn;
var irc = require('irc');

var irc_client = irc.Client(config.server.address, config.nick, {
    secure: config.server.secure || false,
    port: config.server.port,
    userName: config.nick,
    realName: 'Telegram IRC Bot (teleirc)',
    channels: [config.chan]
});

irc.on('registered', function(message) {
    console.info('Connected to IRC server.');

    // Store the nickname assigned by the server
    config.realNick = message.args[0];
    console.info('Using nickname: ' + config.realNick);
});

irc.on('error', function(error) {
    // Error 421 comes up a lot on Mozilla servers, but isn't a problem.
    if (error.rawCommand !== '421') {
        return;
    }

    console.error(error);
    if (error.hasOwnProperty('stack')) {
        console.error(error.stack);
    }
});

// React to users quitting the IRC server
irc.on('quit', function(user) {
    if (user == config.nick) {
        irc.send('NICK', config.nick);
        config.realNick = config.nick
    }
});

/* Receive, parse, and handle messages from IRC.
 * - `user`: The nick of the user that send the message.
 * - `channel`: The channel the message was received in. Note, this might not be
 * a real channel, because it could be a PM. But this function ignores
 * those messages anyways.
 * - `message`: The text of the message sent.
 */
irc.on('message', function(user, channel, message){
    var cmdRe = new RegExp('^' + config.realNick + '[:,]? +(.*)$', 'i');
    var match = cmdRe.exec(message);
    if (match) {
        var message = match[1].trim();
        telegram.stdin.write('irc: <' + user + '>: ' + message + '\n');
    }
});

var handleTgLine = function(line) {
    if(line.match(new RegExp('\\[\\d\\d:\\d\\d\\]  ' + config.tgchat + ' .* >>> .*'))) {
        line = line.split(' ');
        line.shift(); line.shift(); line.shift();

        // line now contains [Firstname, Lastname, ..., >>>, msgword1, msgword2, ...]
        var name = "";
        temp = line.shift();
        while(temp !== '>>>') {
            name += temp;
            temp = line.shift();
        }

        line = line.join(' ');

        // check if msg was sent by bot telegram account && starts with 'irc: '
        // then don't send the msg back to irc
        if(name === config.tgnick.replace(' ', ''))
            if(line.indexOf('irc: ') === 0)
                return;

        sendIrcMsg('<' + name + '>: ' + line);
    }
};

var telegram = spawn(config.tgcli_path, ['-R', '-C', '-W', '-k', config.tgpubkey_path]);
var stdoutBuf = "";
telegram.stdout.on('data', function(data) {
    stdoutBuf += data.toString('utf8');
    var lastNL = stdoutBuf.lastIndexOf('\n');

    // have we received at least one whole line? else wait for more data
    if(lastNL !== -1) {
        var recvdLines = stdoutBuf.substr(0, lastNL + 1).split('\n');
        stdoutBuf = stdoutBuf.substr(lastNL + 1);

        for(var i = 0; i < recvdLines.length; i++) {
            if(recvdLines[i] !== '') {
                //console.log('irc server sent ' + recvdLines[i]);
                handleTgLine(recvdLines[i]);
            }
        }
    }
});
telegram.stdin.write('chat_with_peer ' + config.tgchat + '\n');

var sendIrcMsg = function(msg) {
    irc_client.say(config.chan, msg)
};


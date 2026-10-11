const fs = require("fs");
const path = require("path");

const { chat } = require("../ai/ai");
const { handleMessage: handleGameMessage } = require("../commands/game");

const membersFile = path.join(__dirname, "../data/members.json");

function loadMembers() {

    if (!fs.existsSync(membersFile))
        return {};

    try {

        return JSON.parse(fs.readFileSync(membersFile, "utf8"));

    } catch {

        return {};

    }

}

function convertMentions(text, members) {

    return text.replace(
        /\[\[MENTION:(.+?)\]\]/gi,
        (match, username) => {

            username = username.trim();

            for (const id in members) {

                if (
                    members[id].username.toLowerCase() ===
                    username.toLowerCase()
                ) {

                    return `<@${id}>`;

                }

            }

            return "";

        }
    );

}

module.exports = async (message) => {

    if (message.author.bot) return;

    const bot = message.client.user;

    const content = message.content.trim();

    if (!content) return;

    const botNames = [
        bot.username.toLowerCase(),
        "aiko",
        "akio",
        "ako",
        "aki",
        "aik"
    ];

    let prompt = null;

    // Mention
    if (message.mentions.has(bot)) {

        prompt = content.replace(/<@!?\d+>/g, "").trim();

    } else {

        const words = content.split(/\s+/);

        const first = words[0].toLowerCase();

        if (botNames.includes(first)) {

            prompt = words.slice(1).join(" ").trim();

        }

    }

    if (prompt === null) return;

    // Check for game messages first
    const gameHandled = await handleGameMessage(message);
    if (gameHandled) return;

    if (prompt.length === 0) {

        const replies = [
            "Hmm? 👀",
            "Bol 😄",
            "Haan?",
            "Kya hua?",
            "Sun rahi hu 👀"
        ];

        return message.reply(
            replies[Math.floor(Math.random() * replies.length)]
        );

    }

    try {

        await message.channel.sendTyping();

        // Load Members
        const members = loadMembers();

        const memberList = Object.values(members).map(member => member.username);

        // AI Reply
        const reply = await chat({

            user: message.author,

            message: prompt,

            messageId: message.id,

            memberList,
            guild: message.guild

        });

        // Username -> Discord Mention
        const finalReply = convertMentions(reply, members);

        await message.reply(finalReply);

    } catch (err) {

        console.error(err);

        await message.reply("😭 Brain lag ho gaya.");

    }

};
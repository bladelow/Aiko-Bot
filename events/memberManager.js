const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../data/members.json");

function loadMembers() {

    if (!fs.existsSync(file))
        return {};

    return JSON.parse(fs.readFileSync(file, "utf8"));

}

function saveMembers(data) {

    fs.writeFileSync(file, JSON.stringify(data, null, 4));

}

module.exports = async function (client) {

    const members = loadMembers();

    for (const guild of client.guilds.cache.values()) {

        const fetched = await guild.members.fetch();

        fetched.forEach(member => {

            if (member.user.bot) return;

            members[member.id] = {

                id: member.id,

                username: member.user.username,

                displayName: member.displayName,

                guildId: guild.id,

                joinedAt: members[member.id]?.joinedAt || Date.now(),

                updatedAt: Date.now()

            };

        });

    }

    saveMembers(members);

    console.log(`✅ Saved ${Object.keys(members).length} members.`);

};
const { SlashCommandBuilder } = require("discord.js");

const { ensureUser } = require("../utils/economy");
const { saveUsers } = require("../database");

function styleName(name, font) {
    if (font === "fullwidth") {
        return name.replace(/[!-~]/g, character =>
            String.fromCharCode(character.charCodeAt(0) + 0xfee0)
        );
    }

    if (font === "smallcaps") {
        const map = {
            a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ",
            h: "ʜ", i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ",
            o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ", s: "s", t: "ᴛ", u: "ᴜ",
            v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ"
        };

        return name.toLowerCase().replace(/[a-z]/g, character => map[character] || character);
    }

    return name;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setname")
        .setDescription("Set your purchased custom nickname")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Nickname, up to 32 characters")
                .setRequired(true)
                .setMaxLength(32)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.guild) {
            await interaction.editReply("❌ This command only works in a server.");
            return;
        }

        const users = ensureUser(interaction.user.id);
        const user = users[interaction.user.id];

        if (!user.profile.name) {
            await interaction.editReply("❌ Buy custom name access from `/shop` first.");
            return;
        }

        const name = interaction.options.getString("name").trim();
        if (!name) {
            await interaction.editReply("❌ Your name cannot be empty.");
            return;
        }

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (!interaction.guild.members.me?.permissions.has("ManageNicknames")) {
                await interaction.editReply("❌ The bot needs the **Manage Nicknames** permission.");
                return;
            }

            if (!member.manageable) {
                await interaction.editReply("❌ Move the bot's highest role above your highest role so it can change your nickname.");
                return;
            }

            user.profile.name = name;
            await member.setNickname(styleName(name, user.profile.font).slice(0, 32));
            saveUsers(users);
            await interaction.editReply(`✅ Your custom name is now **${name}**.`);
        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ I could not change your nickname: ${error.message}`);
        }
    }
};

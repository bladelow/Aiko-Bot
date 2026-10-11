const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { adjustStat } = require("../utils/economy");
const { announceLevelUp } = require("../utils/levelUp");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("add")
        .setDescription("Add coins, XP, or levels to a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option
                .setName("member")
                .setDescription("Member receiving the coins")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("Amount of Blade Coins")
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("What to add")
                .setRequired(true)
                .addChoices(
                    { name: "Coins", value: "coins" },
                    { name: "XP", value: "xp" },
                    { name: "Levels", value: "level" }
                )
        ),

    async execute(interaction) {
        const isOwner = interaction.guild?.ownerId === interaction.user.id;
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            await interaction.reply({ content: "❌ Only administrators can use this command.", ephemeral: true });
            return;
        }

        const member = interaction.options.getUser("member");
        const amount = interaction.options.getInteger("amount");
        const type = interaction.options.getString("type");

        const result = adjustStat(member.id, type, amount);
        await interaction.reply(`✅ Added **${amount} ${type}** to **${member.username}**.`);

        if (result.leveledUp) {
            await announceLevelUp(interaction.client, {
                ...result.user,
                id: member.id,
                username: member.username,
                avatarUrl: member.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }),
                displayAvatarURL: options => member.displayAvatarURL(options)
            }, result.previousLevel);
        }
    }
};
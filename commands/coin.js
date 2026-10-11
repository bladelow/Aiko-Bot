const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getUsers,
    saveUsers
} = require("../database");

const ranks = require("../config/ranks");


module.exports = {
    data: new SlashCommandBuilder()
        .setName("coin")
        .setDescription("Check your Blade Coins"),

    async execute(interaction) {

        const users = getUsers();

        if (!users[interaction.user.id]) {

            users[interaction.user.id] = {
                coins: 0,
                xp: 0,
                level: 1,
                answers: {}
            };

            saveUsers(users);

        }

        

        const user = users[interaction.user.id];

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("🪙 Blade Wallet")
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                {
                    name: "Blade Coins",
                    value: `${user.coins}`,
                    inline: true
                },
                {
                    name: "Level",
                    value: `${user.level}`,
                    inline: true
                },
                {
                    name: "XP",
                    value: `${user.xp}`,
                    inline: true
                }
            )
            .setFooter({
                text: interaction.user.username
            });

        await interaction.reply({
            embeds: [embed]
        });

    }
};
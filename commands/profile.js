const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const { ensureUser } = require("../utils/economy");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription("View a Blade Profile")
        .addUserOption(option =>
            option
                .setName("member")
                .setDescription("Member whose profile you want to view")
                .setRequired(false)
        ),

    async execute(interaction) {

        const target = interaction.options.getUser("member") || interaction.user;
        const users = ensureUser(target.id);
        const user = users[target.id];

        const accuracy =
            (user.correct || 0) + (user.wrong || 0) === 0
                ? 0
                : Math.round(
                      ((user.correct || 0) /
                          ((user.correct || 0) + (user.wrong || 0))) *
                          100
                  );

        const xpNeeded = user.level * 100;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({
                name: target.username,
                iconURL: target.displayAvatarURL()
            })
            .setTitle(`👤 ${target.username}'s Blade Profile`)

            .addFields(
                {
                    name: "⭐ Level",
                    value: `${user.level}`,
                    inline: true
                },
                {
                    name: "✨ XP",
                    value: `${user.xp}/${xpNeeded}`,
                    inline: true
                },
                {
                    name: "🪙 Blade Coins",
                    value: `${user.coins}`,
                    inline: true
                },

                {
                    name: "✅ Correct",
                    value: `${user.correct || 0}`,
                    inline: true
                },
                {
                    name: "❌ Wrong",
                    value: `${user.wrong || 0}`,
                    inline: true
                },
                {
                    name: "🎯 Accuracy",
                    value: `${accuracy}%`,
                    inline: true
                },
                {
                    name: "🎨 Name Color",
                    value: user.profile.color || "Default",
                    inline: true
                },
                {
                    name: "🔤 Name Font",
                    value: user.profile.font || "default",
                    inline: true
                },
                {
                    name: "✏️ Custom Name",
                    value: user.profile.name || "Not unlocked",
                    inline: true
                }
            )

            .setThumbnail(target.displayAvatarURL())

            .setFooter({
                text: "Blade Bot"
            });

        await interaction.reply({
            embeds: [embed]
        });

    }

};
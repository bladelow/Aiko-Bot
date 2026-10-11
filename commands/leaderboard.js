const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const { getUsers } = require("../database");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View Blade Leaderboards")
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Leaderboard Type")
                .setRequired(true)
                .addChoices(
                    { name: "Coins", value: "coins" },
                    { name: "Level", value: "level" },
                    { name: "Quiz Wins", value: "correct" }
                )
        ),

    async execute(interaction) {

        const users = getUsers();
        const type = interaction.options.getString("type");

        const members = [];

        for (const id in users) {

            try {

                const member = await interaction.guild.members.fetch(id);

                members.push({
                    name: member.user.username,
                    value: users[id][type] || 0
                });

            } catch {}

        }

        members.sort((a, b) => b.value - a.value);

        const medals = ["🥇", "🥈", "🥉"];

        let text = "";

        members.slice(0, 10).forEach((m, index) => {

            const icon = medals[index] || `${index + 1}.`;

            text += `${icon} **${m.name}** — ${m.value}\n`;

        });

        const embed = new EmbedBuilder()

            .setColor(0xFFD700)

            .setTitle(`🏆 ${type.toUpperCase()} Leaderboard`)

            .setDescription(text || "No data.");

        await interaction.reply({
            embeds: [embed]
        });

    }

};
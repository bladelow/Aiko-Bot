const {
    SlashCommandBuilder,
    PollLayoutType
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create a poll")
        .addStringOption(option =>
            option
                .setName("question")
                .setDescription("Poll question")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("option1")
                .setDescription("First option")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("option2")
                .setDescription("Second option")
                .setRequired(true)
        )
        .addStringOption(option =>
    option
        .setName("option3")
        .setDescription("Third option")
        .setRequired(true)
        )
        .addStringOption(option =>
    option
        .setName("option4")
        .setDescription("Fourth option")
        .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString("question");
        const option1 = interaction.options.getString("option1");
        const option2 = interaction.options.getString("option2");
        const option3 = interaction.options.getString("option3");
        const option4 = interaction.options.getString("option4");

        await interaction.channel.send({
            poll: {
                question: {
                    text: question
                },
                answers: [
                    {
                        text: option1
                    },
                    {
                        text: option2
                    },
                    {
                        text: option3
                    },
                    {
                        text: option4
                    },
                ],
                duration: 24,
                allowMultiselect: false
            }
        });

        await interaction.reply({
            content: "✅ Poll create ho gaya!",
            ephemeral: true
        });
    }
};
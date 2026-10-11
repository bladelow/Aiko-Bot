const {
    SlashCommandBuilder
} = require("discord.js");

const { generatePoll } = require("../ai");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ai-poll")
        .setDescription("Generate an AI Minecraft poll"),

    async execute(interaction) {

        await interaction.deferReply({ ephemeral: true });

        try {

            const poll = await generatePoll();

            await interaction.channel.send({
                poll: {
                    question: {
                        text: poll.question
                    },
                    answers: poll.options.map(option => ({
                        text: option
                    })),
                    duration: 24,
                    allowMultiselect: false
                }
            });

            await interaction.editReply("✅ AI Poll created!");

        } catch (err) {

            console.error(err);

            await interaction.editReply("❌ AI se poll generate nahi hua.");

        }

    }
};
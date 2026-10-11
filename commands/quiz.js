const { SlashCommandBuilder } = require("discord.js");
const { generateAndPostQuiz } = require("../utils/quiz");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("quiz")
        .setDescription("Generate and post a technology or gaming quiz"),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            if (!interaction.channel?.isTextBased() || !interaction.guild) {
                throw new Error("Run this command in a server text channel.");
            }
            await generateAndPostQuiz(interaction.channel);
            await interaction.editReply("✅ Quiz posted! The configured daily quiz will also run at midnight.");
        } catch (error) {
            console.error("[Quiz] Manual quiz generation failed:", error);
            await interaction.editReply(`❌ Could not post the quiz: ${error.message || "unknown error"}`);
        }
    }
};

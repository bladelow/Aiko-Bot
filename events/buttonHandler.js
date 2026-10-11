const {
    getUsers,
    saveUsers,
    getQuizzes,
    saveQuizzes
} = require("../database");
const { handleButton: handleGameButton } = require("../commands/game");
const { quizText } = require("../utils/quiz");

module.exports = async (interaction, client) => {

    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith("game_")) {
        return handleGameButton(interaction);
    }
    
    if (!interaction.customId.startsWith("quiz_")) return;

    const parts = interaction.customId.split("_");

    const quizId = parts[1];
    const selected = Number(parts[2]);

    const quizzes = getQuizzes();
    const users = getUsers();

    const quiz = quizzes[quizId];

    if (!quiz) {
        return interaction.reply({
            content: "❌ Quiz not found.",
            ephemeral: true
        });
    }

    if (quiz.ended || Date.now() >= Number(quiz.expiresAt)) {
        return interaction.reply({
            content: "⏰ This quiz has ended; wait for the next one!",
            ephemeral: true
        });
    }

    if (!Number.isInteger(selected) || selected < 0 || selected > 3) {
        return interaction.reply({
            content: "❌ That quiz answer is invalid.",
            ephemeral: true
        });
    }

    if (!users[interaction.user.id]) {
        users[interaction.user.id] = {
            coins: 0,
            xp: 0,
            level: 1,
            answers: {}
        };
    }

    const user = users[interaction.user.id];
    user.answers = user.answers || {};

    if (user.answers[quizId] !== undefined) {
        return interaction.reply({
            content: "❌ You already answered this quiz.",
            ephemeral: true
        });
    }

    user.answers[quizId] = selected;

    quiz.participants = (Number(quiz.participants) || 0) + 1;

    saveUsers(users);

    saveQuizzes(quizzes);



    try {

        const channel = await client.channels.fetch(quiz.channelId);
        const message = await channel.messages.fetch(quiz.messageId);

        await message.edit({
            content: quizText(quiz, quiz.participants),
            components: message.components,
            allowedMentions: { parse: [] }
        });

    } catch (err) {

        console.error(err);

    }

    await interaction.reply({

        content: `✅ Your answer has been recorded. Rewards will be given after the quiz ends.\n\n👥 Participants: ${quiz.participants}`,

        ephemeral: true

    });

};
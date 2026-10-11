const crypto = require("node:crypto");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getQuizzes, saveQuizzes, getSettings } = require("../database");
const { generateQuiz } = require("../ai");

function quizText(quiz, participants = 0) {
    const winnerCoins = Number(quiz.winnerCoins);
    const participantCoins = Number(quiz.participantCoins);
    return `# 🧠 Daily Quiz${quiz.topic ? ` · ${quiz.topic}` : ""}

**${quiz.question}**

A) ${quiz.options[0]}
B) ${quiz.options[1]}
C) ${quiz.options[2]}
D) ${quiz.options[3]}

👥 Participants: **${participants}**
🏆 Winner: **${Number.isFinite(winnerCoins) ? winnerCoins : 25} Blade Coins** · Participant: **${Number.isFinite(participantCoins) ? participantCoins : 3}**
⏳ Ends <t:${Math.floor(quiz.expiresAt / 1000)}:R>`;
}

async function postQuiz(channel, generatedQuiz, overrides = {}) {
    const settings = { ...getSettings(), ...overrides };
    const durationHours = Math.max(1, Number(settings.quizDurationHours) || 24);
    const configuredWinnerCoins = Number(settings.quizWinnerCoins);
    const configuredParticipantCoins = Number(settings.quizParticipantCoins);
    const quizId = crypto.randomUUID();
    const createdAt = Date.now();
    const quiz = {
        question: generatedQuiz.question,
        options: generatedQuiz.options,
        correct: generatedQuiz.answer,
        explanation: generatedQuiz.explanation,
        topic: generatedQuiz.topic || "",
        participants: 0,
        ended: false,
        createdAt,
        expiresAt: createdAt + durationHours * 60 * 60 * 1000,
        winnerCoins: Math.max(0, Number.isFinite(configuredWinnerCoins) ? configuredWinnerCoins : 25),
        participantCoins: Math.max(0, Number.isFinite(configuredParticipantCoins) ? configuredParticipantCoins : 3),
        channelId: channel.id
    };
    const quizzes = getQuizzes();
    quizzes[quizId] = quiz;
    saveQuizzes(quizzes);
    try {
        const row = new ActionRowBuilder().addComponents(
            ...[ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Secondary, ButtonStyle.Danger]
                .map((style, index) => new ButtonBuilder()
                    .setCustomId(`quiz_${quizId}_${index}`)
                    .setLabel(String.fromCharCode(65 + index))
                    .setStyle(style))
        );
        const message = await channel.send({
            content: quizText(quiz),
            components: [row],
            allowedMentions: { parse: [] }
        });
        quiz.messageId = message.id;
        saveQuizzes(quizzes);
        return quiz;
    } catch (error) {
        delete quizzes[quizId];
        saveQuizzes(quizzes);
        throw error;
    }
}

async function generateAndPostQuiz(channel, overrides) {
    const generated = await generateQuiz();
    return postQuiz(channel, generated, overrides);
}

module.exports = { quizText, postQuiz, generateAndPostQuiz };

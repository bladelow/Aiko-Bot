const { getQuizzes, saveQuizzes, getUsers, saveUsers, getSettings, saveSettings } = require("../database");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { announceLevelUp } = require("../utils/levelUp");
const { generateAndPostQuiz } = require("../utils/quiz");

let processingExpiredQuizzes = false;
let generatingDailyQuiz = false;
const ANSWER_LABELS = ["A", "B", "C", "D"];

function correctAnswerIndex(value) {
    if (typeof value === "string" && /^[A-D]$/i.test(value)) {
        return value.toUpperCase().charCodeAt(0) - 65;
    }
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < ANSWER_LABELS.length ? index : -1;
}

function localDateKey(timeZone) {
    try {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    } catch (error) {
        console.error("[Quiz] Invalid quizTimezone setting:", error.message);
        return localDateKey("UTC");
    }
}

function localClock(timeZone) {
    try {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.hour}:${values.minute}`;
    } catch (error) {
        console.error("[Quiz] Invalid quizTimezone setting:", error.message);
        return localClock("UTC");
    }
}

async function closeExpiredQuizzes(client) {
    if (processingExpiredQuizzes) return;
    processingExpiredQuizzes = true;
    try {
        const quizzes = getQuizzes();
        let changed = false;
        for (const [quizId, quiz] of Object.entries(quizzes)) {
            if (!Number.isFinite(Number(quiz.expiresAt)) && Number.isFinite(Number(quiz.createdAt))) {
                const legacyDuration = Math.max(1, Number(quiz.duration) || 24 * 60 * 60 * 1000);
                quiz.expiresAt = Number(quiz.createdAt) + legacyDuration;
                changed = true;
            }
            if (quiz.ended || !Number.isFinite(Number(quiz.expiresAt)) || Date.now() < Number(quiz.expiresAt)) {
                continue;
            }
            const users = getUsers();
            const correctIndex = correctAnswerIndex(quiz.correct);
            let winners = 0;
            let participants = 0;
            for (const [userId, user] of Object.entries(users)) {
                const answer = user.answers?.[quizId];
                if (answer === undefined) continue;
                participants++;
                const previousLevel = Number(user.level) || 1;
                user.level = previousLevel;
                user.coins = Number(user.coins) || 0;
                user.xp = Number(user.xp) || 0;
                if (answer === correctIndex) {
                    const winnerCoins = Number(quiz.winnerCoins);
                    user.coins += Math.max(0, Number.isFinite(winnerCoins) ? winnerCoins : 25);
                    user.xp += 30;
                    user.correct = (Number(user.correct) || 0) + 1;
                    winners++;
                } else {
                    const participantCoins = Number(quiz.participantCoins);
                    user.coins += Math.max(0, Number.isFinite(participantCoins) ? participantCoins : 3);
                    user.xp += 10;
                    user.wrong = (Number(user.wrong) || 0) + 1;
                }
                while (user.xp >= user.level * 100) {
                    user.xp -= user.level * 100;
                    user.level++;
                }
                delete user.answers[quizId];
                if (user.level > previousLevel) {
                    try {
                        const discordUser = await client.users.fetch(userId);
                        await announceLevelUp(client, {
                            ...user,
                            id: userId,
                            username: discordUser.username,
                            avatarUrl: discordUser.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }),
                            displayAvatarURL: options => discordUser.displayAvatarURL(options)
                        }, previousLevel);
                    } catch (error) {
                        console.error("[Quiz] Level-up announcement failed:", error.message || error);
                    }
                }
            }
            saveUsers(users);
            try {
                const channel = await client.channels.fetch(quiz.channelId);
                const message = channel?.isTextBased() && quiz.messageId
                    ? await channel.messages.fetch(quiz.messageId)
                    : null;
                if (message) {
                    const correct = ANSWER_LABELS[correctIndex] || "Unknown";
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`quiz_ended_${quizId}`)
                            .setLabel("Quiz Ended")
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                    await message.edit({
                        content: `# 🏁 Daily Quiz Ended\n\n**${quiz.question}**\n\nA) ${quiz.options[0]}\nB) ${quiz.options[1]}\nC) ${quiz.options[2]}\nD) ${quiz.options[3]}\n\n✅ Correct Answer: **${correct}**\n📖 ${quiz.explanation}\n👥 Participants: **${participants}**\n🏆 Winners: **${winners}**\n🪙 Rewards have been distributed.`,
                        components: [row],
                        allowedMentions: { parse: [] }
                    });
                }
            } catch (error) {
                console.error(`[Quiz] Could not update ended quiz ${quizId}:`, error.message || error);
            }
            delete quizzes[quizId];
            changed = true;
        }
        if (changed) saveQuizzes(quizzes);
    } finally {
        processingExpiredQuizzes = false;
    }
}

async function postDailyQuiz(client) {
    const settings = getSettings();
    const channelId = String(settings.quizChannelId || "").trim();
    if (!channelId) return;
    const timeZone = settings.quizTimezone || "Asia/Kolkata";
    if (localClock(timeZone) !== "00:00") return;
    const date = localDateKey(timeZone);
    if (settings.quizDailyPostedDate === date || generatingDailyQuiz) return;
    generatingDailyQuiz = true;
    const channel = await client.channels.fetch(channelId).catch(error => {
        console.error(`[Quiz] Could not fetch daily quiz channel ${channelId}:`, error.message);
        return null;
    });
    if (!channel?.isTextBased() || !channel.guild || !("send" in channel)) {
        console.error(`[Quiz] Configured daily quiz channel ${channelId} is not a guild text channel.`);
        generatingDailyQuiz = false;
        return;
    }
    try {
        await generateAndPostQuiz(channel);
        settings.quizDailyPostedDate = date;
        saveSettings({ ...getSettings(), quizDailyPostedDate: date });
        console.log(`[Quiz] Posted daily quiz for ${date} in ${channelId}.`);
    } catch (error) {
        console.error("[Quiz] Could not generate or post the daily quiz:", error.message || error);
    } finally {
        generatingDailyQuiz = false;
    }
}

module.exports = function startQuizManager(client) {
    const expiryTimer = setInterval(async () => {
        await closeExpiredQuizzes(client);
        await postDailyQuiz(client);
    }, 15 * 1000);
    expiryTimer.unref?.();
    return expiryTimer;
};

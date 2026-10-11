const { buildPrompt } = require("./prompt");
const { generateResponse } = require("./providers");
const { memoryContext, remember } = require("./memoryService");
const { getUsers } = require("../database");

async function chat({ user, message, memberList, messageId, guild }) {
    const profile = getUsers()[user.id] || {};
    const correct = Number(profile.correct) || 0;
    const wrong = Number(profile.wrong) || 0;
    const accuracy = correct + wrong === 0 ? 0 : Math.round(correct / (correct + wrong) * 100);
    const inventory = profile.inventory || {};
    const stats = [
        `Blade Coins: ${Number(profile.coins) || 0}`,
        `Level: ${Number(profile.level) || 1}`,
        `XP: ${Number(profile.xp) || 0}`,
        `Quiz correct: ${correct}`,
        `Quiz incorrect: ${wrong}`,
        `Quiz accuracy: ${accuracy}%`,
        `Custom profile name: ${profile.profile?.name || "none"}`,
        `Name color: ${profile.profile?.color || "default"}`,
        `Name font: ${profile.profile?.font || "default"}`,
        `Badges: ${Array.isArray(profile.profile?.badges) ? profile.profile.badges.join(", ") || "none" : "none"}`,
        `Inventory colors: ${Array.isArray(inventory.colors) ? inventory.colors.join(", ") || "none" : "none"}`,
        `Inventory fonts: ${Array.isArray(inventory.fonts) ? inventory.fonts.join(", ") || "none" : "none"}`
    ].join("\n");
    const admins = guild
        ? guild.members.cache
            .filter(member => !member.user.bot && member.permissions.has("Administrator"))
            .map(member => member.displayName)
            .slice(0, 30)
        : [];
    const serverFacts = guild
        ? `Server: ${guild.name}\nOwner: ${guild.members.cache.get(guild.ownerId)?.displayName || guild.ownerId} (user ID: ${guild.ownerId})\nAdministrator names: ${admins.join(", ") || "None cached"}`
        : "";

    const prompt = buildPrompt({
        user,
        memberList,
        memory: memoryContext(user.id, message),
        profileContext: stats,
        serverFacts
    });

    const messages = [
        {
            role: "system",
            content: prompt
        },
        {
            role: "user",
            content: message
        }
    ];

    const reply = await generateResponse(messages);

    remember(user.id, message, reply, { messageId });

    return reply;
}

async function generateQuiz() {
    const topics = ["Minecraft", "technology", "PC hardware", "gaming", "computers"];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const result = await generateResponse([
        {
            role: "system",
            content: "Create one accurate, family-friendly multiple-choice quiz question. Return only valid JSON with keys question (string), options (array of exactly 4 strings), answer (integer 0-3), explanation (string). No markdown."
        },
        {
            role: "user",
            content: `Create a fresh quiz question about ${topic}. Avoid trick questions.`
        }
    ]);
    const json = result.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("AI quiz response was not valid JSON");
    const quiz = JSON.parse(json);
    if (
        typeof quiz.question !== "string" ||
        !Array.isArray(quiz.options) ||
        quiz.options.length !== 4 ||
        !quiz.options.every(option => typeof option === "string") ||
        !Number.isInteger(quiz.answer) ||
        quiz.answer < 0 ||
        quiz.answer > 3 ||
        typeof quiz.explanation !== "string"
    ) {
        throw new Error("AI quiz response did not match the required format");
    }
    return {
        question: quiz.question.replace(/\s+/g, " ").trim().slice(0, 250),
        options: quiz.options.map(option => option.replace(/\s+/g, " ").trim().slice(0, 140)),
        answer: quiz.answer,
        explanation: quiz.explanation.replace(/\s+/g, " ").trim().slice(0, 500),
        topic
    };
}

async function generateMessageOptions(prompt) {
    const result = await generateResponse([
        {
            role: "system",
            content: "Write exactly four distinct, ready-to-send Discord message options for the user's request. Keep each option concise, do not number them, and separate options with a line containing exactly --- ."
        },
        { role: "user", content: String(prompt).slice(0, 1500) }
    ]);
    const options = result
        .split(/^\s*---+\s*$/m)
        .map(option => option.replace(/^\s*(?:Option\s*)?[1-4][.)]\s*/i, "").trim())
        .filter(Boolean)
        .slice(0, 4);
    if (options.length !== 4) {
        throw new Error("AI did not return exactly four message options");
    }
    return options;
}

module.exports = {
    chat,
    generateQuiz,
    generateMessageOptions
};
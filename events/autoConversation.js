const { buildPrompt } = require("../ai/prompt");
const { generateResponse } = require("../ai/providers");
const { getSettings, saveSettings } = require("../database");

const lastActivity = new Map();
const lastPost = new Map();
const dailyPosts = new Map();
const inProgress = new Set();

function noteActivity(message) {
    if (!message.guild || message.author.bot) return;
    lastActivity.set(message.channel.id, Date.now());
}

function localDateKey(timeZone) {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    } catch (error) {
        console.error("[Auto conversation] Invalid timezone setting:", error.message);
        return new Date().toISOString().slice(0, 10);
    }
}

async function startInChannel(channel, activityAt, settings) {
    if (inProgress.has(channel.id)) return;
    inProgress.add(channel.id);
    try {
        const messages = await channel.messages.fetch({ limit: 8 });
        const context = [...messages.values()]
            .reverse()
            .filter(message => message.content.trim())
            .map(message => `${message.member?.displayName || message.author.username}: ${message.content.slice(0, 500)}`)
            .join("\n");
        const memberNames = channel.guild.members.cache
            .filter(member => !member.user.bot)
            .map(member => member.displayName)
            .slice(0, 100);
        const systemPrompt = buildPrompt({
            user: { username: `${channel.guild.name} members` },
            memberList: memberNames,
            serverFacts: `Server: ${channel.guild.name}\nOwner user ID: ${channel.guild.ownerId}`
        });
        const response = await generateResponse([
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: `This channel has been quiet for a while. Start one short, natural conversation message based on the recent context. Do not mention inactivity, do not pretend to be a real person, and do not use @everyone or @here.\n\nRecent channel context:\n${context || "No recent messages are available."}`
            }
        ]);
        if (lastActivity.get(channel.id) !== activityAt) return;
        const text = response.trim().slice(0, 1900);
        if (!text) throw new Error("AI returned an empty auto-conversation message");
        await channel.send({
            content: text,
            allowedMentions: { parse: [], repliedUser: false }
        });
        lastPost.set(channel.id, Date.now());
        const date = localDateKey(settings.quizTimezone || "Asia/Kolkata");
        dailyPosts.set(`${channel.id}:${date}`, (dailyPosts.get(`${channel.id}:${date}`) || 0) + 1);
        const currentSettings = getSettings();
        const history = currentSettings.autoConversationHistory &&
            typeof currentSettings.autoConversationHistory === "object" &&
            !Array.isArray(currentSettings.autoConversationHistory)
            ? { ...currentSettings.autoConversationHistory }
            : {};
        const previous = history[channel.id];
        history[channel.id] = {
            date,
            count: (previous?.date === date ? Number(previous.count) || 0 : 0) + 1,
            lastPostedAt: Date.now()
        };
        saveSettings({ ...currentSettings, autoConversationHistory: history });
    } catch (error) {
        console.error(`[Auto conversation] Could not post in channel ${channel.id}:`, error.message || error);
    } finally {
        inProgress.delete(channel.id);
    }
}

function startAutoConversation(client) {
    const timer = setInterval(async () => {
        const settings = getSettings();
        if (settings.autoConversationEnabled !== true) return;
        const channelIds = Array.isArray(settings.autoConversationChannels)
            ? settings.autoConversationChannels.map(String)
            : [];
        const excluded = new Set(Array.isArray(settings.excludedChannels)
            ? settings.excludedChannels.map(String)
            : []);
        const inactiveMs = Math.max(1, Number(settings.inactiveMinutes) || 30) * 60 * 1000;
        const cooldownMs = Math.max(1, Number(settings.autoConversationCooldownMinutes) || 180) * 60 * 1000;
        const maxDaily = Math.max(1, Number(settings.maxAutoMessagesPerDay) || 4);
        const now = Date.now();
        for (const channelId of channelIds) {
            if (excluded.has(channelId)) continue;
            const activityAt = lastActivity.get(channelId);
            if (!activityAt || now - activityAt < inactiveMs) continue;
            const date = localDateKey(settings.quizTimezone || "Asia/Kolkata");
            const history = settings.autoConversationHistory?.[channelId];
            const todayCount = history?.date === date
                ? Number(history.count) || 0
                : dailyPosts.get(`${channelId}:${date}`) || 0;
            if (todayCount >= maxDaily) continue;
            const previousPost = Math.max(
                lastPost.get(channelId) || 0,
                Number(history?.lastPostedAt) || 0
            );
            if (now - previousPost < cooldownMs) continue;
            const channel = await client.channels.fetch(channelId).catch(error => {
                console.error(`[Auto conversation] Could not fetch channel ${channelId}:`, error.message);
                return null;
            });
            if (!channel?.isTextBased() || !channel.guild) continue;
            await startInChannel(channel, activityAt, settings);
        }
    }, 30 * 1000);
    timer.unref?.();
    return timer;
}

module.exports = { noteActivity, startAutoConversation };

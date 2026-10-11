const { getSettings } = require("../database");
const { AttachmentBuilder } = require("discord.js");
const { generateLevelUpImage } = require("./levelUpImage");

const announcedTransitions = new Set();

async function announceLevelUp(client, user, previousLevel) {
    const settings = getSettings();
    const levelUp = settings.levelUp || {};
    const channelId = levelUp.channelId || settings.levelUpChannelId;

    if (levelUp.enabled === false || !channelId || user.level <= previousLevel) return false;

    const transitionKey = `${user.id}:${previousLevel}:${user.level}`;
    if (announcedTransitions.has(transitionKey)) return false;
    announcedTransitions.add(transitionKey);

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) return false;

        const template = levelUp.message || settings.levelUpMessage ||
            "🎉 {user} reached **Level {level}** and earned **{coins} Blade Coins**!";
        const message = template
            .replaceAll("{user}", levelUp.mentionUser === false ? (user.username || "member") : `<@${user.id || ""}>`)
            .replaceAll("{username}", user.username || "member")
            .replaceAll("{level}", String(user.level))
            .replaceAll("{previousLevel}", String(previousLevel))
            .replaceAll("{coins}", String(settings.levelUpCoins || 0));

        const imageConfig = levelUp.image || {};
        if (imageConfig.enabled !== false) {
            try {
                const buffer = await generateLevelUpImage({
                    user,
                    oldLevel: previousLevel,
                    newLevel: user.level,
                    image: imageConfig
                });
                await channel.send({
                    content: message,
                    files: [new AttachmentBuilder(buffer, { name: `level-up-${user.id}.png` })]
                });
                return true;
            } catch (error) {
                console.error("❌ Level-up image failed; using text fallback:", error.message || error);
            }
        }

        await channel.send(message);
        return true;
    } catch (error) {
        console.error("❌ Level-up announcement failed:", error.message || error);
        announcedTransitions.delete(transitionKey);
        return false;
    }
}

module.exports = {
    announceLevelUp
};

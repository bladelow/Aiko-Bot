const urlPattern = /(?:https?:\/\/|www\.)[^\s<]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io|dev|co|in|xyz)(?:\/[^\s<]*)?/gi;
const recentMessages = new Map();

function normalize(text) {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isAllowedUrl(rawUrl, allowedLinks) {
    try {
        const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const hostname = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
        return allowedLinks.some(entry => {
            const allowed = entry
                .toLowerCase()
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "")
                .split("/")[0]
                .trim();
            return allowed === "*" || hostname === allowed || hostname.endsWith(`.${allowed}`);
        });
    } catch {
        return false;
    }
}

function isLinkModerationBypassed(message, settings) {
    const member = message.member;
    if (!message.guild) return false;
    
    // Server owner always bypasses
    if (settings.allowServerOwner && message.guild.ownerId === message.author.id) {
        return true;
    }

    if (!member) return false;
    
    // Administrators bypass if configured
    if (settings.allowAdministrators && member.permissions.has('Administrator')) {
        return true;
    }
    
    // Check ignored roles
    if (settings.ignoredLinkRoles && Array.isArray(settings.ignoredLinkRoles) && settings.ignoredLinkRoles.length > 0) {
        const memberRoleIds = member.roles.cache.map(role => role.id);
        const hasIgnoredRole = settings.ignoredLinkRoles.some(roleId => memberRoleIds.includes(roleId));
        if (hasIgnoredRole) {
            return true;
        }
    }
    
    return false;
}

async function moderateMessage(message, settings) {
    if (!message.guild || message.author.bot) return { deleted: false, timedOut: false };

    // Check if user bypasses link moderation
    if (settings.linkFilterEnabled && isLinkModerationBypassed(message, settings)) {
        // User bypasses link filter, skip link check but continue with spam check
    } else {
        const urls = message.content.match(urlPattern) || [];
        const channelRules = settings.linkRules?.[message.channel.id];
        const allowedLinks = Array.isArray(channelRules)
            ? channelRules
            : (Array.isArray(settings.allowedLinks) ? settings.allowedLinks : []);

        if (settings.linkFilterEnabled && urls.length > 0 && urls.some(url => !isAllowedUrl(url, allowedLinks))) {
            await message.delete().catch(error => {
                console.error("[Moderation] Could not delete blocked link:", error.message);
            });
            return { deleted: true, timedOut: false, reason: "blocked link" };
        }
    }

    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const entry = recentMessages.get(key) || { text: "", times: [] };
    const text = normalize(message.content);

    if (settings.spamEnabled && text && text === entry.text) {
        entry.times = [...entry.times, now].filter(time => now - time <= settings.spamWindowMs);
    } else {
        entry.text = text;
        entry.times = [now];
    }

    recentMessages.set(key, entry);

    if (entry.times.length >= settings.spamLimit) {
        recentMessages.delete(key);
        await message.delete().catch(error => {
            console.error("[Moderation] Could not delete repeated message:", error.message);
        });

        if (message.member?.moderatable) {
            try {
                await message.member.timeout(
                    settings.spamTimeoutMs,
                    "Repeated identical messages"
                );
                return { deleted: true, timedOut: true, reason: "repeated message" };
            } catch (error) {
                console.error("[Moderation] Could not timeout repeated spam:", error.message);
            }
        }

        return { deleted: true, timedOut: false, reason: "repeated message" };
    }

    return { deleted: false, timedOut: false };
}

module.exports = {
    moderateMessage,
    isLinkModerationBypassed
};

const { createCanvas, loadImage } = require("@napi-rs/canvas");

const DEFAULTS = {
    width: 1200,
    height: 400,
    title: "LEVEL-UP!",
    accentColor: "#8CFF00",
    backgroundColor: "#080A08",
    showAvatar: true,
    showLevelTransition: true
};

function hexToRgb(hex) {
    const value = String(hex).replace("#", "");
    const normalized = value.length === 3
        ? value.split("").map(char => char + char).join("")
        : value;
    const number = Number.parseInt(normalized, 16);
    return {
        red: (number >> 16) & 255,
        green: (number >> 8) & 255,
        blue: number & 255
    };
}

function safeText(value, fallback) {
    const text = String(value || fallback).trim();
    return text.slice(0, 80);
}

async function fetchAvatar(urls) {
    for (const url of urls.filter(Boolean)) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) continue;
            const image = await loadImage(Buffer.from(await response.arrayBuffer()));
            if (image.width > 0 && image.height > 0) return image;
        } catch {
            // Try the next avatar URL, then use the renderer fallback.
        }
    }

    return null;
}

function drawBackground(context, width, height, config) {
    const accent = hexToRgb(config.accentColor);
    const glow = context.createRadialGradient(width * 0.72, height * 0.5, 10, width * 0.72, height * 0.5, width * 0.7);
    glow.addColorStop(0, `rgba(${accent.red}, ${accent.green}, ${accent.blue}, 0.16)`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = config.backgroundColor;
    context.fillRect(0, 0, width, height);
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(255,255,255,0.04)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0)");
    gradient.addColorStop(1, `rgba(${accent.red}, ${accent.green}, ${accent.blue}, 0.07)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalAlpha = 0.32;
    context.strokeStyle = config.accentColor;
    context.lineWidth = 2;
    for (let index = 0; index < 18; index++) {
        const x = 680 + ((index * 149) % 520);
        const y = 30 + ((index * 83) % 330);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 18 + (index % 3) * 12, y - 5 - (index % 4) * 7);
        context.stroke();
    }
    context.restore();
}

function drawAvatar(context, avatar, username, config) {
    const centerX = 220;
    const centerY = 200;
    const radius = 116;

    context.save();
    context.shadowColor = config.accentColor;
    context.shadowBlur = 30;
    context.strokeStyle = config.accentColor;
    context.lineWidth = 8;
    context.beginPath();
    context.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();
    if (avatar) {
        const scale = Math.max((radius * 2) / avatar.width, (radius * 2) / avatar.height);
        const width = avatar.width * scale;
        const height = avatar.height * scale;
        context.drawImage(avatar, centerX - width / 2, centerY - height / 2, width, height);
    } else {
        context.fillStyle = "#1c2a1d";
        context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
        context.fillStyle = "#ffffff";
        context.font = "bold 84px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(safeText(username, "?").charAt(0).toUpperCase(), centerX, centerY);
    }
    context.restore();

    context.save();
    context.strokeStyle = "rgba(255,255,255,0.75)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius + 19, -Math.PI * 0.85, -Math.PI * 0.15);
    context.stroke();
    context.restore();
}

async function generateLevelUpImage({ user, oldLevel, newLevel, image = {} }) {
    const config = { ...DEFAULTS, ...image };
    const width = Math.max(600, Number(config.width) || DEFAULTS.width);
    const height = Math.max(240, Number(config.height) || DEFAULTS.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    drawBackground(context, width, height, config);
    if (config.showAvatar !== false) {
        const avatarOptions = { extension: "png", size: 256, forceStatic: true };
        const avatarUrl = typeof user.displayAvatarURL === "function"
            ? user.displayAvatarURL(avatarOptions)
            : user.avatarUrl;
        const fallbackAvatarUrl = typeof user.avatarURL === "function"
            ? user.avatarURL(avatarOptions)
            : user.avatarUrl;
        const avatar = await fetchAvatar([avatarUrl, fallbackAvatarUrl]);
        drawAvatar(context, avatar, user.username, config);
    }

    const accent = config.accentColor;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.shadowColor = accent;
    context.shadowBlur = 18;
    context.fillStyle = "#ffffff";
    context.font = "900 76px sans-serif";
    context.fillText(safeText(config.title, DEFAULTS.title), 430, 178);
    context.shadowBlur = 0;

    context.fillStyle = accent;
    context.font = "700 42px sans-serif";
    context.fillText(config.showLevelTransition === false ? "NEW LEVEL" : `${oldLevel}  →  ${newLevel}`, 435, 248);

    context.fillStyle = "rgba(255,255,255,0.64)";
    context.font = "500 20px sans-serif";
    context.fillText(safeText(user.username, "Member"), 438, 294);

    context.fillStyle = accent;
    context.fillRect(430, 326, Math.min(480, width - 500), 4);
    context.fillStyle = "rgba(255,255,255,0.14)";
    context.fillRect(430, 338, Math.min(480, width - 500), 2);

    return canvas.toBuffer("image/png");
}

module.exports = {
    generateLevelUpImage
};

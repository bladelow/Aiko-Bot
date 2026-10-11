require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const {
    Client,
    Collection,
    GatewayIntentBits,
    REST,
    Routes
} = require("discord.js");

const startQuizManager = require("./events/quizManager");
const buttonHandler = require("./events/buttonHandler");
const aiChat = require("./events/aiChat");
const messageGenerate = require("./commands/msggenerate");
const sendMessage = require("./commands/sendmsg");
const memberManager = require("./events/memberManager");
const { awardMessageXp } = require("./utils/economy");
const { getSettings, saveSettings } = require("./database");
const { moderateMessage } = require("./events/moderation");
const { startPanel } = require("./web/panel");
const { announceLevelUp } = require("./utils/levelUp");
const { maintain } = require("./ai/memoryService");
const { noteActivity, startAutoConversation } = require("./events/autoConversation");

const defaultSettings = {
    xpEnabled: true,
    xpPerMessage: 5,
    xpCooldownMs: 60000,
    levelUpCoins: 25,
    spamLimit: 3,
    spamWindowMs: 10000,
    spamTimeoutMs: 30000,
    moderationEnabled: true,
    spamEnabled: true,
    linkFilterEnabled: false,
    allowedLinks: [],
    linkRules: {},
    // Link moderation bypass settings
    allowServerOwner: true,
    allowAdministrators: true,
    ignoredLinkRoles: [],
    levelUpChannelId: "",
    levelUpMessage: "🎉 {user} reached **Level {level}** and earned **{coins} Blade Coins**!",
    aiEnabled: true,
    aiPrompt: "",
    aiProvider: "openrouter",
    openRouterModel: process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1:free",
    memoryFreshLimit: 12,
    memoryFreshHours: 24,
    memoryRetrievalLimit: 8,
    memoryWeeklyDays: 7,
    memoryMonthlyDays: 30,
    memoryDeleteThreshold: 0.12,
    autoConversationEnabled: false,
    autoConversationChannels: [],
    inactiveMinutes: 30,
    autoConversationCooldownMinutes: 180,
    maxAutoMessagesPerDay: 4,
    excludedChannels: [],
    quizChannelId: "",
    quizTimezone: "Asia/Kolkata",
    quizDurationHours: 24,
    quizWinnerCoins: 25,
    quizParticipantCoins: 3,
    universalMemoryFacts: [],
    levelUp: {
        enabled: true,
        channelId: "",
        mentionUser: true,
        message: "🎉 {user} just leveled up!",
        image: {
            enabled: true,
            width: 1200,
            height: 400,
            title: "LEVEL-UP!",
            accentColor: "#8CFF00",
            backgroundColor: "#080A08",
            showAvatar: true,
            showLevelTransition: true
        }
    }
};

const settings = {
    ...defaultSettings,
    ...getSettings()
};
settings.levelUp = {
    ...defaultSettings.levelUp,
    ...(settings.levelUp || {})
};
settings.levelUp.image = {
    ...defaultSettings.levelUp.image,
    ...(settings.levelUp.image || {})
};
if (!settings.levelUp.channelId && settings.levelUpChannelId) {
    settings.levelUp.channelId = settings.levelUpChannelId;
}
if (settings.levelUpMessage && settings.levelUp.message === defaultSettings.levelUp.message) {
    settings.levelUp.message = settings.levelUpMessage;
}
function refreshSettings() {
    Object.assign(settings, getSettings());
    settings.levelUp = {
        ...defaultSettings.levelUp,
        ...(settings.levelUp || {})
    };
    settings.levelUp.image = {
        ...defaultSettings.levelUp.image,
        ...(settings.levelUp.image || {})
    };
}
saveSettings(settings);
startPanel(settings);
maintain();
setInterval(maintain, 24 * 60 * 60 * 1000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ==============================
// Collections
// ==============================

client.commands = new Collection();

// ==============================
// Load Slash Commands
// ==============================

const commands = [];

const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {

    const command = require(path.join(commandsPath, file));

    if (!command.data || !command.execute) {

        console.log(`⚠️ ${file} is missing data or execute.`);
        continue;

    }

    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());

    console.log(`📦 Loaded /${command.data.name}`);

}

// ==============================
// Ready
// ==============================

client.once("clientReady", async () => {

    console.log(`✅ Logged in as ${client.user.tag}`);

    if (!process.env.TOKEN) {
        console.error("❌ TOKEN is missing from .env");
        return;
    }

    const rest = new REST({
        version: "10"
    }).setToken(process.env.TOKEN);

    try {

        console.log("🔄 Registering Slash Commands...");

        const commandRoute = process.env.GUILD_ID
            ? Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID)
            : Routes.applicationCommands(client.user.id);

        await rest.put(
            commandRoute,
            {
                body: commands
            }
        );

        console.log(
            process.env.GUILD_ID
                ? "✅ Slash Commands Registered in the test server."
                : "✅ Slash Commands Registered globally. They may take up to an hour to appear."
        );

    } catch (err) {

        console.error(err);

    }

    try {
        await memberManager(client);
    } catch (err) {
        console.error("❌ Member sync failed:", err);
    }

    // Background Systems

    startQuizManager(client);
    startAutoConversation(client);

});

// ==============================
// AI Chat
// ==============================

client.on("messageCreate", async message => {
    noteActivity(message);
    refreshSettings();

    if (settings.moderationEnabled) {
        const moderation = await moderateMessage(message, settings);
        if (moderation.deleted) return;
    }

    if (settings.aiEnabled) {
        await aiChat(message);
    }

    if (settings.xpEnabled && !message.author.bot && message.guild) {

        const result = awardMessageXp(message.author.id, settings.xpPerMessage);

        if (result.leveledUp) {
            await announceLevelUp(client, {
                ...result.user,
                id: message.author.id,
                username: message.author.username,
                avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }),
                displayAvatarURL: options => message.author.displayAvatarURL(options)
            }, result.previousLevel);
        }

    }

});

// ==============================
// Buttons + Slash Commands
// ==============================

client.on("interactionCreate", async interaction => {

    if (interaction.isButton()) {
        if (interaction.customId.startsWith("msggen_")) {
            return messageGenerate.handleInteraction(interaction);
        }

        return buttonHandler(interaction, client);

    }

    if (interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        if (interaction.isModalSubmit() && interaction.customId.startsWith("sendmsg_modal_")) {
            return sendMessage.handleInteraction(interaction);
        }
        return messageGenerate.handleInteraction(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {

        await command.execute(interaction);

    } catch (err) {

        console.error(`❌ /${interaction.commandName} failed:`, err);

        const payload = {

            content: `❌ /${interaction.commandName} failed: ${err.message || "Unknown error"}`,

            ephemeral: true

        };

        if (interaction.deferred || interaction.replied)

            await interaction.followUp(payload);

        else

            await interaction.reply(payload);

    }

});

// ==============================
// Error Handling
// ==============================

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ==============================
// Login
// ==============================

client.login(process.env.TOKEN).catch(err => {
    console.error("❌ Discord login failed:", err.message);
});
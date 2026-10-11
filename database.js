const fs = require("fs");

const MEMBERS = "./data/members.json";

function getMembers() {
    return load(MEMBERS);
}

function saveMembers(data) {
    save(MEMBERS, data);
}

const USERS = "./data/users.json";
const QUIZZES = "./data/quizzes.json";
const path = require("path");
const CHATS = path.join(__dirname, "ai/chats.json");
const MEMORY = path.join(__dirname, "ai/memory.json");
const SETTINGS = path.join(__dirname, "data/settings.json");





function load(file) {
    try {
        let data = fs.readFileSync(file, "utf8").trim();

        if (!data) return {};

        if (file === SETTINGS) {
            data = data.replace(
                /("(?:ignoredLinkRoles|autoConversationChannels|excludedChannels)"\s*:\s*)\[([^\]]*)\]/g,
                (match, prefix, values) => `${prefix}[${values.replace(
                    /(^\s*|,\s*)(\d{15,25})(?=\s*(?:,|$))/g,
                    '$1"$2"'
                )}]`
            );
        }

        return JSON.parse(data);

    } catch (err) {

        console.warn(`⚠️ Invalid JSON in ${file}. Resetting...`);

        fs.writeFileSync(file, "{}");

        return {};
    }
}

function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
}

function addCoins(userId, amount) {

    const users = getUsers();

    if (!users[userId]) {

        users[userId] = {
            coins: 0,
            xp: 0,
            level: 1,
            answers: {},
            profile: {
                name: "",
                font: "default",
                color: "#5865F2",
                title: "",
                badges: []
            },
            stats: {
                correct: 0,
                wrong: 0,
                streak: 0
            }
        };

    }

    users[userId].coins += amount;

    saveUsers(users);

    return users[userId];

}

function addXP(userId, amount) {

    const users = getUsers();

    if (!users[userId]) return;

    users[userId].xp += amount;

    saveUsers(users);

    return users[userId];

}

function getUsers() {
    return load(USERS);
}

function saveUsers(data) {
    save(USERS, data);
}

function getQuizzes() {
    return load(QUIZZES);
}

function saveQuizzes(data) {
    save(QUIZZES, data);
}

function getUser(id) {

    const users = getUsers();

    if (!users[id]) {

        users[id] = {
            coins: 0,
            xp: 0,
            level: 1,
            answers: {}
        };

        saveUsers(users);

    }

    return users[id];

}

function ensureUser(userId) {

    const users = getUsers();

    if (!users[userId]) {

        users[userId] = {
            coins: 0,
            xp: 0,
            level: 1,
            answers: {}
        };

        saveUsers(users);
    }

    return users;
}

function getChats() {
    return load(CHATS);
}

function saveChats(data) {
    save(CHATS, data);
}

function getMemory() {
    return load(MEMORY);
}

function saveMemory(data) {
    save(MEMORY, data);
}

function getSettings() {
    return load(SETTINGS);
}

function saveSettings(data) {
    save(SETTINGS, data);
}

function addCoins(userId, amount) {

    const users = ensureUser(userId);

    users[userId].coins += amount;

    saveUsers(users);

}

function addXP(userId, amount) {

    const users = ensureUser(userId);

    users[userId].xp += amount;

    saveUsers(users);

}

module.exports = {
    getUsers,
    saveUsers,
    getQuizzes,
    saveQuizzes,
    getUser,
    ensureUser,
    addCoins,
    addXP,
    getMembers,
    saveMembers,
    getChats,
    saveChats,
    getMemory,
    saveMemory,
    getSettings,
    saveSettings
};
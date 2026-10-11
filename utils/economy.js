const {
    getUsers,
    saveUsers,
    getSettings
} = require("../database");

function ensureUser(userId) {

    const users = getUsers();

    if (!users[userId]) {

        users[userId] = {
            coins: 0,
            xp: 0,
            level: 1,
            answers: {},
            correct: 0,
            wrong: 0,
            profile: {
                name: "",
                color: "",
                font: "default",
                roleId: ""
            },
            inventory: {
                colors: [],
                fonts: []
            },
            lastXpAt: 0
        };

    } else {

        const user = users[userId];

        user.coins = Number(user.coins) || 0;
        user.xp = Number(user.xp) || 0;
        user.level = Math.max(1, Number(user.level) || 1);
        user.answers = user.answers || {};
        user.correct = Number(user.correct) || 0;
        user.wrong = Number(user.wrong) || 0;
        user.profile = {
            name: "",
            color: "",
            font: "default",
            roleId: "",
            ...(user.profile || {})
        };
        user.inventory = {
            colors: [],
            fonts: [],
            ...(user.inventory || {})
        };
        user.lastXpAt = Number(user.lastXpAt) || 0;
    }

    saveUsers(users);

    return users;
}

function addCoins(userId, amount) {

    const users = ensureUser(userId);

    users[userId].coins += amount;

    saveUsers(users);

    return users[userId];

}

function removeCoins(userId, amount) {

    const users = ensureUser(userId);

    if (users[userId].coins < amount)
        return false;

    users[userId].coins -= amount;

    saveUsers(users);

    return true;

}

function addXP(userId, amount) {

    const users = ensureUser(userId);

    const user = users[userId];

    user.xp += amount;

    let leveledUp = false;

    while (user.xp >= user.level * 100) {

        user.xp -= user.level * 100;

        user.level++;

        leveledUp = true;

    }

    saveUsers(users);

    return {
        user,
        leveledUp
    };

}

function adjustStat(userId, stat, amount) {
    const users = ensureUser(userId);
    const user = users[userId];
    const previousLevel = user.level;

    if (stat === "coins") {
        user.coins = Math.max(0, user.coins + amount);
    } else if (stat === "xp") {
        user.xp = Math.max(0, user.xp + amount);

        while (user.xp >= user.level * 100) {
            user.xp -= user.level * 100;
            user.level++;
        }
    } else if (stat === "level") {
        user.level = Math.max(1, user.level + amount);
        user.xp = 0;
    } else {
        throw new Error("Unsupported stat");
    }

    saveUsers(users);

    return {
        user,
        previousLevel,
        leveledUp: user.level > previousLevel
    };
}

function awardMessageXp(userId, amount = 5) {

    const users = ensureUser(userId);
    const user = users[userId];
    const now = Date.now();
    const settings = getSettings();
    const cooldownMs = Math.max(1000, Number(settings.xpCooldownMs) || 60000);
    const levelUpCoins = Math.max(0, Number(settings.levelUpCoins) || 25);

    if (now - user.lastXpAt < cooldownMs) {
        return {
            user,
            leveledUp: false,
            awarded: false
        };
    }

    user.lastXpAt = now;
    const previousLevel = user.level;
    user.xp += amount;

    let leveledUp = false;

    while (user.xp >= user.level * 100) {
        user.xp -= user.level * 100;
        user.level++;
        user.coins += levelUpCoins;
        leveledUp = true;
    }

    saveUsers(users);

    return {
        user,
        leveledUp,
        previousLevel,
        levelsGained: user.level - previousLevel,
        awarded: true
    };

}

module.exports = {
    ensureUser,
    addCoins,
    removeCoins,
    addXP,
    adjustStat,
    awardMessageXp
};
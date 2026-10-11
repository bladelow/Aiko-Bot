const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const { addCoins, ensureUser, removeCoins } = require("../utils/economy");
const { saveUsers } = require("../database");
const shop = require("../config/shop");

const items = [
    ...Object.entries(shop.colors).map(([id, item]) => ({
        name: id,
        description: `${item.label} color role - ${item.price} coins`
    })),
    ...Object.entries(shop.fonts).map(([id, item]) => ({
        name: id,
        description: `${item.label} font - ${item.price} coins`
    })),
    {
        name: "name",
        description: `${shop.name.label} - ${shop.name.price} coins`
    }
];

function styleName(name, font) {
    if (font === "fullwidth") {
        return name.replace(/[!-~]/g, character =>
            String.fromCharCode(character.charCodeAt(0) + 0xfee0)
        );
    }

    if (font === "smallcaps") {
        const map = {
            a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ",
            h: "ʜ", i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ",
            o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ", s: "s", t: "ᴛ", u: "ᴜ",
            v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ"
        };

        return name.toLowerCase().replace(/[a-z]/g, character => map[character] || character);
    }

    return name;
}

async function applyNickname(member, profile) {
    const baseName = profile.name || member.user.username;
    const nickname = styleName(baseName, profile.font);
    await member.setNickname(nickname.slice(0, 32));
}

function checkNicknamePermissions(interaction, member) {
    const botMember = interaction.guild.members.me;

    if (!botMember?.permissions.has("ManageNicknames")) {
        return "The bot needs the **Manage Nicknames** permission.";
    }

    if (!member.manageable) {
        return "The bot's highest role must be above your highest role, and it cannot change an owner's or administrator's nickname.";
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy a cosmetic with Blade Coins")
        .addStringOption(option =>
            option
                .setName("item")
                .setDescription("Shop item to buy")
                .setRequired(true)
                .addChoices(...items.map(item => ({
                    name: item.name,
                    value: item.name
                })))
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.guild) {
            await interaction.editReply("❌ This command only works in a server.");
            return;
        }

        const itemId = interaction.options.getString("item");
        const users = ensureUser(interaction.user.id);
        const user = users[interaction.user.id];
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (shop.colors[itemId]) {
            const item = shop.colors[itemId];

            if (!removeCoins(interaction.user.id, item.price)) {
                await interaction.editReply(`❌ You need **${item.price}** Blade Coins.`);
                return;
            }

            let role;

            try {
                if (!interaction.guild.members.me?.permissions.has("ManageRoles")) {
                    throw new Error("The bot needs Manage Roles permission.");
                }

                if (user.profile.roleId) {
                    const oldRole = interaction.guild.roles.cache.get(user.profile.roleId);
                    if (oldRole && oldRole.editable) await oldRole.delete("Replaced by a new Aiko color");
                }

                role = await interaction.guild.roles.create({
                    name: "Aiko Color",
                    colors: { primaryColor: item.hex },
                    hoist: false,
                    reason: "Blade Shop purchase"
                });

                const botRole = interaction.guild.members.me.roles.highest;
                const memberHighestRole = member.roles.highest;

                if (!botRole || botRole.position <= memberHighestRole.position + 1) {
                    throw new Error("The bot's highest role must be above the member's highest role so the color role can be placed above it.");
                }

                await role.setPosition(
                    memberHighestRole.position + 1,
                    "Positioned as the member's highest role"
                );
                await member.roles.add(role);
                const updatedUsers = ensureUser(interaction.user.id);
                const updatedUser = updatedUsers[interaction.user.id];
                updatedUser.profile.color = itemId;
                updatedUser.profile.roleId = role.id;
                updatedUser.inventory.colors = [...new Set([...updatedUser.inventory.colors, itemId])];
                saveUsers(updatedUsers);

                await interaction.editReply({ embeds: [new EmbedBuilder()
                    .setColor(item.hex)
                    .setDescription(`✅ You bought the **${item.label}** name color.`)] });
            } catch (error) {
                if (role?.deletable) {
                    await role.delete("Color role purchase failed").catch(() => {});
                }
                addCoins(interaction.user.id, item.price);
                console.error(error);
                await interaction.editReply(`❌ I could not create the color role: ${error.message}`);
            }
            return;
        }

        if (shop.fonts[itemId]) {
            const item = shop.fonts[itemId];
            const nicknamePermissionError = checkNicknamePermissions(interaction, member);

            if (nicknamePermissionError) {
                await interaction.editReply(`❌ ${nicknamePermissionError}`);
                return;
            }

            if (user.inventory.fonts.includes(itemId)) {
                user.profile.font = itemId;
                saveUsers(users);
                await applyNickname(member, user.profile);
                await interaction.editReply(`✅ Your **${item.label}** font is now active.`);
                return;
            }

            if (!removeCoins(interaction.user.id, item.price)) {
                await interaction.editReply(`❌ You need **${item.price}** Blade Coins.`);
                return;
            }

            const updatedUsers = ensureUser(interaction.user.id);
            const updatedUser = updatedUsers[interaction.user.id];
            updatedUser.inventory.fonts.push(itemId);
            updatedUser.profile.font = itemId;
            saveUsers(updatedUsers);
            await applyNickname(member, updatedUser.profile);
            await interaction.editReply(`✅ You bought and equipped the **${item.label}** font.`);
            return;
        }

        if (itemId === "name") {
            const nicknamePermissionError = checkNicknamePermissions(interaction, member);

            if (nicknamePermissionError) {
                await interaction.editReply(`❌ ${nicknamePermissionError}`);
                return;
            }

            if (user.profile.name) {
                await interaction.editReply("✅ You already own custom name access. Use `/setname` to change it.");
                return;
            }

            if (!removeCoins(interaction.user.id, shop.name.price)) {
                await interaction.editReply(`❌ You need **${shop.name.price}** Blade Coins.`);
                return;
            }

            const updatedUsers = ensureUser(interaction.user.id);
            const updatedUser = updatedUsers[interaction.user.id];
            updatedUser.profile.name = interaction.user.username;
            saveUsers(updatedUsers);
            await applyNickname(member, updatedUser.profile);
            await interaction.editReply("✅ Custom name access unlocked. Use `/setname name:<name>` to choose your name.");
        }
    }
};

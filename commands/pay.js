const { SlashCommandBuilder } = require("discord.js");

const {
    ensureUser,
    removeCoins,
    addCoins
} = require("../utils/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Pay Blade Coins to another member")
        .addUserOption(option =>
            option
                .setName("member")
                .setDescription("Member receiving the coins")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("Amount of Blade Coins")
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction) {
        const recipient = interaction.options.getUser("member");
        const amount = interaction.options.getInteger("amount");

        if (recipient.id === interaction.user.id) {
            await interaction.reply({ content: "❌ You cannot pay yourself.", ephemeral: true });
            return;
        }

        if (recipient.bot) {
            await interaction.reply({ content: "❌ You cannot pay a bot.", ephemeral: true });
            return;
        }

        const users = ensureUser(interaction.user.id);
        if (users[interaction.user.id].coins < amount) {
            await interaction.reply({ content: "❌ You do not have enough Blade Coins.", ephemeral: true });
            return;
        }

        removeCoins(interaction.user.id, amount);
        addCoins(recipient.id, amount);

        await interaction.reply(
            `✅ You paid **${amount}** Blade Coins to **${recipient.username}**.`
        );
    }
};
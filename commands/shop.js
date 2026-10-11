const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const shop = require("../config/shop");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View Blade Coin cosmetics"),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🛍️ Blade Shop")
            .setDescription("Buy an item with `/buy item:<item>`.")
            .addFields(
                {
                    name: "🎨 Name Colors",
                    value: Object.entries(shop.colors)
                        .map(([id, item]) => `\`${id}\` ${item.label} — **${item.price}** coins`)
                        .join("\n")
                },
                {
                    name: "🔤 Name Fonts",
                    value: Object.entries(shop.fonts)
                        .map(([id, item]) => `\`${id}\` ${item.label} — **${item.price}** coins`)
                        .join("\n")
                },
                {
                    name: "✏️ Custom Name",
                    value: `\`name\` ${shop.name.label} — **${shop.name.price}** coins`
                }
            );

        await interaction.reply({ embeds: [embed] });
    }
};

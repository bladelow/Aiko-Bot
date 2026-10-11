const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

function isAuthorized(interaction) {
    return Boolean(
        interaction.guild &&
        (interaction.guild.ownerId === interaction.user.id ||
            interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("sendmsg")
        .setDescription("Send a multiline message as the bot (server owner/admin only)")
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("Channel where the bot should post")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({
                content: "❌ Only the server owner or an administrator can use this command.",
                ephemeral: true
            });
        }
        const channel = interaction.options.getChannel("channel", true);
        const modal = new ModalBuilder()
            .setCustomId(`sendmsg_modal_${channel.id}`)
            .setTitle("Write a multiline message");
        const input = new TextInputBuilder()
            .setCustomId("message_body")
            .setLabel("Message (line breaks and blank lines are supported)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true)
            .setPlaceholder("Write your message here...");
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async handleInteraction(interaction) {
        if (!interaction.isModalSubmit() || !interaction.customId.startsWith("sendmsg_modal_")) {
            return false;
        }
        if (!isAuthorized(interaction)) {
            await interaction.reply({
                content: "❌ Only the server owner or an administrator can use this command.",
                ephemeral: true
            });
            return true;
        }
        const content = interaction.fields.getTextInputValue("message_body");
        if (!content.trim()) {
            await interaction.reply({ content: "❌ The message cannot be empty.", ephemeral: true });
            return true;
        }
        const channelId = interaction.customId.slice("sendmsg_modal_".length);
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || !("send" in channel)) {
            await interaction.reply({ content: "❌ The selected server text channel is no longer available.", ephemeral: true });
            return true;
        }
        await channel.send({
            content,
            allowedMentions: { parse: [], repliedUser: false }
        });
        await interaction.reply({ content: `✅ Message sent to <#${channel.id}>.`, ephemeral: true });
        return true;
    }
};

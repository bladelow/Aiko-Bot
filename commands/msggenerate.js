const crypto = require("node:crypto");
const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");
const { generateMessageOptions } = require("../ai");

const sessions = new Map();
const SESSION_TTL = 15 * 60 * 1000;

function canGenerate(interaction) {
    return Boolean(
        interaction.guild &&
        (interaction.guild.ownerId === interaction.user.id ||
            interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
            interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages))
    );
}

function getSession(interaction, id) {
    const session = sessions.get(id);
    if (!session || Date.now() - session.createdAt > SESSION_TTL) {
        sessions.delete(id);
        return null;
    }
    if (session.userId !== interaction.user.id) return null;
    return session;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("msggenerate")
        .setDescription("Generate message choices you can edit before sending")
        .addStringOption(option => option
            .setName("prompt")
            .setDescription("Describe the message Aiko should draft")
            .setMinLength(3)
            .setMaxLength(1200)
            .setRequired(true)),

    async execute(interaction) {
        if (!canGenerate(interaction)) {
            return interaction.reply({
                content: "❌ Only the server owner, an administrator, or a moderator with Manage Messages can use this command.",
                ephemeral: true
            });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const options = await generateMessageOptions(interaction.options.getString("prompt", true));
            const id = crypto.randomUUID().slice(0, 12);
            sessions.set(id, {
                userId: interaction.user.id,
                channelId: interaction.channelId,
                createdAt: Date.now(),
                options
            });
            for (const [sessionId, session] of sessions) {
                if (Date.now() - session.createdAt > SESSION_TTL) sessions.delete(sessionId);
            }

            const embed = new EmbedBuilder()
                .setTitle("Choose a message draft")
                .setDescription("Select one option below. You can edit the full text before sending, or cancel.")
                .addFields(options.map((text, index) => ({
                    name: `Option ${index + 1}`,
                    value: text.slice(0, 1000)
                })));
            const selectRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`msggen_select_${id}`)
                    .setPlaceholder("Choose a draft to customize")
                    .addOptions(options.map((_, index) => ({
                        label: `Option ${index + 1}`,
                        value: String(index)
                    })))
            );
            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`msggen_cancel_${id}`)
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary)
            );
            await interaction.editReply({
                embeds: [embed],
                components: [selectRow, cancelRow]
            });
        } catch (error) {
            console.error("[msggenerate] Could not generate message drafts:", error);
            await interaction.editReply(`❌ Could not generate message drafts: ${error.message || "unknown error"}`);
        }
    },

    async handleInteraction(interaction) {
        const [prefix, action, id] = interaction.customId.split("_");
        if (prefix !== "msggen") return false;
        const session = getSession(interaction, id);
        if (!session || !canGenerate(interaction)) {
            await interaction.reply({ content: "❌ This draft expired or you are not allowed to use it.", ephemeral: true });
            return true;
        }

        if (interaction.isButton() && action === "cancel") {
            sessions.delete(id);
            await interaction.update({
                content: "Draft canceled.",
                embeds: [],
                components: []
            });
            return true;
        }

        if (interaction.isStringSelectMenu() && action === "select") {
            const index = Number(interaction.values[0]);
            if (!Number.isInteger(index) || index < 0 || index >= session.options.length) {
                await interaction.reply({ content: "❌ Invalid draft selection.", ephemeral: true });
                return true;
            }
            const modal = new ModalBuilder()
                .setCustomId(`msggen_modal_${id}_${index}`)
                .setTitle("Customize and send draft");
            const input = new TextInputBuilder()
                .setCustomId("message_body")
                .setLabel("Message (line breaks are supported)")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(2000)
                .setRequired(true)
                .setValue(session.options[index].slice(0, 2000));
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (interaction.isModalSubmit() && action === "modal") {
            const content = interaction.fields.getTextInputValue("message_body");
            if (!content.trim()) {
                await interaction.reply({ content: "❌ The message cannot be empty.", ephemeral: true });
                return true;
            }
            const channel = await interaction.guild.channels.fetch(session.channelId);
            if (!channel?.isTextBased() || !("send" in channel)) {
                await interaction.reply({ content: "❌ The original channel is no longer available.", ephemeral: true });
                return true;
            }
            await channel.send({
                content,
                allowedMentions: { parse: [], repliedUser: false }
            });
            sessions.delete(id);
            await interaction.reply({ content: "✅ Your customized message has been sent.", ephemeral: true });
            return true;
        }
        return false;
    }
};

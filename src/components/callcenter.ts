import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild,
  Interaction,
  MessageFlags,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
} from "discord.js";
import { config } from "../config";
import { baseEmbed, attachMediaToEmbed, serverInfoButton } from "../lib/embeds";
import { log } from "../lib/logger";
import { memberHasRole } from "../lib/permissions";
import { notifyUser } from "../lib/notify";
import { getSubmissionDialogueByUser } from "../store/forms";
import {
  TICKET_STATUS_LABELS,
  getTicket,
  getTicketDialogueByUser,
  updateTicket,
  type CallTicket,
} from "../store/callcenter";

function modalRow(
  ...components: ModalActionRowComponentBuilder[]
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(components);
}

function selectRow(select: StringSelectMenuBuilder): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function addSelectOption(
  select: StringSelectMenuBuilder,
  value: string,
  label: string,
  emoji: string,
): void {
  select.addOptions(
    new StringSelectMenuOptionBuilder().setLabel(label).setValue(value).setEmoji(emoji),
  );
}

export function buildCcWelcome(): EmbedBuilder {
  return baseEmbed({
    title: "Кол-центр Слобідської ЦРЛ",
    description:
      "Дякуємо, що звернулися до кол-центру Слобідської ЦРЛ.\n\n" +
      "**Опишіть ваше звернення нижче** — оператор отримає його, поставить уточнення та передасть далі.\n" +
      "*Ваші повідомлення у цій гілці не переадресовуються оператору до початку розгляду та діалогу.*\n\n" +
      "У цій гілці можете писати лише ви (пацієнт).\n" +
      "Статус і відповіді оператора ви отримаєте у цій гілці та в особистих повідомленнях.",
  });
}

export function buildCcSubmissionEmbed(ticket: CallTicket): EmbedBuilder {
  const embed = new EmbedBuilder({ color: config.embedColor })
    .setTitle("Звернення до кол-центру")
    .setDescription(
      TICKET_STATUS_LABELS[ticket.status] ?? ticket.status,
    );
  if (ticket.author_icon) {
    embed.setAuthor({ name: ticket.author_name, iconURL: ticket.author_icon });
  } else {
    embed.setAuthor({ name: ticket.author_name });
  }
  embed.addFields(
    { name: "Пацієнт:", value: `<@${ticket.user_id}>`, inline: true },
    { name: "Створено:", value: `<t:${Math.floor((ticket.created_at ?? Date.now()) / 1000)}:F>`, inline: true },
  );
  embed.addFields({
    name: "Звернення:",
    value: (ticket.content || "—").slice(0, 1024),
    inline: false,
  });
  if (ticket.reviewer_id) {
    embed.addFields({ name: "Оператор:", value: `<@${ticket.reviewer_id}>`, inline: true });
  }
  const reasonFinal = ticket.status === "accepted" || ticket.status === "rejected";
  embed.addFields({
    name: "Причина:",
    value: ticket.review_reason
      ? ticket.review_reason.slice(0, 1024)
      : reasonFinal
        ? "не вказано"
        : "Очікує оператора",
    inline: false,
  });
  embed.setFooter({ text: `Тікет: ${ticket.id}` });
  attachMediaToEmbed(embed, ticket.attachments ?? []);
  return embed;
}

export function buildCcReviewSelect(ticket: CallTicket): StringSelectMenuBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`cc_review:${ticket.id}`)
    .setPlaceholder("Дія щодо звернення...");
  const final = ticket.status === "accepted" || ticket.status === "rejected";

  addSelectOption(select, "accept", "Прийняти", "✅");
  addSelectOption(select, "reject", "Відхилити", "❌");
  if (ticket.status === "reviewing") {
    addSelectOption(select, "dialogue", "Почати діалог", "💬");
  } else if (ticket.status !== "dialogue") {
    addSelectOption(select, "reviewing", "Розглянути", "👁️");
  }

  select.setDisabled(final);
  return select;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCcReviewView(ticket: CallTicket): ActionRowBuilder<any>[] {
  if (ticket.status === "accepted" || ticket.status === "rejected") return [];
  return [selectRow(buildCcReviewSelect(ticket))];
}

export function buildCcReasonModal(ticket: CallTicket, action: string): ModalBuilder {
  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Причина (необов'язково)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder("Вкажіть причину рішення (необов'язково)");
  return new ModalBuilder()
    .setCustomId(`cc_reason:${ticket.id}:${action}`)
    .setTitle(action === "accept" ? "Прийняти звернення" : "Відхилити звернення")
    .addComponents(modalRow(reason));
}

function activeDialogueUserExists(userId: string): boolean {
  return (
    !!getSubmissionDialogueByUser(userId) || !!getTicketDialogueByUser(userId)
  );
}

async function refreshCcSubmission(client: Client, ticket: CallTicket): Promise<void> {
  if (!ticket.message_id || !ticket.channel_id) return;
  try {
    const ch = await client.channels.fetch(ticket.channel_id);
    if (ch && "messages" in ch) {
      const msg = await ch.messages.fetch(ticket.message_id);
      await msg.edit({
        embeds: [buildCcSubmissionEmbed(ticket)],
        components: buildCcReviewView(ticket),
      });
    }
  } catch (e) {
    log("warn", "Не вдалося оновити ембед звернення:", e);
  }
}

async function statusInThread(
  client: Client,
  ticket: CallTicket,
  title: string,
  description: string,
  reason?: string | null,
): Promise<void> {
  if (!ticket.thread_id) return;
  try {
    const ch = await client.channels.fetch(ticket.thread_id);
    if (ch && "send" in ch) {
      const embed = baseEmbed({ title, description });
      const isFinal = ticket.status === "accepted" || ticket.status === "rejected";
      embed.addFields({
        name: "Причина:",
        value: reason
          ? reason.slice(0, 1024)
          : isFinal
            ? "не вказано"
            : "Очікує оператора",
        inline: false,
      });
      await ch.send({ content: `<@${ticket.user_id}>`, embeds: [embed] });
    }
  } catch (e) {
    log("warn", "Не вдалося надіслати статус у гілку пацієнта:", e);
  }
}

async function notifyCcAuthor(
  client: Client,
  ticket: CallTicket,
  title: string,
  description: string,
  guild: Guild | null,
): Promise<void> {
  const embed = baseEmbed({ title, description });
  const reasonFinal = ticket.status === "accepted" || ticket.status === "rejected";
  embed.addFields({
    name: "Причина:",
    value: ticket.review_reason
      ? ticket.review_reason.slice(0, 1024)
      : reasonFinal
        ? "не вказано"
        : "Очікує оператора",
    inline: false,
  });
  if (ticket.reviewer_id) {
    embed.setFooter({ text: `Оператор: <@${ticket.reviewer_id}>` });
  }
  await notifyUser(
    client,
    String(ticket.user_id),
    { embeds: [embed], components: guild ? [serverInfoButton(guild.name)] : [] },
  );
  log("info", `Повідомлення автору звернення ${ticket.user_id}: статус=${ticket.status}, причина="${ticket.review_reason ?? ""}"`);
}

async function handleCcDecision(
  interaction: Interaction,
  ticket: CallTicket,
  action: string,
  reason?: string | null,
): Promise<void> {
  if (!interaction.isRepliable()) return;
  const member = interaction.member as never as { roles: { cache: Map<string, unknown> } } | null;
  if (!memberHasRole(member as never, config.callCenterOperatorRoleId)) {
    await interaction.reply({
      content: "У вас немає прав для роботи зі зверненнями.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const guild = interaction.guild as Guild | null;
  const reviewerId = String(interaction.user.id);

  if (action === "reviewing") {
    if (ticket.status === "reviewing") {
      await interaction.reply({
        content: "Звернення вже на розгляді.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (ticket.status === "dialogue" || ticket.status === "accepted" || ticket.status === "rejected") {
      await interaction.reply({
        content: "Звернення завершене або у діалозі.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    updateTicket(ticket.id, { status: "reviewing", reviewer_id: reviewerId, review_reason: null });
    const updated = getTicket(ticket.id) ?? ticket;
    await interaction.reply({
      content: `Звернення на розгляді <@${reviewerId}>.`,
      flags: MessageFlags.Ephemeral,
    });
    await refreshCcSubmission(interaction.client as Client, updated);
    await statusInThread(
      interaction.client as Client,
      updated,
      "Ваше звернення на розгляді",
      "Оператор розглядає ваше звернення.",
    );
    await notifyCcAuthor(
      interaction.client as Client,
      updated,
      "Ваше звернення на розгляді",
      "Оператор розглядає ваше звернення. Після цього буде розпочато діалог.",
      guild,
    );
    return;
  }

  if (action === "dialogue") {
    if (ticket.status !== "reviewing") {
      await interaction.reply({
        content: "Спочатку поставте звернення на розгляд.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (activeDialogueUserExists(String(ticket.user_id))) {
      await interaction.reply({
        content: "У пацієнта вже триває інший діалог. Завершіть його перед новим.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!interaction.isRepliable()) return;
    if (!("message" in interaction) || !interaction.message) {
      await interaction.reply({
        content: "Не вдалося створити гілку діалогу.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const threadName = `Діалог — ${ticket.author_name}`.slice(0, 100);
    let thread: ThreadChannel;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      thread = await interaction.message.startThread({ name: threadName, autoArchiveDuration: 10080 });
    } catch (e) {
      await interaction.editReply({ content: "Не вдалося створити гілку діалогу." }).catch(() => undefined);
      return;
    }
    updateTicket(ticket.id, {
      status: "dialogue",
      reviewer_id: reviewerId,
      operator_thread_id: String(thread.id),
      review_reason: null,
    });
    const updated = getTicket(ticket.id) ?? ticket;
    await thread
      .send({
        embeds: [
          baseEmbed({
            title: "Діалог розпочато",
            description:
              `Ви почали діалог з <@${ticket.user_id}>.\n\n` +
              "Ваші повідомлення у цій гілці переадресовуються пацієнту, а його повідомлення (з гілки та ЛС) приходять сюди.",
          }),
        ],
      })
      .catch(() => undefined);
    await interaction.editReply({
      content: `Діалог з автором звернення розпочато <@${reviewerId}>.`,
    });
    await refreshCcSubmission(interaction.client as Client, updated);
    await statusInThread(
      interaction.client as Client,
      updated,
      "Розпочато діалог",
      "Оператор розпочав діалог щодо вашого звернення. Спілкуйтеся у цій гілці або в ЛС боту.",
    );
    await notifyCcAuthor(
      interaction.client as Client,
      updated,
      "Розпочато діалог",
      "Оператор розпочав діалог щодо вашого звернення. Продовжуйте спілкування у гілці або в ЛС боту.",
      guild,
    );
    log("info", `Тікет ${ticket.id}: діалог розпочато оператором ${reviewerId}`);
    return;
  }

  if (action === "accept" || action === "reject") {
    if (ticket.status === "accepted" || ticket.status === "rejected") {
      await interaction.reply({
        content: "Звернення вже завершене.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const accepted = action === "accept";
    const finalReason = reason || null;
    updateTicket(ticket.id, {
      status: accepted ? "accepted" : "rejected",
      reviewer_id: reviewerId,
      review_reason: finalReason,
    });
    const updated = getTicket(ticket.id) ?? ticket;
    const statusText = accepted ? "прийнято" : "відхилено";
    await interaction.reply({
      content: `Звернення ${statusText} <@${reviewerId}>.`,
      flags: MessageFlags.Ephemeral,
    });
    await refreshCcSubmission(interaction.client as Client, updated);
    const title = accepted ? "Ваше звернення прийнято" : "Ваше звернення відхилено";
    const description = accepted
      ? "Оператор прийняв ваше звернення."
      : "Оператор відхилив ваше звернення.";
    await statusInThread(interaction.client as Client, updated, title, description, updated.review_reason);
    await notifyCcAuthor(interaction.client as Client, updated, title, description, guild);
    log("info", `Тікет ${ticket.id}: ${statusText} оператором ${reviewerId}`);
    return;
  }
}

export async function handleCcReview(interaction: Interaction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const ticketId = interaction.customId.split(":")[1];
  const ticket = getTicket(ticketId);
  if (!ticket) {
    await interaction.reply({ content: "Звернення не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.values[0];
  if (action === "accept" || action === "reject") {
    await interaction.showModal(buildCcReasonModal(ticket, action));
    return;
  }
  await handleCcDecision(interaction, ticket, action);
}

export async function handleCcReasonModal(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const [, ticketId, action] = interaction.customId.split(":");
  const ticket = getTicket(ticketId);
  if (!ticket) {
    await interaction.reply({ content: "Звернення не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const reason = interaction.fields.getTextInputValue("reason").trim() || null;
  await handleCcDecision(interaction, ticket, action, reason);
}
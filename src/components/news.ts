import crypto from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  MessageFlags,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { config } from "../config";
import { baseEmbed } from "../lib/embeds";
import { log } from "../lib/logger";
import { memberHasRole } from "../lib/permissions";

interface NewsDraft {
  title: string;
  description: string;
  imageUrl: string;
  pings: string[];
}

const drafts = new Map<string, NewsDraft>();
const previewRefs = new Map<string, { channelId: string; messageId: string }>();

function row(
  ...components: ModalActionRowComponentBuilder[]
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(components);
}

function buttonRow(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export function buildNewsPreviewView(): ActionRowBuilder<ButtonBuilder>[] {
  const edit = new ButtonBuilder()
    .setCustomId("news_edit")
    .setLabel("Заповнити текст")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🎨");
  return [buttonRow(edit)];
}

export function buildNewsModal(): ModalBuilder {
  const title = new TextInputBuilder()
    .setCustomId("news_title")
    .setLabel("Назва новини")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Заголовок новини...")
    .setMaxLength(256)
    .setRequired(true);
  const description = new TextInputBuilder()
    .setCustomId("news_description")
    .setLabel("Опис новини")
    .setPlaceholder("Текст новини...")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(true);
  const image = new TextInputBuilder()
    .setCustomId("news_image")
    .setLabel("Зображення (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://example.com/image.png")
    .setRequired(false)
    .setMaxLength(500);
  const pings = new TextInputBuilder()
    .setCustomId("news_pings")
    .setLabel("Пінги ролей (необов'язково)")
    .setPlaceholder("<@&1234>, <@&5678>")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200);
  return new ModalBuilder()
    .setCustomId("news_modal")
    .setTitle("Публікація новини")
    .addComponents(
      row(title),
      row(description),
      row(image),
      row(pings),
    );
}

function buildPreviewView(token: string): ActionRowBuilder<ButtonBuilder>[] {
  const publish = new ButtonBuilder()
    .setCustomId(`news_publish:${token}`)
    .setLabel("Опублікувати")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");
  const edit = new ButtonBuilder()
    .setCustomId(`news_edit:${token}`)
    .setLabel("Редагувати")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("✏️");
  const cancel = new ButtonBuilder()
    .setCustomId(`news_cancel:${token}`)
    .setLabel("Скасувати")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("❌");
  return [buttonRow(publish, edit, cancel)];
}

export async function handleNewsEdit(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const userId = String(interaction.user.id);
  const token = interaction.customId.includes(":") ? interaction.customId.split(":")[1] : undefined;
  if (token) drafts.delete(token);
  if (interaction.message && interaction.channelId) {
    previewRefs.set(userId, { channelId: interaction.channelId, messageId: interaction.message.id });
  }
  await interaction.showModal(buildNewsModal());
}

export async function handleNewsModal(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const title = interaction.fields.getTextInputValue("news_title");
  const description = interaction.fields.getTextInputValue("news_description");
  const imageUrl = interaction.fields.getTextInputValue("news_image").trim();
  const pingsRaw = interaction.fields.getTextInputValue("news_pings").trim();

  const embed = baseEmbed({ title, description });

  if (imageUrl) {
    if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
      await interaction.reply({
        content: "Посилання на зображення має починатися з `http://` або `https://`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    embed.setImage(imageUrl);
  }

  const mentions: string[] = [];
  if (pingsRaw) {
    const items = pingsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const re = /^<@&([0-9]+)>$/;
    for (const item of items) {
      const match = re.exec(item);
      if (!match) {
        await interaction.reply({
          content: "Пінги мають бути у форматі `<@&1234>` через кому, до 5 ролей.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      mentions.push(match[1]);
    }
    const unique = [...new Set(mentions)];
    if (unique.length > 5) {
      await interaction.reply({
        content: "Можна вказати не більше 5 пінг-ролей.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const token = crypto.randomBytes(6).toString("hex");
  drafts.set(token, { title, description, imageUrl, pings: mentions });

  embed.setFooter({ text: "Попередній перегляд" });

  const userId = String(interaction.user.id);
  const ref = previewRefs.get(userId);
  if (ref) {
    try {
      await interaction.deferUpdate();
      const ch = await interaction.client.channels.fetch(ref.channelId);
      if (ch && "messages" in ch) {
        const msg = await ch.messages.fetch(ref.messageId);
        await msg.edit({ embeds: [embed], components: buildPreviewView(token) });
        return;
      }
    } catch {}
    await interaction
      .editReply({ embeds: [embed], components: buildPreviewView(token) })
      .catch(() => undefined);
    return;
  }

  await interaction.reply({
    embeds: [embed],
    components: buildPreviewView(token),
    flags: MessageFlags.Ephemeral,
  });
  const fetched = await interaction.fetchReply().catch(() => null);
  if (fetched && interaction.channelId) {
    previewRefs.set(userId, { channelId: interaction.channelId, messageId: fetched.id });
  }
}

async function permissionCheck(interaction: Interaction): Promise<boolean> {
  const member = interaction.member as never as { roles: { cache: Map<string, unknown> } } | null;
  if (!memberHasRole(member as never, config.roleNews)) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "У вас немає прав для публікації новин.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return false;
  }
  return true;
}

export async function handleNewsPublish(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const token = interaction.customId.split(":")[1];
  const draft = drafts.get(token);
  if (!draft) {
    await interaction.reply({ content: "Чернетку новини не знайдено. Заповніть форму заново.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await permissionCheck(interaction))) return;

  const embed = baseEmbed({ title: draft.title, description: draft.description });
  if (draft.imageUrl) embed.setImage(draft.imageUrl);

  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await interaction.reply({ content: "Не вдалося визначити канал для публікації.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    if (draft.pings.length > 0) {
      const mentionText = draft.pings.map((id) => `<@&${id}>`).join(" ");
      await channel.send({ content: mentionText, embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (e) {
    await interaction.reply({
      content: `Не вдалося опублікувати новину: ${e instanceof Error ? e.message : String(e)}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  drafts.delete(token);
  previewRefs.delete(String(interaction.user.id));
  try {
    await interaction.message.delete();
  } catch {}
  await interaction.reply({ content: "✅ Новину опубліковано в канал.", flags: MessageFlags.Ephemeral });
  log("info", `Новину опублікував користувач ${interaction.user.id}: ${draft.title.slice(0, 80)}`);
}

export async function handleNewsCancel(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const token = interaction.customId.split(":")[1];
  drafts.delete(token);
  previewRefs.delete(String(interaction.user.id));
  try {
    await interaction.deferUpdate();
  } catch {}
  try {
    await interaction.message.delete();
  } catch {
    await interaction
      .editReply({ content: "Публікацію новини скасовано.", components: [] })
      .catch(() => undefined);
  }
}
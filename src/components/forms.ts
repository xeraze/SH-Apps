import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild,
  Interaction,
  Message,
  MessageFlags,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
} from "discord.js";
import { config } from "../config";
import { attachMediaToEmbed, baseEmbed, serverInfoButton } from "../lib/embeds";
import { log } from "../lib/logger";
import { notifyUser } from "../lib/notify";
import { memberHasRole } from "../lib/permissions";
import {
  SUBMISSION_STATUS_LABELS,
  addSubmissionAttachments,
  createSubmission,
  getForm,
  getSubmission,
  getSubmissionDialogueByUser,
  loadForms,
  loadSubmissions,
  saveForm,
  updateSubmission,
  type Form,
  type Submission,
} from "../store/forms";
import { getTicketDialogueByUser } from "../store/callcenter";

function modalRow(
  ...components: ModalActionRowComponentBuilder[]
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(components);
}

function selectRow(select: StringSelectMenuBuilder): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buttonRow(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export function colorInt(color?: string): number {
  if (!color) return config.embedColor;
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return m ? parseInt(m[1], 16) : config.embedColor;
}

export interface MenuStyling {
  title?: string;
  description?: string;
  color?: string;
  footer?: string;
  footerIcon?: string;
  image?: string;
}

export interface MenuPanelState {
  formIds: string[];
  styling?: MenuStyling;
  published?: boolean;
}

const panelStates = new Map<string, MenuPanelState>();

export function buildMenuEmbed(formIds?: string[], styling?: MenuStyling): EmbedBuilder {
  const color = styling?.color ? colorInt(styling.color) : config.embedColor;
  const title = (styling?.title || "Меню з заявками").slice(0, 256);
  const description =
    styling?.description ??
    "Всі ваші заявки надійдуть розглядаючим де вони приймуть рішення щодо прийняття або відхилення вашого прохання.";
  const embed = new EmbedBuilder({ color })
    .setTitle(title)
    .setDescription(description.slice(0, 4000));
  if (styling?.footer) {
    const footer: { text: string; iconURL?: string } = { text: styling.footer.slice(0, 2048) };
    if (styling.footerIcon) footer.iconURL = styling.footerIcon;
    embed.setFooter(footer);
  }
  if (styling?.image) embed.setImage(styling.image);
  return embed;
}

export function buildMenuView(formIds?: string[]): ActionRowBuilder<StringSelectMenuBuilder>[] {
  let forms = loadForms();
  if (formIds && formIds.length > 0) {
    forms = forms.filter((f) => formIds.includes(f.id));
  }
  if (forms.length === 0) return [];
  const select = new StringSelectMenuBuilder()
    .setCustomId("form_menu_select")
    .setPlaceholder("Оберіть анкету...")
    .addOptions(
      forms.map((f) => {
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(f.title.slice(0, 100))
          .setValue(f.id);
        if (f.emoji) opt.setEmoji(f.emoji);
        return opt;
      }),
    );
  return [selectRow(select)];
}

export function buildPanelButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const edit = new ButtonBuilder()
    .setCustomId("panel_edit")
    .setLabel("Змінити текст")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📝");
  const json = new ButtonBuilder()
    .setCustomId("panel_json")
    .setLabel("Змінити JSON")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🧾");
  return [buttonRow(edit, json)];
}

function buildPanelSelect(state: MenuPanelState): StringSelectMenuBuilder {
  const all = loadForms();
  const select = new StringSelectMenuBuilder()
    .setCustomId("panel_select")
    .setPlaceholder("Оберіть анкети, які увійдуть до меню...")
    .setMinValues(1)
    .setMaxValues(Math.max(all.length, 1));
  for (const f of all) {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(f.title.slice(0, 100))
      .setValue(f.id);
    if (f.emoji) opt.setEmoji(f.emoji);
    if (state.formIds.includes(f.id)) opt.setDefault(true);
    select.addOptions(opt);
  }
  return select;
}

function buildPanelView(state: MenuPanelState): any[] {
  return [selectRow(buildPanelSelect(state)), ...buildPanelButtons()];
}

export async function openBidMenuPanel(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) return;
  const member = interaction.member as never as { roles: { cache: Map<string, unknown> } } | null;
  if (!memberHasRole(member as never, config.bidmenuRoleId)) {
    await interaction.reply({
      content: "У вас немає прав для цієї команди.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const all = loadForms();
  if (all.length === 0) {
    await interaction.reply({ content: "Анкет немає. Додайте файли у data/forms/*.json.", flags: MessageFlags.Ephemeral });
    return;
  }
  const state: MenuPanelState = { formIds: [] };
  panelStates.set(String(interaction.user.id), state);
  await interaction.reply({
    embeds: [
      baseEmbed({
        title: "Відправка меню з заявками",
        description:
          "Меню відправиться в той же канал, де ви прописуєте це меню!\n\n" +
          "Переконайтеся що ви остаточно закінчили редагування заявок, бот в міру їх змін не оновлює меню.",
      }),
    ],
    components: buildPanelView(state),
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePanelSelect(interaction: Interaction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const state = panelStates.get(String(interaction.user.id));
  if (!state) {
    await interaction.reply({ content: "Панель меню застаріла. Виконайте /bidmenu заново.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (state.published) {
    await interaction.reply({ content: "Меню вже опубліковано. Виконайте /bidmenu заново.", flags: MessageFlags.Ephemeral });
    return;
  }
  const formIds = interaction.values;
  if (formIds.length === 0) {
    await interaction.reply({ content: "Оберіть хоча б одну анкету для меню.", flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await interaction.reply({ content: "Не вдалося визначити канал.", flags: MessageFlags.Ephemeral });
    return;
  }
  const view = buildMenuView(formIds);
  if (view.length === 0) {
    await interaction.reply({ content: "Вибрані анкети не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  const allForms = loadForms();
  state.formIds = formIds;
  try {
    await channel.send({ embeds: [buildMenuEmbed(formIds, state.styling)], components: view });
  } catch (e) {
    await interaction
      .editReply({ content: `Не вдалося надіслати меню: ${e instanceof Error ? e.message : String(e)}` })
      .catch(() => undefined);
    return;
  }
  state.published = true;
  panelStates.delete(String(interaction.user.id));
  try {
    await interaction.message.edit({
      embeds: [
        baseEmbed({
          title: "Меню відправлено",
          description: `Всі ваші заявки були переглянуті. Додано було ${formIds.length}/${allForms.length}!`,
        }),
      ],
      components: [],
    });
  } catch (e) {
    log("warn", "Не вдалося оновити панель меню:", e);
  }
}

export function buildPanelEditModal(): ModalBuilder {
  const title = new TextInputBuilder()
    .setCustomId("panel_title")
    .setLabel("Заголовок ембеда (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setRequired(false);
  const desc = new TextInputBuilder()
    .setCustomId("panel_desc")
    .setLabel("Опис ембеда (необов'язково)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(false);
  const color = new TextInputBuilder()
    .setCustomId("panel_color")
    .setLabel("Колір #RRGGBB (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(7)
    .setRequired(false)
    .setPlaceholder("#3498db");
  const footer = new TextInputBuilder()
    .setCustomId("panel_footer")
    .setLabel("Футер ембеда (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(2048)
    .setRequired(false);
  const image = new TextInputBuilder()
    .setCustomId("panel_image")
    .setLabel("Посилання на зображення (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder("https://example.com/image.png");
  return new ModalBuilder()
    .setCustomId("panel_edit_modal")
    .setTitle("Оформлення меню анкет")
    .addComponents(modalRow(title), modalRow(desc), modalRow(color), modalRow(footer), modalRow(image));
}

function validImageUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export async function handlePanelEdit(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  await interaction.showModal(buildPanelEditModal());
}

export async function handlePanelEditModal(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const state = panelStates.get(String(interaction.user.id));
  if (!state) {
    await interaction.reply({ content: "Панель меню застаріла. Виконайте /bidmenu заново.", flags: MessageFlags.Ephemeral });
    return;
  }
  const title = interaction.fields.getTextInputValue("panel_title").trim();
  const description = interaction.fields.getTextInputValue("panel_desc").trim();
  const color = interaction.fields.getTextInputValue("panel_color").trim();
  const footer = interaction.fields.getTextInputValue("panel_footer").trim();
  const image = interaction.fields.getTextInputValue("panel_image").trim();
  if (image && !validImageUrl(image)) {
    await interaction.reply({
      content: "Посилання на зображення має починатися з `http://` або `https://`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  state.styling = {
    title: title || undefined,
    description: description || undefined,
    color: color || undefined,
    footer: footer || undefined,
    image: image || undefined,
  };
  await interaction.reply({ content: "✅ Оформлення меню оновлено.", flags: MessageFlags.Ephemeral });
}

export function buildPanelJsonModal(): ModalBuilder {
  const json = new TextInputBuilder()
    .setCustomId("panel_json")
    .setLabel("JSON: title, desc, color, footer, image")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('{"title":"Анкети","description":"...","color":"#3498db","footer":"...","image":"https://..."}');
  return new ModalBuilder()
    .setCustomId("panel_json_modal")
    .setTitle("Оформлення меню через JSON")
    .addComponents(modalRow(json));
}

export async function handlePanelJson(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  await interaction.showModal(buildPanelJsonModal());
}

export async function handlePanelJsonModal(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const state = panelStates.get(String(interaction.user.id));
  if (!state) {
    await interaction.reply({ content: "Панель меню застаріла. Виконайте /bidmenu заново.", flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("panel_json").trim();
  let parsed: Partial<MenuStyling>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await interaction.reply({ content: "JSON невалідний. Перевірте синтаксис.", flags: MessageFlags.Ephemeral });
    return;
  }
  const image = typeof parsed.image === "string" ? parsed.image.trim() : "";
  if (image && !validImageUrl(image)) {
    await interaction.reply({
      content: "Посилання на зображення має починатися з `http://` або `https://`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const extra = parsed as unknown as Record<string, unknown>;
  const footerIcon =
    typeof extra.footer_icon === "string"
      ? String(extra.footer_icon).trim()
      : typeof parsed.footerIcon === "string"
        ? parsed.footerIcon.trim()
        : "";
  if (footerIcon && !validImageUrl(footerIcon)) {
    await interaction.reply({
      content: "Посилання на іконку футера має починатися з `http://` або `https://`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  state.styling = {
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    color: typeof parsed.color === "string" ? parsed.color : undefined,
    footer: typeof parsed.footer === "string" ? parsed.footer : undefined,
    footerIcon: footerIcon || undefined,
    image: image || undefined,
  };
  await interaction.reply({ content: "✅ Оформлення меню оновлено.", flags: MessageFlags.Ephemeral });
}

export function buildFormModal(form: Form): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`form_submit:${form.id}`)
    .setTitle(form.title.slice(0, 45));
  form.questions.slice(0, 5).forEach((q, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel((q.label || `Питання ${i + 1}`).slice(0, 45))
      .setStyle(q.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required ?? true)
      .setMaxLength(q.multiline ? 4000 : 1024);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(modalRow(input));
  });
  return modal;
}

export function buildSubmissionEmbeds(sub: Submission, form: Form): EmbedBuilder[] {
  const color = colorInt(form.color);
  const thumb = sub.author_icon || undefined;

  const header = new EmbedBuilder({ color })
    .setTitle(`Прийшла нова заявка ・ ${form.title}`.slice(0, 256))
    .setDescription(`Відправник заявки: **${sub.author_name}** <@${sub.user_id}>`);
  if (thumb) header.setThumbnail(thumb);
  if (config.dividerImage) header.setImage(config.dividerImage);
  header.addFields({
    name: "Статус",
    value: `\`${SUBMISSION_STATUS_LABELS[sub.status] ?? sub.status}\``,
    inline: true,
  });
  if (sub.reviewer_id) {
    header.addFields({ name: "Перевіряючий", value: `<@${sub.reviewer_id}>`, inline: true });
  }
  const reasonFinal = sub.status === "accepted" || sub.status === "rejected";
  header.addFields({
    name: "Причина винесення рішення",
    value: sub.review_reason
      ? sub.review_reason.slice(0, 1024)
      : reasonFinal
        ? "`не вказано`"
        : "`Очікує розглядаючого`",
    inline: false,
  });

  const answers = new EmbedBuilder({ color }).setTitle("Відповіді на питання прописані в заявці");
  if (thumb) answers.setThumbnail(thumb);
  const lines = sub.answers
    .map((a) => `**${a.label}**\n> \`\`\`${a.value}\`\`\``)
    .join("\n\n");
  answers.setDescription(lines.slice(0, 4000));
  attachMediaToEmbed(answers, sub.attachments ?? []);
  return [header, answers];
}

export function buildReviewSelect(sub: Submission): StringSelectMenuBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`form_review:${sub.id}`)
    .setPlaceholder("Розглянути заявку...");
  const final = sub.status === "accepted" || sub.status === "rejected";
  const add = (value: string, label: string) =>
    select.addOptions(new StringSelectMenuOptionBuilder().setLabel(label).setValue(value));
  add("accept", "✅ Прийняти");
  add("reject", "❌ Відхилити");
  if (sub.status === "reviewing") {
    add("dialogue", "💬 Почати діалог");
  } else if (sub.status !== "dialogue") {
    add("reviewing", "👁️ Розглянути");
  }
  select.setDisabled(final);
  return select;
}

export function buildReviewView(sub: Submission): ActionRowBuilder<any>[] {
  if (sub.status === "accepted" || sub.status === "rejected") return [];
  return [selectRow(buildReviewSelect(sub))];
}

export function buildThreadControls(sub: Submission): ActionRowBuilder<ButtonBuilder>[] {
  const final = sub.status === "accepted" || sub.status === "rejected";
  const accept = new ButtonBuilder()
    .setCustomId(`form_accept:${sub.id}`)
    .setLabel("Прийняти")
    .setStyle(ButtonStyle.Success)
    .setDisabled(final);
  const reject = new ButtonBuilder()
    .setCustomId(`form_reject:${sub.id}`)
    .setLabel("Відхилити")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(final);
  return [buttonRow(accept, reject)];
}

export function buildReasonModal(sub: Submission, action: string): ModalBuilder {
  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Причина (необов'язково)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder("Вкажіть причину рішення (необов'язково)");
  return new ModalBuilder()
    .setCustomId(`form_reason:${sub.id}:${action}`)
    .setTitle(action === "accept" ? "Прийняти заявку" : "Відхилити заявку")
    .addComponents(modalRow(reason));
}

export function buildEditFormModal(): ModalBuilder {
  const id = new TextInputBuilder()
    .setCustomId("form_id")
    .setLabel("ID анкети (з data/forms/*.json)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setPlaceholder("Напр.: job_application");
  const title = new TextInputBuilder()
    .setCustomId("form_title")
    .setLabel("Заголовок ембеда (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setRequired(false);
  const desc = new TextInputBuilder()
    .setCustomId("form_desc")
    .setLabel("Опис ембеда (необов'язково)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(false);
  const color = new TextInputBuilder()
    .setCustomId("form_color")
    .setLabel("Колір #RRGGBB (необов'язково)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(7)
    .setRequired(false)
    .setPlaceholder("#3498db");
  const json = new TextInputBuilder()
    .setCustomId("form_json")
    .setLabel("JSON (повний конфіг, необов'язково)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  return new ModalBuilder()
    .setCustomId("form_edit_modal")
    .setTitle("Редагування ембеда анкети")
    .addComponents(modalRow(id), modalRow(title), modalRow(desc), modalRow(color), modalRow(json));
}

async function notifySubmissionAuthor(
  client: Client,
  sub: Submission,
  form: Form,
  title: string,
  description: string,
  guild: Guild | null,
): Promise<void> {
  const embed = baseEmbed({ title, description });
  const isFinal = sub.status === "accepted" || sub.status === "rejected";
  embed.addFields({
    name: "Причина:",
    value: sub.review_reason
      ? sub.review_reason.slice(0, 1024)
      : isFinal
        ? "не вказано"
        : "Очікує розглядаючого",
    inline: false,
  });
  if (sub.reviewer_id) {
    embed.setFooter({ text: `Перевірив: <@${sub.reviewer_id}>` });
  }
  await notifyUser(
    client,
    String(sub.user_id),
    { embeds: [embed], components: guild ? [serverInfoButton(guild.name)] : [] },
    sub.thread_id,
  );
  log("info", `Повідомлення автору анкети ${sub.user_id}: статус=${sub.status}, причина="${sub.review_reason ?? ""}"`);
}

async function publishAcceptedSubmission(client: Client, sub: Submission, form: Form): Promise<void> {
  if (!form.accepted_channel_id) return;
  let channel = client.channels.cache.get(form.accepted_channel_id) ?? null;
  if (!channel || !("send" in channel)) {
    try {
      channel = await client.channels.fetch(form.accepted_channel_id);
    } catch {
      return;
    }
  }
  if (!channel || !("send" in channel)) return;
  try {
    await channel.send({ content: `<@${sub.user_id}>`, embeds: buildSubmissionEmbeds(sub, form) });
  } catch {
    log("warn", "Не вдалося опублікувати прийняту заявку");
  }
}

async function refreshSubmissionMessage(client: Client, sub: Submission, form: Form): Promise<void> {
  if (!sub.message_id || !sub.channel_id) return;
  try {
    const ch = await client.channels.fetch(sub.channel_id);
    if (ch && "messages" in ch) {
      const msg = await ch.messages.fetch(sub.message_id);
      await msg.edit({
        embeds: buildSubmissionEmbeds(sub, form),
        components: buildReviewView(sub),
      });
    }
  } catch {}
}

async function refreshThreadControls(client: Client, sub: Submission): Promise<void> {
  if (!sub.thread_id || !sub.thread_controls_id) return;
  try {
    const ch = await client.channels.fetch(sub.thread_id);
    if (ch instanceof ThreadChannel && "messages" in ch) {
      const msg = await ch.messages.fetch(sub.thread_controls_id);
      const reasonText =
        sub.review_reason ||
        (sub.status === "accepted" || sub.status === "rejected" ? "не вказано" : "Очікує розглядаючого");
      await msg.edit({
        embeds: [
          baseEmbed({
            title: SUBMISSION_STATUS_LABELS[sub.status] ?? sub.status,
            description: reasonText,
          }),
        ],
        components: buildThreadControls(sub),
      });
    }
  } catch {}
}

async function handleFormDecision(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  sub: Submission,
  form: Form,
  action: string,
  reason?: string | null,
): Promise<void> {
  const member = interaction.member as never as { roles: { cache: Map<string, unknown> } } | null;
  if (!memberHasRole(member as never, config.reviewerRoleIds)) {
    await interaction.reply({ content: "У вас немає прав для перевірки анкет.", flags: MessageFlags.Ephemeral });
    return;
  }

  const guild = interaction.guild as Guild | null;
  const reviewerId = String(interaction.user.id);

  if (action === "accept" || action === "reject") {
    if (reason === undefined) {
      if (interaction.isButton()) {
        await interaction.showModal(buildReasonModal(sub, action));
      }
      return;
    }
    const accepted = action === "accept";
    updateSubmission(sub.id, {
      status: accepted ? "accepted" : "rejected",
      reviewer_id: reviewerId,
      review_reason: reason || null,
    });
    const updated = getSubmission(sub.id) ?? sub;
    const statusText = accepted ? "прийнято" : "відхилено";
    await interaction.reply({ content: `✅ Заявку ${statusText} <@${reviewerId}>.`, flags: MessageFlags.Ephemeral });
    await refreshSubmissionMessage(interaction.client as Client, updated, form);
    await refreshThreadControls(interaction.client as Client, updated);
    const title = accepted ? "Вашу заявку прийнято" : "Вашу заявку відхилено";
    const description = accepted
      ? `Вашу заявку «${form.title}» прийнято.`
      : `Вашу заявку «${form.title}» відхилено.`;
    if (accepted) await publishAcceptedSubmission(interaction.client as Client, updated, form);
    await notifySubmissionAuthor(
      interaction.client as Client,
      updated,
      form,
      title,
      description,
      guild,
    );
    return;
  }

  if (action === "reviewing") {
    updateSubmission(sub.id, { status: "reviewing", reviewer_id: reviewerId, review_reason: null });
    const updated = getSubmission(sub.id) ?? sub;
    await interaction.reply({ content: "Заявку надіслано на розгляд.", flags: MessageFlags.Ephemeral });
    await refreshSubmissionMessage(interaction.client as Client, updated, form);
    await notifySubmissionAuthor(
      interaction.client as Client,
      updated,
      form,
      "Вашу заявку надіслано на розгляд",
      `Вашу заявку «${form.title}» надіслано на розгляд. Статус буде оновлено пізніше.`,
      guild,
    );
    return;
  }

  if (action === "dialogue") {
    if (sub.status !== "reviewing") {
      await interaction.reply({ content: "Спочатку поставте заявку на розгляд.", flags: MessageFlags.Ephemeral });
      return;
    }
    const authorId = String(sub.user_id);
    if (getSubmissionDialogueByUser(authorId) || getTicketDialogueByUser(authorId)) {
      await interaction.reply({
        content: "У автора заявки вже триває діалог. Завершіть його перед новим.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!interaction.message) {
      await interaction.reply({ content: "Не вдалося створити гілку діалогу.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const threadName = `Діалог — ${form.title}`.slice(0, 100);
    let thread: ThreadChannel;
    try {
      thread = await interaction.message.startThread({ name: threadName, autoArchiveDuration: 10080 });
    } catch {
      await interaction.reply({ content: "Не вдалося створити гілку діалогу.", flags: MessageFlags.Ephemeral });
      return;
    }
    updateSubmission(sub.id, { status: "dialogue" });
    const updated = getSubmission(sub.id) ?? sub;
    const controls = await thread
      .send({
        embeds: [
          baseEmbed({
            title: "Розпочато діалог",
            description:
              `Ви почали діалог з <@${sub.user_id}> щодо заявки «${form.title}».\n\n` +
              "Повідомлення автора з ПП приходитимуть сюди, ваші повідомлення надсилатимуться автору в ПП.",
          }),
        ],
        components: buildThreadControls(updated),
      })
      .catch(() => null);
    updateSubmission(sub.id, {
      thread_id: String(thread.id),
      thread_controls_id: controls ? String(controls.id) : null,
    });
    await interaction.editReply({ content: "Діалог з автором заявки розпочато." });
    await refreshSubmissionMessage(interaction.client as Client, updated, form);
    await notifySubmissionAuthor(
      interaction.client as Client,
      updated,
      form,
      "Розпочато діалог щодо вашої заявки",
      `Перевіряючий розпочав діалог щодо вашої заявки «${form.title}». Подальша взаємодія відбуватиметься у ПП.`,
      guild,
    );
    return;
  }
}

export async function handleFormMenuSelect(interaction: Interaction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const formId = interaction.values[0];
  const form = getForm(formId);
  if (!form) {
    await interaction.reply({ content: "Анкету не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(buildFormModal(form));
}

export async function handleFormSubmit(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const formId = interaction.customId.split(":")[1];
  const form = getForm(formId);
  if (!form) {
    await interaction.reply({ content: "Анкету не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!form.channel_id) {
    await interaction.reply({
      content: "Канал для анкети не налаштовано. Повідомте STAFF.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const answers = form.questions.slice(0, 5).map((q, i) => ({
    label: q.label || `Питання ${i + 1}`,
    value: interaction.fields.getTextInputValue(`q${i}`).trim() || "—",
  }));
  const sub = createSubmission({
    form_id: form.id,
    user_id: String(interaction.user.id),
    author_name: interaction.user.username,
    author_icon: interaction.user.displayAvatarURL(),
    answers,
  });
  let channel = interaction.client.channels.cache.get(form.channel_id) ?? null;
  if (!channel || !("send" in channel)) {
    try {
      channel = await interaction.client.channels.fetch(form.channel_id);
    } catch {
      channel = null;
    }
  }
  if (!channel || !("send" in channel)) {
    await interaction.reply({
      content: "Канал для анкети не знайдено. Повідомте STAFF.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const message = await channel.send({
    content: form.ping_role_id ? `<@&${form.ping_role_id}>` : undefined,
    embeds: buildSubmissionEmbeds(sub, form),
    components: buildReviewView(sub),
  });
  updateSubmission(sub.id, { message_id: String(message.id), channel_id: String(channel.id) });
  await interaction.reply({
    content:
      "✅ Вашу анкету надіслано на розгляд.\n\n" +
      "📎 Якщо потрібно прикріпити файли або зображення — надішліть їх боту в ЛС у будь-який момент, вони будуть додані до вашої заявки.",
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePendingAttachmentMessage(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.guild) return;
  if (message.attachments.size === 0) return;
  const subs = loadSubmissions()
    .filter((s) => String(s.user_id) === String(message.author.id) && s.status !== "accepted" && s.status !== "rejected")
    .sort((a, b) => (b.message_id ?? "").localeCompare(a.message_id ?? ""));
  const sub = subs[0];
  if (!sub) return;
  const urls = [...message.attachments.values()].map((a) => a.url);
  const updated = addSubmissionAttachments(sub.id, urls);
  if (!updated) return;
  const form = getForm(updated.form_id);
  if (form) await refreshSubmissionMessage(client, updated, form);
  await message
    .reply(`✅ Файли прикріплено до анкети ${form ? `«${form.title}»` : ""}.`)
    .catch(() => undefined);
}

export async function handleFormReview(interaction: Interaction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const subId = interaction.customId.split(":")[1];
  const sub = getSubmission(subId);
  if (!sub) {
    await interaction.reply({ content: "Заявку не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const form = getForm(sub.form_id);
  if (!form) {
    await interaction.reply({ content: "Анкету не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.values[0];
  if (action === "accept" || action === "reject") {
    await interaction.showModal(buildReasonModal(sub, action));
    return;
  }
  await handleFormDecision(interaction, sub, form, action);
}

export async function handleFormReason(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const [, subId, action] = interaction.customId.split(":");
  const sub = getSubmission(subId);
  if (!sub) {
    await interaction.reply({ content: "Заявку не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const form = getForm(sub.form_id);
  if (!form) {
    await interaction.reply({ content: "Анкету не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const reason = interaction.fields.getTextInputValue("reason").trim() || null;
  await handleFormDecision(interaction, sub, form, action, reason);
}

export async function handleFormThreadButton(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const [kind, subId] = interaction.customId.split(":");
  const sub = getSubmission(subId);
  if (!sub) {
    await interaction.reply({ content: "Заявку не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  const form = getForm(sub.form_id);
  if (!form) {
    await interaction.reply({ content: "Анкету не знайдено.", flags: MessageFlags.Ephemeral });
    return;
  }
  await handleFormDecision(interaction, sub, form, kind === "form_accept" ? "accept" : "reject");
}

export async function handleFormEdit(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  await interaction.showModal(buildEditFormModal());
}

export async function handleFormEditModal(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const formId = interaction.fields.getTextInputValue("form_id").trim();
  const form = getForm(formId);
  if (!form) {
    await interaction.reply({
      content: `Анкету з ID «${formId}» не знайдено. Перевірте data/forms/*.json.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const jsonRaw = interaction.fields.getTextInputValue("form_json").trim();
  if (jsonRaw) {
    let parsed: Partial<Form>;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch {
      await interaction.reply({ content: "JSON невалідний. Перевірте синтаксис.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      await interaction.reply({ content: "У JSON має бути масив questions.", flags: MessageFlags.Ephemeral });
      return;
    }
    saveForm({
      ...form,
      ...parsed,
      id: form.id,
      title: (parsed.title || form.title).trim(),
    });
    await interaction.reply({
      content: `✅ Ембед анкети «${form.title}» оновлено з JSON.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const title = interaction.fields.getTextInputValue("form_title").trim();
  const description = interaction.fields.getTextInputValue("form_desc").trim();
  const color = interaction.fields.getTextInputValue("form_color").trim();
  saveForm({
    ...form,
    title: title || form.title,
    description: description || form.description,
    color: color || form.color || undefined,
  });
  await interaction.reply({ content: `✅ Ембед анкети «${form.title}» оновлено.`, flags: MessageFlags.Ephemeral });
}

export async function handleFormPublish(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const member = interaction.member as never as { roles: { cache: Map<string, unknown> } } | null;
  if (!memberHasRole(member as never, config.bidmenuRoleId)) {
    await interaction.reply({ content: "У вас немає прав для публікації меню.", flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await interaction.reply({ content: "Не вдалося визначити канал.", flags: MessageFlags.Ephemeral });
    return;
  }
  await channel.send({ embeds: [buildMenuEmbed()], components: buildMenuView() });
  await interaction.reply({ content: "✅ Меню анкет опубліковано в канал.", flags: MessageFlags.Ephemeral });
}
import {
  Client,
  Message,
  ThreadChannel,
  EmbedBuilder,
  PermissionFlagsBits,
  Routes,
} from "discord.js";
import { config } from "../config";
import {
  buildCcReviewView,
  buildCcSubmissionEmbed,
  buildCcWelcome,
} from "../components/callcenter";
import { baseEmbed, messageRelayEmbed } from "../lib/embeds";
import { log } from "../lib/logger";
import { notifyUser } from "../lib/notify";
import {
  createTicket,
  getTicketByOperatorThread,
  getTicketByThread,
  hasActiveTicket,
  updateTicket,
} from "../store/callcenter";

interface Sendable {
  send(options: { embeds: EmbedBuilder[] }): Promise<unknown>;
}

interface SendableMessage extends Sendable {
  send(options: { embeds: EmbedBuilder[] }): Promise<{ delete(): Promise<unknown> }>;
}

async function tempNote(channel: SendableMessage, content: string): Promise<void> {
  try {
    const msg = await channel.send({ embeds: [baseEmbed({ title: "Кол-центр", description: content })] });
    setTimeout(() => msg.delete().catch(() => undefined), 10_000);
  } catch {}
}

async function relayEmbed(
  target: Sendable,
  opts: { name: string; icon?: string | null; content: string; attachments?: string[] },
): Promise<void> {
  const embed = messageRelayEmbed({
    authorName: opts.name,
    authorIcon: opts.icon ?? undefined,
    content: opts.content,
    attachments: opts.attachments,
  });
  await target
    .send({ embeds: [embed] })
    .catch((e) => log("warn", "Не вдалося переадресувати повідомлення:", e));
}

export async function handleCallCenterMessage(client: Client, message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  if (message.channelId === config.callCenterChannelId && !message.channel.isThread()) {
    const operatorRoleId = config.callCenterOperatorRoleId;
    if (!operatorRoleId || !message.mentions.roles.has(operatorRoleId)) return;

    if (hasActiveTicket(String(message.author.id))) {
      await tempNote(
        message.channel as unknown as SendableMessage,
        "Ви вже маєте активне звернення, яке обробляється. Дочекайтеся результату.",
      );
      log("info", `Пацієнт ${message.author.id} спробував створити нове звернення, але вже має активне`);
      return;
    }

    const name = `Звернення пацієнта`;
    let thread: ThreadChannel;
    try {
      thread = await message.startThread({ name, autoArchiveDuration: 10080 });
    } catch (e) {
      log("warn", "Не вдалося створити гілку кол-центру:", e);
      return;
    }

    const ticket = createTicket({
      user_id: String(message.author.id),
      author_name: message.author.username,
      author_icon: message.author.displayAvatarURL({ extension: "png", size: 256 }),
      content: message.content.trim() || "Не зазначено",
      thread_id: String(thread.id),
      thread_parent_id: message.channelId,
      attachments: [...message.attachments.values()].map((a) => a.url),
    });

    try {
      const block = (PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads).toString();
      const overwrites: {
        id: string;
        type: number;
        allow?: string;
        deny?: string;
      }[] = [
        {
          id: message.guild.roles.everyone.id,
          type: 0,
          deny: block,
        },
        {
          id: String(message.author.id),
          type: 1,
          allow: block,
        },
        {
          id: String(client.user?.id),
          type: 1,
          allow: block,
        },
      ];
      if (operatorRoleId) {
        overwrites.push({
          id: operatorRoleId,
          type: 0,
          deny: block,
        });
      }
      await client.rest.patch(Routes.channel(thread.id), {
        body: { permission_overwrites: overwrites },
      });
    } catch (e) {
      log("warn", "Не вдалося обмежити права в гілці пацієнта:", e);
    }

    const welcome = await thread.send({ embeds: [buildCcWelcome()] }).catch(() => null);
    if (welcome) updateTicket(ticket.id, { welcome_id: String(welcome.id) });

    if (config.callCenterOperatorChannelId) {
      let channel = client.channels.cache.get(config.callCenterOperatorChannelId) ?? null;
      if (!channel || !("send" in channel)) {
        try {
          channel = await client.channels.fetch(config.callCenterOperatorChannelId);
        } catch {
          channel = null;
        }
      }
      if (channel && "send" in channel) {
        const msg = await channel
          .send({
            content: `<@&${operatorRoleId}> — нове звернення ${ticket.id}`,
            embeds: [buildCcSubmissionEmbed(ticket)],
            components: buildCcReviewView(ticket),
          })
          .catch((e) => {
            log("warn", "Не вдалося надіслати звернення операторам:", e);
            return null;
          });
        if (msg) {
          updateTicket(ticket.id, { message_id: String(msg.id), channel_id: String(channel.id) });
        }
      }
    }

    const dm = baseEmbed({
        title: "Кол-центр Слобідської ЦРЛ",
        description:
          "Дякуємо за звернення! Оператор отримав його та скоро розпочне розгляд.\n" +
          "Опишіть ваше звернення у гілці під вашим повідомленням або в особистих повідомленнях — оператор поставить уточнення.\n" +
          "Статус і відповіді оператора ви отримаєте у гілці та в особистих повідомленнях.",
      });
      await notifyUser(client, String(message.author.id), { embeds: [dm] });

    log("info", `Тікет ${ticket.id} створив пацієнт ${message.author.id}`);
    return;
  }

  if (message.channel.isThread()) {
    const thread = message.channel;

    const ticket = getTicketByThread(thread.id);
    if (ticket) {
      if (ticket.status === "dialogue" && ticket.operator_thread_id) {
        const opThread = await client.channels
          .fetch(ticket.operator_thread_id)
          .catch(() => null);
        if (opThread && "send" in opThread) {
          await relayEmbed(opThread as unknown as Sendable, {
            name: message.member?.displayName ?? message.author.username,
            icon: message.member?.displayAvatarURL() ?? message.author.displayAvatarURL(),
            content: message.content,
            attachments: [...message.attachments.values()].map((a) => a.url),
          });
        }
      }
      return;
    }

    const opTicket = getTicketByOperatorThread(thread.id);
    if (opTicket) {
      const operatorRoleId = config.callCenterOperatorRoleId ?? "";
      if (!message.member?.roles.cache.has(operatorRoleId)) {
        return;
      }
      const name = "Оператор";
      const icon = undefined;
      const attachments = [...message.attachments.values()].map((a) => a.url);

      const patientThread = await client.channels
        .fetch(String(opTicket.thread_id))
        .catch(() => null);
      if (patientThread && "send" in patientThread) {
        await relayEmbed(patientThread as unknown as Sendable, { name, icon, content: message.content, attachments });
      }
      const dm = messageRelayEmbed({
        authorName: name,
        authorIcon: icon ?? undefined,
        content: message.content,
        attachments,
      });
      await notifyUser(client, String(opTicket.user_id), { embeds: [dm] });
    }
  }
}
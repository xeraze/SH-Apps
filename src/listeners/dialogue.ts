import { Client, Message, ThreadChannel } from "discord.js";
import { config } from "../config";
import { messageRelayEmbed } from "../lib/embeds";
import { notifyUser } from "../lib/notify";
import { getSubmissionByThread, getSubmissionDialogueByUser } from "../store/forms";
import { getTicketDialogueByUser } from "../store/callcenter";

async function getThread(client: Client, id: string): Promise<ThreadChannel | null> {
  try {
    const channel = client.channels.cache.get(id) ?? (await client.channels.fetch(id));
    return channel instanceof ThreadChannel ? channel : null;
  } catch {
    return null;
  }
}

export async function handleMessage(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.content && message.attachments.size === 0) return;

  const userFooter = `${message.author.username} | ${message.author.id}`;
  const userIcon = message.author.displayAvatarURL();
  const attachments = [...message.attachments.values()].map((a) => a.url);

  if (!message.guild) {
    const sub = getSubmissionDialogueByUser(String(message.author.id));
    const ticket = getTicketDialogueByUser(String(message.author.id));
    const threadId = sub?.thread_id ?? ticket?.operator_thread_id ?? ticket?.thread_id;
    if (threadId) {
      const thread = await getThread(client, threadId);
      if (thread) {
        const embed = messageRelayEmbed({
          authorName: message.author.username,
          authorIcon: userIcon,
          content: message.content,
          footer: userFooter,
          attachments,
        });
        await thread.send({ embeds: [embed] }).catch(() => undefined);
      }
    }
    return;
  }

  if (message.channel.isThread()) {
    const thread = message.channel;
    const sub = getSubmissionByThread(thread.id);
    if (sub) {
      const isReviewer =
        !!message.member && config.reviewerRoleIds.some((id) => message.member!.roles.cache.has(id));
      let name = message.author.username;
      let icon = userIcon;
      if (isReviewer) {
        name = message.member?.displayName ?? name;
        icon = message.member?.displayAvatarURL() ?? icon;
      }
      const embed = messageRelayEmbed({
        authorName: name,
        authorIcon: icon,
        content: message.content,
        attachments,
      });
      await notifyUser(client, String(sub.user_id), { embeds: [embed] });
      return;
    }
  }
}
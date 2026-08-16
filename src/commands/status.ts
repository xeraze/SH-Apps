import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { config } from "../config";
import { loadSubmissions } from "../store/forms";
import { loadTickets } from "../store/callcenter";

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} дн.`);
  if (h) parts.push(`${h} год.`);
  if (m) parts.push(`${m} хв.`);
  parts.push(`${sec} сек.`);
  return parts.join(" ");
}

export async function executeStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client;
  const guild = client.guilds.cache.get(config.guildId) ?? null;
  const submissions = loadSubmissions();
  const tickets = loadTickets();

  const embed = new EmbedBuilder({
    color: config.embedColor,
    title: "Статус бота",
    thumbnail: { url: client.user?.displayAvatarURL() ?? "" },
    description:
      [
        `🤖 Бот: **${client.user?.tag ?? "?"}**`,
        `📶 Пінг: \`${client.ws.ping} мс\``,
        `⏱ Аптайм: \`${formatUptime(client.uptime ?? 0)}\``,
        `🖥 Сервер: \`${guild?.name ?? "—"}\``,
        `💾 Заявок створено: \`${submissions.length}\``,
        `📞 Звернень до кол-центру: \`${tickets.length}\``,
        `👤 Користувачів на сервері: \`${guild?.memberCount ?? "—"}\``,
      ].join("\n"),
    footer: { text: `Shard: ${interaction.guild?.shardId ?? 0}` },
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
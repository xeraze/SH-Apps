import { execSync } from "node:child_process";
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { config } from "../config";
import { loadSubmissions } from "../store/forms";
import { loadTickets } from "../store/callcenter";

function formatBytes(kb: number): string {
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(1)} ГБ`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} МБ`;
  return `${Math.round(kb)} КБ`;
}

function diskUsage(): string {
  try {
    const out = execSync("df -k /home/container 2>/dev/null || df -k /", { encoding: "utf8" });
    const line = out.trim().split("\n").filter((l) => !l.startsWith("Filesystem")).pop();
    if (!line) return "—";
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 5) return "—";
    const used = Number(parts[2]);
    const available = Number(parts[3]);
    const total = used + available;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    return `${formatBytes(used)} / ${formatBytes(total)} (${pct}%) · вільно ${formatBytes(available)}`;
  } catch {
    return "—";
  }
}

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
        `💽 Диск: \`${diskUsage()}\``,
      ].join("\n"),
    footer: { text: `Shard: ${interaction.guild?.shardId ?? 0}` },
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
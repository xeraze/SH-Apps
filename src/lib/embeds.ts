import { EmbedBuilder } from "discord.js";
import { config } from "../config";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|tiff)(\?.*)?$/i;

function mediaLink(url: string): string {
  return `[${decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "файл")}](${url})`;
}

export function baseEmbed(data?: { title?: string; description?: string }): EmbedBuilder {
  const embed = new EmbedBuilder({ color: config.embedColor });
  if (data?.title) embed.setTitle(data.title);
  if (data?.description) embed.setDescription(data.description);
  return embed;
}

export function attachMediaToEmbed(embed: EmbedBuilder, urls: string[] | null | undefined): void {
  const list = (Array.isArray(urls) ? urls : []).filter(Boolean);
  if (list.length === 0) return;
  const images = list.filter((u) => IMAGE_RE.test(u));
  const others = list.filter((u) => !IMAGE_RE.test(u));
  if (images.length > 0) embed.setImage(images[0]);
  const rest = [...images.slice(1), ...others];
  if (rest.length > 0) {
    embed.addFields({
      name: "Вкладення:",
      value: rest.slice(0, 8).map(mediaLink).join("\n"),
      inline: false,
    });
  }
}

export function messageRelayEmbed(opts: {
  authorName: string;
  authorIcon?: string;
  content: string;
  footer?: string;
  attachments?: string[];
}): EmbedBuilder {
  const embed = new EmbedBuilder({
    color: config.embedColor,
    description: opts.content,
  });
  if (opts.authorIcon) {
    embed.setAuthor({ name: opts.authorName, iconURL: opts.authorIcon });
  } else {
    embed.setAuthor({ name: opts.authorName });
  }
  if (opts.footer) embed.setFooter({ text: opts.footer });
  if (opts.attachments?.length) {
    const images = opts.attachments.filter((u) => IMAGE_RE.test(u));
    const others = opts.attachments.filter((u) => !IMAGE_RE.test(u));
    if (images.length > 0) embed.setImage(images[0]);
    const rest = [...images.slice(1), ...others];
    if (rest.length > 0) {
      const lines = rest.slice(0, 8).map(mediaLink).join("\n");
      embed.setDescription(
        `${opts.content || ""}${opts.content ? "\n\n" : ""}${lines}`.slice(0, 4000),
      );
    }
  }
  return embed;
}

export function serverInfoButton(guildName: string): {
  type: 1;
  components: { type: 2; style: 2; custom_id: string; label: string; disabled: true }[];
} {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        custom_id: "server_info_disabled",
        label: `Відправлено з ${guildName}`,
        disabled: true,
      },
    ],
  };
}

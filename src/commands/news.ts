import { ChatInputCommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { baseEmbed } from "../lib/embeds";
import { memberHasRole } from "../lib/permissions";
import { config } from "../config";
import { buildNewsPreviewView } from "../components/news";

function member(interaction: ChatInputCommandInteraction): GuildMember | null {
  return interaction.member as GuildMember | null;
}

export async function executeNews(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!memberHasRole(member(interaction), config.roleNews)) {
    await interaction.reply({ content: "У вас немає прав для цієї команди.", flags: MessageFlags.Ephemeral });
    return;
  }
  const preview = baseEmbed({
    title: "Публікація новини",
    description:
      "Натисніть кнопку нижче, щоб заповнити поля новини.\n" +
      "Після відправлення форми бот опублікує ембед у цей канал.\n\n" +
      "*Заповніть усі поля перед відправленням — попередній перегляд не оновлюється автоматично.*",
  });
  await interaction.reply({
    embeds: [preview],
    components: buildNewsPreviewView(),
    flags: MessageFlags.Ephemeral,
  });
}
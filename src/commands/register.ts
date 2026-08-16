import {
  Client,
  REST,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config";
import { log } from "../lib/logger";

export function buildCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const news = new SlashCommandBuilder()
    .setName("news")
    .setDescription("Опублікувати новину у цей канал");

  const bidmenu = new SlashCommandBuilder()
    .setName("bidmenu")
    .setDescription("Панель анкет: обрання, редагування ембедів, публікація меню");

  return [news.toJSON(), bidmenu.toJSON()];
}

export async function registerCommands(client: Client): Promise<void> {
  if (!config.guildId || !client.user) {
    log("warn", "GUILD_ID не вказано — команди зі слешем не зареєстровані");
    return;
  }
  const rest = new REST().setToken(config.token);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), {
      body: buildCommands(),
    });
    log("info", "Слеш-команди зареєстровані для сервера", config.guildId);
  } catch (e) {
    log("error", "Не вдалося зареєструвати команди:", e);
  }
}
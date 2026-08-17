import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { registerCommands } from "./commands/register";
import { config } from "./config";
import { handleInteraction } from "./interactions";
import { logErrorToChannel, userLabel } from "./lib/errors";
import { log } from "./lib/logger";
import { handleCallCenterMessage } from "./listeners/callcenter";
import { handleMessage } from "./listeners/dialogue";

if (!config.token) {
  console.error("DISCORD_TOKEN не задан в .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.once(Events.ClientReady, async (c) => {
  log("info", `Бота запущено як ${c.user.tag} (${c.user.id})`);
  try {
    await c.user.setActivity({ name: "Sloboda Hospital", type: ActivityType.Watching });
  } catch {}
  await registerCommands(c);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleCallCenterMessage(client, message);
    await handleMessage(client, message);
  } catch (e) {
    log("error", "Помилка в обробці повідомлення:", e);
    await logErrorToChannel({
      client,
      commandName: "message",
      error: e as Error,
      userLabel: userLabel(message.author),
      channelLabel: message.channel.id,
    });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (e) {
    log("error", "Помилка в обробці взаємодії:", e);
    await logErrorToChannel({
      client,
      commandName: interaction.isChatInputCommand()
        ? interaction.commandName
        : "customId" in interaction
          ? interaction.customId
          : "unknown",
      error: e as Error,
      userLabel: userLabel(interaction.user),
      channelLabel: interaction.channelId ?? "—",
    });
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Сталася непередбачувана помилка.", flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
  }
});

process.on("SIGINT", () => {
  log("info", "Отримано SIGINT — завершення бота...");
  const force = setTimeout(() => process.exit(0), 3000);
  force.unref();
  client
    .destroy()
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
});

process.on("SIGTERM", () => {
  log("info", "Отримано SIGTERM — завершення бота...");
  const force = setTimeout(() => process.exit(0), 3000);
  force.unref();
  client
    .destroy()
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
});

client.login(config.token);

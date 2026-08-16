import { ChatInputCommandInteraction } from "discord.js";
import { openBidMenuPanel } from "../components/forms";

export async function executeBidMenu(interaction: ChatInputCommandInteraction): Promise<void> {
  await openBidMenuPanel(interaction);
}
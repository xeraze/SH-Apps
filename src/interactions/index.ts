import { Interaction } from "discord.js";
import { executeBidMenu } from "../commands/bidmenu";
import { executeNews } from "../commands/news";
import { executeStatus } from "../commands/status";
import { handleNewsEdit, handleNewsModal, handleNewsPublish, handleNewsCancel } from "../components/news";
import {
  handleFormMenuSelect,
  handleFormReason,
  handleFormReview,
  handleFormSubmit,
  handleFormThreadButton,
  handlePanelEdit,
  handlePanelEditModal,
  handlePanelJson,
  handlePanelJsonModal,
  handlePanelSelect,
} from "../components/forms";
import { handleCcReasonModal, handleCcReview } from "../components/callcenter";

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case "news":
        return executeNews(interaction);
      case "bidmenu":
        return executeBidMenu(interaction);
      case "status":
        return executeStatus(interaction);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const id = interaction.customId;
    if (id.startsWith("form_submit:")) return handleFormSubmit(interaction);
    if (id.startsWith("form_reason:")) return handleFormReason(interaction);
    if (id === "news_modal") return handleNewsModal(interaction);
    if (id.startsWith("cc_reason:")) return handleCcReasonModal(interaction);
    if (id === "panel_edit_modal") return handlePanelEditModal(interaction);
    if (id === "panel_json_modal") return handlePanelJsonModal(interaction);
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;
    if (id === "form_menu_select") return handleFormMenuSelect(interaction);
    if (id.startsWith("form_review:")) return handleFormReview(interaction);
    if (id.startsWith("cc_review:")) return handleCcReview(interaction);
    if (id === "panel_select") return handlePanelSelect(interaction);
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith("news_edit")) return handleNewsEdit(interaction);
    if (id.startsWith("news_publish:")) return handleNewsPublish(interaction);
    if (id.startsWith("news_cancel:")) return handleNewsCancel(interaction);
    if (id.startsWith("form_accept:") || id.startsWith("form_reject:")) {
      return handleFormThreadButton(interaction);
    }
    if (id === "panel_edit") return handlePanelEdit(interaction);
    if (id === "panel_json") return handlePanelJson(interaction);
    return;
  }
}
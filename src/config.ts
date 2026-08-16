import "dotenv/config";

function env(key: string, fallback = ""): string {
  const raw = process.env[key]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function roleIds(key: string): string[] {
  return env(key)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !["0", "ROLE_ID_HERE", "your_role_id_here"].includes(s));
}

export const config = {
  token: env("DISCORD_TOKEN"),
  guildId: env("GUILD_ID"),
  errorLogChannelId: env("ERROR_LOG_CHANNEL_ID"),

  roleNews: roleIds("ROLE_NEWS"),
  reviewerRoleIds: roleIds("REVIEWER_ROLE_IDS"),
  bidmenuRoleId: env("BIDMENU_ROLE_ID") || null,

  callCenterChannelId: env("CALL_CENTER_CHANNEL_ID"),
  callCenterOperatorRoleId: env("CALL_CENTER_OPERATOR_ROLE_ID") || null,
  callCenterOperatorChannelId: env("CALL_CENTER_OPERATOR_CHANNEL_ID"),

  embedColor: 0x34373c,
  dividerImage: env("SUBMISSION_DIVIDER_IMAGE") || "https://i.imgur.com/EzvcPiU.png",
} as const;

export const DATA_DIR = `${process.cwd()}/data`;
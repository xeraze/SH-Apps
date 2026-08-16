import { GuildMember } from "discord.js";

export function memberHasRole(
  member: GuildMember | null | undefined,
  roleIds: string | string[] | null,
): boolean {
  if (!roleIds || !member) return false;
  const ids = Array.isArray(roleIds) ? roleIds : [roleIds];
  return ids.some((id) => member.roles.cache.has(id));
}
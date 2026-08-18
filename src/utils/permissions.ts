import { GuildMember, PermissionFlagsBits, type VoiceBasedChannel } from "discord.js";

export function asGuildMember(member: unknown): GuildMember | null {
  return member instanceof GuildMember ? member : null;
}

export function getMemberVoiceChannel(member: GuildMember | null): VoiceBasedChannel | null {
  return member?.voice.channel ?? null;
}

export function canManageGuild(member: GuildMember | null): boolean {
  if (!member) {
    return false;
  }
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export function canControlPlayback(
  member: GuildMember | null,
  botChannelId: string | undefined,
): boolean {
  if (!member) {
    return false;
  }
  if (canManageGuild(member)) {
    return true;
  }
  const channel = getMemberVoiceChannel(member);
  if (!channel || !botChannelId) {
    return false;
  }
  return channel.id === botChannelId;
}

export function botCanJoin(channel: VoiceBasedChannel): boolean {
  const me = channel.guild.members.me;
  if (!me) {
    return false;
  }
  const perms = channel.permissionsFor(me);
  if (!perms) {
    return false;
  }
  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.Connect) &&
    perms.has(PermissionFlagsBits.Speak)
  );
}

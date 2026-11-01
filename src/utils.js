import { ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Normalizes a permission name to the standard Discord.js PermissionFlagsBits key.
 * Handles snake_case, lowercase, or direct matches.
 */
export function normalizePermission(name) {
  if (!name || typeof name !== 'string') return null;
  if (name in PermissionFlagsBits) return name;
  
  const clean = name.replace(/[_\s-]/g, '').toLowerCase();
  for (const key of Object.keys(PermissionFlagsBits)) {
    if (key.toLowerCase() === clean) return key;
  }
  return null;
}

/**
 * Normalizes an array of permission strings.
 */
export function parsePermissionsList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(p => normalizePermission(p))
    .filter(Boolean);
}

/**
 * Normalizes channel type from user-friendly strings to Discord.js ChannelType enum.
 */
export function normalizeChannelType(type) {
  if (typeof type === 'number') return type;
  const t = String(type || 'text').toLowerCase().replace(/[_\s-]/g, '');
  
  switch (t) {
    case 'text':
    case 'guildtext':
    case 'txt':
    case 'chat':
      return ChannelType.GuildText;
    case 'voice':
    case 'guildvoice':
    case 'vc':
    case 'audio':
      return ChannelType.GuildVoice;
    case 'category':
    case 'guildcategory':
    case 'cat':
      return ChannelType.GuildCategory;
    case 'announcement':
    case 'announcements':
    case 'news':
    case 'guildannouncement':
      return ChannelType.GuildAnnouncement;
    case 'stage':
    case 'stagevoice':
    case 'guildstagevoice':
      return ChannelType.GuildStageVoice;
    case 'forum':
    case 'guildforum':
      return ChannelType.GuildForum;
    default:
      return ChannelType.GuildText;
  }
}

/**
 * Converts channel type enum to human-readable string.
 */
export function channelTypeToString(type) {
  switch (type) {
    case ChannelType.GuildText: return 'text';
    case ChannelType.GuildVoice: return 'voice';
    case ChannelType.GuildCategory: return 'category';
    case ChannelType.GuildAnnouncement: return 'announcement';
    case ChannelType.GuildStageVoice: return 'stage';
    case ChannelType.GuildForum: return 'forum';
    default: return 'other';
  }
}

/**
 * Resolves a role or member target by ID or name (including @everyone).
 */
export async function resolveTarget(guild, target) {
  if (!target) return null;
  const str = String(target).trim();
  
  // @everyone check
  if (str === '@everyone' || str.toLowerCase() === 'everyone') {
    return { id: guild.roles.everyone.id, type: 'role', name: '@everyone' };
  }
  
  // Check if role by ID
  const roleById = guild.roles.cache.get(str);
  if (roleById) {
    return { id: roleById.id, type: 'role', name: roleById.name };
  }
  
  // Check if role by Name (case-insensitive)
  const roleByName = guild.roles.cache.find(r => r.name.toLowerCase() === str.toLowerCase());
  if (roleByName) {
    return { id: roleByName.id, type: 'role', name: roleByName.name };
  }
  
  // Check if member by ID
  try {
    const member = await guild.members.fetch(str).catch(() => null);
    if (member) {
      return { id: member.id, type: 'member', name: member.user?.tag || member.displayName };
    }
  } catch {
    // Member fetch failed
  }
  
  // Fallback: return raw ID if it looks like a snowflake
  if (/^\d{17,20}$/.test(str)) {
    return { id: str, type: 'role', name: str };
  }
  
  return null;
}

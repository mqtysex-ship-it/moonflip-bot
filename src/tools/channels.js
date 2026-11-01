import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { fetchGuild } from '../discord.js';
import { normalizeChannelType, normalizePermission, resolveTarget, channelTypeToString } from '../utils.js';

/**
 * Creates a Discord channel category.
 * Requires user approval (confirmed: true).
 */
export async function createCategoryHandler({ guildId, name, position, permissionOverwrites, confirmed }) {
  if (!confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'APPROVAL_REQUIRED',
              action: 'create_category',
              target: {
                guildId,
                name,
                position: position ?? 'auto',
                permissionOverwrites: permissionOverwrites || [],
              },
              message: `⚠️ USER APPROVAL REQUIRED: Ready to create category "${name}" in guild ${guildId}. Please confirm with the user and re-run this tool with confirmed: true.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const guild = await fetchGuild(guildId);

  // Parse overwrites if provided
  const parsedOverwrites = [];
  if (Array.isArray(permissionOverwrites)) {
    for (const ov of permissionOverwrites) {
      const resolved = await resolveTarget(guild, ov.targetId || ov.target);
      if (!resolved) continue;

      const allowBits = (ov.allow || []).map(normalizePermission).filter(Boolean).map(p => PermissionFlagsBits[p]);
      const denyBits = (ov.deny || []).map(normalizePermission).filter(Boolean).map(p => PermissionFlagsBits[p]);

      parsedOverwrites.push({
        id: resolved.id,
        type: resolved.type === 'member' ? OverwriteType.Member : OverwriteType.Role,
        allow: allowBits,
        deny: denyBits,
      });
    }
  }

  const category = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    position: typeof position === 'number' ? position : undefined,
    permissionOverwrites: parsedOverwrites.length > 0 ? parsedOverwrites : undefined,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'SUCCESS',
            message: `Category "${category.name}" created successfully.`,
            category: {
              id: category.id,
              name: category.name,
              position: category.position,
              type: 'category',
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Creates a Discord channel (text, voice, announcement, stage, forum).
 * Requires user approval (confirmed: true).
 */
export async function createChannelHandler({
  guildId,
  name,
  type = 'text',
  categoryId,
  topic,
  nsfw = false,
  permissionOverwrites,
  confirmed,
}) {
  const normalizedType = normalizeChannelType(type);
  const typeStr = channelTypeToString(normalizedType);

  if (!confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'APPROVAL_REQUIRED',
              action: 'create_channel',
              target: {
                guildId,
                name,
                type: typeStr,
                categoryId: categoryId || null,
                topic: topic || null,
                nsfw,
                permissionOverwrites: permissionOverwrites || [],
              },
              message: `⚠️ USER APPROVAL REQUIRED: Ready to create ${typeStr} channel "${name}"${categoryId ? ` in category ${categoryId}` : ''}. Please confirm with the user and re-run with confirmed: true.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const guild = await fetchGuild(guildId);

  // Validate parent category if specified
  let parent = undefined;
  if (categoryId) {
    const parentChannel = guild.channels.cache.get(categoryId) || (await guild.channels.fetch(categoryId).catch(() => null));
    if (!parentChannel || parentChannel.type !== ChannelType.GuildCategory) {
      throw new Error(`Category ID "${categoryId}" is invalid or is not a category channel.`);
    }
    parent = parentChannel.id;
  }

  // Parse overwrites
  const parsedOverwrites = [];
  if (Array.isArray(permissionOverwrites)) {
    for (const ov of permissionOverwrites) {
      const resolved = await resolveTarget(guild, ov.targetId || ov.target);
      if (!resolved) continue;

      const allowBits = (ov.allow || []).map(normalizePermission).filter(Boolean).map(p => PermissionFlagsBits[p]);
      const denyBits = (ov.deny || []).map(normalizePermission).filter(Boolean).map(p => PermissionFlagsBits[p]);

      parsedOverwrites.push({
        id: resolved.id,
        type: resolved.type === 'member' ? OverwriteType.Member : OverwriteType.Role,
        allow: allowBits,
        deny: denyBits,
      });
    }
  }

  const channel = await guild.channels.create({
    name,
    type: normalizedType,
    parent,
    topic: normalizedType === ChannelType.GuildText || normalizedType === ChannelType.GuildAnnouncement ? topic : undefined,
    nsfw: Boolean(nsfw),
    permissionOverwrites: parsedOverwrites.length > 0 ? parsedOverwrites : undefined,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'SUCCESS',
            message: `Channel "${channel.name}" created successfully.`,
            channel: {
              id: channel.id,
              name: channel.name,
              type: typeStr,
              parentId: channel.parentId,
              topic: channel.topic || null,
              nsfw: channel.nsfw || false,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Sets permission overwrites on a channel or category.
 * Requires user approval (confirmed: true).
 */
export async function setChannelPermissionsHandler({
  guildId,
  channelId,
  targetId,
  targetType = 'role',
  allow = [],
  deny = [],
  confirmed,
}) {
  if (!confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'APPROVAL_REQUIRED',
              action: 'set_channel_permissions',
              target: {
                guildId,
                channelId,
                targetId,
                targetType,
                allow,
                deny,
              },
              message: `⚠️ USER APPROVAL REQUIRED: Ready to set permissions on channel ${channelId} for ${targetType} "${targetId}". Allow: [${allow.join(', ')}], Deny: [${deny.join(', ')}]. Please confirm with the user and re-run with confirmed: true.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const guild = await fetchGuild(guildId);
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel) {
    throw new Error(`Channel with ID "${channelId}" was not found.`);
  }

  const resolved = await resolveTarget(guild, targetId);
  if (!resolved) {
    throw new Error(`Target "${targetId}" could not be resolved to a valid role or member in guild.`);
  }

  const allowPerms = (allow || []).map(normalizePermission).filter(Boolean);
  const denyPerms = (deny || []).map(normalizePermission).filter(Boolean);

  const overwrites = {};
  for (const perm of allowPerms) {
    overwrites[perm] = true;
  }
  for (const perm of denyPerms) {
    overwrites[perm] = false;
  }

  await channel.permissionOverwrites.edit(
    resolved.id,
    overwrites,
    { type: resolved.type === 'member' ? OverwriteType.Member : OverwriteType.Role }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'SUCCESS',
            message: `Permissions updated successfully for "${resolved.name}" on channel "${channel.name}".`,
            channelId: channel.id,
            target: resolved,
            allow: allowPerms,
            deny: denyPerms,
          },
          null,
          2
        ),
      },
    ],
  };
}

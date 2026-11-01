import { ChannelType } from 'discord.js';
import { getDiscordClient, fetchGuild, getBotInviteUrl } from '../discord.js';
import { channelTypeToString } from '../utils.js';

/**
 * Lists all Discord guilds the bot currently belongs to.
 */
export async function listServersHandler() {
  const client = await getDiscordClient();
  const oauthGuilds = await client.guilds.fetch();
  
  if (oauthGuilds.size === 0) {
    const inviteUrl = getBotInviteUrl();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              servers: [],
              count: 0,
              message: 'The Discord bot is currently not in any servers. Please invite the bot to your server using the link below.',
              inviteUrl: inviteUrl,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const servers = [];
  for (const [id, baseGuild] of oauthGuilds) {
    try {
      const guild = await baseGuild.fetch();
      servers.push({
        id: guild.id,
        name: guild.name,
        description: guild.description || null,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        iconUrl: guild.iconURL() || null,
        joinedTimestamp: guild.joinedTimestamp,
      });
    } catch {
      servers.push({
        id,
        name: baseGuild.name,
      });
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            count: servers.length,
            servers,
            inviteUrl: getBotInviteUrl(),
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Gets detailed breakdown of a specific guild: categories, channels, and roles.
 */
export async function getServerHandler({ guildId }) {
  const guild = await fetchGuild(guildId);

  // Group channels by category
  const categoriesMap = new Map();
  const uncategorizedChannels = [];

  const channels = await guild.channels.fetch();
  
  for (const [, ch] of channels) {
    if (!ch) continue;
    if (ch.type === ChannelType.GuildCategory) {
      if (!categoriesMap.has(ch.id)) {
        categoriesMap.set(ch.id, {
          id: ch.id,
          name: ch.name,
          position: ch.position,
          channels: [],
        });
      }
    }
  }

  for (const [, ch] of channels) {
    if (!ch || ch.type === ChannelType.GuildCategory) continue;
    const channelInfo = {
      id: ch.id,
      name: ch.name,
      type: channelTypeToString(ch.type),
      position: ch.position,
      topic: ch.topic || null,
    };

    if (ch.parentId && categoriesMap.has(ch.parentId)) {
      categoriesMap.get(ch.parentId).channels.push(channelInfo);
    } else {
      uncategorizedChannels.push(channelInfo);
    }
  }

  // Fetch roles
  const roles = guild.roles.cache
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      hoist: r.hoist,
      position: r.position,
      permissions: r.permissions.toArray(),
    }));

  const result = {
    id: guild.id,
    name: guild.name,
    description: guild.description || null,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    rolesCount: roles.length,
    roles,
    categories: Array.from(categoriesMap.values()).sort((a, b) => a.position - b.position),
    uncategorizedChannels: uncategorizedChannels.sort((a, b) => a.position - b.position),
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listServersHandler, getServerHandler } from './tools/servers.js';
import {
  createCategoryHandler,
  createChannelHandler,
  setChannelPermissionsHandler,
} from './tools/channels.js';
import {
  createRoleHandler,
  setRolePermissionsHandler,
} from './tools/roles.js';
import {
  planServerSetupHandler,
  applyServerSetupHandler,
} from './tools/setup.js';

/**
 * Creates and configures the Discord MCP Server instance.
 */
export function createDiscordMcpServer() {
  const server = new McpServer({
    name: 'discord-mcp',
    version: '1.0.0',
  });

  // 1. List Servers
  server.tool(
    'discord_list_servers',
    'Lists all Discord servers (guilds) the bot is currently in. If the bot is not in any server, returns the bot OAuth2 invite link.',
    {},
    async () => listServersHandler()
  );

  // 2. Get Server Details
  server.tool(
    'discord_get_server',
    'Retrieves detailed information about a Discord server, including all categories, text/voice channels, roles, and member count.',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
    },
    async (args) => getServerHandler(args)
  );

  // 3. Create Category
  server.tool(
    'discord_create_category',
    'Creates a channel category on a Discord server. Requires user approval (confirmed: true).',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
      name: z.string().describe('Name of the category to create'),
      position: z.number().optional().describe('Sort position index'),
      confirmed: z
        .boolean()
        .default(false)
        .describe('Explicit user approval. Must be true to perform modification.'),
    },
    async (args) => createCategoryHandler(args)
  );

  // 4. Create Channel
  server.tool(
    'discord_create_channel',
    'Creates a text, voice, announcement, stage, or forum channel. Requires user approval (confirmed: true).',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
      name: z.string().describe('Channel name'),
      type: z
        .enum(['text', 'voice', 'announcement', 'stage', 'forum'])
        .default('text')
        .describe('Channel type: text, voice, announcement, stage, forum'),
      categoryId: z.string().optional().describe('Parent category ID (optional)'),
      topic: z.string().optional().describe('Channel topic or description'),
      nsfw: z.boolean().optional().default(false).describe('Whether channel is NSFW'),
      confirmed: z
        .boolean()
        .default(false)
        .describe('Explicit user approval. Must be true to perform modification.'),
    },
    async (args) => createChannelHandler(args)
  );

  // 5. Create Role
  server.tool(
    'discord_create_role',
    'Creates a new role with optional color, hoist, and permissions. Requires user approval (confirmed: true).',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
      name: z.string().describe('Name of the role'),
      color: z.string().optional().describe('Hex color code (e.g. #3498db)'),
      hoist: z
        .boolean()
        .optional()
        .default(false)
        .describe('Display role members separately in the sidebar list'),
      mentionable: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether anyone can @mention this role'),
      permissions: z
        .array(z.string())
        .optional()
        .describe('List of permission names, e.g. ["ViewChannel", "SendMessages"]'),
      confirmed: z
        .boolean()
        .default(false)
        .describe('Explicit user approval. Must be true to perform modification.'),
    },
    async (args) => createRoleHandler(args)
  );

  // 6. Set Channel Permissions
  server.tool(
    'discord_set_channel_permissions',
    'Configures permission overwrites for a role (e.g. "@everyone", "Admin") or member on a channel or category. Requires user approval (confirmed: true).',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
      channelId: z.string().describe('The ID of the channel or category'),
      targetId: z
        .string()
        .describe('Role name, role ID, "@everyone", or member ID to configure'),
      targetType: z
        .enum(['role', 'member'])
        .default('role')
        .describe('Target type: role or member'),
      allow: z
        .array(z.string())
        .optional()
        .describe('List of permission flags to allow'),
      deny: z
        .array(z.string())
        .optional()
        .describe('List of permission flags to deny'),
      confirmed: z
        .boolean()
        .default(false)
        .describe('Explicit user approval. Must be true to perform modification.'),
    },
    async (args) => setChannelPermissionsHandler(args)
  );

  // 7. Set Role Permissions
  server.tool(
    'discord_set_role_permissions',
    'Sets server-wide permissions for an existing role. Requires user approval (confirmed: true).',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
      roleId: z.string().describe('The role ID or name'),
      permissions: z
        .array(z.string())
        .describe('List of permission flags to assign to this role'),
      confirmed: z
        .boolean()
        .default(false)
        .describe('Explicit user approval. Must be true to perform modification.'),
    },
    async (args) => setRolePermissionsHandler(args)
  );

  // 8. Plan Automated Server Setup
  server.tool(
    'discord_plan_server_setup',
    'Generates a comprehensive Discord server setup plan from a natural-language prompt or template (software_dev, gaming, community, minimal). Returns a dry-run plan without modifying Discord.',
    {
      guildId: z
        .string()
        .optional()
        .describe('The Discord server/guild ID to configure (optional if generating general preview)'),
      templateName: z
        .enum(['software_dev', 'gaming', 'community', 'minimal', 'custom'])
        .optional()
        .describe('Predefined template: software_dev, gaming, community, minimal'),
      promptOrSpec: z
        .string()
        .optional()
        .describe('Natural-language description or JSON specification of the desired server layout'),
    },
    async (args) => planServerSetupHandler(args)
  );

  // 9. Apply Server Setup
  server.tool(
    'discord_apply_server_setup',
    'Applies a server setup plan to a Discord guild in correct dependency order (roles -> categories -> channels -> permissions). Requires user approval (confirmed: true).',
    {
      guildId: z.string().describe('The Discord server/guild ID'),
      plan: z.any().describe('The setup plan object generated by discord_plan_server_setup'),
      confirmed: z
        .boolean()
        .default(false)
        .describe('Explicit user approval. Must be true to execute changes on Discord.'),
    },
    async (args) => applyServerSetupHandler(args)
  );

  return server;
}

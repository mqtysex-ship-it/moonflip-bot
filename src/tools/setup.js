import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { fetchGuild, getBotInviteUrl } from '../discord.js';
import { SERVER_TEMPLATES, generatePlanFromPrompt } from '../templates.js';
import { normalizeChannelType, normalizePermission, parsePermissionsList, channelTypeToString } from '../utils.js';

/**
 * Plans automated server setup from a template, natural language prompt, or specification.
 * Returns the preview plan without modifying Discord.
 */
export async function planServerSetupHandler({ guildId, templateName, promptOrSpec, structure }) {
  let guild = null;
  if (guildId) {
    try {
      guild = await fetchGuild(guildId);
    } catch {
      // Guild not found or bot not in guild
    }
  }

  let plan = null;

  // 1. If explicit structure is passed
  if (structure && typeof structure === 'object') {
    plan = structure;
  }
  // 2. If promptOrSpec is JSON string
  else if (promptOrSpec && typeof promptOrSpec === 'string' && promptOrSpec.trim().startsWith('{')) {
    try {
      plan = JSON.parse(promptOrSpec);
    } catch {
      // Not valid JSON, fall through to text prompt
    }
  }

  // 3. If templateName is provided
  if (!plan && templateName && SERVER_TEMPLATES[templateName]) {
    plan = JSON.parse(JSON.stringify(SERVER_TEMPLATES[templateName]));
  }

  // 4. If promptOrSpec is a natural language prompt
  if (!plan && promptOrSpec) {
    plan = JSON.parse(JSON.stringify(generatePlanFromPrompt(promptOrSpec)));
  }

  // 5. Default fallback
  if (!plan) {
    plan = JSON.parse(JSON.stringify(SERVER_TEMPLATES.community));
  }

  // Ensure arrays exist
  plan.roles = plan.roles || [];
  plan.categories = plan.categories || [];
  plan.channels = plan.channels || [];

  // Build markdown preview
  const serverTitle = guild ? `**${guild.name}**` : 'Discord Server';
  let preview = `### 📋 Proposed Discord Server Setup Plan for ${serverTitle}\n\n`;

  if (plan.roles.length > 0) {
    preview += `#### 🎭 Roles (${plan.roles.length})\n`;
    for (const r of plan.roles) {
      preview += `- **@${r.name}** (Color: \`${r.color || 'default'}\`, Hoist: \`${r.hoist || false}\`, Mentionable: \`${r.mentionable || false}\`)\n`;
      if (r.permissions && r.permissions.length > 0) {
        preview += `  - Permissions: \`${r.permissions.join(', ')}\`\n`;
      }
    }
    preview += '\n';
  }

  if (plan.categories.length > 0) {
    preview += `#### 📁 Categories & Channels\n`;
    for (const cat of plan.categories) {
      preview += `- 📁 **${cat.name}**\n`;
      if (Array.isArray(cat.channels)) {
        for (const ch of cat.channels) {
          const typeIcon = ch.type === 'voice' ? '🔊' : ch.type === 'announcement' ? '📢' : '#';
          preview += `  - ${typeIcon} **${ch.name}** (${ch.type || 'text'})${ch.topic ? ` - *${ch.topic}*` : ''}\n`;
        }
      }
    }
    preview += '\n';
  }

  if (plan.channels.length > 0) {
    preview += `#### 📂 Uncategorized Channels (${plan.channels.length})\n`;
    for (const ch of plan.channels) {
      const typeIcon = ch.type === 'voice' ? '🔊' : '#';
      preview += `- ${typeIcon} **${ch.name}** (${ch.type || 'text'})\n`;
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'PLAN_GENERATED',
            guildId: guild ? guild.id : (guildId || null),
            guildName: guild ? guild.name : null,
            botInviteUrl: !guild ? getBotInviteUrl() : undefined,
            summaryMarkdown: preview,
            plan: plan,
            approvalNotice: '⚠️ USER APPROVAL REQUIRED: Present this plan to the user. Once approved, call "discord_apply_server_setup" with confirmed: true and the provided plan object.',
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Applies a server setup plan to a guild.
 * Requires user approval (confirmed: true).
 */
export async function applyServerSetupHandler({ guildId, plan, confirmed }) {
  if (!confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'APPROVAL_REQUIRED',
              action: 'apply_server_setup',
              guildId,
              message: '⚠️ USER APPROVAL REQUIRED: You must review the setup plan with the user and explicitly provide confirmed: true to modify the Discord server.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (!plan || typeof plan !== 'object') {
    throw new Error('A valid plan object is required. Use "discord_plan_server_setup" first to generate one.');
  }

  const guild = await fetchGuild(guildId);
  const createdRoles = [];
  const createdCategories = [];
  const createdChannels = [];
  const roleNameToId = new Map();

  // Populate existing roles into lookup map
  for (const [, role] of guild.roles.cache) {
    roleNameToId.set(role.name.toLowerCase(), role.id);
  }
  roleNameToId.set('@everyone', guild.roles.everyone.id);
  roleNameToId.set('everyone', guild.roles.everyone.id);

  // Helper to resolve role IDs in overwrites
  const resolveOverwrites = (overwrites) => {
    if (!Array.isArray(overwrites)) return undefined;
    const resolved = [];
    for (const ov of overwrites) {
      const targetStr = String(ov.targetId || ov.target || '').trim();
      let targetId = roleNameToId.get(targetStr.toLowerCase()) || targetStr;
      if (!targetId) continue;

      const allowBits = (ov.allow || []).map(normalizePermission).filter(Boolean).map(p => PermissionFlagsBits[p]);
      const denyBits = (ov.deny || []).map(normalizePermission).filter(Boolean).map(p => PermissionFlagsBits[p]);

      resolved.push({
        id: targetId,
        type: ov.targetType === 'member' ? OverwriteType.Member : OverwriteType.Role,
        allow: allowBits,
        deny: denyBits,
      });
    }
    return resolved.length > 0 ? resolved : undefined;
  };

  // 1. Create Roles
  if (Array.isArray(plan.roles)) {
    for (const roleDef of plan.roles) {
      // Check if role with same name already exists
      let role = guild.roles.cache.find(r => r.name.toLowerCase() === roleDef.name.toLowerCase());
      if (!role) {
        const perms = parsePermissionsList(roleDef.permissions);
        role = await guild.roles.create({
          name: roleDef.name,
          color: roleDef.color || undefined,
          hoist: Boolean(roleDef.hoist),
          mentionable: Boolean(roleDef.mentionable),
          permissions: perms.length > 0 ? perms.map(p => PermissionFlagsBits[p]) : undefined,
        });
        createdRoles.push({ id: role.id, name: role.name, color: role.hexColor });
      }
      roleNameToId.set(roleDef.name.toLowerCase(), role.id);
    }
  }

  // 2. Create Categories & Nested Channels
  if (Array.isArray(plan.categories)) {
    for (const catDef of plan.categories) {
      const overwrites = resolveOverwrites(catDef.permissionOverwrites);
      let category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catDef.name.toLowerCase()
      );

      if (!category) {
        category = await guild.channels.create({
          name: catDef.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwrites,
        });
        createdCategories.push({ id: category.id, name: category.name });
      } else {
        createdCategories.push({ id: category.id, name: category.name, existing: true });
      }

      if (Array.isArray(catDef.channels)) {
        for (const chDef of catDef.channels) {
          let ch = guild.channels.cache.find(
            (c) => c.parentId === category.id && c.name.toLowerCase() === chDef.name.toLowerCase()
          );

          if (!ch) {
            let chType = normalizeChannelType(chDef.type);
            const chOverwrites = resolveOverwrites(chDef.permissionOverwrites);
            try {
              ch = await guild.channels.create({
                name: chDef.name,
                type: chType,
                parent: category.id,
                topic: chDef.topic,
                permissionOverwrites: chOverwrites,
              });
            } catch (err) {
              // Fallback to GuildText if announcement channels are disabled
              if (chType !== ChannelType.GuildText) {
                ch = await guild.channels.create({
                  name: chDef.name,
                  type: ChannelType.GuildText,
                  parent: category.id,
                  topic: chDef.topic,
                  permissionOverwrites: chOverwrites,
                });
              } else {
                throw err;
              }
            }
            createdChannels.push({
              id: ch.id,
              name: ch.name,
              type: channelTypeToString(ch.type),
              categoryId: category.id,
            });
          } else {
            createdChannels.push({
              id: ch.id,
              name: ch.name,
              type: channelTypeToString(ch.type),
              categoryId: category.id,
              existing: true,
            });
          }
        }
      }
    }
  }

  // 3. Create Uncategorized Channels
  if (Array.isArray(plan.channels)) {
    for (const chDef of plan.channels) {
      let ch = guild.channels.cache.find(
        (c) => !c.parentId && c.name.toLowerCase() === chDef.name.toLowerCase()
      );

      if (!ch) {
        let chType = normalizeChannelType(chDef.type);
        const chOverwrites = resolveOverwrites(chDef.permissionOverwrites);
        try {
          ch = await guild.channels.create({
            name: chDef.name,
            type: chType,
            topic: chDef.topic,
            permissionOverwrites: chOverwrites,
          });
        } catch (err) {
          if (chType !== ChannelType.GuildText) {
            ch = await guild.channels.create({
              name: chDef.name,
              type: ChannelType.GuildText,
              topic: chDef.topic,
              permissionOverwrites: chOverwrites,
            });
          } else {
            throw err;
          }
        }

        createdChannels.push({
          id: ch.id,
          name: ch.name,
          type: channelTypeToString(ch.type),
          categoryId: null,
        });
      }
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'SUCCESS',
            message: `Discord server "${guild.name}" setup completed successfully.`,
            summary: {
              rolesCreated: createdRoles.length,
              categoriesCreated: createdCategories.length,
              channelsCreated: createdChannels.length,
            },
            createdRoles,
            createdCategories,
            createdChannels,
          },
          null,
          2
        ),
      },
    ],
  };
}

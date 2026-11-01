import { PermissionsBitField } from 'discord.js';
import { fetchGuild } from '../discord.js';
import { parsePermissionsList, resolveTarget } from '../utils.js';

/**
 * Creates a new role in the guild.
 * Requires user approval (confirmed: true).
 */
export async function createRoleHandler({
  guildId,
  name,
  color,
  hoist = false,
  mentionable = false,
  permissions = [],
  confirmed,
}) {
  const normalizedPerms = parsePermissionsList(permissions);

  if (!confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'APPROVAL_REQUIRED',
              action: 'create_role',
              target: {
                guildId,
                name,
                color: color || null,
                hoist,
                mentionable,
                permissions: normalizedPerms,
              },
              message: `⚠️ USER APPROVAL REQUIRED: Ready to create role "${name}" (color: ${color || 'default'}, hoist: ${hoist}, mentionable: ${mentionable}, perms: [${normalizedPerms.join(', ')}]). Please confirm with the user and re-run with confirmed: true.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const guild = await fetchGuild(guildId);

  const role = await guild.roles.create({
    name,
    color: color || undefined,
    hoist: Boolean(hoist),
    mentionable: Boolean(mentionable),
    permissions: normalizedPerms.length > 0 ? new PermissionsBitField(normalizedPerms) : undefined,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'SUCCESS',
            message: `Role "${role.name}" created successfully.`,
            role: {
              id: role.id,
              name: role.name,
              color: role.hexColor,
              hoist: role.hoist,
              mentionable: role.mentionable,
              position: role.position,
              permissions: role.permissions.toArray(),
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
 * Updates permissions for an existing role.
 * Requires user approval (confirmed: true).
 */
export async function setRolePermissionsHandler({ guildId, roleId, permissions = [], confirmed }) {
  const normalizedPerms = parsePermissionsList(permissions);

  if (!confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'APPROVAL_REQUIRED',
              action: 'set_role_permissions',
              target: {
                guildId,
                roleId,
                permissions: normalizedPerms,
              },
              message: `⚠️ USER APPROVAL REQUIRED: Ready to update permissions for role "${roleId}" to: [${normalizedPerms.join(', ')}]. Please confirm with the user and re-run with confirmed: true.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const guild = await fetchGuild(guildId);
  const resolved = await resolveTarget(guild, roleId);
  if (!resolved || resolved.type !== 'role') {
    throw new Error(`Role "${roleId}" could not be found in guild.`);
  }

  const role = guild.roles.cache.get(resolved.id) || (await guild.roles.fetch(resolved.id));
  if (!role) {
    throw new Error(`Role with ID "${resolved.id}" was not found.`);
  }

  await role.setPermissions(new PermissionsBitField(normalizedPerms));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'SUCCESS',
            message: `Permissions updated successfully for role "${role.name}".`,
            role: {
              id: role.id,
              name: role.name,
              permissions: role.permissions.toArray(),
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

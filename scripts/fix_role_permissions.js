import { Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function fixRolesAndPermissions() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_BOT_TOKEN);

  const guild = await client.guilds.fetch('1566215806956601466');
  console.log(`Connected to guild: ${guild.name} (ID: ${guild.id})`);

  const roles = await guild.roles.fetch();

  // 1. Fix @everyone role permissions
  const everyoneRole = guild.roles.everyone;
  console.log('\n--- Configuring @everyone Permissions ---');
  const safeEveryonePerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.UseExternalStickers,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.UseVAD,
    PermissionFlagsBits.ChangeNickname,
    PermissionFlagsBits.UseApplicationCommands,
    PermissionFlagsBits.CreateInstantInvite,
    PermissionFlagsBits.SendVoiceMessages,
    PermissionFlagsBits.SendPolls,
  ];
  await everyoneRole.setPermissions(safeEveryonePerms, 'Security fix: Revoke MentionEveryone, ManageExpressions, CreateEvents');
  console.log('✅ @everyone permissions secured. MentionEveryone and server editing revoked.');

  // Base community member permissions
  const memberPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.UseExternalStickers,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.Stream,
    PermissionFlagsBits.UseVAD,
    PermissionFlagsBits.ChangeNickname,
    PermissionFlagsBits.UseApplicationCommands,
    PermissionFlagsBits.SendVoiceMessages,
    PermissionFlagsBits.SendPolls,
  ];

  // Role definitions from lowest (Pos 1) to highest (Pos 14)
  // Higher index = higher position in hierarchy
  const roleSpecs = [
    {
      name: '✅ Verified',
      color: '#2ecc71',
      hoist: true,
      permissions: memberPerms,
    },
    {
      name: '🥉 Bronze Tier',
      color: '#cd7f32',
      hoist: true,
      permissions: memberPerms,
    },
    {
      name: '🥈 Silver Tier',
      color: '#c0c0c0',
      hoist: true,
      permissions: memberPerms,
    },
    {
      name: '🥇 Gold Tier',
      color: '#ffd700',
      hoist: true,
      permissions: memberPerms,
    },
    {
      name: '💎 Diamond VIP',
      color: '#00ffff',
      hoist: true,
      permissions: memberPerms,
    },
    {
      name: '👑 High Roller Elite',
      color: '#8a2be2',
      hoist: true,
      permissions: memberPerms,
    },
    {
      name: '♾️ Influencer',
      color: '#9b59b6',
      hoist: true,
      permissions: [
        ...memberPerms,
        PermissionFlagsBits.PrioritySpeaker,
      ],
    },
    {
      name: '♾️ Trial Moderator',
      color: '#5865F2',
      hoist: true,
      permissions: [
        ...memberPerms,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
      ],
    },
    {
      name: '♾️ External Moderator',
      color: '#e67e22',
      hoist: true,
      permissions: [
        ...memberPerms,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
      ],
    },
    {
      name: '♾️ Head Moderator',
      color: '#3498db',
      hoist: true,
      permissions: [
        ...memberPerms,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageThreads,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
      ],
    },
    {
      name: '🛡️ Administrator',
      color: '#f1c40f',
      hoist: true,
      permissions: [PermissionFlagsBits.Administrator],
    },
    {
      name: '♾️ Head Administrator',
      color: '#95a5a6',
      hoist: true,
      permissions: [PermissionFlagsBits.Administrator],
    },
    {
      name: '👑 Server Manager',
      color: '#f5f6fa',
      hoist: true,
      permissions: [PermissionFlagsBits.Administrator],
    },
    {
      name: '👑 Owner',
      color: '#e74c3c',
      hoist: true,
      permissions: [PermissionFlagsBits.Administrator],
    },
  ];

  console.log('\n--- Updating Role Settings & Permissions ---');
  const positionedRoles = [];

  for (const spec of roleSpecs) {
    let role = roles.find((r) => r.name.toLowerCase() === spec.name.toLowerCase() ||
      r.name.toLowerCase().replace(/[^a-z]/g, '') === spec.name.toLowerCase().replace(/[^a-z]/g, '')
    );

    if (!role) {
      console.log(`Creating missing role: ${spec.name}`);
      role = await guild.roles.create({
        name: spec.name,
        color: spec.color,
        hoist: spec.hoist,
        permissions: spec.permissions,
        mentionable: true,
      });
    } else {
      console.log(`Updating role: ${role.name}`);
      await role.edit({
        name: spec.name,
        color: spec.color,
        hoist: spec.hoist,
        permissions: spec.permissions,
        mentionable: true,
      });
    }

    positionedRoles.push({ role, spec });
  }

  // Position roles: index 0 (Verified) -> pos 1, up to index 13 (Owner) -> pos 14
  console.log('\n--- Reordering Role Hierarchy ---');
  for (let i = 0; i < positionedRoles.length; i++) {
    const targetPos = i + 1; // 1 to 14
    const r = positionedRoles[i].role;
    try {
      await r.setPosition(targetPos);
      console.log(`Set [Pos ${targetPos}] @${r.name}`);
    } catch (err) {
      console.error(`Position set error for ${r.name}:`, err.message);
    }
  }

  console.log('\nRole permissions and hierarchy successfully secured!');
  client.destroy();
  process.exit(0);
}

fixRolesAndPermissions().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

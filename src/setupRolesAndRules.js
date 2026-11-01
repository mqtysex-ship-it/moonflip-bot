import { fetchGuild, destroyDiscordClient } from './discord.js';
import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { buildRulesChannelPayload } from './rulesSystem.js';

export async function setupRolesAndRules(guildId = '1566215806956601466') {
  const guild = await fetchGuild(guildId);
  console.log('Connected to guild:', guild.name);

  // 1. Desired Role Structure in descending order of hierarchy
  const roleDefs = [
    { name: '👑┃Owner', color: '#E74C3C', hoist: true, admin: true },
    { name: '💼┃Server Manager', color: '#FF8C00', hoist: true, admin: true },
    { name: '🛡️┃Head Admin', color: '#E67E22', hoist: true, perms: ['ManageGuild', 'ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers', 'ManageMessages'] },
    { name: '🛡️┃Administrator', color: '#F1C40F', hoist: true, perms: ['ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers', 'ManageMessages'] },
    { name: '🔨┃Head Moderator', color: '#3498DB', hoist: true, perms: ['KickMembers', 'BanMembers', 'ManageMessages', 'MuteMembers'] },
    { name: '🔨┃Moderator', color: '#2980B9', hoist: true, perms: ['KickMembers', 'ManageMessages', 'MuteMembers'] },
    { name: '🔰┃Trial Moderator', color: '#1ABC9C', hoist: true, perms: ['ManageMessages', 'MuteMembers'] },
    { name: '✨┃Influencer', color: '#9B59B6', hoist: true, perms: ['PrioritySpeaker', 'AttachFiles', 'EmbedLinks'] },
    { name: '👑┃High Roller Elite', color: '#8A2BE2', hoist: true, perms: ['AttachFiles', 'EmbedLinks', 'Connect', 'Speak'] },
    { name: '💎┃Diamond VIP', color: '#00FFFF', hoist: true, perms: ['AttachFiles', 'EmbedLinks', 'Connect', 'Speak'] },
    { name: '🥇┃Gold Tier', color: '#FFD700', hoist: true, perms: ['AttachFiles', 'EmbedLinks', 'Connect', 'Speak'] },
    { name: '🥈┃Silver Tier', color: '#C0C0C0', hoist: true, perms: ['AttachFiles', 'EmbedLinks', 'Connect', 'Speak'] },
    { name: '🥉┃Bronze Tier', color: '#CD7F32', hoist: true, perms: ['AttachFiles', 'EmbedLinks', 'Connect', 'Speak'] },
    { name: '✅┃Verified', color: '#2ECC71', hoist: true, perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak', 'AddReactions'] },
  ];

  const roleMap = new Map();

  // Create or update roles
  for (const def of roleDefs) {
    let role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === def.name.toLowerCase() ||
             r.name.toLowerCase().replace(/[^a-z]/g, '') === def.name.toLowerCase().replace(/[^a-z]/g, '')
    );

    const perms = def.admin ? [PermissionFlagsBits.Administrator] : (def.perms || []);

    if (!role) {
      role = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: def.hoist,
        mentionable: true,
        permissions: perms,
      });
      console.log(`Created role: ${role.name}`);
    } else {
      await role.edit({
        name: def.name,
        color: def.color,
        hoist: def.hoist,
      }).catch(() => {});
      console.log(`Updated role: ${role.name}`);
    }
    roleMap.set(def.name, role);
  }

  // Assign Owner role to server owner
  const ownerMember = await guild.members.fetch(guild.ownerId).catch(() => null);
  if (ownerMember) {
    const ownerRole = roleMap.get('👑┃Owner');
    const managerRole = roleMap.get('💼┃Server Manager');
    if (ownerRole) await ownerMember.roles.add(ownerRole).catch(() => {});
    if (managerRole) await ownerMember.roles.add(managerRole).catch(() => {});
    console.log(`Assigned Owner & Manager roles to owner: ${ownerMember.user.tag}`);
  }

  // 2. Create #roles in Information category
  const infoCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.includes('ɪɴғᴏʀᴍᴀᴛɪᴏɴ')
  );

  let rolesChannel = guild.channels.cache.find((c) => c.name.includes('roles') && !c.name.includes('rules'));
  if (!rolesChannel && infoCat) {
    rolesChannel = await guild.channels.create({
      name: '🎭┃roles',
      type: ChannelType.GuildText,
      parent: infoCat.id,
      position: 1, // Directly below verify-here
      topic: 'Official server hierarchy, staff ranks, prestige levels, and member tiers.',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('Created #roles channel');
  }

  // Post aesthetic Roles Showcase embed
  if (rolesChannel) {
    const msgs = await rolesChannel.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🎭  OFFICIAL SERVER ROLE DIRECTORY')
      .setDescription(
        `> Our community features an organized hierarchical ranking system. All roles are displayed separately in the server sidebar.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 👑 LEADERSHIP & MANAGEMENT\n` +
        `✦ **\`👑┃Owner\`** — Server creator and executive authority.\n` +
        `✦ **\`💼┃Server Manager\`** — Manages community operations and server infrastructure.\n` +
        `✦ **\`🛡️┃Head Admin\`** — Oversees administrative staff and escalations.\n` +
        `✦ **\`🛡️┃Administrator\`** — Full platform moderation and economy oversight.\n\n` +
        `### 🔨 MODERATION TEAM\n` +
        `✦ **\`🔨┃Head Moderator\`** — Leads chat safety and moderator workflows.\n` +
        `✦ **\`🔨┃Moderator\`** — Active chat moderation, mute/ban enforcement.\n` +
        `✦ **\`🔰┃Trial Moderator\`** — New moderator under supervision.\n\n` +
        `### ✨ CREATORS & SPECIAL GUESTS\n` +
        `✦ **\`✨┃Influencer\`** — Content creators, streamers, and verified partners.\n\n` +
        `### 🏆 PRESTIGE TIERS (EARNED VIA XP)\n` +
        `✦ **\`👑┃High Roller Elite\`** — **Level 50** prestige champion (+15k tokens).\n` +
        `✦ **\`💎┃Diamond VIP\`** — **Level 35** elite tier (+5k tokens).\n` +
        `✦ **\`🥇┃Gold Tier\`** — **Level 20** unlocked **VIP Suite** access (+2k tokens).\n` +
        `✦ **\`🥈┃Silver Tier\`** — **Level 10** active player (+750 tokens).\n` +
        `✦ **\`🥉┃Bronze Tier\`** — **Level 05** community regular (+250 tokens).\n\n` +
        `### 👥 GENERAL COMMUNITY\n` +
        `✦ **\`✅┃Verified\`** — Full access to community lounges, games, and voice rooms.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Level up automatically by chatting and playing token games!*`
      )
      .setFooter({ text: 'Hierarchy Directory • Clear Prestige Ranks' })
      .setTimestamp();

    await rolesChannel.send({ embeds: [embed] });
    console.log('Sent roles directory embed');
  }

  // 3. Post Categorized Modular Rules + Interactive Dropdown in #rules
  const rulesCh = guild.channels.cache.find((c) => c.name.includes('rules'));
  if (rulesCh) {
    const msgs = await rulesCh.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const payload = buildRulesChannelPayload(guild);
    await rulesCh.send(payload);
    console.log('Sent interactive Rainbet/Clash.gg rules & dropdown in #rules');
  }

  console.log('Roles categories and modular rules deployed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('setupRolesAndRules.js')) {
  setupRolesAndRules()
    .then(() => destroyDiscordClient())
    .catch(console.error);
}

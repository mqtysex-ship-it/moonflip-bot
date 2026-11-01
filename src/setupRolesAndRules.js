import { fetchGuild, destroyDiscordClient } from './discord.js';
import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

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

  // 3. Post Categorized Modular Rules in #rules
  const rulesCh = guild.channels.cache.find((c) => c.name.includes('rules'));
  if (rulesCh) {
    const msgs = await rulesCh.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    // Card 1: Header & General Conduct
    const embed1 = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('📜  SECTION I: GENERAL COMMUNITY CONDUCT')
      .setDescription(
        `> Welcome to **${guild.name}**! By remaining in this server, you agree to respect everyone and adhere to the guidelines below.\n\n` +
        `**[ 1.1 ] Mutual Respect & Anti-Harassment**\n` +
        `Treat all members with respect. Hate speech, racism, sexism, slurs, cyberbullying, doxxing, or targeted toxicity will result in an instant ban.\n\n` +
        `**[ 1.2 ] No Advertising or Unsolicited DMs**\n` +
        `Do not promote other Discord servers, referral links, YouTube/Twitch channels, or DM server members without prior staff permission.\n\n` +
        `**[ 1.3 ] Strictly Safe For Work (SFW)**\n` +
        `All text, profile pictures, banners, custom statuses, and uploaded media must be strictly Safe For Work. NSFW content is zero-tolerance.`
      );

    // Card 2: Virtual Token & Gaming Regulations
    const embed2 = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🎰  SECTION II: VIRTUAL TOKEN & GAMING REGULATIONS')
      .setDescription(
        `> Guidelines governing our virtual token gaming platform.\n\n` +
        `**[ 2.1 ] Virtual Tokens Only — Strictly Zero Real Money Wagers**\n` +
        `All chips, tokens, and balances are strictly virtual game points. Buying or selling tokens between members for real money (RMT) is strictly illegal and will result in a permanent blacklist.\n\n` +
        `**[ 2.2 ] Fair Play & Anti-Exploit Policy**\n` +
        `Exploiting bot bugs, using macros, auto-clickers, duplication glitches, or abusing system bugs to farm tokens is considered cheating. Violations lead to immediate balance wipes and bans.\n\n` +
        `**[ 2.3 ] No Alt Accounts / Multi-Accounting**\n` +
        `Players may only play from a single Discord account. Using alt accounts to multiply daily rewards or bypass limits will result in all balances being permanently revoked.`
      );

    // Card 3: Promotional Prize Redemptions & KYC
    const embed3 = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎁  SECTION III: PROMOTIONAL REDEMPTIONS & KYC')
      .setDescription(
        `> Terms regarding promotional prizes, crypto, and gift card rewards.\n\n` +
        `**[ 3.1 ] 18+ Age Requirement**\n` +
        `All promotional prize redemptions (Cryptocurrency or Digital Gift Cards) require participants to be at least **18 years of age**.\n\n` +
        `**[ 3.2 ] Mandatory KYC Verification**\n` +
        `To comply with Anti-Money Laundering (AML) standards and prevent fraud, staff reserves the right to request Identity Verification (KYC) before dispatching any prize redemption.\n\n` +
        `**[ 3.3 ] Playthrough & Turnover Requirement**\n` +
        `Tokens cannot be acquired and instantly redeemed. A playthrough requirement must be met before redemption requests can be processed.\n\n` +
        `**[ 3.4 ] Finality & Network Fees**\n` +
        `Crypto redemptions are subject to network gas fees. Members are solely responsible for providing accurate wallet addresses; sent blockchain transactions cannot be reversed.`
      );

    // Card 4: Security & Infraction Ladder
    const embed4 = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('⚖️  SECTION IV: SECURITY & ENFORCEMENT MATRIX')
      .setDescription(
        `> How rules are enforced and how to keep your account safe.\n\n` +
        `**[ 4.1 ] Staff Impersonation & Scam Defense**\n` +
        `Staff will **NEVER** DM you asking for passwords, seed phrases, or private payment links. Always verify official roles in the sidebar.\n\n` +
        `**[ 4.2 ] Infraction Matrix**\n` +
        `✦ **1st Offense**: Official Warning & Message Removal\n` +
        `✦ **2nd Offense**: 24-Hour Timeout / Mute\n` +
        `✦ **3rd Offense**: Temporary Kick / Balance Reset\n` +
        `✦ **Severe / Exploit Offense**: Permanent Ban & Wallet Blacklist\n\n` +
        `**[ 4.3 ] Staff Discretion**\n` +
        `Moderators and Administrators hold final authority on all disputes. Submit appeals or reports in \`#💡┃feedback\`.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: 'Official Community Guidelines • Updated & Enforced' })
      .setTimestamp();

    await rulesCh.send({ embeds: [embed1, embed2, embed3, embed4] });
    console.log('Sent 4-part categorized rules embeds in #rules');
  }

  console.log('Roles categories and modular rules deployed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('setupRolesAndRules.js')) {
  setupRolesAndRules()
    .then(() => destroyDiscordClient())
    .catch(console.error);
}

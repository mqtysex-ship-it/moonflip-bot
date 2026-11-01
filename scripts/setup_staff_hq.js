import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  EmbedBuilder,
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const GUILD_ID = '1566215806956601466';

async function setupStaffHQ() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_BOT_TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID);
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  console.log(`Connected to guild: ${guild.name} (${guild.id})`);

  const everyoneId = guild.roles.everyone.id;
  const botId = client.user.id;

  // Locate Staff Roles
  const findRole = (keywords) =>
    guild.roles.cache.find((r) => {
      const n = r.name.toLowerCase();
      return keywords.every((kw) => n.includes(kw));
    });

  const ownerRole = findRole(['owner']);
  const managerRole = findRole(['manager']);
  const headAdminRole = findRole(['head', 'admin']);
  const adminRole = guild.roles.cache.find(
    (r) => r.name.toLowerCase().includes('admin') && !r.name.toLowerCase().includes('head')
  );
  const headModRole = findRole(['head', 'mod']);
  const extModRole = findRole(['external', 'mod']);
  const trialModRole = findRole(['trial', 'mod']);

  const allStaffRoles = [
    ownerRole,
    managerRole,
    headAdminRole,
    adminRole,
    headModRole,
    extModRole,
    trialModRole,
  ].filter(Boolean);

  const executiveRoles = [
    ownerRole,
    managerRole,
    headAdminRole,
    adminRole,
  ].filter(Boolean);

  const seniorStaffRoles = [
    ownerRole,
    managerRole,
    headAdminRole,
    adminRole,
    headModRole,
  ].filter(Boolean);

  console.log(
    'Matched Staff Roles:',
    allStaffRoles.map((r) => `${r.name} (${r.id})`).join(', ')
  );

  // Base permission overwrites for general Staff-only channels
  const staffCategoryOverwrites = [
    {
      id: everyoneId,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: botId,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
    },
    ...allStaffRoles.map((role) => ({
      id: role.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseVAD,
      ],
    })),
  ];

  // Overwrites for Read-Only Staff Briefing (Senior staff can post, Trial/Ext mods read-only)
  const briefingOverwrites = [
    {
      id: everyoneId,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botId,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    ...allStaffRoles.map((role) => ({
      id: role.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    })),
    ...seniorStaffRoles.map((role) => ({
      id: role.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  // Overwrites for Executive / Admin-Only rooms
  const executiveOverwrites = [
    {
      id: everyoneId,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: botId,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
    },
    ...executiveRoles.map((role) => ({
      id: role.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseVAD,
      ],
    })),
  ];

  // Overwrites for Redemption & KYC Review (Senior Staff + Admins can send, Trial/Ext Mods can view & assist)
  const redemptionOverwrites = [
    {
      id: everyoneId,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botId,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    ...allStaffRoles.map((role) => ({
      id: role.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    })),
  ];

  // 1. Create or Update Category: ─── 🛡️ sᴛᴀғғ ʜᴇᴀᴅǫᴜᴀʀᴛᴇʀs ───
  const catName = '─── 🛡️ sᴛᴀғғ ʜᴇᴀᴅǫᴜᴀʀᴛᴇʀs ───';
  let staffCat = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      (c.name.includes('sᴛᴀғғ') || c.name.toLowerCase().includes('staff'))
  );

  if (!staffCat) {
    staffCat = await guild.channels.create({
      name: catName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: staffCategoryOverwrites,
    });
    console.log(`✅ Created category: ${staffCat.name}`);
  } else {
    await staffCat.edit({
      name: catName,
      permissionOverwrites: staffCategoryOverwrites,
    });
    console.log(`✅ Updated category: ${staffCat.name}`);
  }

  // Define cool staff rooms
  const textRooms = [
    {
      key: 'briefing',
      name: '📌┃staff-briefing',
      topic: 'Official Moonflip Staff Handbook, Standard Operating Procedures (SOPs), and Internal Announcements.',
      overwrites: briefingOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🛡️  MOONFLIP STAFF HEADQUARTERS — OFFICIAL HANDBOOK')
          .setDescription(
            `> Welcome to the **Moonflip Staff Team**! This sector is strictly confidential and restricted to authorized personnel (\`Trial Moderator\` through \`Owner\`).\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 📋 1. CORE STAFF RESPONSIBILITIES\n` +
            `✦ **Community Safety**: Maintain a clean, welcoming, SFW, and scam-free environment across all public lounges.\n` +
            `✦ **Ticket Responsiveness**: Claim and respond to open tickets in \`─── 🎫 sᴜᴘᴘᴏʀᴛ ───\` promptly. Always generate a transcript before closing.\n` +
            `✦ **Fair Play Enforcement**: Monitor game rooms for multi-accounting, macro abuse, or RMT (Real Money Trading) solicitation.\n\n` +
            `### ⚖️ 2. MODERATION ESCALATION MATRIX\n` +
            `✦ **Level 1 (Minor Spam / Off-Topic)**: Verbal warning in chat + message deletion.\n` +
            `✦ **Level 2 (Repeated Spam / Toxicity)**: 1h – 24h Timeout + log incident in \`#🔨┃mod-operations\`.\n` +
            `✦ **Level 3 (Scam Links / NSFW / Doxxing / RMT / Alt Farming)**: Immediate Permanent Ban + notify \`@Administrator\` for wallet wipe.\n\n` +
            `### 🔒 3. CONFIDENTIALITY & INTEGRITY\n` +
            `✦ Never leak internal staff discussions, screenshots, or KYC details outside of Staff HQ.\n` +
            `✦ Economy commands (\`/addtokens\`, \`/removetokens\`, \`/settokens\`) are strictly logged and audited.`
          )
          .setFooter({ text: 'Moonflip Internal Operations • Strictly Confidential' })
          .setTimestamp(),
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('⚡  STAFF DIRECTORY & ROOM GUIDE')
          .setDescription(
            `> Quick reference for navigating our internal Staff Headquarters rooms:\n\n` +
            `📌 **\`#📌┃staff-briefing\`** — Official SOPs, staff updates, and policy announcements.\n` +
            `💬 **\`#💬┃staff-lounge\`** — Private off-duty hangout and casual chat for the staff team.\n` +
            `🔨 **\`#🔨┃mod-operations\`** — Active moderation coordination, ban logs, and shift handoffs.\n` +
            `🎁 **\`#🎁┃redemption-review\`** — Prize redemption audits, playthrough checks, and KYC verification queue.\n` +
            `🤖 **\`#🤖┃staff-commands\`** — Private terminal for staff slash commands and wallet lookups.\n` +
            `👑 **\`#👑┃executive-board\`** — Restricted high-level room for Administrators, Managers, and Owners.\n` +
            `🔊 **\`Staff War Room\` & \`Executive Office\`** — Private voice channels for team meetings and live calls.`
          )
          .setFooter({ text: 'Moonflip Staff Portal' }),
      ],
    },
    {
      key: 'lounge',
      name: '💬┃staff-lounge',
      topic: 'Private general chat, breakroom, and casual discussion exclusively for Moonflip Staff.',
      overwrites: staffCategoryOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('💬  MOONFLIP STAFF LOUNGE & BREAKROOM')
          .setDescription(
            `> Welcome to the private **Staff Lounge**! 🌙\n` +
            `> Kick back, chat with fellow moderators and admins, coordinate your availability, or share ideas for upcoming community events.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `✦ **Visibility**: \`100% Private (Staff Only)\`\n` +
            `✦ **Tip**: Keep active case evidence in \`#🔨┃mod-operations\` and payout reviews in \`#🎁┃redemption-review\` so nothing gets lost!`
          )
          .setFooter({ text: 'Moonflip Staff Team Sanctuary' })
          .setTimestamp(),
      ],
    },
    {
      key: 'ops',
      name: '🔨┃mod-operations',
      topic: 'Active moderation coordination, player reports, multi-account investigations, and punishment logs.',
      overwrites: staffCategoryOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('🔨  MODERATION OPERATIONS & INCIDENT LOGS')
          .setDescription(
            `> Use this channel to coordinate active moderation actions, flag suspicious accounts, and log timeouts/bans.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 📝 INCIDENT REPORT FORMAT\n` +
            `When logging a major punishment or flagging an account for Admin wallet review, include:\n` +
            `\`\`\`yaml\n` +
            `Target User: @username (User ID)\n` +
            `Rule Violated: [e.g. Section 2.3 Multi-Accounting / Scam Link]\n` +
            `Action Taken: [Warning / 24h Mute / Ban / Pending Admin Review]\n` +
            `Evidence: [Attach Screenshot or Message Link]\n` +
            `\`\`\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .setFooter({ text: 'Moonflip Moderation Desk • Security & Fair Play' })
          .setTimestamp(),
      ],
    },
    {
      key: 'redemption',
      name: '🎁┃redemption-review',
      topic: 'Prize redemption audits, KYC verification, wallet turnover checks, and payout approvals.',
      overwrites: redemptionOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('🎁  PRIZE REDEMPTION & KYC AUDIT DESK')
          .setDescription(
            `> Coordinate and verify member prize redemption tickets from \`─── 🎫 sᴜᴘᴘᴏʀᴛ ───\` before dispatching rewards.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### ✅ PRE-PAYOUT VERIFICATION CHECKLIST\n` +
            `1️⃣ **Age & KYC Check**: Confirm member is **18+** and has passed required identity verification.\n` +
            `2️⃣ **Playthrough Audit**: Check player stats via \`/balance\` or \`#🤖┃staff-commands\` to verify legitimate game turnover.\n` +
            `3️⃣ **Fair Play Clearance**: Ensure zero multi-account transfers or exploit flags exist on the account.\n` +
            `4️⃣ **Executive Sign-Off**: Tag \`@Administrator\` or \`@Server Manager\` with the ticket link and wallet address for final dispatch.`
          )
          .setFooter({ text: 'Moonflip Compliance & Rewards Desk' })
          .setTimestamp(),
      ],
    },
    {
      key: 'commands',
      name: '🤖┃staff-commands',
      topic: 'Private staff terminal for executing slash commands, auditing balances, and testing bot features.',
      overwrites: staffCategoryOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('🤖  STAFF COMMAND TERMINAL & WALLET AUDITOR')
          .setDescription(
            `> Execute bot slash commands privately without cluttering public channels.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 🛠️ AVAILABLE STAFF & AUDIT COMMANDS\n` +
            `✦ \`/balance [user]\` — Inspect any member's current token wallet and games played.\n` +
            `✦ \`/rank [user]\` — Inspect a member's XP level and prestige tier progress.\n` +
            `✦ \`/leaderboard\` — View the top 10 richest token holders on the server.\n` +
            `✦ \`/addtokens <user> <amount>\` — *(Admin)* Credit tokens to a member's wallet.\n` +
            `✦ \`/removetokens <user> <amount>\` — *(Admin)* Deduct tokens from a member's wallet.\n` +
            `✦ \`/settokens <user> <amount>\` — *(Admin)* Set a member's exact token balance.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .setFooter({ text: 'Moonflip Internal Bot Terminal' })
          .setTimestamp(),
      ],
    },
    {
      key: 'brand',
      name: '🎨┃brand-resources',
      topic: 'Official Moonflip Brand Identity, Design Assets, Logos, Color Palette, Banners, and Media Kit for Staff.',
      overwrites: staffCategoryOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('🎨  MOONFLIP BRANDING HUB & RESOURCE REPOSITORY')
          .setDescription(
            `> Welcome to the official **Moonflip Branding & Media Kit** repository!\n` +
            `> Use this channel to download official vector logos, export high-resolution banners, grab brand hex codes, coordinate graphics with designers, and drop raw assets for community announcements.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 🌙 1. CORE BRAND IDENTITY & GUIDELINES\n` +
            `✦ **Brand Name**: \`Moonflip\` *(Capital M, lowercase f or CamelCase)*\n` +
            `✦ **Core Concept**: Modern, sleek crypto-adjacent entertainment platform featuring provably fair virtual token games (Crash, Mines, Keno, Coinflip, Slots, Blackjack).\n` +
            `✦ **Tone of Voice**: High-energy, elite, transparent, luxurious, and welcoming.\n` +
            `✦ **Visual Aesthetic**: Dark cyber-space theme with vibrant gold accents, glowing neon highlights, and crisp minimalist geometry.\n\n` +
            `### ⚠️ BRAND SAFETY RULES\n` +
            `✦ **Virtual Entertainment Only**: Never use misleading real-money gambling terminology in public promotional graphics. Always frame gameplay as virtual token entertainment.\n` +
            `✦ **Logo Integrity**: Do not stretch, warp, distort, or recolor the primary logo in clashing neon hues without approval.`
          )
          .setFooter({ text: 'Moonflip Creative & Brand Asset Directory • Staff Internal' })
          .setTimestamp(),
        new EmbedBuilder()
          .setColor(0x8a2be2)
          .setTitle('🎨  OFFICIAL COLOR PALETTE & TYPOGRAPHY')
          .setDescription(
            `> Exact hex codes and styling rules for social media graphics, server banners, badges, and stream overlays.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 🌈 COLOR SYSTEM\n` +
            `✦ 🪙 **Moonflip Gold (Primary)**: \`#F1C40F\` — Logo, VIP badges, win states, buttons.\n` +
            `✦ 🌙 **Deep Midnight (Background)**: \`#0F1117\` / \`#161922\` — Canvas, cards, backgrounds.\n` +
            `✦ 🚀 **Cosmic Violet (Prestige)**: \`#8A2BE2\` — High Roller tiers, special events.\n` +
            `✦ 💎 **Cyan Ice (Elite)**: \`#00FFFF\` — Diamond VIP, multipliers, highlights.\n` +
            `✦ ⚡ **Emerald Mint (Success)**: \`#2ECC71\` — Cashouts, verified badges, confirmations.\n` +
            `✦ 💣 **Crimson Blast (Accent)**: \`#E74C3C\` — Mines, crash points, warnings.\n\n` +
            `### ✍️ TYPOGRAPHY SPECIFICATIONS\n` +
            `✦ **Display Headings**: *Montserrat ExtraBold*, *Orbitron*, *Inter Tight Display*\n` +
            `✦ **UI & Body Copy**: *Inter*, *Roboto*, *SF Pro Display*\n` +
            `✦ **Numerical & Multipliers**: *Space Mono*, *JetBrains Mono*`
          )
          .setFooter({ text: 'Standardized Hex Guidelines' }),
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('📦  ASSET REPOSITORY & RESOURCE DROP-ZONE')
          .setDescription(
            `> Staff, managers, and designers can drop or pin raw design files directly in this channel.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 📂 ASSET CATEGORIES TO POST HERE:\n` +
            `1️⃣ **Logo Packs**: Transparent PNGs (Full Logo, Emblem Icon, Monochrome Black/White, 512x512, 1024x1024).\n` +
            `2️⃣ **Server Banners & Headers**: Official 960x540 animated/static banners, invite splash screens, channel header cards.\n` +
            `3️⃣ **Social Media Templates**: Twitter/X banners (1500x500), Twitch/Kick stream overlays, YouTube thumbnails.\n` +
            `4️⃣ **Partner & Creator Kits**: Watermark overlays, token coin PNGs, custom emojis, and animated stickers.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 *To add resources: Upload your high-res files (\`.png\`, \`.svg\`, \`.psd\`, \`.ai\`) or paste Google Drive / Figma / Dropbox share links right below!*`
          )
          .setFooter({ text: 'Always upload uncompressed or vector files for highest fidelity' }),
      ],
    },
    {
      key: 'executive',
      name: '👑┃executive-board',
      topic: 'Restricted high-level war room for Administrators, Head Admins, Server Managers, and Owners.',
      overwrites: executiveOverwrites,
      embeds: [
        new EmbedBuilder()
          .setColor(0x8a2be2)
          .setTitle('👑  EXECUTIVE BOARDROOM (ADMINISTRATION & MANAGEMENT)')
          .setDescription(
            `> Welcome to the **Moonflip Executive Boardroom**.\n` +
            `> This channel is strictly hidden from Trial/External/Head Moderators and is accessible **only** to \`🛡️ Administrator\`, \`♾️ Head Administrator\`, \`👑 Server Manager\`, and \`👑 Owner\`.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 📊 EXECUTIVE FOCUS AREAS\n` +
            `✦ **Economy & RTP Tuning**: High-roller limits, giveaway budgets, and token supply oversight.\n` +
            `✦ **Staff Promotions & Reviews**: Evaluating Trial Moderators and managing staff permissions.\n` +
            `✦ **Partnerships & Creators**: Coordinating \`♾️ Influencer\` campaigns and server growth.`
          )
          .setFooter({ text: 'Moonflip Executive Command • Level 4 Clearance' })
          .setTimestamp(),
      ],
    },
  ];

  // Create or update each text room and post its embeds if fresh
  for (let i = 0; i < textRooms.length; i++) {
    const spec = textRooms[i];
    let ch = guild.channels.cache.find(
      (c) =>
        c.parentId === staffCat.id &&
        c.type === ChannelType.GuildText &&
        (c.name.toLowerCase() === spec.name.toLowerCase() || c.name.includes(spec.key))
    );

    if (!ch) {
      ch = await guild.channels.create({
        name: spec.name,
        type: ChannelType.GuildText,
        parent: staffCat.id,
        position: i,
        topic: spec.topic,
        permissionOverwrites: spec.overwrites,
      });
      console.log(`✅ Created text channel: #${ch.name}`);
    } else {
      await ch.edit({
        name: spec.name,
        parent: staffCat.id,
        position: i,
        topic: spec.topic,
        permissionOverwrites: spec.overwrites,
      });
      console.log(`✅ Updated text channel: #${ch.name}`);
    }

    // Clear old bot messages & post fresh embeds
    const msgs = await ch.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) {
      if (m.author.id === botId) {
        await m.delete().catch(() => {});
      }
    }
    if (spec.embeds && spec.embeds.length > 0) {
      await ch.send({ embeds: spec.embeds });
      console.log(`   ↳ Deployed embed(s) in #${ch.name}`);
    }
  }

  // Create or update Voice Rooms inside Staff HQ
  const voiceRooms = [
    {
      key: 'War Room',
      name: '🔊┃Staff War Room',
      overwrites: staffCategoryOverwrites,
    },
    {
      key: 'Executive Office',
      name: '🔒┃Executive Office',
      overwrites: executiveOverwrites,
    },
  ];

  for (let i = 0; i < voiceRooms.length; i++) {
    const vSpec = voiceRooms[i];
    let vc = guild.channels.cache.find(
      (c) =>
        c.parentId === staffCat.id &&
        c.type === ChannelType.GuildVoice &&
        (c.name.toLowerCase() === vSpec.name.toLowerCase() || c.name.includes(vSpec.key))
    );

    if (!vc) {
      vc = await guild.channels.create({
        name: vSpec.name,
        type: ChannelType.GuildVoice,
        parent: staffCat.id,
        permissionOverwrites: vSpec.overwrites,
      });
      console.log(`✅ Created voice channel: ${vc.name}`);
    } else {
      await vc.edit({
        name: vSpec.name,
        parent: staffCat.id,
        permissionOverwrites: vSpec.overwrites,
      });
      console.log(`✅ Updated voice channel: ${vc.name}`);
    }
  }

  console.log('\n🎉 Moonflip Staff Headquarters setup completed successfully!');
  client.destroy();
  process.exit(0);
}

setupStaffHQ().catch((err) => {
  console.error('Fatal error setting up Staff HQ:', err);
  process.exit(1);
});

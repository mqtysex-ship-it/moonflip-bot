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

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_BOT_TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID);
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  console.log(`Connected to guild: ${guild.name} (${guild.id})`);

  const everyoneRole = guild.roles.everyone;
  const botId = client.user.id;

  // 1. Locate Roles
  const roles = guild.roles.cache;
  const findRole = (keywords) =>
    roles.find((r) => {
      const n = r.name.toLowerCase();
      return keywords.every((kw) => n.includes(kw));
    });

  const ownerRole = findRole(['owner']);
  const managerRole = findRole(['manager']);
  const headAdminRole = findRole(['head', 'admin']);
  const adminRole = roles.find(
    (r) => r.name.toLowerCase().includes('admin') && !r.name.toLowerCase().includes('head')
  );
  const headModRole = findRole(['head', 'mod']);
  const extModRole = findRole(['external', 'mod']);
  const trialModRole = findRole(['trial', 'mod']);
  const verifiedRole = findRole(['verified']);
  const goldRole = findRole(['gold']);
  const diamondRole = findRole(['diamond']);
  const eliteRole = findRole(['high roller']);

  console.log('\n--- 1. Upgrading Administrator Role Permissions ---');
  if (adminRole) {
    console.log(`Setting Administrator permission flag on: ${adminRole.name}`);
    await adminRole.setPermissions([PermissionFlagsBits.Administrator]);
    console.log(`✅ ${adminRole.name} now has full Administrator permission flag!`);
  }
  if (headAdminRole) {
    console.log(`Setting Administrator permission flag on: ${headAdminRole.name}`);
    await headAdminRole.setPermissions([PermissionFlagsBits.Administrator]);
    console.log(`✅ ${headAdminRole.name} now has full Administrator permission flag!`);
  }

  const staffRoles = [
    ownerRole,
    managerRole,
    headAdminRole,
    adminRole,
    headModRole,
    extModRole,
    trialModRole,
  ].filter(Boolean);

  console.log('\n--- 2. Updating Category Overwrites so ALL Staff & Admins can access Token Games and Community ---');

  // Base staff permissions for text & gaming categories
  const staffTextAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseApplicationCommands,
    PermissionFlagsBits.ManageMessages,
  ];

  // Base staff permissions for voice categories
  const staffVoiceAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.Stream,
    PermissionFlagsBits.UseVAD,
    PermissionFlagsBits.MuteMembers,
    PermissionFlagsBits.DeafenMembers,
    PermissionFlagsBits.MoveMembers,
  ];

  // 2A. Token Games Category: ─── 🎰 ᴛᴏᴋᴇɴ ɢᴀᴍᴇs ───
  const tokenGamesCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && (c.name.includes('ᴛᴏᴋᴇɴ') || c.name.toLowerCase().includes('token'))
  );
  if (tokenGamesCat) {
    console.log(`Updating category: ${tokenGamesCat.name}`);
    const overwrites = [
      {
        id: everyoneRole.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ...(verifiedRole ? [{
        id: verifiedRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.EmbedLinks,
        ],
      }] : []),
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: staffTextAllow,
      })),
    ];
    await tokenGamesCat.permissionOverwrites.set(overwrites);
    console.log(`✅ Updated ${tokenGamesCat.name} overwrites with all staff roles.`);

    // Sync all child channels in Token Games
    const gameChannels = guild.channels.cache.filter((c) => c.parentId === tokenGamesCat.id);
    for (const [, ch] of gameChannels) {
      await ch.lockPermissions();
      console.log(`   ↳ Synced #${ch.name} to category.`);
    }
  }

  // 2B. Community Category: ─── 💬 ᴄᴏᴍᴍᴜɴɪᴛʏ ───
  const commCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && (c.name.includes('ᴄᴏᴍᴍᴜɴɪᴛʏ') || c.name.toLowerCase().includes('community'))
  );
  if (commCat) {
    console.log(`Updating category: ${commCat.name}`);
    const overwrites = [
      {
        id: everyoneRole.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ...(verifiedRole ? [{
        id: verifiedRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      }] : []),
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: staffTextAllow,
      })),
    ];
    await commCat.permissionOverwrites.set(overwrites);
    console.log(`✅ Updated ${commCat.name} overwrites with all staff roles.`);

    const commChannels = guild.channels.cache.filter((c) => c.parentId === commCat.id);
    for (const [, ch] of commChannels) {
      await ch.lockPermissions();
      console.log(`   ↳ Synced #${ch.name} to category.`);
    }
  }

  // 2C. Levels & Rewards: ─── 🏆 ʟᴇᴠᴇʟs & ʀᴇᴡᴀʀᴅs ───
  const rewardsCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && (c.name.includes('ʟᴇᴠᴇʟs') || c.name.toLowerCase().includes('levels'))
  );
  if (rewardsCat) {
    console.log(`Updating category: ${rewardsCat.name}`);
    const overwrites = [
      {
        id: everyoneRole.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ...(verifiedRole ? [{
        id: verifiedRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      }] : []),
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: staffTextAllow,
      })),
    ];
    await rewardsCat.permissionOverwrites.set(overwrites);
    console.log(`✅ Updated ${rewardsCat.name} overwrites with all staff roles.`);

    const rChannels = guild.channels.cache.filter((c) => c.parentId === rewardsCat.id);
    for (const [, ch] of rChannels) {
      await ch.lockPermissions();
      console.log(`   ↳ Synced #${ch.name} to category.`);
    }
  }

  // 2D. VIP High Roller: ─── 👑 ᴠɪᴘ ʜɪɢʜ ʀᴏʟʟᴇʀ ───
  const vipCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && (c.name.includes('ʜɪɢʜ ʀᴏʟʟᴇʀ') || c.name.toLowerCase().includes('vip'))
  );
  if (vipCat) {
    console.log(`Updating category: ${vipCat.name}`);
    const overwrites = [
      {
        id: everyoneRole.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ...(goldRole ? [{
        id: goldRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      }] : []),
      ...(diamondRole ? [{
        id: diamondRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      }] : []),
      ...(eliteRole ? [{
        id: eliteRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      }] : []),
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: [
          ...staffTextAllow,
          ...staffVoiceAllow,
        ],
      })),
    ];
    await vipCat.permissionOverwrites.set(overwrites);
    console.log(`✅ Updated ${vipCat.name} overwrites with all staff roles.`);

    const vipChannels = guild.channels.cache.filter((c) => c.parentId === vipCat.id);
    for (const [, ch] of vipChannels) {
      await ch.lockPermissions();
      console.log(`   ↳ Synced #${ch.name} to category.`);
    }
  }

  // 2E. Voice Lounge: ─── 🔊 ᴠᴏɪᴄᴇ ʟᴏᴜɴɢᴇ ───
  const voiceCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && (c.name.includes('ᴠᴏɪᴄᴇ') || c.name.toLowerCase().includes('voice'))
  );
  if (voiceCat) {
    console.log(`Updating category: ${voiceCat.name}`);
    const overwrites = [
      {
        id: everyoneRole.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      ...(verifiedRole ? [{
        id: verifiedRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
        ],
      }] : []),
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          ...staffVoiceAllow,
        ],
      })),
    ];
    await voiceCat.permissionOverwrites.set(overwrites);
    console.log(`✅ Updated ${voiceCat.name} overwrites with all staff roles.`);

    const vChannels = guild.channels.cache.filter((c) => c.parentId === voiceCat.id);
    for (const [, ch] of vChannels) {
      await ch.lockPermissions();
      console.log(`   ↳ Synced #${ch.name} to category.`);
    }
  }

  // 3. Create branding staff channel in Staff HQ
  console.log('\n--- 3. Creating Branding Staff Channel in Staff HQ ---');
  const staffCat = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      (c.name.includes('sᴛᴀғғ') || c.name.toLowerCase().includes('staff'))
  );

  if (!staffCat) {
    throw new Error('Staff Headquarters category was not found.');
  }

  const channelName = '🎨┃brand-resources';
  let brandCh = guild.channels.cache.find(
    (c) =>
      c.parentId === staffCat.id &&
      (c.name.includes('brand') || c.name.includes('design') || c.name.includes('resources'))
  );

  const brandOverwrites = [
    {
      id: everyoneRole.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    ...staffRoles.map((role) => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
      ],
    })),
  ];

  if (!brandCh) {
    brandCh = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: staffCat.id,
      position: 5, // Below staff-commands, above executive-board
      topic: 'Official Moonflip Brand Identity, Design Assets, Logos, Color Palette, Banners, and Media Kit for Staff.',
      permissionOverwrites: brandOverwrites,
    });
    console.log(`✅ Created text channel: #${brandCh.name}`);
  } else {
    await brandCh.edit({
      name: channelName,
      parent: staffCat.id,
      position: 5,
      topic: 'Official Moonflip Brand Identity, Design Assets, Logos, Color Palette, Banners, and Media Kit for Staff.',
      permissionOverwrites: brandOverwrites,
    });
    console.log(`✅ Updated text channel: #${brandCh.name}`);
  }

  // Clear previous bot messages in brand channel and post aesthetic brand kit embeds
  const msgs = await brandCh.messages.fetch({ limit: 10 }).catch(() => []);
  for (const [, m] of msgs) {
    if (m.author.id === botId) await m.delete().catch(() => {});
  }

  const embedHeader = new EmbedBuilder()
    .setColor(0xf1c40f) // Gold
    .setTitle('🎨  MOONFLIP BRANDING HUB & RESOURCE REPOSITORY')
    .setDescription(
      `> Welcome to the official **Moonflip Branding & Media Kit** repository!\n` +
      `> Use this channel to download official vector logos, export high-resolution banners, grab brand hex codes, coordinate graphics with designers, and drop raw assets for community announcements.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 🌙 1. CORE BRAND IDENTITY & GUIDELINES\n` +
      `✦ **Brand Name**: \`Moonflip\` *(Capital M, lowercase f or CamelCase)*\n` +
      `✦ **Core Concept**: Modern, sleek crypto-adjacent entertainment platform featuring provably fair virtual token games (Crash, Mines, Plinko, Coinflip, Blackjack).\n` +
      `✦ **Tone of Voice**: High-energy, elite, transparent, luxurious, and welcoming.\n` +
      `✦ **Visual Aesthetic**: Dark cyber-space theme with vibrant gold accents, glowing neon highlights, and crisp minimalist geometry.\n\n` +
      `### ⚠️ BRAND SAFETY RULES\n` +
      `✦ **Virtual Entertainment Only**: Never use misleading real-money gambling terminology in public promotional graphics. Always frame gameplay as virtual token entertainment.\n` +
      `✦ **Logo Integrity**: Do not stretch, warp, distort, or recolor the primary logo in clashing neon hues without approval.`
    )
    .setFooter({ text: 'Moonflip Creative & Brand Asset Directory • Staff Internal' })
    .setTimestamp();

  const embedPalette = new EmbedBuilder()
    .setColor(0x8a2be2) // Violet / Neon
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
    .setFooter({ text: 'Standardized Hex Guidelines' });

  const embedAssets = new EmbedBuilder()
    .setColor(0x2ecc71) // Green
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
    .setFooter({ text: 'Always upload uncompressed or vector files for highest fidelity' });

  await brandCh.send({ embeds: [embedHeader, embedPalette, embedAssets] });
  console.log(`✅ Deployed 3 brand resource embeds into #${brandCh.name}!`);

  console.log('\n🎉 ALL UPDATES COMPLETED SUCCESSFULLY!');
  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

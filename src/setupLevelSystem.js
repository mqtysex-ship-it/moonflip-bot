import { fetchGuild, destroyDiscordClient } from './discord.js';
import { ChannelType, OverwriteType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { LEVEL_TIERS } from './games/levels.js';

export async function setupLevelSystem(guildId = '1566215806956601466') {
  const guild = await fetchGuild(guildId);
  console.log('Connected to guild:', guild.name);

  // 1. Create Level Tier Roles
  const createdTierRoles = new Map();
  for (const tier of LEVEL_TIERS) {
    let role = guild.roles.cache.find((r) => r.name.toLowerCase() === tier.roleName.toLowerCase());
    if (!role) {
      role = await guild.roles.create({
        name: tier.roleName,
        color: tier.color,
        hoist: true,
        mentionable: true,
        permissions: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      });
      console.log(`Created role: @${role.name}`);
    } else {
      console.log(`Role already exists: @${role.name}`);
    }
    createdTierRoles.set(tier.roleName, role);
  }

  // 2. Add #faq and #token-guide to Information category
  const infoCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.includes('ɪɴғᴏʀᴍᴀᴛɪᴏɴ')
  );

  if (infoCat) {
    let faqCh = guild.channels.cache.find((c) => c.parentId === infoCat.id && c.name.includes('faq'));
    if (!faqCh) {
      faqCh = await guild.channels.create({
        name: '❓┃faq',
        type: ChannelType.GuildText,
        parent: infoCat.id,
        topic: 'Frequently Asked Questions about virtual tokens, games, and levels.',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        ],
      });
      console.log('Created #faq channel');
    }

    let guideCh = guild.channels.cache.find((c) => c.parentId === infoCat.id && c.name.includes('token-guide'));
    if (!guideCh) {
      guideCh = await guild.channels.create({
        name: '💎┃token-guide',
        type: ChannelType.GuildText,
        parent: infoCat.id,
        topic: 'Complete guide on earning tokens, games, multipliers, and wallet management.',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        ],
      });
      console.log('Created #token-guide channel');
    }
  }

  // 3. Create Categories: Levels & Rewards
  const verifiedRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'verified');
  const adminRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'admin');

  let rewardsCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.includes('ʟᴇᴠᴇʟs')
  );

  if (!rewardsCat) {
    rewardsCat = await guild.channels.create({
      name: '─── 🏆 ʟᴇᴠᴇʟs & ʀᴇᴡᴀʀᴅs ───',
      type: ChannelType.GuildCategory,
      position: 2,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...(verifiedRole ? [{ id: verifiedRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
        ...(adminRole ? [{ id: adminRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }] : []),
      ],
    });
    console.log('Created Levels & Rewards category');
  }

  // Sub-channels for Levels & Rewards
  let perksCh = guild.channels.cache.find((c) => c.parentId === rewardsCat.id && c.name.includes('perks'));
  if (!perksCh) {
    perksCh = await guild.channels.create({
      name: '🏆┃level-perks',
      type: ChannelType.GuildText,
      parent: rewardsCat.id,
      topic: 'Unlock exclusive tier roles, token bonuses, and VIP rooms as you level up!',
    });
    console.log('Created #level-perks');
  }

  let levelUpsCh = guild.channels.cache.find((c) => c.parentId === rewardsCat.id && c.name.includes('level-ups'));
  if (!levelUpsCh) {
    levelUpsCh = await guild.channels.create({
      name: '🆙┃level-ups',
      type: ChannelType.GuildText,
      parent: rewardsCat.id,
      topic: 'Automatic celebratory announcements when members rank up and claim token bonuses!',
    });
    console.log('Created #level-ups');
  }

  // 4. Create VIP / High Roller Category (Unlocked at Level 20 / Gold Tier +)
  let vipCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.includes('ʜɪɢʜ ʀᴏʟʟᴇʀ')
  );

  const goldRole = createdTierRoles.get('Gold Tier');
  const diamondRole = createdTierRoles.get('Diamond VIP');
  const eliteRole = createdTierRoles.get('High Roller Elite');

  const vipOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...(adminRole ? [{ id: adminRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }] : []),
    ...(goldRole ? [{ id: goldRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] : []),
    ...(diamondRole ? [{ id: diamondRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] : []),
    ...(eliteRole ? [{ id: eliteRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] : []),
  ];

  if (!vipCat) {
    vipCat = await guild.channels.create({
      name: '─── 👑 ᴠɪᴘ ʜɪɢʜ ʀᴏʟʟᴇʀ ───',
      type: ChannelType.GuildCategory,
      position: 3,
      permissionOverwrites: vipOverwrites,
    });
    console.log('Created VIP High Roller category');
  }

  // VIP Channels
  let vipLoungeCh = guild.channels.cache.find((c) => c.parentId === vipCat.id && c.name.includes('vip-lounge'));
  if (!vipLoungeCh) {
    vipLoungeCh = await guild.channels.create({
      name: '👑┃vip-lounge',
      type: ChannelType.GuildText,
      parent: vipCat.id,
      topic: 'Exclusive private sanctuary for Gold Tier, Diamond, and High Roller members.',
    });
    console.log('Created #vip-lounge');
  }

  let vipVc = guild.channels.cache.find((c) => c.parentId === vipCat.id && c.name.includes('VIP Suite'));
  if (!vipVc) {
    vipVc = await guild.channels.create({
      name: '🔊┃VIP High Roller Suite',
      type: ChannelType.GuildVoice,
      parent: vipCat.id,
    });
    console.log('Created VIP Voice Suite');
  }

  // 5. Deploy Aesthetic Embeds into #faq, #token-guide, and #level-perks
  const faqChannel = guild.channels.cache.find((c) => c.name.includes('faq'));
  if (faqChannel) {
    const msgs = await faqChannel.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('❓  FREQUENTLY ASKED QUESTIONS (FAQ)')
      .setDescription(
        `> Welcome to the FAQ hub! Find quick answers regarding our virtual token economy, games, and levels.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        {
          name: '`[ Q1 ]` How do I get free tokens?',
          value: '✦ Every new verified member starts with **1,000 free tokens**.\n✦ Click **`🎁 Daily (+500)`** in `#🤖┃commands` every 24h.\n✦ Earn tokens automatically through level-up bonuses and community giveaways.',
        },
        {
          name: '`[ Q2 ]` Are tokens real money?',
          value: '✦ **No.** Tokens are digital game entertainment points with zero direct monetary value.\n✦ We maintain a legal closed-loop entertainment model with optional promotional prize rewards for verified members.',
        },
        {
          name: '`[ Q3 ]` How does leveling up work?',
          value: '✦ Chatting in community text channels earns **+15 to +25 XP** per message.\n✦ Playing token games earns **+20 XP** per play.\n✦ Leveling up grants instant token bonuses and unlocks exclusive tiered roles (Bronze, Silver, Gold, Diamond, High Roller)!',
        },
        {
          name: '`[ Q4 ]` Are games rigged or provably fair?',
          value: '✦ All games (Mines, Crash, Slots, Coinflip, Keno, Blackjack) use **cryptographically secure RNG** (`crypto.randomBytes`) ensuring transparent, provably fair outcomes matching industry standards.',
        },
        {
          name: '`[ Q5 ]` How do I unlock the VIP High Roller category?',
          value: '✦ Reach **Level 20 (Gold Tier)** or higher through activity and token games to gain exclusive access to the VIP Lounge and High Roller Voice Suite!',
        }
      )
      .setFooter({ text: 'Got more questions? Ask in #💡┃feedback' })
      .setTimestamp();

    await faqChannel.send({ embeds: [embed] });
    console.log('Sent FAQ embed');
  }

  const guideChannel = guild.channels.cache.find((c) => c.name.includes('token-guide'));
  if (guideChannel) {
    const msgs = await guideChannel.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('💎  OFFICIAL TOKEN GUIDE & ECONOMY MANUAL')
      .setDescription(
        `> Everything you need to know to master the token gaming platform.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        {
          name: '`🪙 1. Managing Your Wallet`',
          value: 'Use `/balance` or click the button in `#🤖┃commands` to check your current balance, games played, and stats at any time. Send tokens to friends via `/pay <user> <amount>`.',
        },
        {
          name: '`🎮 2. Game Multipliers & Strategy`',
          value: '✦ **💣 Mines**: High multiplier scaling. Uncover 2-4 gems and cash out early for consistent gains.\n✦ **📈 Crash**: Ride the multiplier rocket, but beware of instant crashes (1.5% edge).\n✦ **🎰 Slots**: Hit 3 Diamonds for a **30x Jackpot**.\n✦ **🎲 Keno**: Pick 5 lucky numbers for up to **40x payouts**.',
        },
        {
          name: '`👑 3. Progression & Perks`',
          value: 'Every wager and win adds to your player experience. Progress from **Bronze Tier** all the way to **High Roller Elite** to claim massive token bonuses!',
        }
      )
      .setFooter({ text: 'Entertainment Platform • Play Responsibly' })
      .setTimestamp();

    await guideChannel.send({ embeds: [embed] });
    console.log('Sent Token Guide embed');
  }

  const perksChannel = guild.channels.cache.find((c) => c.name.includes('level-perks'));
  if (perksChannel) {
    const msgs = await perksChannel.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x8a2be2)
      .setTitle('🏆  TIER RANKS, LEVEL REWARDS & VIP PERKS')
      .setDescription(
        `> Level up by chatting and playing in game rooms. Each tier unlocks permanent prestige roles and instant token payouts!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        {
          name: '🥉 `Level 05` — Bronze Tier (`#CD7F32`)',
          value: '✦ **Bonus**: `+250 🪙` Instant Reward\n✦ **Perks**: Bronze colored username, Hoisted in member list',
        },
        {
          name: '🥈 `Level 10` — Silver Tier (`#C0C0C0`)',
          value: '✦ **Bonus**: `+750 🪙` Instant Reward\n✦ **Perks**: Silver role badge, priority bot permissions',
        },
        {
          name: '🥇 `Level 20` — Gold Tier (`#FFD700`)',
          value: '✦ **Bonus**: `+2,000 🪙` Instant Reward\n✦ **Perks**: **Unlocks 👑 VIP High Roller Category** (`#vip-lounge` & `VIP Suite`)',
        },
        {
          name: '💎 `Level 35` — Diamond VIP (`#00FFFF`)',
          value: '✦ **Bonus**: `+5,000 🪙` Instant Reward\n✦ **Perks**: Cyan neon badge, exclusive high-roller recognition',
        },
        {
          name: '👑 `Level 50` — High Roller Elite (`#8A2BE2`)',
          value: '✦ **Bonus**: `+15,000 🪙` Instant Reward\n✦ **Perks**: Highest prestige tier, custom title recognition, supreme server bragging rights',
        }
      )
      .setFooter({ text: 'Check your rank anytime using /rank' })
      .setTimestamp();

    await perksChannel.send({ embeds: [embed] });
    console.log('Sent Level Perks embed');
  }

  console.log('Level system and categorized rules deployed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('setupLevelSystem.js')) {
  setupLevelSystem()
    .then(() => destroyDiscordClient())
    .catch(console.error);
}

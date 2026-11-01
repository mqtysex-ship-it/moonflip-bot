import { fetchGuild, destroyDiscordClient } from './discord.js';
import { ChannelType, OverwriteType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

async function createGameChannels() {
  const guild = await fetchGuild('1566215806956601466');
  const verifiedRole = guild.roles.cache.find((r) => r.id === '1566221699697999884' || r.name.toLowerCase().includes('verified'));
  const adminRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'admin');

  const catName = '─── 🎰 ᴛᴏᴋᴇɴ ɢᴀᴍᴇs ───';

  // Check if category already exists
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catName.toLowerCase()
  );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  if (verifiedRole) {
    overwrites.push({
      id: verifiedRole.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  if (adminRole) {
    overwrites.push({
      id: adminRole.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  if (!category) {
    category = await guild.channels.create({
      name: catName,
      type: ChannelType.GuildCategory,
      position: 1, // Place right below INFORMATION
      permissionOverwrites: overwrites,
    });
    console.log('Created category:', category.name);
  } else {
    console.log('Category already exists:', category.name);
  }

  const games = [
    {
      name: '💣┃mines',
      topic: 'Virtual Mines game. Uncover gems and cash out before hitting a mine!',
      title: '💣  MINES (VIRTUAL)',
      desc: '> **Virtual Mines Game Room**\n> Pick your grid, uncover multipliers, and cash out before hitting a bomb!\n\n*Bot integration coming soon.*',
      color: 0xe74c3c,
    },
    {
      name: '📈┃crash',
      topic: 'Virtual Crash game. Watch the multiplier rise and cash out before the crash!',
      title: '📈  CRASH (VIRTUAL)',
      desc: '> **Virtual Crash Game Room**\n> Place your token bet, watch the rocket fly, and cash out before it crashes!\n\n*Bot integration coming soon.*',
      color: 0x2ecc71,
    },
    {
      name: '🎲┃keno',
      topic: 'Virtual Keno game. Pick your lucky numbers and hit big payout multipliers!',
      title: '🎲  KENO (VIRTUAL)',
      desc: '> **Virtual Keno Game Room**\n> Select your numbers, hit draws, and multiply your tokens!\n\n*Bot integration coming soon.*',
      color: 0x9b59b6,
    },
    {
      name: '🪙┃coinflip',
      topic: 'Virtual Coinflip. Fast-paced 50/50 token flips against other members or bot!',
      title: '🪙  COINFLIP (VIRTUAL)',
      desc: '> **Virtual Coinflip Game Room**\n> 50/50 PvP or PvE token battles. Call Heads or Tails!\n\n*Bot integration coming soon.*',
      color: 0xf1c40f,
    },
    {
      name: '🃏┃blackjack',
      topic: 'Virtual Blackjack. Hit, stand, double down, and beat the dealer to 21!',
      title: '🃏  BLACKJACK (VIRTUAL)',
      desc: '> **Virtual Blackjack Game Room**\n> Classic 21 card action against the house dealer.\n\n*Bot integration coming soon.*',
      color: 0x3498db,
    },
    {
      name: '🎰┃slots',
      topic: 'Virtual Slot machines. Spin the reels and match symbols for jackpot payouts!',
      title: '🎰  SLOTS (VIRTUAL)',
      desc: '> **Virtual Slots Game Room**\n> Classic 3-reel and 5-reel virtual slot machine spins.\n\n*Bot integration coming soon.*',
      color: 0xe67e22,
    },
  ];

  for (const game of games) {
    let ch = guild.channels.cache.find(
      (c) => c.parentId === category.id && c.name.toLowerCase() === game.name.toLowerCase()
    );

    if (!ch) {
      ch = await guild.channels.create({
        name: game.name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: game.topic,
        permissionOverwrites: overwrites,
      });
      console.log('Created channel:', ch.name);

      const embed = new EmbedBuilder()
        .setColor(game.color)
        .setTitle(game.title)
        .setDescription(game.desc)
        .setFooter({ text: 'Virtual Tokens Only • Fair Play • Entertainment' })
        .setTimestamp();

      await ch.send({ embeds: [embed] }).catch(() => {});
    } else {
      console.log('Channel already exists:', ch.name);
    }
  }

  console.log('All game channels created successfully!');
  await destroyDiscordClient();
}

createGameChannels().catch(console.error);

import { createHash } from 'node:crypto';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import {
  getUser,
  getBalance,
  adjustWallet,
  claimDaily,
  transferTokens,
  getLeaderboard,
} from '../games/economy.js';
import { getUserLevelData, LEVEL_TIERS } from '../games/levels.js';
import { setupTicketPanel } from '../tickets/ticketSystem.js';
import { createWebPlaySession, getPublicBaseUrl } from '../web/playApi.js';
import { showMinesLeaderboard } from '../games/minesGame.js';
import { showCrashLeaderboard } from '../games/crashLeaderboard.js';

export function getSlashCommandDefinitions() {
  return [
    // 1. /balance
    new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Check your current virtual token balance and wallet stats')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Check another member balance (optional)').setRequired(false)
      ),

    // 2. /daily
    new SlashCommandBuilder()
      .setName('daily')
      .setDescription('Claim your free +500 daily tokens (available every 24 hours)'),

    // 3. /leaderboard
    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('View the server leaderboards (Wealth, 5x5 Mines, or Orbital Crash)')
      .addStringOption((opt) =>
        opt
          .setName('game')
          .setDescription('Select leaderboard category')
          .setRequired(false)
          .addChoices(
            { name: '💰 Server Wealth (Token Balance)', value: 'wealth' },
            { name: '💣 5x5 Mines (Top Multipliers & Wins)', value: 'mines' },
            { name: '🚀 Orbital Crash (Top Multipliers & Flights)', value: 'crash' }
          )
      ),

    // 4. /pay
    new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Send virtual tokens to another member')
      .addUserOption((opt) => opt.setName('user').setDescription('The recipient member').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Amount of tokens to send').setMinValue(1).setRequired(true)
      ),

    // 6. /rank
    new SlashCommandBuilder()
      .setName('rank')
      .setDescription('View your current player level, XP progress, and tier prestige role')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Check another member rank (optional)').setRequired(false)
      ),

    // 7. /levels
    new SlashCommandBuilder()
      .setName('levels')
      .setDescription('View the highest leveled players on the server'),

    // 8. /addtokens (Admin / Owner Only)
    new SlashCommandBuilder()
      .setName('addtokens')
      .setDescription('👑 [ADMIN] Add virtual tokens to a member account')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((opt) => opt.setName('user').setDescription('Target member').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Amount of tokens to add').setMinValue(1).setRequired(true)
      ),

    // 9. /removetokens (Admin / Owner Only)
    new SlashCommandBuilder()
      .setName('removetokens')
      .setDescription('👑 [ADMIN] Deduct virtual tokens from a member account')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((opt) => opt.setName('user').setDescription('Target member').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Amount of tokens to deduct').setMinValue(1).setRequired(true)
      ),

    // 10. /setbalance (Admin / Owner Only)
    new SlashCommandBuilder()
      .setName('setbalance')
      .setDescription('👑 [ADMIN] Set a member exact token balance')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((opt) => opt.setName('user').setDescription('Target member').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Exact token balance to set').setMinValue(0).setRequired(true)
      ),

    // 11. /ticket-panel (Staff / Admin Only)
    new SlashCommandBuilder()
      .setName('ticket-panel')
      .setDescription('🎫 [STAFF] Deploy or refresh the 24/7 Moonflip Support & Ticket panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // 12. /play (Web Arena)
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('🎮 Launch the Moonflip Web Arena in your browser'),

    // 13. /crash (Orbital Crash)
    new SlashCommandBuilder()
      .setName('crash')
      .setDescription('🚀 Launch the real-time 60 FPS Orbital Crash Web Arena in your browser'),

    // 14. /plinko (Plinko Pyramid)
    new SlashCommandBuilder()
      .setName('plinko')
      .setDescription('🎯 Launch the Moonflip Plinko Pyramid Web Arena in your browser'),

    // 15. /coinflip (Coinflip)
    new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('🪙 Launch Moonflip Coinflip in the Web Arena'),

    // 16. /mines (5x5 Mines)
    new SlashCommandBuilder()
      .setName('mines')
      .setDescription('💣 Launch Moonflip Mines 5x5 in the Web Arena'),
  ];
}

const walletCommands = new Set(['addtokens', 'removetokens', 'setbalance']);

function canAdjustWallet(interaction) {
  return !!process.env.DISCORD_GUILD_ID && interaction.guildId === process.env.DISCORD_GUILD_ID
    && (process.env.WALLET_ADMIN_USER_IDS || '').split(',').some(id => id.trim() === interaction.user.id);
}

function walletOperationId(interactionId) {
  const hex = createHash('sha256').update('discord-wallet-adjust:' + interactionId).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function registerGuildSlashCommands(guild) {
  try {
    const definitions = getSlashCommandDefinitions().filter(command =>
      !walletCommands.has(command.name) || guild.id === process.env.DISCORD_GUILD_ID);
    await guild.commands.set(definitions);
    console.log(`[Slash Commands] Registered ${definitions.length} slash commands in guild: ${guild.name}`);
  } catch (err) {
    console.error('[Slash Commands Registration Error]', err.message);
  }
}

export function isStaffOrOwner(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

export async function handleChatInputCommand(interaction) {
  const { commandName } = interaction;

  // 1. /balance
  if (commandName === 'balance') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const stats = (await getUser(targetUser.id));

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`💰 ${targetUser.username}'s Wallet`)
      .setDescription(
        `> **Balance:** \`${stats.balance.toLocaleString()} tokens\`\n\n` +
        `• **Games Played:** \`${stats.gamesPlayed.toLocaleString()}\`\n` +
        `• **Total Wagered:** \`${stats.totalBet.toLocaleString()} tokens\``
      );

    return interaction.reply({ embeds: [embed] });
  }

  // 2. /daily
  if (commandName === 'daily') {
    const res = (await claimDaily(interaction.user.id));
    if (res.success) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎁 Daily Tokens Claimed')
        .setDescription(
          `> Added **+${res.amount.toLocaleString()} tokens** to your wallet.\n\n` +
          `• **New Balance:** \`${res.newBalance.toLocaleString()} tokens\``
        );
      return interaction.reply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('⏳ Daily Cooldown')
        .setDescription(
          `> You've already claimed your daily reward today.\n\n` +
          `• **Available in:** \`${res.remainingHours}h ${res.remainingMinutes}m\``
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }

  // 3. /leaderboard
  if (commandName === 'leaderboard') {
    const gameType = interaction.options.getString('game') || 'wealth';
    if (gameType === 'mines') {
      return await showMinesLeaderboard(interaction);
    }
    if (gameType === 'crash') {
      return await showCrashLeaderboard(interaction);
    }

    const top = (await getLeaderboard(10));

    let list = '';
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
      list += `${medal} <@${entry.userId}> — \`${entry.balance.toLocaleString()} tokens\`\n`;
    }

    if (!list) list = 'No players registered yet.';

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏆 Moonflip Wealth Leaderboard')
      .setDescription(list);

    return interaction.reply({ embeds: [embed] });
  }

  // 4. /pay
  if (commandName === 'pay') {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot send tokens to yourself.', flags: MessageFlags.Ephemeral });
    }

    if (targetUser.bot) {
      return interaction.reply({ content: 'You cannot send tokens to a bot account.', flags: MessageFlags.Ephemeral });
    }

    const res = (await transferTokens(interaction.user.id, targetUser.id, amount));
    if (!res.success) {
      return interaction.reply({ content: `Transfer failed: ${res.error}`, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('💸 Transfer Successful')
      .setDescription(
        `> <@${interaction.user.id}> sent **${amount.toLocaleString()} tokens** to <@${targetUser.id}>.\n\n` +
        `• **Your Balance:** \`${res.senderBalance.toLocaleString()} tokens\`\n` +
        `• **Recipient Balance:** \`${res.receiverBalance.toLocaleString()} tokens\``
      );

    return interaction.reply({ embeds: [embed] });
  }

  // 6. /rank
  if (commandName === 'rank') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const lvlData = (await getUserLevelData(targetUser.id));

    let currentTier = 'Novice Player';
    let tierColor = 0x3498db;
    for (const t of LEVEL_TIERS) {
      if (lvlData.level >= t.level) {
        currentTier = t.roleName;
        tierColor = parseInt(t.color.replace('#', ''), 16);
        break;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(tierColor)
      .setTitle(`${targetUser.username} — Level ${lvlData.level}`)
      .setDescription(
        `• Tier: **${currentTier}**\n` +
        `• XP: **${lvlData.xp.toLocaleString()} / ${lvlData.requiredXp.toLocaleString()}** (${lvlData.progressPercent}%)`
      );

    return interaction.reply({ embeds: [embed] });
  }

  // 7. /levels
  if (commandName === 'levels') {
    const rawUsers = (await getLeaderboard(50));
    const sortedByLvl = rawUsers
      .map((u) => ({ ...u, xp: u.xp ?? 0, level: u.level ?? 1 }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, 10);

    let list = '';
    for (let i = 0; i < sortedByLvl.length; i++) {
      const entry = sortedByLvl[i];
      list += `${i + 1}. <@${entry.userId}> — **Level ${entry.level}** (${entry.xp.toLocaleString()} XP)\n`;
    }

    if (!list) list = 'No players ranked yet.';

    const embed = new EmbedBuilder()
      .setColor(0x8a2be2)
      .setTitle('Level Leaderboard')
      .setDescription(list);

    return interaction.reply({ embeds: [embed] });
  }

  // 8. /addtokens (Admin Only)
  if (commandName === 'addtokens') {
    if (!canAdjustWallet(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: This command requires wallet administration access.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const { balance: newBal } = await adjustWallet(targetUser.id, 'add', amount, walletOperationId(interaction.id));

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🛡️ Tokens Granted')
      .setDescription(
        `> Admin credited tokens to <@${targetUser.id}>.\n\n` +
        `• **Member:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
        `• **Amount:** \`+${amount.toLocaleString()} 🪙\`\n` +
        `• **New Balance:** \`${newBal.toLocaleString()} 🪙\`\n` +
        `• **Authorized By:** <@${interaction.user.id}>`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 7. /removetokens (Admin Only)
  if (commandName === 'removetokens') {
    if (!canAdjustWallet(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: This command requires wallet administration access.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const { balance: newBal, previousBalance: prevBal } = await adjustWallet(targetUser.id, 'deduct', amount, walletOperationId(interaction.id));

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🛡️ Tokens Deducted')
      .setDescription(
        `> Admin deducted tokens from <@${targetUser.id}>.\n\n` +
        `• **Member:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
        `• **Deducted:** \`-${(prevBal - newBal).toLocaleString()} 🪙\`\n` +
        `• **New Balance:** \`${newBal.toLocaleString()} 🪙\`\n` +
        `• **Authorized By:** <@${interaction.user.id}>`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 8. /setbalance (Admin Only)
  if (commandName === 'setbalance') {
    if (!canAdjustWallet(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: This command requires wallet administration access.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const { balance: newBal, previousBalance: prevBal } = await adjustWallet(targetUser.id, 'set', amount, walletOperationId(interaction.id));

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🛡️ Balance Overwrite')
      .setDescription(
        `> Admin updated token balance for <@${targetUser.id}>.\n\n` +
        `• **Member:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
        `• **Previous:** \`${prevBal.toLocaleString()} 🪙\`\n` +
        `• **New Balance:** \`${newBal.toLocaleString()} 🪙\`\n` +
        `• **Authorized By:** <@${interaction.user.id}>`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 9. /ticket-panel (Staff Only)
  if (commandName === 'ticket-panel') {
    if (!isStaffOrOwner(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: Only Staff Members or Admins can deploy the ticket panel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { panelCh } = await setupTicketPanel(interaction.guild);
      return interaction.editReply({
        content: `✅ **Support Ticket Panel Deployed!** Check <#${panelCh.id}>.`,
      });
    } catch (err) {
      return interaction.editReply({
        content: `⚠️ Failed to deploy ticket panel: ${err.message}`,
      });
    }
  }

  // 12. /play, /crash, /plinko, /coinflip & /mines (Web Arena)
  if (
    commandName === 'play' ||
    commandName === 'crash' ||
    commandName === 'plinko' ||
    commandName === 'coinflip' ||
    commandName === 'mines'
  ) {
    const isCrash = commandName === 'crash';
    const isPlinko = commandName === 'plinko';
    const isCoinflip = commandName === 'coinflip';
    const isMines = commandName === 'mines';
    const token = (await createWebPlaySession(interaction.user));
    const baseUrl = getPublicBaseUrl(interaction);
    const homeUrl = `${baseUrl}/play#token=${token}`;
    const crashUrl = `${baseUrl}/play?game=crash#token=${token}`;
    const minesUrl = `${baseUrl}/play?game=mines#token=${token}`;
    const plinkoUrl = `${baseUrl}/play?game=plinko#token=${token}`;
    const coinflipUrl = `${baseUrl}/play?game=coinflip#token=${token}`;
    const balance = await getBalance(interaction.user.id);

    const gameTitle = isPlinko
      ? 'Plinko'
      : isCrash
      ? 'Crash'
      : isCoinflip
      ? 'Coinflip'
      : isMines
      ? 'Mines'
      : 'Web Arena';

    const embed = new EmbedBuilder()
      .setColor(isPlinko ? 0x2ecc71 : isCrash ? 0xff9900 : isCoinflip ? 0xf1c40f : 0x00f0ff)
      .setTitle(`🎮 ${gameTitle} Session Ready`)
      .setDescription(
        `> Your secure session is ready.\n\n` +
        `• **Balance:** \`${balance.toLocaleString()} tokens\`\n\n` +
        `-# Click a button below to launch in your browser.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Arena')
        .setEmoji('🌐')
        .setStyle(ButtonStyle.Link)
        .setURL(homeUrl),
      new ButtonBuilder()
        .setLabel('Plinko')
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Link)
        .setURL(plinkoUrl),
      new ButtonBuilder()
        .setLabel('Mines')
        .setEmoji('💣')
        .setStyle(ButtonStyle.Link)
        .setURL(minesUrl),
      new ButtonBuilder()
        .setLabel('Crash')
        .setEmoji('🚀')
        .setStyle(ButtonStyle.Link)
        .setURL(crashUrl),
      new ButtonBuilder()
        .setLabel('Coinflip')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Link)
        .setURL(coinflipUrl)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }
}

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import {
  getUser,
  getBalance,
  addTokens,
  setBalance,
  claimDaily,
  transferTokens,
  getLeaderboard,
} from '../games/economy.js';
import { getUserLevelData, LEVEL_TIERS } from '../games/levels.js';
import { setupTicketPanel } from '../tickets/ticketSystem.js';

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
      .setDescription('View the top richest token players on the server'),

    // 4. /pay
    new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Send virtual tokens to another member')
      .addUserOption((opt) => opt.setName('user').setDescription('The recipient member').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Amount of tokens to send').setMinValue(1).setRequired(true)
      ),

    // 5. /deposit-test
    new SlashCommandBuilder()
      .setName('deposit-test')
      .setDescription('Simulate a credit/token test deposit into your wallet')
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Amount of test tokens to credit (e.g. 500, 1000, 5000)').setMinValue(10).setRequired(true)
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
  ];
}

export async function registerGuildSlashCommands(guild) {
  try {
    const definitions = getSlashCommandDefinitions();
    await guild.commands.set(definitions);
    console.log(`[Slash Commands] Registered ${definitions.length} slash commands in guild: ${guild.name}`);
  } catch (err) {
    console.error('[Slash Commands Registration Error]', err.message);
  }
}

export function isStaffOrOwner(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.member?.roles?.cache?.some((r) => r.name.toLowerCase() === 'admin')) return true;
  return false;
}

export async function handleChatInputCommand(interaction) {
  const { commandName } = interaction;

  // 1. /balance
  if (commandName === 'balance') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const stats = getUser(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`💳  ${targetUser.username}'s Token Wallet`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        `> **Account Overview & Virtual Balance**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🪙 **Current Balance**: \`${stats.balance.toLocaleString()} 🪙\`\n` +
        `🎲 **Games Played**: \`${stats.gamesPlayed.toLocaleString()}\`\n` +
        `📉 **Total Wagered**: \`${stats.totalBet.toLocaleString()} 🪙\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Play token games in <#1566223405789741108> or claim daily rewards.*`
      )
      .setFooter({ text: 'Virtual Tokens • Provably Fair Economy' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 2. /daily
  if (commandName === 'daily') {
    const res = claimDaily(interaction.user.id);
    if (res.success) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🎁  DAILY TOKENS CLAIMED!')
        .setDescription(
          `> You received your daily allowance of **+${res.amount.toLocaleString()} 🪙**!\n\n` +
          `💳 **New Balance**: \`${res.newBalance.toLocaleString()} 🪙\`\n` +
          `⏰ **Next Claim**: Available in 24 hours.`
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('⏳  DAILY REWARD COOLDOWN')
        .setDescription(
          `> You have already claimed your daily reward today!\n\n` +
          `⏰ **Cooldown Remaining**: **${res.remainingHours} hours and ${res.remainingMinutes} minutes**.`
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // 3. /leaderboard
  if (commandName === 'leaderboard') {
    const top = getLeaderboard(10);
    const badges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    let list = '';
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const badge = badges[i] || `[${i + 1}]`;
      list += `${badge} <@${entry.userId}> — **\`${entry.balance.toLocaleString()} 🪙\`** *(Played: ${entry.gamesPlayed})*\n`;
    }

    if (!list) list = '*No players have registered yet.*';

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏆  SERVER WEALTH LEADERBOARD')
      .setDescription(
        `> **Top 10 Richest Token Holders on the Server**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${list}` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: 'Updated Real-Time • Virtual Token Rankings' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 4. /pay
  if (commandName === 'pay') {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot send tokens to yourself!', ephemeral: true });
    }

    if (targetUser.bot) {
      return interaction.reply({ content: '❌ You cannot send tokens to a bot account!', ephemeral: true });
    }

    const res = transferTokens(interaction.user.id, targetUser.id, amount);
    if (!res.success) {
      return interaction.reply({ content: `❌ Transfer failed: ${res.error}`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💸  TOKEN TRANSFER SUCCESSFUL')
      .setDescription(
        `> <@${interaction.user.id}> successfully sent **${amount.toLocaleString()} 🪙** to <@${targetUser.id}>!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💳 **Sender Balance**: \`${res.senderBalance.toLocaleString()} 🪙\`\n` +
        `📥 **Recipient Balance**: \`${res.receiverBalance.toLocaleString()} 🪙\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 5. /deposit-test
  if (commandName === 'deposit-test') {
    const amount = interaction.options.getInteger('amount');
    const newBal = addTokens(interaction.user.id, amount);
    const receiptId = Math.random().toString(36).substring(2, 9).toUpperCase();

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💳  TEST DEPOSIT CREDITED')
      .setDescription(
        `> **Simulated Credit Deposit Successful!**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🪙 **Tokens Added**: \`+${amount.toLocaleString()} 🪙\`\n` +
        `💳 **Total Balance**: \`${newBal.toLocaleString()} 🪙\`\n` +
        `🧾 **Receipt ID**: \`#DEP-${receiptId}\`\n` +
        `⚡ **Status**: \`Completed (Simulated / Test)\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*This was a simulation deposit for testing token economy flows.*`
      )
      .setFooter({ text: 'Test Deposit Engine • Instant Settlement' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 6. /rank
  if (commandName === 'rank') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const lvlData = getUserLevelData(targetUser.id);

    let currentTier = 'Novice Player';
    let tierColor = 0x3498db;
    for (const t of LEVEL_TIERS) {
      if (lvlData.level >= t.level) {
        currentTier = t.roleName;
        tierColor = parseInt(t.color.replace('#', ''), 16);
        break;
      }
    }

    const totalBlocks = 12;
    const filledBlocks = Math.round((lvlData.progressPercent / 100) * totalBlocks);
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(totalBlocks - filledBlocks);

    const embed = new EmbedBuilder()
      .setColor(tierColor)
      .setTitle(`🏆  ${targetUser.username}'s Player Rank`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        `> **Prestige Tier**: **\`${currentTier}\`**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⭐ **Current Level**: \`Level ${lvlData.level}\`\n` +
        `📈 **Experience**: \`${lvlData.xp.toLocaleString()} / ${lvlData.requiredXp.toLocaleString()} XP\` (\`${lvlData.progressPercent}%\`)\n` +
        `📊 **Progress Bar**: \`[${bar}]\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Chat in community channels or play token games to earn XP and level rewards!*`
      )
      .setFooter({ text: 'Level Rewards • Automatic Tier Promotion' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 7. /levels
  if (commandName === 'levels') {
    const rawUsers = getLeaderboard(50);
    const sortedByLvl = rawUsers
      .map((u) => ({ ...u, ...getUserLevelData(u.userId) }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, 10);

    const badges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    let list = '';
    for (let i = 0; i < sortedByLvl.length; i++) {
      const entry = sortedByLvl[i];
      const badge = badges[i] || `[${i + 1}]`;
      list += `${badge} <@${entry.userId}> — **Level \`${entry.level}\`** *(${entry.xp.toLocaleString()} XP)*\n`;
    }

    if (!list) list = '*No players ranked yet.*';

    const embed = new EmbedBuilder()
      .setColor(0x8a2be2)
      .setTitle('🌟  SERVER LEVEL LEADERBOARD')
      .setDescription(
        `> **Top 10 Highest Level Players on the Server**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${list}` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 8. /addtokens (Admin Only)
  if (commandName === 'addtokens') {
    if (!isStaffOrOwner(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: Only the Server Owner or Admins can add tokens.',
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const prevBal = getBalance(targetUser.id);
    const newBal = addTokens(targetUser.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('👑  ADMIN TOKEN CREDIT')
      .setDescription(
        `> **Admin Granted Tokens Successfully**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 **Member**: <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
        `🪙 **Added**: \`+${amount.toLocaleString()} 🪙\`\n` +
        `📊 **Balance Shift**: \`${prevBal.toLocaleString()} 🪙\` ➔ \`${newBal.toLocaleString()} 🪙\`\n` +
        `🛡️ **Authorized By**: <@${interaction.user.id}>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 7. /removetokens (Admin Only)
  if (commandName === 'removetokens') {
    if (!isStaffOrOwner(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: Only the Server Owner or Admins can remove tokens.',
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const user = getUser(targetUser.id);
    const prevBal = user.balance;
    user.balance = Math.max(0, user.balance - amount);
    const newBal = user.balance;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('👑  ADMIN TOKEN DEDUCTION')
      .setDescription(
        `> **Tokens Deducted by Administration**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 **Member**: <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
        `🪙 **Deducted**: \`-${amount.toLocaleString()} 🪙\`\n` +
        `📊 **Balance Shift**: \`${prevBal.toLocaleString()} 🪙\` ➔ \`${newBal.toLocaleString()} 🪙\`\n` +
        `🛡️ **Authorized By**: <@${interaction.user.id}>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 8. /setbalance (Admin Only)
  if (commandName === 'setbalance') {
    if (!isStaffOrOwner(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: Only the Server Owner or Admins can set balances.',
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const prevBal = getBalance(targetUser.id);
    const newBal = setBalance(targetUser.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('👑  ADMIN BALANCE OVERRIDE')
      .setDescription(
        `> **Token Balance Overwritten**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 **Member**: <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
        `📊 **Previous Balance**: \`${prevBal.toLocaleString()} 🪙\`\n` +
        `💳 **New Set Balance**: \`${newBal.toLocaleString()} 🪙\`\n` +
        `🛡️ **Authorized By**: <@${interaction.user.id}>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // 9. /ticket-panel (Staff Only)
  if (commandName === 'ticket-panel') {
    if (!isStaffOrOwner(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: Only Staff Members or Admins can deploy the ticket panel.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
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
}

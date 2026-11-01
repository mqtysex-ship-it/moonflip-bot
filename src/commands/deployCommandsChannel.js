import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { fetchGuild, destroyDiscordClient } from '../discord.js';
import { registerGuildSlashCommands } from './slashCommands.js';

export async function deployCommandsChannel(guildId = '1566215806956601466') {
  const guild = await fetchGuild(guildId);

  // Register slash commands first
  await registerGuildSlashCommands(guild);

  const cmdChannel = guild.channels.cache.find((c) => c.name.includes('commands'));
  if (!cmdChannel) {
    console.error('Commands channel not found!');
    return;
  }

  // Purge old messages
  const msgs = await cmdChannel.messages.fetch({ limit: 10 }).catch(() => []);
  for (const [, m] of msgs) {
    await m.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🤖  TOKEN COMMANDS & WALLET DASHBOARD')
    .setDescription(
      `> Welcome to the **Official Command Center**!\n` +
      `> Check your token balance, claim your daily rewards, send tokens to friends, or test simulated deposits.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 💬 Member Commands:\n` +
      `✦ \`/balance [user]\` — View your or another member's token wallet & stats\n` +
      `✦ \`/rank [user]\` — View your player level, XP progress, and prestige tier\n` +
      `✦ \`/daily\` — Claim **+500 free tokens** every 24 hours\n` +
      `✦ \`/leaderboard\` — View the top 10 richest token holders on the server\n` +
      `✦ \`/levels\` — View the highest level players on the server\n` +
      `✦ \`/pay <user> <amount>\` — Transfer virtual tokens to another member\n` +
      `✦ \`/deposit-test <amount>\` — Simulate a credit deposit into your wallet\n\n` +
      `### 👑 Owner & Admin Commands:\n` +
      `✦ \`/addtokens <user> <amount>\` — **Credit tokens** directly to any member\n` +
      `✦ \`/removetokens <user> <amount>\` — Deduct tokens from any member\n` +
      `✦ \`/setbalance <user> <amount>\` — Overwrite a member's exact token balance\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*You can also click the quick-action buttons below for instant access!*`
    )
    .setFooter({
      text: 'Virtual Token Economy • Fast & Automated',
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('eco_rank_btn').setLabel('🎖️ My Rank').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco_daily').setLabel('🎁 Daily (+500)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('eco_leaderboard_btn').setLabel('🏆 Top Wealth').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco_test_deposit_1000').setLabel('💳 Test Deposit').setStyle(ButtonStyle.Success)
  );

  await cmdChannel.send({ embeds: [embed], components: [row] });
  console.log(`Deployed Command Center in #${cmdChannel.name}!`);
}

if (process.argv[1] && process.argv[1].endsWith('deployCommandsChannel.js')) {
  deployCommandsChannel()
    .then(() => destroyDiscordClient())
    .catch(console.error);
}

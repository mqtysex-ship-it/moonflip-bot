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
    .setColor(0x5865f2)
    .setTitle('🤖 Moonflip Bot Commands')
    .setDescription(
      `> Use slash commands or the quick-action buttons below.\n\n` +
      `**🎮 Games**\n` +
      `• \`/play\` · \`/plinko\` · \`/crash\` · \`/coinflip\` · \`/mines\` — Launch the WebApp\n\n` +
      `**💰 Wallet & Economy**\n` +
      `• \`/balance [user]\` — Check your tokens & stats\n` +
      `• \`/daily\` — Claim free daily tokens (every 24h)\n` +
      `• \`/pay <user> <amount>\` — Send tokens to a friend\n\n` +
      `**📊 Progression**\n` +
      `• \`/rank [user]\` · \`/levels\` — View rank & XP progress\n` +
      `• \`/leaderboard\` — View top players\n\n` +
      `-# Tap any button below for instant access.`
    )
    .setFooter({
      text: 'Moonflip Commands',
      iconURL: guild.iconURL() || undefined,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_balance').setLabel('Balance').setEmoji('💰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('eco_daily').setLabel('Daily (+500)').setEmoji('🎁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('eco_leaderboard_btn').setLabel('Leaderboard').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco_rank_btn').setLabel('My Rank').setEmoji('🎖️').setStyle(ButtonStyle.Secondary)
  );

  await cmdChannel.send({ embeds: [embed], components: [row] });
  console.log(`Deployed Command Center in #${cmdChannel.name}!`);
}

if (process.argv[1] && process.argv[1].endsWith('deployCommandsChannel.js')) {
  deployCommandsChannel()
    .then(() => destroyDiscordClient())
    .catch(console.error);
}

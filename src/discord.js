import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBalance, claimDaily, addTokens, getLeaderboard } from './games/economy.js';
import { addXp, getUserLevelData, LEVEL_TIERS } from './games/levels.js';
import { start5x5Mines, handle5x5MinesInteraction, showMinesSetupModal } from './games/minesGame.js';
import { continuousCrash, showCrashModal } from './games/continuousCrash.js';
import { playModernKeno, showKenoModal } from './games/kenoGame.js';
import { playSlots, showSlotsModal } from './games/slotsGame.js';
import { playCoinflip, showCoinflipModal } from './games/coinflipGame.js';
import { startBlackjack, handleBlackjackButton } from './games/blackjackGame.js';
import { registerGuildSlashCommands, handleChatInputCommand } from './commands/slashCommands.js';
import { handleTicketInteraction } from './tickets/ticketSystem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded quietly from the project root if token not already set
if (!process.env.DISCORD_BOT_TOKEN) {
  dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
}

let discordClient = null;
let loginPromise = null;

/**
 * Returns a connected Discord.js Client instance.
 * Reuses existing connection across tool calls.
 */
export async function getDiscordClient() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not configured in .env or environment variables.');
  }

  if (discordClient && discordClient.isReady()) {
    return discordClient;
  }

  if (loginPromise) {
    return loginPromise;
  }

  loginPromise = new Promise((resolve, reject) => {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
      ],
    });

    client.once('clientReady', async (c) => {
      console.error(`[Discord MCP] Logged in as ${c.user.tag} (${c.user.id})`);
      discordClient = c;
      resolve(c);

      // Auto-register slash commands & start continuous crash for each guild
      try {
        const guilds = await c.guilds.fetch();
        for (const [id, baseGuild] of guilds) {
          const g = await baseGuild.fetch();
          await registerGuildSlashCommands(g);
          continuousCrash.start(g).catch((err) => console.error('[Continuous Crash Start Error]', err.message));
        }
      } catch (err) {
        console.error('[Slash Command Auto-Register Error]', err.message);
      }
    });

    client.on('error', (err) => {
      console.error('[Discord MCP Client Error]', err.message);
    });

    // Interactive interaction listener (Slash commands & Buttons)
    client.on('interactionCreate', async (interaction) => {
      // 1. Handle Slash Commands (/balance, /daily, /pay, /addtokens, etc.)
      if (interaction.isChatInputCommand()) {
        try {
          return await handleChatInputCommand(interaction);
        } catch (err) {
          console.error('[Slash Command Exec Error]', err.message);
          const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
          return interaction[replyFn]({
            content: `⚠️ Command failed: ${err.message}`,
            ephemeral: true,
          }).catch(() => {});
        }
      }

      // 2. Handle Modal Submissions (5x5 Mines, Continuous Crash, Keno)
      if (interaction.isModalSubmit()) {
        try {
          if (interaction.customId === 'mines_custom_modal') {
            return await handle5x5MinesInteraction(interaction);
          }
          if (interaction.customId === 'crash_custom_modal') {
            const raw = interaction.fields.getTextInputValue('crash_bet_input');
            const amt = Math.max(10, parseInt(raw.replace(/[^0-9]/g, ''), 10) || 100);
            return continuousCrash.handleBet(interaction, amt);
          }
          if (interaction.customId === 'keno_custom_modal') {
            const betRaw = interaction.fields.getTextInputValue('keno_bet_input');
            const numRaw = interaction.fields.getTextInputValue('keno_numbers_input');
            const bet = Math.max(10, parseInt(betRaw.replace(/[^0-9]/g, ''), 10) || 100);
            const nums = numRaw
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n) && n >= 1 && n <= 20);
            return await playModernKeno(interaction, bet, nums);
          }
          if (interaction.customId === 'coinflip_custom_modal') {
            const sideRaw = interaction.fields.getTextInputValue('coinflip_side_input') || 'heads';
            const betRaw = interaction.fields.getTextInputValue('coinflip_bet_input') || '100';
            const side = sideRaw.trim().toLowerCase().startsWith('t') ? 'tails' : 'heads';
            const bet = Math.max(10, parseInt(betRaw.replace(/[^0-9]/g, ''), 10) || 100);
            return await playCoinflip(interaction, side, bet);
          }
          if (interaction.customId === 'slots_custom_modal') {
            const betRaw = interaction.fields.getTextInputValue('slots_bet_input') || '100';
            const bet = Math.max(10, parseInt(betRaw.replace(/[^0-9]/g, ''), 10) || 100);
            return await playSlots(interaction, bet);
          }
        } catch (err) {
          console.error('[Modal Submit Error]', err.message);
          const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
          return interaction[replyFn]({
            content: `⚠️ Modal error: ${err.message}`,
            ephemeral: true,
          }).catch(() => {});
        }
      }

      if (!interaction.isButton()) return;
      const id = interaction.customId;

      try {
        // Tickets System interactions
        if (id.startsWith('ticket_')) {
          return await handleTicketInteraction(interaction);
        }

        // Leaderboard Button
        if (id === 'eco_leaderboard_btn') {
          const top = getLeaderboard(10);
          const badges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
          let list = '';
          for (let i = 0; i < top.length; i++) {
            const entry = top[i];
            const badge = badges[i] || `[${i + 1}]`;
            list += `${badge} <@${entry.userId}> — **\`${entry.balance.toLocaleString()} 🪙\`** *(Played: ${entry.gamesPlayed})*\n`;
          }
          if (!list) list = '*No players yet.*';

          const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('🏆  SERVER WEALTH LEADERBOARD')
            .setDescription(`> **Top 10 Richest Token Holders**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${list}━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
            .setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Test Deposit (+1,000)
        if (id === 'eco_test_deposit_1000') {
          const amount = 1000;
          const newBal = addTokens(interaction.user.id, amount);
          const receiptId = Math.random().toString(36).substring(2, 9).toUpperCase();

          const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('💳  SIMULATED DEPOSIT CREDITED')
            .setDescription(
              `> **+${amount.toLocaleString()} 🪙 Test Credits Deposited!**\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `💳 **New Balance**: \`${newBal.toLocaleString()} 🪙\`\n` +
              `🧾 **Receipt ID**: \`#DEP-${receiptId}\`\n` +
              `⚡ **Status**: \`Completed (Instant Simulation)\`\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `*Test deposit credited to your wallet.*`
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Verification
        if (id === 'verify_button') {
          const verifiedRole = interaction.guild?.roles.cache.find(
            (r) => r.name.toLowerCase() === 'verified'
          );
          if (!verifiedRole) {
            return interaction.reply({
              content: '⚠️ The Verified role was not found in this server.',
              ephemeral: true,
            });
          }
          await interaction.member.roles.add(verifiedRole);
          return interaction.reply({
            content: '🎉 **You have been successfully verified!** Welcome to the community — all channels, token games, and voice rooms are now unlocked for you.',
            ephemeral: true,
          });
        }

        // Wallet & Daily
        if (id === 'eco_balance') {
          const bal = getBalance(interaction.user.id);
          return interaction.reply({
            content: `💳 **Wallet Balance**: \`${bal.toLocaleString()} 🪙\`\n> Need more? Use the **🎁 Daily (+500)** button to claim free tokens every 24 hours!`,
            ephemeral: true,
          });
        }

        if (id === 'eco_rank_btn') {
          const lvlData = getUserLevelData(interaction.user.id);
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
            .setTitle(`🏆  ${interaction.user.username}'s Player Rank`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setDescription(
              `> **Prestige Tier**: **\`${currentTier}\`**\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `⭐ **Current Level**: \`Level ${lvlData.level}\`\n` +
              `📈 **Experience**: \`${lvlData.xp.toLocaleString()} / ${lvlData.requiredXp.toLocaleString()} XP\` (\`${lvlData.progressPercent}%\`)\n` +
              `📊 **Progress Bar**: \`[${bar}]\`\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `*Earn XP by chatting in community channels or playing token games!*`
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (id === 'eco_daily') {
          const res = claimDaily(interaction.user.id);
          if (res.success) {
            return interaction.reply({
              content: `🎁 **Daily Reward Claimed!** You received **+${res.amount} 🪙**!\n💳 **New Balance**: \`${res.newBalance.toLocaleString()} 🪙\``,
              ephemeral: true,
            });
          } else {
            return interaction.reply({
              content: `⏳ **Daily Cooldown**: You already claimed your daily tokens! Please wait **${res.remainingHours}h ${res.remainingMinutes}m** before claiming again.`,
              ephemeral: true,
            });
          }
        }

        // 5x5 Mines Game
        if (
          id.startsWith('start_m5_') ||
          id.startsWith('m5_tile_') ||
          id === 'm5_cashout' ||
          id === 'mines_setup_modal'
        ) {
          return await handle5x5MinesInteraction(interaction);
        }
        if (id === 'start_mines_100') return await start5x5Mines(interaction, 100, 3);
        if (id === 'start_mines_500') return await start5x5Mines(interaction, 500, 5);

        // Continuous Crash Game
        if (id.startsWith('crash_bet_')) {
          const amount = parseInt(id.replace('crash_bet_', ''), 10) || 100;
          return await continuousCrash.handleBet(interaction, amount);
        }
        if (id === 'crash_live_cashout') {
          return await continuousCrash.handleCashout(interaction);
        }
        if (id === 'crash_modal_btn') {
          return await showCrashModal(interaction);
        }

        // Modern 20-Ball Keno
        if (
          id.startsWith('keno_play_') ||
          id.startsWith('keno_replay_') ||
          id.startsWith('keno_quick_') ||
          id.startsWith('start_keno_')
        ) {
          const parts = id.split('_');
          let bet = 100;
          let picks = 5;
          if (parts.length >= 4) {
            picks = parseInt(parts[2], 10) || 5;
            bet = parseInt(parts[3], 10) || 100;
          } else {
            bet = parseInt(parts[parts.length - 1], 10) || 100;
          }
          return await playModernKeno(interaction, bet, picks);
        }
        if (id === 'keno_modal_btn') {
          return await showKenoModal(interaction);
        }

        // Slots Game
        if (id.startsWith('slots_spin_')) {
          const bet = parseInt(id.replace('slots_spin_', ''), 10) || 100;
          return await playSlots(interaction, bet);
        }

        // Coinflip Game
        if (id.startsWith('flip_heads_')) {
          const bet = parseInt(id.replace('flip_heads_', ''), 10) || 100;
          return await playCoinflip(interaction, 'heads', bet);
        }
        if (id.startsWith('flip_tails_')) {
          const bet = parseInt(id.replace('flip_tails_', ''), 10) || 100;
          return await playCoinflip(interaction, 'tails', bet);
        }

        // Blackjack Game
        if (id === 'start_bj_100') return await startBlackjack(interaction, 100);
        if (id === 'start_bj_500') return await startBlackjack(interaction, 500);
        if (id === 'bj_hit' || id === 'bj_stand') return await handleBlackjackButton(interaction);

      } catch (err) {
        if (err.code === 10062) return; // Interaction expired / unknown, ignore safely
        console.error('[Button Interaction Error]', err.message);
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({
            content: `⚠️ Action failed: ${err.message}`,
            ephemeral: true,
          }).catch(() => {});
        }
      }
    });

    // Chat activity XP & Level-Up Listener
    const xpCooldowns = new Map();

    client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;

      const userId = message.author.id;
      const now = Date.now();
      const lastXp = xpCooldowns.get(userId) || 0;

      if (now - lastXp < 45000) return; // 45s cooldown per user
      xpCooldowns.set(userId, now);

      const xpGained = Math.floor(Math.random() * 11) + 15; // 15-25 XP
      const result = addXp(userId, xpGained);

      if (result.leveledUp) {
        const lvlChannel = message.guild.channels.cache.find((c) =>
          c.name.includes('level-ups')
        );
        if (lvlChannel) {
          const tierText = result.rewardedTier
            ? `👑 **NEW PRESTIGE TIER UNLOCKED: @${result.rewardedTier.roleName}!**\n`
            : '';
          const embed = new EmbedBuilder()
            .setColor(
              result.rewardedTier
                ? parseInt(result.rewardedTier.color.replace('#', ''), 16)
                : 0x2ecc71
            )
            .setTitle('🆙  LEVEL UP CELEBRATION!')
            .setDescription(
              `> GG <@${userId}>! You advanced to **Level ${result.newLevel}**!\n\n` +
              tierText +
              `🪙 **Token Reward**: \`+${result.tokenBonus.toLocaleString()} 🪙\` credited to your wallet!\n` +
              `⭐ **Next Level Target**: \`${result.requiredXp} XP\``
            )
            .setThumbnail(message.author.displayAvatarURL())
            .setTimestamp();

          await lvlChannel
            .send({ content: `<@${userId}>`, embeds: [embed] })
            .catch(() => {});
        }

        // Auto-assign tier role if reached
        if (result.rewardedTier) {
          const tierRole = message.guild.roles.cache.find(
            (r) => r.name.toLowerCase() === result.rewardedTier.roleName.toLowerCase()
          );
          if (tierRole) {
            await message.member?.roles?.add(tierRole).catch(() => {});
          }
        }
      }
    });

    client.login(token).catch((err) => {
      loginPromise = null;
      reject(new Error(`Failed to log into Discord: ${err.message}`));
    });
  });

  return loginPromise;
}

/**
 * Destroys Discord client session if active.
 */
export async function destroyDiscordClient() {
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch {
      // Ignore cleanup error
    }
    discordClient = null;
    loginPromise = null;
  }
}

/**
 * Generates an OAuth2 invite link for the bot with Administrator permissions.
 */
export function getBotInviteUrl(clientId) {
  if (!clientId && discordClient?.user?.id) {
    clientId = discordClient.user.id;
  }
  if (!clientId) return null;
  // Permissions 8 = Administrator (can manage channels, roles, categories)
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&integration_type=0&scope=bot`;
}

/**
 * Fetches a Guild by ID and pre-populates roles and channels caches.
 */
export async function fetchGuild(guildId) {
  const client = await getDiscordClient();
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new Error(`Guild with ID "${guildId}" was not found. Verify the bot has been invited to this server.`);
  }

  // Pre-fetch channels and roles to ensure cache is populated
  await Promise.all([
    guild.channels.fetch().catch(() => {}),
    guild.roles.fetch().catch(() => {}),
  ]);

  return guild;
}

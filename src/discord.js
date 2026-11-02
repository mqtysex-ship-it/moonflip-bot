import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBalance, claimDaily, addTokens, getLeaderboard } from './games/economy.js';
import { addXp, getUserLevelData, LEVEL_TIERS } from './games/levels.js';
import { start5x5Mines, handle5x5MinesInteraction, showMinesSetupModal, showMinesLeaderboard } from './games/minesGame.js';
import { continuousCrash, showCrashModal } from './games/continuousCrash.js';
import { showCrashLeaderboard } from './games/crashLeaderboard.js';
import { playModernKeno, showKenoModal, handleKenoInteraction } from './games/kenoGame.js';
import { playSlots, showSlotsModal } from './games/slotsGame.js';
import { playCoinflip, showCoinflipModal } from './games/coinflipGame.js';
import { startBlackjack, handleBlackjackButton, showBlackjackModal } from './games/blackjackGame.js';
import { registerGuildSlashCommands, handleChatInputCommand } from './commands/slashCommands.js';
import { handleTicketInteraction } from './tickets/ticketSystem.js';
import { handleRulesInteraction } from './rulesSystem.js';
import { createWebPlaySession, getPublicBaseUrl } from './web/playApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded quietly from the project root if token not already set
if (!process.env.DISCORD_BOT_TOKEN && !process.env.DISCORD_TOKEN) {
  dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
}

let discordClient = null;
let loginPromise = null;

/**
 * Returns a connected Discord.js Client instance.
 * Reuses existing connection across tool calls.
 */
export async function getDiscordClient() {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN (or DISCORD_TOKEN) is not configured in .env or environment variables.');
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
        GatewayIntentBits.GuildMessages,
      ],
      rest: {
        timeout: 15000,
        retries: 2,
      },
    });

    client.once('clientReady', async (c) => {
      console.error(`[Discord MCP] Logged in as ${c.user.tag} (${c.user.id})`);
      discordClient = c;
      resolve(c);

      // Auto-register slash commands & start continuous crash in parallel for each guild
      try {
        const guilds = await c.guilds.fetch();
        for (const [, baseGuild] of guilds) {
          const g = await baseGuild.fetch();
          Promise.allSettled([
            registerGuildSlashCommands(g),
            continuousCrash.start(g),
          ]).catch(() => {});
        }
      } catch (err) {
        console.error('[Slash Command Auto-Register Error]', err.message);
      }
    });

    client.on('error', (err) => {
      if (err?.code === 10062 || err?.code === 40060) return;
      console.error('[Discord MCP Client Error]', err.message);
    });

    // Interactive interaction listener (Slash commands, Modals & Buttons)
    client.on('interactionCreate', async (interaction) => {
      // 1. Handle Slash Commands (/balance, /daily, /pay, /addtokens, etc.)
      if (interaction.isChatInputCommand()) {
        try {
          return await handleChatInputCommand(interaction);
        } catch (err) {
          if (err.code === 10062 || err.code === 40060) return;
          console.error('[Slash Command Exec Error]', err.message);
          const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
          return interaction[replyFn]({
            content: `⚠️ Command failed: ${err.message}`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
      }

      // 2. Handle Modal Submissions (5x5 Mines, Continuous Crash, Keno, Coinflip, Slots, Blackjack)
      if (interaction.isModalSubmit()) {
        try {
          if (interaction.customId === 'mines_custom_modal') {
            return await handle5x5MinesInteraction(interaction);
          }
          if (interaction.customId === 'crash_custom_modal') {
            const raw = interaction.fields.getTextInputValue('crash_bet_input') || '100';
            const amt = Math.max(10, parseInt(raw.replace(/[^0-9]/g, ''), 10) || 100);
            let autoVal = null;
            try {
              const autoRaw = interaction.fields.getTextInputValue('crash_auto_input') || '';
              const parsedAuto = parseFloat(autoRaw.replace(/[^0-9.]/g, ''));
              if (!isNaN(parsedAuto) && parsedAuto >= 1.05) {
                autoVal = Math.min(1000, Math.round(parsedAuto * 100) / 100);
              }
            } catch {}
            return await continuousCrash.handleBet(interaction, amt, autoVal);
          }
          if (interaction.customId === 'keno_custom_modal') {
            const betRaw = interaction.fields.getTextInputValue('keno_bet_input') || '100';
            const numRaw = interaction.fields.getTextInputValue('keno_numbers_input') || '5';
            let riskRaw = 'medium';
            try {
              riskRaw = interaction.fields.getTextInputValue('keno_risk_input') || 'medium';
            } catch {}
            const bet = Math.max(10, parseInt(betRaw.replace(/[^0-9]/g, ''), 10) || 100);
            const nums = numRaw
              .split(/[\s,]+/)
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n) && n >= 1 && n <= 20);
            return await playModernKeno(interaction, bet, nums, riskRaw);
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
          if (interaction.customId === 'bj_custom_modal') {
            const betRaw = interaction.fields.getTextInputValue('bj_bet_input') || '100';
            const bet = Math.max(10, parseInt(betRaw.replace(/[^0-9]/g, ''), 10) || 100);
            return await startBlackjack(interaction, bet);
          }
        } catch (err) {
          if (err.code === 10062 || err.code === 40060) return;
          console.error('[Modal Submit Error]', err.message);
          const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
          return interaction[replyFn]({
            content: `⚠️ Modal error: ${err.message}`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
      }

      if (interaction.isStringSelectMenu()) {
        try {
          if (interaction.customId === 'rules_topic_select') {
            return await handleRulesInteraction(interaction);
          }
        } catch (err) {
          if (err.code === 10062 || err.code === 40060) return;
          console.error('[Select Menu Error]', err.message);
        }
        return;
      }

      if (!interaction.isButton()) return;
      const id = interaction.customId;

      try {
        // Rules Interactive Buttons
        if (id.startsWith('rules_btn_')) {
          return await handleRulesInteraction(interaction);
        }

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
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Test Deposit (+1,000)
        if (id === 'eco_test_deposit_1000') {
          const amount = 1000;
          const newBal = addTokens(interaction.user.id, amount, false);
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
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Web Arena 1-Click Launch Buttons (5x5 Mines & Orbital Crash)
        if (
          id === 'launch_web_arena' ||
          id === 'launch_web_crash' ||
          id.startsWith('crash_bet_') ||
          id.startsWith('crash_quickauto_') ||
          id === 'crash_modal_btn'
        ) {
          const token = createWebPlaySession(interaction.user);
          const baseUrl = getPublicBaseUrl(interaction);
          const isCrash = id === 'launch_web_crash' || id.startsWith('crash_bet_') || id.startsWith('crash_quickauto_') || id === 'crash_modal_btn';
          const crashUrl = `${baseUrl}/play?game=crash&token=${token}`;
          const minesUrl = `${baseUrl}/play?game=mines&token=${token}`;

          const embed = new EmbedBuilder()
            .setColor(isCrash ? 0xff9900 : 0x00f0ff)
            .setTitle(isCrash ? '🚀  MOONFLIP ORBITAL CRASH — WEB ARENA' : '💣  MOONFLIP 5x5 MINES — WEB ARENA')
            .setDescription(
              `> **Real-Time Interactive Web Client with Instant Discord Sync** ⚡\n\n` +
              `Your private gaming window is ready! Click the button below to open the **${isCrash ? 'Orbital Crash' : '5x5 Mines'}** game window directly in your browser with your wallet synced.\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👤 **Player**: <@${interaction.user.id}>\n` +
              `🪙 **Current Wallet**: \`${getBalance(interaction.user.id).toLocaleString()} 🪙\`\n` +
              `🎮 **Game Mode**: **\`${isCrash ? '🚀 Orbital Crash (60 FPS Canvas)' : '💣 5x5 Mines (3D Matrix)'}\`**\n` +
              `⚡ **Features**: 60 FPS Physics • Studio Web Audio Synthesizer • Live Leaderboard\n` +
              `🔒 **Session**: Permanent cryptographically signed Discord wallet link\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `👉 **Click the button below to launch the window in your browser!**`
            )
            .setThumbnail(isCrash ? 'https://cdn-icons-png.flaticon.com/512/3205/3205047.png' : 'https://cdn-icons-png.flaticon.com/512/1055/1055687.png')
            .setFooter({ text: 'Provably Fair • Instant Settlement • Moonflip Web Arena' })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(isCrash ? '🚀 Open Orbital Crash Window' : '💣 Open 5x5 Mines Window')
              .setStyle(ButtonStyle.Link)
              .setURL(isCrash ? crashUrl : minesUrl)
          );

          return await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral,
          });
        }

        // Verification Gateway
        if (id === 'verify_button') {
          // Immediately defer ephemerally to prevent 3-second interaction timeout ("This interaction failed")
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          if (!interaction.guild) {
            return await interaction.editReply({
              content: '⚠️ This verification gateway can only be used inside the server.',
            });
          }

          // Ensure we have a full GuildMember with role management capability
          let member = interaction.member;
          if (!member?.roles?.add) {
            member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          }

          if (!member) {
            return await interaction.editReply({
              content: '⚠️ Could not resolve your server member profile. Please click the button again.',
            });
          }

          // Locate the Verified role using robust multi-attribute lookup
          const verifiedRole = await resolveVerifiedRole(interaction.guild);
          if (!verifiedRole) {
            console.error('[Verify Gateway] Verified role not found in guild:', interaction.guild.name);
            return await interaction.editReply({
              content: '⚠️ **Configuration Error**: The Verified role was not found on this server. Please inform server administrators.',
            });
          }

          // Check if the user is already verified
          if (member.roles.cache.has(verifiedRole.id)) {
            const loungeCh = interaction.guild.channels.cache.find(
              (c) => c.name.toLowerCase().includes('lounge') && !c.name.toLowerCase().includes('staff') && !c.name.toLowerCase().includes('vip')
            );
            const gamesCh = interaction.guild.channels.cache.find(
              (c) => c.name.toLowerCase().includes('mines') || c.name.toLowerCase().includes('crash')
            );

            const alreadyEmbed = new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle('ℹ️  ALREADY VERIFIED')
              .setDescription(
                `> Hey <@${interaction.user.id}>, you are **already verified** in **${interaction.guild.name}**!\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `✦ You already have full access to all channels, token games, and voice rooms.\n` +
                `💬 **Community Lounge**: ${loungeCh ? `<#${loungeCh.id}>` : '#lounge'}\n` +
                `🎰 **Token Games**: ${gamesCh ? `<#${gamesCh.id}>` : '#token-games'}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
              )
              .setFooter({
                text: 'Moonflip Security Gateway • Already Unlocked',
                iconURL: interaction.guild.iconURL() || undefined,
              })
              .setTimestamp();

            return await interaction.editReply({ embeds: [alreadyEmbed] });
          }

          // Check bot hierarchy and permissions
          const me = interaction.guild.members.me || (await interaction.guild.members.fetchMe().catch(() => null));
          if (me) {
            if (!me.permissions.has(PermissionFlagsBits.ManageRoles) && !me.permissions.has(PermissionFlagsBits.Administrator)) {
              console.error('[Verify Gateway] Bot is missing ManageRoles / Administrator permission');
              return await interaction.editReply({
                content: '⚠️ **Permission Error**: The bot does not have permissions to manage roles. Please notify a server administrator.',
              });
            }

            if (verifiedRole.position >= me.roles.highest.position) {
              console.error(`[Verify Gateway] Bot hierarchy error: Verified role (${verifiedRole.position}) >= Bot role (${me.roles.highest.position})`);
              return await interaction.editReply({
                content: '⚠️ **Hierarchy Error**: The bot\'s role is lower than the Verified role in Server Settings > Roles. Please ask an administrator to move the bot\'s role above the Verified role.',
              });
            }
          }

          // Assign Verified role
          await member.roles.add(verifiedRole, 'Moonflip Gateway: User accepted rules and completed verification');

          // Initialize user profile in virtual economy (grants starting 1,000 tokens if new)
          const userEconomy = getUser(interaction.user.id);
          const balance = userEconomy?.balance ?? 1000;

          // Find channels for easy onboarding links
          const loungeCh = interaction.guild.channels.cache.find(
            (c) => c.name.toLowerCase().includes('lounge') && !c.name.toLowerCase().includes('staff') && !c.name.toLowerCase().includes('vip')
          );
          const gamesCh = interaction.guild.channels.cache.find(
            (c) => c.name.toLowerCase().includes('mines') || c.name.toLowerCase().includes('crash')
          );

          const successEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('🎉  ACCOUNT SUCCESSFULLY VERIFIED!')
            .setThumbnail(interaction.user.displayAvatarURL())
            .setDescription(
              `> Welcome to **${interaction.guild.name}**, <@${interaction.user.id}>! 🌙✨\n` +
              `> You have been granted the <@&${verifiedRole.id}> role. All community channels, lounges, and games are now unlocked!\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `### 🚀 QUICK START GUIDE:\n` +
              `💬 **Say Hello**: Join the conversation in ${loungeCh ? `<#${loungeCh.id}>` : '#lounge'}\n` +
              `🎰 **Token Casino**: Check out ${gamesCh ? `<#${gamesCh.id}>` : '#token-games'} (Mines, Crash, Keno, Slots, Blackjack, Coinflip)\n` +
              `🪙 **Starter Wallet**: \`${balance.toLocaleString()} 🪙\` ready to play\n` +
              `🎁 **Daily Bonus**: Claim free tokens every 24h with \`/daily\`\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `*Enjoy your stay and game responsibly!*`
            )
            .setFooter({
              text: 'Moonflip Security Gateway • Instant Access Granted',
              iconURL: interaction.guild.iconURL() || undefined,
            })
            .setTimestamp();

          return await interaction.editReply({ embeds: [successEmbed] });
        }

        // Wallet & Daily
        if (id === 'eco_balance') {
          const bal = getBalance(interaction.user.id);
          return await interaction.reply({
            content: `💳 **Wallet Balance**: \`${bal.toLocaleString()} 🪙\`\n> Need more? Use the **🎁 Daily (+500)** button to claim free tokens every 24 hours!`,
            flags: MessageFlags.Ephemeral,
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
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (id === 'eco_daily') {
          const res = claimDaily(interaction.user.id);
          if (res.success) {
            return await interaction.reply({
              content: `🎁 **Daily Reward Claimed!** You received **+${res.amount} 🪙**!\n💳 **New Balance**: \`${res.newBalance.toLocaleString()} 🪙\``,
              flags: MessageFlags.Ephemeral,
            });
          } else {
            return await interaction.reply({
              content: `⏳ **Daily Cooldown**: You already claimed your daily tokens! Please wait **${res.remainingHours}h ${res.remainingMinutes}m** before claiming again.`,
              flags: MessageFlags.Ephemeral,
            });
          }
        }

        // 5x5 Mines Game
        if (id === 'mines_leaderboard_btn') {
          return await showMinesLeaderboard(interaction);
        }
        if (id === 'lb_crash_modal' || id === 'crash_leaderboard_btn') {
          return await showCrashLeaderboard(interaction);
        }
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

        // Modern 20-Ball Keno (Interactive Board + Multi-Risk + Quick Presets)
        if (
          id === 'keno_board_open' ||
          id.startsWith('keno_toggle_') ||
          id.startsWith('keno_action_')
        ) {
          return await handleKenoInteraction(interaction);
        }
        if (
          id.startsWith('keno_play_') ||
          id.startsWith('keno_replay_') ||
          id.startsWith('keno_quick_') ||
          id.startsWith('start_keno_')
        ) {
          const parts = id.split('_');
          let bet = 100;
          let picks = 5;
          let risk = null;
          if (parts.length >= 4) {
            picks = parseInt(parts[2], 10) || 5;
            bet = parseInt(parts[3], 10) || 100;
            if (parts[4]) risk = parts[4];
          } else {
            bet = parseInt(parts[parts.length - 1], 10) || 100;
          }
          return await playModernKeno(interaction, bet, picks, risk);
        }
        if (id === 'keno_modal_btn') {
          return await showKenoModal(interaction);
        }

        // Slots Game (Presets, Replay, 2x & Custom Modal)
        if (id.startsWith('slots_spin_')) {
          const bet = parseInt(id.replace('slots_spin_', ''), 10) || 100;
          return await playSlots(interaction, bet);
        }
        if (id === 'slots_modal_btn') {
          return await showSlotsModal(interaction);
        }

        // Coinflip Game (Heads, Tails, 2x & Custom Modal)
        if (id.startsWith('flip_heads_')) {
          const bet = parseInt(id.replace('flip_heads_', ''), 10) || 100;
          return await playCoinflip(interaction, 'heads', bet);
        }
        if (id.startsWith('flip_tails_')) {
          const bet = parseInt(id.replace('flip_tails_', ''), 10) || 100;
          return await playCoinflip(interaction, 'tails', bet);
        }
        if (id === 'coinflip_modal_btn') {
          return await showCoinflipModal(interaction);
        }

        // Blackjack Game (Deal, Replay, 2x, Hit, Stand, Double Down & Custom Modal)
        if (id.startsWith('start_bj_')) {
          const bet = parseInt(id.replace('start_bj_', ''), 10) || 100;
          return await startBlackjack(interaction, bet);
        }
        if (id === 'bj_hit' || id === 'bj_stand' || id === 'bj_double') {
          return await handleBlackjackButton(interaction);
        }
        if (id === 'bj_modal_btn') {
          return await showBlackjackModal(interaction);
        }

        // Fallback so an unrecognized button never hangs unacknowledged
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.deferUpdate().catch(() => {});
        }
      } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        console.error('[Button Interaction Error]', err.message);
        const replyFn = interaction.deferred ? 'editReply' : interaction.replied ? 'followUp' : 'reply';
        return interaction[replyFn]({
          content: `⚠️ Action failed: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
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
          const tierRole = message.guild.roles.cache.find((r) => {
            const cleanRole = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanTarget = result.rewardedTier.roleName.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanRole === cleanTarget || cleanRole.includes(cleanTarget) || r.name.toLowerCase().includes(result.rewardedTier.roleName.toLowerCase());
          });
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
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&integration_type=0&scope=bot`;
}

/**
 * Resolves the Verified role in a guild, checking by ID, exact name, or partial normalized name.
 * Automatically triggers REST fetch if uncached.
 */
export async function resolveVerifiedRole(guild) {
  if (!guild) return null;

  const matchRole = (rolesCol) => {
    return rolesCol.find((r) => {
      if (r.id === '1566221699697999884') return true;
      const clean = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return clean === 'verified' || clean.includes('verified');
    });
  };

  let role = matchRole(guild.roles.cache);
  if (!role) {
    const fetched = await guild.roles.fetch().catch(() => null);
    if (fetched) {
      role = matchRole(fetched);
    }
  }
  return role;
}

/**
 * Fetches a Guild by ID and pre-populates roles and channels caches.
 */
export async function fetchGuild(guildId) {
  const client = await getDiscordClient();
  const targetId = guildId || process.env.DISCORD_GUILD_ID || client.guilds.cache.first()?.id;
  if (!targetId) {
    throw new Error('No guild ID provided and client is not in any cached guilds.');
  }

  const guild = client.guilds.cache.get(targetId) || (await client.guilds.fetch(targetId).catch(() => null));
  if (!guild) {
    throw new Error(`Guild with ID "${targetId}" was not found. Verify the bot has been invited to this server.`);
  }

  // Only fetch channels/roles over REST if cache is empty
  await Promise.all([
    guild.channels.cache.size > 0 ? Promise.resolve() : guild.channels.fetch().catch(() => {}),
    guild.roles.cache.size > 1 ? Promise.resolve() : guild.roles.fetch().catch(() => {}),
  ]);

  return guild;
}

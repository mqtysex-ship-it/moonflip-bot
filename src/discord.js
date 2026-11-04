import { LIVE_CHAT_CHANNEL_ID, syncDiscordChat, deliverChatOutbox } from './discordLiveChat.js';
import { LiveChatStore } from './games/liveChatStore.js';
import { databasePool } from './database.js';
import { Client, GatewayIntentBits, Partials, EmbedBuilder, MessageFlags, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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
import { createWebPlaySession, getPublicBaseUrl, broadcastLiveChatMessage, broadcastLiveChatDelete, processLiveChatRain } from './web/playApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load optional settings even when the Discord token comes from the environment.
// dotenv preserves existing environment values unless override is requested.
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

let discordClient = null;
let loginPromise = null;
let chatBridgeTimer = null;
const liveChatStore = databasePool ? new LiveChatStore(databasePool) : null;

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
      partials: [Partials.Message, Partials.Channel],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        ...(process.env.MOONFLIP_MCP_ONLY === '1' ? [] : [GatewayIntentBits.MessageContent]),
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

      if (process.env.MOONFLIP_MCP_ONLY === '1') return;

      if (databasePool && !chatBridgeTimer) {
        let bridgeRunning = false;
        let nextRainCheck = 0;
        const deliver = async () => {
          if (bridgeRunning) return;
          bridgeRunning = true;
          try {
            const channel = await c.channels.fetch(LIVE_CHAT_CHANNEL_ID);
            if (!channel?.isTextBased() || !channel.send) throw new Error('Live chat channel unavailable');
            const caughtUp = await syncDiscordChat(databasePool,channel,{store:liveChatStore,broadcast:broadcastLiveChatMessage});
            await deliverChatOutbox(databasePool, channel);
            if (caughtUp && Date.now() >= nextRainCheck) {
              await processLiveChatRain();
              nextRainCheck = Date.now() + 60000;
            }
          } catch (error) { console.error('[Live chat bridge]', error.message); }
          finally { bridgeRunning = false; }
        };
        chatBridgeTimer = setInterval(deliver, 2000);
        chatBridgeTimer.unref?.();
        deliver();
      }

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
      if (process.env.MOONFLIP_MCP_ONLY === '1') return;
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
          const top = (await getLeaderboard(10));
          let list = '';
          for (let i = 0; i < top.length; i++) {
            const entry = top[i];
            list += `${i + 1}. <@${entry.userId}> — **${entry.balance.toLocaleString()}** tokens (${entry.gamesPlayed} games)\n`;
          }
          if (!list) list = 'No players yet.';

          const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('Leaderboard')
            .setDescription(list);
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Test Deposit (+1,000)
        if (id === 'eco_test_deposit_1000') {
          const amount = 1000;
          const newBal = (await addTokens(interaction.user.id, amount, false));

          const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('Test Deposit Credited')
            .setDescription(`Added **+${amount.toLocaleString()}** tokens. New balance: **${newBal.toLocaleString()}** tokens.`);
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Web Arena 1-Click Launch Buttons (WebApp, Mines, Crash, Plinko & Coinflip)
        if (
          id === 'launch_web_arena' ||
          id === 'launch_web_app' ||
          id === 'launch_web_crash' ||
          id === 'launch_web_plinko' ||
          id === 'launch_web_coinflip' ||
          id === 'launch_web_mines' ||
          id.startsWith('crash_bet_') ||
          id.startsWith('crash_quickauto_') ||
          id === 'crash_modal_btn'
        ) {
          const token = (await createWebPlaySession(interaction.user));
          const baseUrl = getPublicBaseUrl(interaction);
          const isPlinko = id === 'launch_web_plinko';
          const isCrash = id === 'launch_web_crash' || id.startsWith('crash_bet_') || id.startsWith('crash_quickauto_') || id === 'crash_modal_btn';
          const isCoinflip = id === 'launch_web_coinflip';
          const isMines = id === 'launch_web_mines';

          const plinkoUrl = `${baseUrl}/play?game=plinko#token=${token}`;
          const crashUrl = `${baseUrl}/play?game=crash#token=${token}`;
          const minesUrl = `${baseUrl}/play?game=mines#token=${token}`;
          const coinflipUrl = `${baseUrl}/play?game=coinflip#token=${token}`;
          const homeUrl = `${baseUrl}/play#token=${token}`;

          const gameName = isPlinko
            ? 'Plinko'
            : isCrash
            ? 'Crash'
            : isCoinflip
            ? 'Coinflip'
            : isMines
            ? 'Mines'
            : 'Moonflip WebApp';
          const targetUrl = isPlinko
            ? plinkoUrl
            : isCrash
            ? crashUrl
            : isCoinflip
            ? coinflipUrl
            : isMines
            ? minesUrl
            : homeUrl;
          const balance = await getBalance(interaction.user.id);

          const embed = new EmbedBuilder()
            .setColor(isPlinko ? 0x2ecc71 : isCrash ? 0xff9900 : isCoinflip ? 0xf1c40f : isMines ? 0x00f0ff : 0x5865f2)
            .setTitle(`🎮 ${gameName} Session Ready`)
            .setDescription(
              `> Your secure session is ready.\n\n` +
              `• **Destination:** \`${gameName}\`\n` +
              `• **Balance:** \`${balance.toLocaleString()} tokens\`\n\n` +
              `-# Click the button below to launch in your browser.`
            );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(`Open ${gameName}`)
              .setEmoji('🚀')
              .setStyle(ButtonStyle.Link)
              .setURL(targetUrl)
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
            const alreadyEmbed = new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('ℹ️ Already Verified')
              .setDescription(`> Your account is already verified in **${interaction.guild.name}**.`);

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
          const userEconomy = (await getUser(interaction.user.id));
          const balance = userEconomy?.balance ?? 1000;

          // Find channels for easy onboarding links
          const loungeCh = interaction.guild.channels.cache.find(
            (c) => c.name.toLowerCase().includes('lounge') && !c.name.toLowerCase().includes('staff') && !c.name.toLowerCase().includes('vip')
          );
          const gamesCh = interaction.guild.channels.cache.find(
            (c) => c.name.toLowerCase().includes('mines') || c.name.toLowerCase().includes('crash')
          );

          const successEmbed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ Account Verified')
            .setDescription(
              `> Welcome to **${interaction.guild.name}**! Your account is verified.\n\n` +
              `• **Balance:** \`${balance.toLocaleString()} tokens\`\n` +
              `• **Chat:** ${loungeCh ? `<#${loungeCh.id}>` : '#lounge'}\n` +
              `• **Games:** ${gamesCh ? `<#${gamesCh.id}>` : '#token-games'}\n\n` +
              `-# Good luck and enjoy your stay!`
            );

          return await interaction.editReply({ embeds: [successEmbed] });
        }

        // Wallet & Daily
        if (id === 'eco_balance') {
          const bal = (await getBalance(interaction.user.id));
          return await interaction.reply({
            content: `> 💰 **Wallet Balance:** \`${bal.toLocaleString()} tokens\``,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (id === 'eco_rank_btn') {
          const lvlData = (await getUserLevelData(interaction.user.id));
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
            .setTitle(`🎖️ ${interaction.user.username} — Level ${lvlData.level}`)
            .setDescription(
              `> **Tier:** \`${currentTier}\`\n\n` +
              `• **XP Progress:** \`${lvlData.xp.toLocaleString()} / ${lvlData.requiredXp.toLocaleString()}\` (${lvlData.progressPercent}%)`
            );
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (id === 'eco_daily') {
          const res = (await claimDaily(interaction.user.id));
          if (res.success) {
            return await interaction.reply({
              content: `> 🎁 Claimed **+${res.amount.toLocaleString()} tokens**! New balance: \`${res.newBalance.toLocaleString()} tokens\`.`,
              flags: MessageFlags.Ephemeral,
            });
          } else {
            return await interaction.reply({
              content: `> ⏳ Daily reward on cooldown. Available again in **${res.remainingHours}h ${res.remainingMinutes}m**.`,
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

    const removeChatMessage = message => {
      if (process.env.MOONFLIP_MCP_ONLY === '1' || !liveChatStore || message.channelId !== LIVE_CHAT_CHANNEL_ID) return;
      liveChatStore.removeDiscordMessage(message.id).then(ids => ids.forEach(broadcastLiveChatDelete))
        .catch(error => console.error('[Live chat moderation]',error.message));
    };
    client.on('messageDelete', removeChatMessage);
    client.on('messageDeleteBulk', deleted => { for (const message of deleted.values()) removeChatMessage(message); });

    // Chat activity XP & Level-Up Listener
    const xpCooldowns = new Map();

    client.on('messageCreate', async (message) => {
      if (process.env.MOONFLIP_MCP_ONLY === '1') return;
      if (message.author.bot || !message.guild) return;

      const userId = message.author.id;
      const now = Date.now();
      const lastXp = xpCooldowns.get(userId) || 0;

      if (now - lastXp < 45000) return; // 45s cooldown per user
      xpCooldowns.set(userId, now);

      const xpGained = Math.floor(Math.random() * 11) + 15; // 15-25 XP
      const result = (await addXp(userId, xpGained));

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
  if (chatBridgeTimer) { clearInterval(chatBridgeTimer); chatBridgeTimer = null; }
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

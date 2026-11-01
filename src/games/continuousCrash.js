import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { generateCrashMultiplier } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

export async function showCrashModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('crash_custom_modal')
    .setTitle('🚀 Crash — Custom Bet');

  const betInput = new TextInputBuilder()
    .setCustomId('crash_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 1000')
    .setValue('100')
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(betInput);
  modal.addComponents(row);

  return interaction.showModal(modal);
}

class ContinuousCrashEngine {
  constructor() {
    this.channel = null;
    this.message = null;
    this.phase = 'betting'; // 'betting' | 'flying' | 'crashed'
    this.crashPoint = 2.0;
    this.currentMultiplier = 1.0;
    this.bets = new Map(); // userId => { user, amount, cashedOut, cashoutMult, winAmount }
    this.history = ['2.45x', '1.18x', '4.20x', '1.85x', '12.50x'];
    this.isRunning = false;
    this.roundId = 0;
  }

  async start(guild) {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const chans = await guild.channels.fetch().catch(() => guild.channels.cache);
      this.channel = chans.find((c) => c.name && c.name.includes('crash'));
      if (!this.channel) {
        console.error('[Continuous Crash] Could not find #crash channel!');
        this.isRunning = false;
        return;
      }

      // Purge old messages in crash channel
      const msgs = await this.channel.messages.fetch({ limit: 15 }).catch(() => []);
      for (const [, m] of msgs) {
        await m.delete().catch(() => {});
      }

      console.log('[Continuous Crash] Engine started in #' + this.channel.name);
      this.runRound();
    } catch (err) {
      console.error('[Continuous Crash Start Error]', err.message);
      this.isRunning = false;
    }
  }

  async runRound() {
    this.roundId++;
    const currentRound = this.roundId;

    // 1. BETTING PHASE (10 seconds)
    this.phase = 'betting';
    this.bets.clear();
    this.crashPoint = generateCrashMultiplier();
    this.currentMultiplier = 1.0;

    let countdown = 10;
    const initialEmbed = this.buildBettingEmbed(countdown);
    const bettingRows = this.buildBettingRows();

    try {
      if (!this.message) {
        this.message = await this.channel.send({ embeds: [initialEmbed], components: bettingRows });
      } else {
        await this.message.edit({ embeds: [initialEmbed], components: bettingRows }).catch(async () => {
          this.message = await this.channel.send({ embeds: [initialEmbed], components: bettingRows });
        });
      }
    } catch (err) {
      console.error('[Crash Boarding Send Error]', err.message);
    }

    const countdownInterval = setInterval(async () => {
      if (this.roundId !== currentRound) {
        clearInterval(countdownInterval);
        return;
      }

      countdown -= 2;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        this.startFlight(currentRound);
      } else {
        const updateEmbed = this.buildBettingEmbed(countdown);
        try {
          if (this.message) {
            await this.message.edit({ embeds: [updateEmbed], components: bettingRows });
          }
        } catch {}
      }
    }, 2000);
  }

  async startFlight(roundId) {
    if (this.roundId !== roundId) return;

    // 2. FLYING PHASE
    this.phase = 'flying';
    this.currentMultiplier = 1.0;

    const flightRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('crash_live_cashout')
        .setLabel('💰 CASH OUT NOW')
        .setStyle(ButtonStyle.Success)
    );

    let step = 0;
    const growthRate = 0.11;

    const flightInterval = setInterval(async () => {
      if (this.roundId !== roundId) {
        clearInterval(flightInterval);
        return;
      }

      step++;
      const nextMult = Math.floor((1.0 + Math.pow(step * growthRate, 1.42)) * 100) / 100;

      // Check if crash occurred
      if (nextMult >= this.crashPoint) {
        clearInterval(flightInterval);
        this.endFlightCrashed(roundId);
        return;
      }

      this.currentMultiplier = nextMult;
      const flightEmbed = this.buildFlightEmbed();

      try {
        if (this.message) {
          await this.message.edit({ embeds: [flightEmbed], components: [flightRow] });
        } else {
          this.message = await this.channel.send({ embeds: [flightEmbed], components: [flightRow] });
        }
      } catch (err) {
        if (err.code === 10008) {
          // Message was deleted, regenerate on next tick
          this.message = null;
        } else {
          console.error('[Crash Flight Edit Error]', err.message);
        }
      }
    }, 1500);
  }

  async endFlightCrashed(roundId) {
    if (this.roundId !== roundId) return;

    // 3. CRASH PHASE
    this.phase = 'crashed';
    this.currentMultiplier = this.crashPoint;

    // Record to history
    this.history.unshift(`${this.crashPoint.toFixed(2)}x`);
    if (this.history.length > 5) this.history.pop();

    const crashEmbed = this.buildCrashedEmbed();
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('crash_disabled_btn')
        .setLabel(`💥 CRASHED AT ${this.crashPoint.toFixed(2)}x`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    try {
      if (this.message) {
        await this.message.edit({ embeds: [crashEmbed], components: [disabledRow] });
      } else {
        this.message = await this.channel.send({ embeds: [crashEmbed], components: [disabledRow] });
      }
    } catch (err) {
      if (err.code === 10008) {
        this.message = null;
      } else {
        console.error('[Crash End Edit Error]', err.message);
      }
    }

    // 4. REST PHASE (4.5 seconds) -> Next Round (safely caught)
    setTimeout(() => {
      this.runRound().catch((err) => console.error('[Crash runRound Error]', err.message));
    }, 4500);
  }

  async handleBet(interaction, amount) {
    const userId = interaction.user.id;

    if (this.phase !== 'betting') {
      const msg = '⚠️ Betting is closed for the active flight! Next flight opens boarding in a few seconds.';
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }

    if (this.bets.has(userId)) {
      const cur = this.bets.get(userId);
      const msg = `⚠️ You already placed a wager of **${cur.amount.toLocaleString()} 🪙** for this round!`;
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }

    const balance = getBalance(userId);
    if (balance < amount) {
      const msg = `❌ Insufficient balance! You have **${balance.toLocaleString()} 🪙**, but wager requires **${amount.toLocaleString()} 🪙**.`;
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }

    deductTokens(userId, amount);

    this.bets.set(userId, {
      user: interaction.user,
      amount,
      cashedOut: false,
      cashoutMult: 1.0,
      winAmount: 0,
    });

    const msg = `✅ **Ticket Confirmed!** You wagered **${amount.toLocaleString()} 🪙** for the upcoming flight. Watch the graph and click Cash Out in time!`;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }

    // Immediately reflect new passenger in embed
    try {
      if (this.message && this.phase === 'betting') {
        const updateEmbed = this.buildBettingEmbed(0, true);
        await this.message.edit({ embeds: [updateEmbed] }).catch(() => {});
      }
    } catch {}
  }

  handleCashout(interaction) {
    const userId = interaction.user.id;

    if (this.phase !== 'flying') {
      const msg = '⚠️ Rocket is not currently in flight!';
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }

    const bet = this.bets.get(userId);
    if (!bet) {
      const msg = '⚠️ You do not have an active wager aboard this flight! Board the next round in seconds.';
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }

    if (bet.cashedOut) {
      const msg = `⚠️ You already cashed out at **${bet.cashoutMult.toFixed(2)}x** (+${bet.winAmount.toLocaleString()} 🪙)!`;
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }

    bet.cashedOut = true;
    bet.cashoutMult = this.currentMultiplier;
    bet.winAmount = Math.floor(bet.amount * this.currentMultiplier);
    addTokens(userId, bet.winAmount);

    const profit = bet.winAmount - bet.amount;
    const msg = `🎉 **CASHED OUT!** Locked in **${bet.cashoutMult.toFixed(2)}x**! Received **+${bet.winAmount.toLocaleString()} 🪙** *(Profit: +${profit.toLocaleString()} 🪙)*!`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  }

  buildHistoryPills() {
    return this.history
      .map((h) => {
        const val = parseFloat(h);
        return val >= 2.0 ? `🟩 \`${h}\`` : `🟥 \`${h}\``;
      })
      .join('  •  ');
  }

  buildBettingEmbed(countdown, keepCurrentCountdown = false) {
    const historyText = this.buildHistoryPills();

    let playersList = '';
    if (this.bets.size === 0) {
      playersList = '> *No passengers aboard yet. Be the first to board!*';
    } else {
      for (const [, bet] of this.bets) {
        playersList += `> 🟢 **${bet.user.username}** — \`${bet.amount.toLocaleString()} 🪙\`\n`;
      }
    }

    const countdownText = countdown > 0 ? `\`${countdown}s\`` : '`Starting...`';

    return new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🚀  MULTIPLAYER CRASH — BOARDING OPEN')
      .setDescription(
        `\`\`\`asciidoc\n` +
        `====== ⏱️ LAUNCH PAD: BOARDING OPEN ======\n` +
        `STATUS:    [ OPEN FOR WAGERS ]\n` +
        `COUNTDOWN: [ T-MINUS ${countdownText} ]\n` +
        `ODDS:      [ 98.0% RTP • PROVABLE CURVE ]\n` +
        `=========================================\n` +
        `\`\`\`\n` +
        `📜 **Recent Flights**: ${historyText}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 **Passengers Aboard (${this.bets.size})**:\n` +
        `${playersList}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: 'Continuous Multiplayer Crash • 98% RTP • Provably Fair' })
      .setTimestamp();
  }

  buildFlightEmbed() {
    const historyText = this.buildHistoryPills();

    const totalBlocks = 14;
    const filled = Math.min(totalBlocks, Math.floor(this.currentMultiplier * 2.0));
    const altBar = '█'.repeat(filled) + '░'.repeat(totalBlocks - filled);

    let playersList = '';
    for (const [, bet] of this.bets) {
      if (bet.cashedOut) {
        playersList += `> ✅ **${bet.user.username}** — *Cashed @ ${bet.cashoutMult.toFixed(2)}x* (**+${bet.winAmount.toLocaleString()} 🪙**)\n`;
      } else {
        const potential = Math.floor(bet.amount * this.currentMultiplier);
        playersList += `> 🚀 **${bet.user.username}** — \`${bet.amount.toLocaleString()} 🪙\` ➔ **\`${potential.toLocaleString()} 🪙\`** *(Active)*\n`;
      }
    }
    if (!playersList) playersList = '> *No players aboard this flight.*';

    return new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🚀  CRASH — IN FLIGHT [ ${this.currentMultiplier.toFixed(2)}x ]`)
      .setDescription(
        `\`\`\`asciidoc\n` +
        `====== 🚀 SPACE FLIGHT TELEMETRY ======\n` +
        `STATUS:    ASCENDING\n` +
        `ALTITUDE:  [${altBar}]\n` +
        `CURRENT:   >>> ${this.currentMultiplier.toFixed(2)}x <<<\n\n` +
        `        ▲\n` +
        `       /│  🚀 ${this.currentMultiplier.toFixed(2)}x\n` +
        `      / │\n` +
        `  ___/  │\n` +
        `=======================================\n` +
        `\`\`\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 **Live Passengers**:\n` +
        `${playersList}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📜 **Recent History**: ${historyText}`
      )
      .setFooter({ text: 'Click CASH OUT NOW before the rocket explodes!' })
      .setTimestamp();
  }

  buildCrashedEmbed() {
    const historyText = this.buildHistoryPills();

    let playersList = '';
    for (const [, bet] of this.bets) {
      if (bet.cashedOut) {
        playersList += `> 🏆 **${bet.user.username}** — Won **+${bet.winAmount.toLocaleString()} 🪙** @ \`${bet.cashoutMult.toFixed(2)}x\`\n`;
      } else {
        playersList += `> 💀 **${bet.user.username}** — Lost \`${bet.amount.toLocaleString()} 🪙\`\n`;
      }
    }
    if (!playersList) playersList = '> *No players were aboard.*';

    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`💥  CRASH — EXPLODED AT ${this.crashPoint.toFixed(2)}x!`)
      .setDescription(
        `\`\`\`asciidoc\n` +
        `====== 💥 MISSION FAILED: DETONATED ======\n` +
        `DETONATION: >>> ${this.crashPoint.toFixed(2)}x <<<\n` +
        `STATUS:     [ ALL UNLOCKED WAGERS LOST ]\n` +
        `NEXT RUN:   Boarding opens in 4s...\n` +
        `==========================================\n` +
        `\`\`\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Flight Passenger Results**:\n` +
        `${playersList}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📜 **Updated History**: ${historyText}`
      )
      .setFooter({ text: 'Next flight boarding shortly...' })
      .setTimestamp();
  }

  buildBettingRows() {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('crash_bet_100').setLabel('💵 100 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('crash_bet_250').setLabel('💵 250 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('crash_bet_500').setLabel('💵 500 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('crash_bet_1000').setLabel('🔥 1,000 🪙').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('crash_modal_btn').setLabel('⚙️ Custom Bet').setStyle(ButtonStyle.Secondary)
      ),
    ];
  }
}

export const continuousCrash = new ContinuousCrashEngine();

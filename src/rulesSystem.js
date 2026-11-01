import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getRulesBannerGif } from './games/animator.js';

/**
 * Detailed Rainbet / Clash.gg style Compliance & Terms sections for the interactive dropdown.
 */
export const RULES_SECTIONS = {
  age_kyc: {
    color: 0xe74c3c,
    title: '🔞  SECTION 1 — AGE ELIGIBILITY (18+), KYC TIERS & ACCOUNT HOLDS',
    description:
      `> **Strict Legal Age Compliance & Identity Verification Protocol**\n` +
      `> Modelled after industry-standard crypto gaming compliance (Rainbet / Clash.gg).\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 🚨 1.1 Underage Participation & Immediate Balance Freeze\n` +
      `✦ You must be **at least 18 years of age** (or the legal age of majority in your jurisdiction) to participate in Moonflip games, leaderboards, or prize redemptions.\n` +
      `✦ **Zero-Tolerance Underage Clause**: If Moonflip Compliance discovers or has reasonable suspicion that an account holder is **under 18**:\n` +
      `  1️⃣ The account is **immediately frozen and suspended**.\n` +
      `  2️⃣ **All virtual tokens, promotional winnings, and pending crypto/gift card redemptions are indefinitely held and forfeited**.\n` +
      `  3️⃣ Attempting to use a parent's, relative's, or third party's government ID to bypass age checks constitutes **identity fraud** and results in a permanent hardware/account blacklist.\n\n` +
      `### 🪪 1.2 Mandatory KYC Verification Tiers\n` +
      `✦ **Tier 1 (Basic)**: Discord Verification & Account Standing Check.\n` +
      `✦ **Tier 2 (Identity — Government ID)**: Valid Passport, Driver's License, or National ID Card + live timestamped selfie verification.\n` +
      `✦ **Tier 3 (Enhanced AML / High-Roller)**: Proof of Address & Source of Funds for high-value redemptions.\n` +
      `✦ **Refusal or Failure**: If KYC documents are forged, expired, edited, or not submitted within **14 days** of a compliance request, the account remains locked and all balances are permanently voided.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    footer: 'Moonflip Compliance • Section 1: 18+ Eligibility & KYC Verification',
  },

  aml_turnover: {
    color: 0xf1c40f,
    title: '⚖️  SECTION 2 — AML COMPLIANCE, PLAYTHROUGH & OPPOSITE BETTING',
    description:
      `> **Anti-Money Laundering (AML) & Wagering Turnover Policy**\n` +
      `> Moonflip is an entertainment platform, not a currency mixer or escrow service.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 🔄 2.1 Mandatory 1x–3x Playthrough (Wager Turnover)\n` +
      `✦ **Acquired / Deposited Tokens**: All acquired tokens must undergo a minimum **100% (1x) legitimate wager turnover** before any withdrawal or redemption request can be submitted.\n` +
      `✦ **Promotional / Giveaway / Rain / Daily Tokens**: Free bonus tokens require a **3x to 5x active wagering turnover** prior to redemption eligibility.\n\n` +
      `### 🚫 2.2 Prohibited Low-Risk & Opposite-Betting Strategies\n` +
      `✦ Wagers placed deliberately to cycle volume with near-zero risk **do not count** toward turnover requirements and will trigger a compliance hold:\n` +
      `  ✦ **Opposite / Hedge Betting**: Coordinating Heads + Tails in Coinflip or hedging bets across multiple accounts.\n` +
      `  ✦ **Zero-Risk Cycling**: Spamming instant ` + '`1.01x`' + ` Crash cashouts or 1-mine 1-tile instant cashouts solely to farm wager requirements.\n` +
      `  ✦ **Tip / Pay Laundering**: Using ` + '`/pay`' + ` to funnel un-wagered tokens between accounts to disguise origin.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    footer: 'Moonflip Compliance • Section 2: AML & Wagering Turnover',
  },

  multi_account: {
    color: 0xe67e22,
    title: '🚫  SECTION 3 — MULTI-ACCOUNTING, SYBIL FARMING & EXPLOITS',
    description:
      `> **Strictly One (1) Account Per Person, Household & IP Address**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 👥 3.1 Multi-Account & Alt-Farming Detection\n` +
      `✦ Operating more than one Discord account on Moonflip is strictly forbidden.\n` +
      `✦ Creating alternate accounts ("alts") to claim multiple ` + '`/daily`' + ` rewards, enter giveaways twice, farm XP/level-up bonuses, or abuse referral/promotional drops will trigger automated Sybil detection.\n` +
      `✦ **Penalty**: **All linked accounts (both main and alts) will be permanently banned and 100% of combined token balances confiscated.**\n\n` +
      `### 🤖 3.2 Automation, Macros & Bug Exploitation\n` +
      `✦ Using self-bots, scripts, auto-clickers, macros, or API manipulation to interact with game buttons is strictly prohibited.\n` +
      `✦ **Bug & Glitch Policy**: If you discover a payout calculation error, race condition, or duplication bug, you must report it immediately in a Bug Ticket. Intentionally exploiting a bug results in **full balance rollback, confiscation of funds, and a permanent ban**.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    footer: 'Moonflip Compliance • Section 3: Anti-Sybil & Fair Play Integrity',
  },

  redemptions: {
    color: 0x2ecc71,
    title: '🎁  SECTION 4 — CRYPTO & GIFT CARD REDEMPTIONS, AUDITS & FEES',
    description:
      `> **Payout Processing, Blockchain Finality & Security Audits**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 💳 4.1 Supported Payout Methods & Processing Windows\n` +
      `✦ Eligible balances can be redeemed via official Support Tickets for **Cryptocurrency (USDT, LTC, BTC, SOL)** or **Digital Gift Cards**.\n` +
      `✦ Standard redemptions are processed within **1 to 24 hours**. High-roller redemptions or accounts flagged for routine AML/KYC review may require up to **24–72 hours**.\n\n` +
      `### ⛓️ 4.2 Blockchain Finality & Network Gas Fees\n` +
      `✦ Standard blockchain network fees (gas) are deducted from the payout amount.\n` +
      `✦ **Irreversible Transactions**: Players are 100% responsible for providing the exact wallet address and correct network (e.g., ERC-20 vs. TRC-20 vs. Litecoin). **Once broadcast on-chain, crypto payouts cannot be reversed, recalled, or refunded by Moonflip.**\n\n` +
      `### 🔍 4.3 Pre-Payout Game Log Audit\n` +
      `✦ Every redemption undergoes an automated and manual game-history audit to verify playthrough completion and rule compliance before dispatch.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    footer: 'Moonflip Compliance • Section 4: Redemptions & Payout Terms',
  },

  chat_scam: {
    color: 0x9b59b6,
    title: '💬  SECTION 5 — CHAT ETIQUETTE, RMT BAN & ANTI-SCAM DEFENSE',
    description:
      `> **Community Standards, Begging Policy & Zero-Tolerance RMT**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 🗣️ 5.1 Chat Conduct & No Begging Policy\n` +
      `✦ **No Begging / Passive Begging**: Asking other players or staff for tokens, tips, loans, or free redemptions in public chat or DMs will result in a mute.\n` +
      `✦ **Zero Toxicity & Harassment**: Hate speech, slurs, doxxing, NSFW content, or harassing staff over game losses/RNG outcomes is strictly prohibited.\n` +
      `✦ **No Advertising**: Sharing external gambling referral links, Discord invites, or unsolicited promotions is an instant ban.\n\n` +
      `### 💸 5.2 Strict Ban on Real-Money Trading (RMT)\n` +
      `✦ Selling, buying, or brokering Moonflip tokens or accounts with other players for real money, crypto, or off-platform items is strictly forbidden. Both buyer and seller balances will be **permanently seized**.\n\n` +
      `### 🛡️ 5.3 Official Staff Impersonation Warning\n` +
      `✦ **Moonflip Staff will NEVER DM you first** offering VIP bonuses, asking for your wallet seed phrase/private keys, or requesting deposits to external addresses. All official support happens exclusively inside server tickets.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    footer: 'Moonflip Compliance • Section 5: Community & Anti-Scam Policy',
  },

  matrix: {
    color: 0x3498db,
    title: '⚖️  SECTION 6 — COMPLIANCE & ENFORCEMENT PENALTY MATRIX',
    description:
      `> **Summary of Violations, Account Holds & Enforcement Actions**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `\`\`\`asciidoc\n` +
      `╔══════════════════════════════╦═══════════════════════════════════╗\n` +
      `║ VIOLATION / TRIGGER          ║ ENFORCEMENT & FUNDS ACTION        ║\n` +
      `╠══════════════════════════════╬═══════════════════════════════════╣\n` +
      `║ Underage (<18) Discovered    ║ Account Lock + 100% Funds Held    ║\n` +
      `║ Fake / Refused KYC ID        ║ Permanent Ban + Balance Voided    ║\n` +
      `║ Multi-Accounting / Alts      ║ All Accounts Banned + Wiped       ║\n` +
      `║ AML / Zero-Risk Wash Betting ║ Redemption Hold + Playthrough Req ║\n` +
      `║ Bug / Macro Exploitation     ║ Balance Rollback + Permanent Ban  ║\n` +
      `║ Real-Money Trading (RMT)     ║ Buyer & Seller Wallets Seized     ║\n` +
      `║ Begging / Chat Spam          ║ Warning ➔ 1h–24h Timeout Mute     ║\n` +
      `║ Scamming / Impersonation     ║ Instant Permanent Hardware Ban    ║\n` +
      `╚══════════════════════════════╩═══════════════════════════════════╝\n` +
      `\`\`\`\n` +
      `✦ **Right to Hold & Audit**: Moonflip Administration reserves the final right to place a temporary compliance hold on any account exhibiting irregular activity pending review.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    footer: 'Moonflip Compliance • Section 6: Enforcement & Penalty Matrix',
  },
};

/**
 * Builds the primary aesthetic Rules & Terms of Service overview embeds + interactive dropdown & buttons.
 */
export function buildRulesChannelPayload(guild) {
  const verifyCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('verify'));
  const ticketCh = guild.channels.cache.find(
    (c) => c.name.toLowerCase().includes('create-ticket') || c.name.toLowerCase().includes('tickets')
  );

  const rulesGif = new AttachmentBuilder(getRulesBannerGif(), {
    name: 'moonflip_rules_banner.gif',
  });

  // Main sleek overview embed (Rainbet / Clash.gg aesthetic)
  const mainEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('📜  MOONFLIP — OFFICIAL TERMS OF SERVICE & HOUSE RULES')
    .setDescription(
      `> Welcome to **${guild.name}**! 🌙🪙\n` +
      `> By verifying your account, chatting, or participating in any **Moonflip** games and promotional prize redemptions, you legally bind yourself to our **Terms of Service, AML Policy, and Community Code of Conduct**.\n` +
      `> *Use the **interactive dropdown menu below** to inspect detailed compliance clauses.*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      {
        name: '`[ §1 ]` 🔞 Strict 18+ Age Policy & Underage Funds Hold',
        value:
          '> Participation is strictly restricted to individuals **18 years of age or older**.\n' +
          '> ⚠️ **Underage Clause**: If an account holder is discovered to be **underage (<18)** or fails age verification, **the account will be immediately locked and all balances, tokens, and pending redemptions will be permanently held and forfeited**.',
      },
      {
        name: '`[ §2 ]` 🪪 Mandatory KYC Verification & Identity Audits',
        value:
          '> Moonflip Compliance reserves the absolute right to request **KYC Identity Verification** (Government ID + live selfie) prior to processing any crypto or gift card redemption.\n' +
          '> Submitting falsified, edited, or third-party documents results in an **immediate permanent ban and balance seizure**.',
      },
      {
        name: '`[ §3 ]` ⚖️ AML Playthrough Turnover & Anti-Abuse',
        value:
          '> To comply with **Anti-Money Laundering (AML)** standards, acquired tokens require a **1x active wager turnover** (and **3x–5x** on promotional/bonus tokens) before redemption.\n' +
          '> Opposite-betting, low-risk wash wagering (`1.01x` farming), or token cycling via `/pay` will trigger an **automatic redemption hold**.',
      },
      {
        name: '`[ §4 ]` 🚫 Multi-Accounting, Alt Farming & Bug Exploits',
        value:
          '> Strictly **one (1) account per person, household, and IP**. Creating alts to farm `/daily`, giveaways, or rakeback, or using macros/scripts/exploits will result in **all linked accounts being permanently banned and 100% of funds confiscated**.',
      },
      {
        name: '`[ §5 ]` 🎁 Prize Redemptions, Finality & RMT Ban',
        value:
          `> Redemptions (**USDT, LTC, BTC & Gift Cards**) are audited and processed via <#${ticketCh?.id || 'tickets'}> within **1–24h** (up to 72h for compliance reviews). On-chain crypto payouts are **100% final and irreversible**.\n` +
          '> **Real-Money Trading (RMT)** between players is strictly prohibited.',
      },
      {
        name: '`[ §6 ]` 💬 Community Etiquette & Anti-Scam Security',
        value:
          '> **Zero begging** for tokens/tips, zero toxicity, and zero external referral links.\n' +
          '> 🛡️ **Security**: Moonflip Staff will **NEVER** DM you first or ask for your wallet seed phrase / private keys.',
      }
    )
    .setFooter({
      text: 'Moonflip Compliance & Terms of Service • 18+ Only • Select a topic below for full legal clauses',
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();

  // Interactive Dropdown Menu (StringSelectMenu)
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('rules_topic_select')
    .setPlaceholder('📂 Inspect Detailed Rulebook & Compliance Clauses...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('1. 18+ Age Policy, KYC Tiers & Underage Funds Hold')
        .setDescription('What happens if you are under 18, KYC checks, and account holds')
        .setValue('age_kyc')
        .setEmoji('🔞'),
      new StringSelectMenuOptionBuilder()
        .setLabel('2. AML Compliance, Playthrough & Opposite Betting')
        .setDescription('Mandatory wager turnover (1x–3x) and prohibited wash betting')
        .setValue('aml_turnover')
        .setEmoji('⚖️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('3. Multi-Accounting, Sybil Farming & Bug Exploits')
        .setDescription('Household/IP limits, alt detection, macros, and balance confiscation')
        .setValue('multi_account')
        .setEmoji('🚫'),
      new StringSelectMenuOptionBuilder()
        .setLabel('4. Crypto & Gift Card Redemptions, Audits & Fees')
        .setDescription('Payout windows, gas fees, blockchain finality, and pre-payout audits')
        .setValue('redemptions')
        .setEmoji('🎁'),
      new StringSelectMenuOptionBuilder()
        .setLabel('5. Chat Etiquette, No-Begging, RMT & Scam Defense')
        .setDescription('Community chat rules, RMT prohibition, and staff impersonation defense')
        .setValue('chat_scam')
        .setEmoji('💬'),
      new StringSelectMenuOptionBuilder()
        .setLabel('6. Enforcement & Penalty Matrix (Full Table)')
        .setDescription('Complete overview of infractions, account holds, and penalties')
        .setValue('matrix')
        .setEmoji('🛡️')
    );

  const rowDropdown = new ActionRowBuilder().addComponents(selectMenu);

  // Quick-Action Interactive Buttons below Dropdown
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rules_btn_kyc_faq')
      .setLabel('🔞 Underage & KYC Hold Policy')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('rules_btn_provably_fair')
      .setLabel('🎲 Provably Fair & House Odds')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('rules_btn_matrix')
      .setLabel('⚖️ Penalty Matrix')
      .setStyle(ButtonStyle.Secondary)
  );

  if (verifyCh) {
    rowButtons.addComponents(
      new ButtonBuilder()
        .setLabel('⚡ Verify Account')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${verifyCh.id}`)
    );
  }
  if (ticketCh) {
    rowButtons.addComponents(
      new ButtonBuilder()
        .setLabel('🎫 Support Desk')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${ticketCh.id}`)
    );
  }

  return {
    files: [rulesGif],
    embeds: [mainEmbed],
    components: [rowDropdown, rowButtons],
  };
}

/**
 * Handles interactions from the #rules dropdown menu and quick-info buttons.
 */
export async function handleRulesInteraction(interaction) {
  // 1. Dropdown Menu Selection
  if (interaction.isStringSelectMenu() && interaction.customId === 'rules_topic_select') {
    const selectedKey = interaction.values[0];
    const section = RULES_SECTIONS[selectedKey] || RULES_SECTIONS.age_kyc;

    const embed = new EmbedBuilder()
      .setColor(section.color)
      .setTitle(section.title)
      .setDescription(section.description)
      .setFooter({ text: section.footer })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  // 2. Quick-Info Buttons
  if (interaction.isButton()) {
    if (interaction.customId === 'rules_btn_kyc_faq') {
      const section = RULES_SECTIONS.age_kyc;
      const embed = new EmbedBuilder()
        .setColor(section.color)
        .setTitle(section.title)
        .setDescription(section.description)
        .setFooter({ text: section.footer })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'rules_btn_matrix') {
      const section = RULES_SECTIONS.matrix;
      const embed = new EmbedBuilder()
        .setColor(section.color)
        .setTitle(section.title)
        .setDescription(section.description)
        .setFooter({ text: section.footer })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'rules_btn_provably_fair') {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🎲  PROVABLY FAIR RNG & HOUSE EDGE DISCLOSURE')
        .setDescription(
          `> **Cryptographic Randomness & House Edge Transparency**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `### 🔐 1. Cryptographic RNG Engine\n` +
          `✦ All Moonflip games (**Mines, Crash, Keno, Coinflip, Blackjack, Slots**) are powered by Node.js cryptographic entropy (\`crypto.randomBytes\` / \`crypto.randomInt\`).\n` +
          `✦ Every round is settled server-side in real time with atomic wallet protection so outcomes cannot be manipulated by client latency.\n\n` +
          `### 🏛️ 2. House Edge & Entertainment Model\n` +
          `✦ Like Rainbet, Clash.gg, and all casino-style platforms, every game incorporates a built-in **House Edge** to fund promotional prize pools, daily token drops, and level-up rewards.\n` +
          `✦ **Play Responsibly**: Virtual tokens are entertainment points. Never wager more than you are comfortable losing, and remember that the House always holds a mathematical long-term edge.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'Moonflip Provably Fair Disclosure • Play Responsibly (18+)' })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

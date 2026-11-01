import { fetchGuild, destroyDiscordClient } from './discord.js';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getRulesBannerGif } from './games/animator.js';

async function updateRules() {
  const guild = await fetchGuild('1566215806956601466');
  const rulesCh = guild.channels.cache.find((c) => c.name.includes('rules'));
  const ticketCh = guild.channels.cache.find((c) => c.name.includes('ticket'));

  if (!rulesCh) {
    console.error('Rules channel not found!');
    return;
  }

  // Purge previous messages in rules channel
  const msgs = await rulesCh.messages.fetch({ limit: 10 });
  for (const [, m] of msgs) {
    await m.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f) // Sleek Gold
    .setTitle('🏆  SERVER RULES & PROMOTIONAL PRIZE REDEMPTION')
    .setDescription(
      `> Welcome to **${guild.name}**!\n` +
      `> Our server features virtual token games, community competitions, and **promotional prize redemption opportunities** (Crypto & Gift Cards). To ensure fair play, prevent fraud, and maintain compliance, all members must adhere to these guidelines.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      {
        name: '`[ 01 ]` 🪙 Virtual Tokens & Acquisition',
        value:
          'Tokens can be earned freely through server activity, community events, or acquired through official server channels. Tokens represent digital entertainment points and promotional contest entries.',
      },
      {
        name: '`[ 02 ]` 🎁 Prize Redemption (Crypto & Gift Cards)',
        value:
          'Eligible token balances can be redeemed for promotional rewards, including **cryptocurrency (e.g. USDT, LTC, BTC)** and **digital gift cards**. All redemptions are subject to security verification and stock availability.',
      },
      {
        name: '`[ 03 ]` 🔞 Strict 18+ Policy & Mandatory KYC Verification',
        value:
          'All prize redemptions are strictly limited to members **18 years of age or older**. Staff reserves the absolute right to request identity verification (KYC) before approving any crypto transfer or gift card code to prevent fraud and underage participation.',
      },
      {
        name: '`[ 04 ]` ⚖️ Anti-Money Laundering (AML) & Playthrough Turnover',
        value:
          'Purchased tokens cannot be deposited and immediately redeemed. A mandatory **playthrough / turnover requirement** must be completed through gameplay before redemptions can be approved, in compliance with standard AML regulations.',
      },
      {
        name: '`[ 05 ]` 🚫 Multi-Accounting & Exploitation Forfeiture',
        value:
          'Operating alternate accounts (alts), automated clickers, self-bots, or abusing system glitches to farm tokens or bypass limits is strictly prohibited. Any violation results in **immediate forfeiture of all tokens and a permanent ban**.',
      },
      {
        name: '`[ 06 ]` ⏱️ Processing, Review & Network Fees',
        value:
          'Redemptions are manually reviewed by staff and processed within **24–72 hours**. Crypto withdrawals are subject to standard blockchain network gas fees. Members are solely responsible for submitting correct wallet addresses; on-chain transactions cannot be reversed.',
      },
      {
        name: '`[ 07 ]` 🛡️ Anti-Scam & Security Awareness',
        value:
          `Staff will **NEVER** DM you first offering prizes, asking for wallet private keys, or providing unverified payment links. All official transactions, KYC reviews, and prize redemptions occur solely through server tickets in <#${ticketCh?.id || 'tickets'}>.`,
      },
      {
        name: '`[ 08 ]` 🤝 Respectful Community & Staff Discretion',
        value:
          'Treat all members and staff with respect. Toxicity, harassment, or verbal abuse over game results or redemption delays will result in mutes. Staff decisions regarding disputes, rollbacks, and account security are final.',
      }
    )
    .setFooter({
      text: 'Promotional Prize Program • 18+ Strictly Enforced • KYC & AML Protected',
      iconURL: guild.iconURL() || undefined,
    })
    .setImage('attachment://moonflip_rules_banner.gif')
    .setTimestamp();

  const rulesGif = new AttachmentBuilder(getRulesBannerGif(), {
    name: 'moonflip_rules_banner.gif',
  });

  await rulesCh.send({ embeds: [embed], files: [rulesGif] });
  console.log('Promotional prize rules embed updated successfully!');

  await destroyDiscordClient();
  process.exit(0);
}

updateRules().catch(console.error);

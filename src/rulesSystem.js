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
  web_arena: {
    color: 0x00f0ff,
    title: '🌐 Moonflip Web Application (All Games)',
    description:
      `> All Moonflip games (**Mines, Crash, Plinko, Coinflip**, and our full catalog) are hosted on our official WebApp!\n\n` +
      `• **How to Open:** Click **🎮 Play WebApp** in any channel or type \`/play\`.\n` +
      `• **1-Click Discord Sync:** No sign-up or passwords. Your Discord identity and wallet balance automatically link.\n` +
      `• **All Games Included:** Enjoy rich interactive animations, sound effects, auto-betting, and instant server settlements directly back to your Discord balance.`,
    footer: 'Moonflip • WebApp Guide',
  },

  age_kyc: {
    color: 0xe74c3c,
    title: '1. Age Eligibility (18+) & Verification',
    description:
      `• You must be **18 years of age or older** to participate in games, leaderboards, or prize redemptions.\n` +
      `• Accounts found to belong to minors will be closed and any associated balances voided.\n` +
      `• Identity verification (KYC) may be requested prior to processing prize redemptions.`,
    footer: 'Moonflip • Section 1',
  },

  aml_turnover: {
    color: 0xf1c40f,
    title: '2. Playthrough & Fair Wagering',
    description:
      `• Standard playthrough requirements apply to promotional and bonus tokens before redemption.\n` +
      `• Opposite betting (e.g., hedging both sides across accounts) or automated wash-betting does not count toward playthrough.`,
    footer: 'Moonflip • Section 2',
  },

  multi_account: {
    color: 0xe67e22,
    title: '3. One Account Policy & Fair Play',
    description:
      `• Limit **one Discord account per person**.\n` +
      `• Using alternate accounts to claim multiple \`/daily\` rewards, giveaways, or bonuses will result in account suspension.\n` +
      `• Macros, self-bots, or bug exploitation are prohibited. Please report any bugs via a support ticket.`,
    footer: 'Moonflip • Section 3',
  },

  redemptions: {
    color: 0x2ecc71,
    title: '4. Redemptions & Support Tickets',
    description:
      `• Eligible redemptions (crypto or gift cards) are handled through private tickets in the support channel.\n` +
      `• Always double-check your wallet address and network before confirming a payout.`,
    footer: 'Moonflip • Section 4',
  },

  chat_scam: {
    color: 0x9b59b6,
    title: '5. Community Conduct & Security',
    description:
      `• Be respectful in chat. Harassment, spam, begging for tokens, and external referral links are not allowed.\n` +
      `• Off-platform buying or selling of tokens (RMT) is prohibited.\n` +
      `• **Security Note**: Staff will never DM you first or ask for your passwords or private keys.`,
    footer: 'Moonflip • Section 5',
  },

  matrix: {
    color: 0x3498db,
    title: '6. Moderation Overview',
    description:
      `• **Chat Spam / Begging**: Warning or temporary mute\n` +
      `• **Alternate Accounts**: Account suspension and balance reset\n` +
      `• **Exploits / Automation**: Permanent ban\n` +
      `• **Scamming / Impersonation**: Permanent ban`,
    footer: 'Moonflip • Section 6',
  },
};

/**
 * Builds the primary aesthetic Rules & Terms of Service overview embeds + interactive dropdown & buttons.
 */
export function buildRulesChannelPayload(guild) {
  const ticketCh = guild.channels.cache.find(
    (c) => c.name.toLowerCase().includes('create-ticket') || c.name.toLowerCase().includes('tickets')
  );

  const rulesGif = new AttachmentBuilder(getRulesBannerGif(), {
    name: 'moonflip_rules_banner.gif',
  });

  const mainEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 Server Rules & WebApp')
    .setDescription(
      `> Welcome to **${guild.name}**! Please follow these guidelines to keep the community fair and enjoyable for everyone.\n\n` +
      `\`🌐\` **Official Web Application (All Games)**\n` +
      `> All games are hosted on our official WebApp! Launch it anytime via \`/play\` or the green button below — your Discord wallet, stats, and rank sync automatically.\n\n` +
      `\`1.\` **Age Requirement (18+)**\n` +
      `> Participation in games and prize redemptions is strictly restricted to members aged 18 and older.\n\n` +
      `\`2.\` **One Account Policy**\n` +
      `> Alternate accounts to farm \`/daily\` rewards or giveaways are prohibited. Automated scripts and exploits will result in bans.\n\n` +
      `\`3.\` **Community Conduct**\n` +
      `> Keep chat friendly. Token begging, spam, advertising, and off-platform trading (RMT) are not permitted.\n\n` +
      `\`4.\` **Support & Security**\n` +
      `> All support and redemption requests are handled in <#${ticketCh?.id || 'tickets'}>. Staff will **never** DM you first.\n\n` +
      `-# Select a topic below to read detailed policies.`
    )
    .setFooter({
      text: 'Moonflip Rules',
      iconURL: guild.iconURL() || undefined,
    });

  // Interactive Dropdown Menu (StringSelectMenu)
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('rules_topic_select')
    .setPlaceholder('Select a topic to read details...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('🌐 WebApp (All Games)')
        .setDescription('How to play all games in the WebApp with synced balance')
        .setValue('web_arena'),
      new StringSelectMenuOptionBuilder()
        .setLabel('1. Age Eligibility (18+)')
        .setDescription('Age requirement and verification')
        .setValue('age_kyc'),
      new StringSelectMenuOptionBuilder()
        .setLabel('2. Playthrough & Fair Wagering')
        .setDescription('Bonus turnover and fair betting rules')
        .setValue('aml_turnover'),
      new StringSelectMenuOptionBuilder()
        .setLabel('3. One Account Policy')
        .setDescription('Rules on alt accounts and automation')
        .setValue('multi_account'),
      new StringSelectMenuOptionBuilder()
        .setLabel('4. Redemptions & Tickets')
        .setDescription('How support and redemptions are processed')
        .setValue('redemptions'),
      new StringSelectMenuOptionBuilder()
        .setLabel('5. Community Conduct & Security')
        .setDescription('Chat guidelines and scam prevention')
        .setValue('chat_scam'),
      new StringSelectMenuOptionBuilder()
        .setLabel('6. Moderation Overview')
        .setDescription('Summary of moderation actions')
        .setValue('matrix')
    );

  const rowDropdown = new ActionRowBuilder().addComponents(selectMenu);

  // Quick-Action Interactive Buttons below Dropdown
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('launch_web_app')
      .setLabel('Play WebApp')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('rules_btn_web_guide')
      .setLabel('How to Play')
      .setEmoji('📖')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('rules_btn_provably_fair')
      .setLabel('Fairness & RNG')
      .setEmoji('⚖️')
      .setStyle(ButtonStyle.Secondary)
  );

  if (ticketCh) {
    rowButtons.addComponents(
      new ButtonBuilder()
        .setLabel('Support')
        .setEmoji('🎫')
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
    if (interaction.customId === 'rules_btn_web_guide') {
      const section = RULES_SECTIONS.web_arena;
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
        .setTitle('Fairness & RNG')
        .setDescription(
          `All Moonflip games (Mines, Crash, Plinko, Keno, Coinflip, Blackjack, Slots) use server-side cryptographic randomness (\`crypto.randomBytes\` / \`crypto.randomInt\`).\n\n` +
          `Each round is settled atomically on the server and includes a standard house edge. Play responsibly (18+).`
        )
        .setFooter({ text: 'Moonflip • Fairness' });

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

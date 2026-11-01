/**
 * Built-in server setup templates for automated Discord server generation.
 */
export const SERVER_TEMPLATES = {
  software_dev: {
    name: 'Software Engineering / Dev Team',
    description: 'Structure for dev teams with announcements, architecture, code reviews, standups and pair programming.',
    roles: [
      { name: 'Admin', color: '#E74C3C', hoist: true, mentionable: true, permissions: ['Administrator'] },
      { name: 'Tech Lead', color: '#9B59B6', hoist: true, mentionable: true, permissions: ['ManageChannels', 'ManageMessages', 'ViewChannel', 'SendMessages'] },
      { name: 'Developer', color: '#3498DB', hoist: true, mentionable: true, permissions: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
      { name: 'QA / Tester', color: '#2ECC71', hoist: true, mentionable: true, permissions: ['ViewChannel', 'SendMessages'] },
      { name: 'Contributor', color: '#95A5A6', hoist: false, mentionable: false, permissions: ['ViewChannel', 'SendMessages'] },
    ],
    categories: [
      {
        name: '📌 INFORMATION',
        channels: [
          { name: 'welcome-and-rules', type: 'text', topic: 'Server rules, onboarding instructions, and guidelines' },
          { name: 'announcements', type: 'announcement', topic: 'Important team and project announcements' },
          { name: 'useful-links', type: 'text', topic: 'Docs, repositories, issue trackers, CI/CD dashboards' },
        ],
      },
      {
        name: '💻 DEVELOPMENT',
        channels: [
          { name: 'general-dev', type: 'text', topic: 'General engineering discussions and questions' },
          { name: 'architecture', type: 'text', topic: 'RFCs, system design, and technical decisions' },
          { name: 'pull-requests', type: 'text', topic: 'PR notifications and review requests' },
          { name: 'bug-reports', type: 'text', topic: 'Issue triage and debugging' },
          { name: 'releases', type: 'text', topic: 'Changelogs and deployment updates' },
        ],
      },
      {
        name: '💬 WATERCOOLER',
        channels: [
          { name: 'casual-chat', type: 'text', topic: 'Non-work chatter and coffee breaks' },
          { name: 'tech-news', type: 'text', topic: 'Articles, tooling, and new tech releases' },
        ],
      },
      {
        name: '🔊 VOICE ROOMS',
        channels: [
          { name: 'Daily Standup', type: 'voice' },
          { name: 'Pair Programming 1', type: 'voice' },
          { name: 'Pair Programming 2', type: 'voice' },
          { name: 'Lounge', type: 'voice' },
        ],
      },
    ],
  },

  gaming: {
    name: 'Gaming Community / Clan',
    description: 'Structure for gaming communities with general chat, media, LFG, and squad voice rooms.',
    roles: [
      { name: 'Owner', color: '#E91E63', hoist: true, mentionable: true, permissions: ['Administrator'] },
      { name: 'Moderator', color: '#3498DB', hoist: true, mentionable: true, permissions: ['KickMembers', 'BanMembers', 'ManageMessages', 'MuteMembers'] },
      { name: 'VIP', color: '#F1C40F', hoist: true, mentionable: true, permissions: ['ViewChannel', 'SendMessages', 'AttachFiles'] },
      { name: 'Member', color: '#2ECC71', hoist: false, mentionable: false, permissions: ['ViewChannel', 'SendMessages'] },
    ],
    categories: [
      {
        name: '📌 WELCOME',
        channels: [
          { name: 'rules', type: 'text', topic: 'Server guidelines and etiquette' },
          { name: 'announcements', type: 'announcement', topic: 'News and tournament announcements' },
        ],
      },
      {
        name: '💬 COMMUNITY',
        channels: [
          { name: 'general-chat', type: 'text', topic: 'Hang out and chat' },
          { name: 'clips-and-memes', type: 'text', topic: 'Share gameplay clips, screenshots, and memes' },
          { name: 'bot-commands', type: 'text', topic: 'Music bots, mini-games, and commands' },
        ],
      },
      {
        name: '🎮 LOBBIES & LFG',
        channels: [
          { name: 'looking-for-group', type: 'text', topic: 'Find teammates and squad up' },
          { name: 'ranked-lfg', type: 'text', topic: 'Competitive team matchmaking' },
        ],
      },
      {
        name: '🔊 VOICE CHANNELS',
        channels: [
          { name: 'Lobby 1', type: 'voice' },
          { name: 'Lobby 2', type: 'voice' },
          { name: 'Duo Room', type: 'voice' },
          { name: 'Squad Room', type: 'voice' },
          { name: 'AFK', type: 'voice' },
        ],
      },
    ],
  },

  community: {
    name: 'General Community & Discussion',
    description: 'Clean community structure with information, discussion, showcase, and social voice channels.',
    roles: [
      { name: 'Admin', color: '#E74C3C', hoist: true, mentionable: true, permissions: ['Administrator'] },
      { name: 'Moderator', color: '#3498DB', hoist: true, mentionable: true, permissions: ['ManageMessages', 'KickMembers'] },
      { name: 'Active Member', color: '#2ECC71', hoist: true, mentionable: false, permissions: ['ViewChannel', 'SendMessages'] },
      { name: 'Member', color: '#95A5A6', hoist: false, mentionable: false, permissions: ['ViewChannel', 'SendMessages'] },
    ],
    categories: [
      {
        name: '📌 INFORMATION',
        channels: [
          { name: 'welcome-and-rules', type: 'text', topic: 'Server information and rules' },
          { name: 'announcements', type: 'announcement', topic: 'Official updates and announcements' },
          { name: 'introductions', type: 'text', topic: 'Introduce yourself to the community' },
        ],
      },
      {
        name: '💬 GENERAL',
        channels: [
          { name: 'general-chat', type: 'text', topic: 'Open conversation for everyone' },
          { name: 'questions-and-help', type: 'text', topic: 'Ask questions and get community assistance' },
          { name: 'showcase', type: 'text', topic: 'Share your work and projects' },
          { name: 'off-topic', type: 'text', topic: 'Random discussions and hobbies' },
        ],
      },
      {
        name: '🔊 VOICE',
        channels: [
          { name: 'Community Lounge', type: 'voice' },
          { name: 'Study & Chill', type: 'voice' },
        ],
      },
    ],
  },

  minimal: {
    name: 'Minimal Clean Setup',
    description: 'A minimal discord setup with essential channels.',
    roles: [
      { name: 'Admin', color: '#E74C3C', hoist: true, mentionable: true, permissions: ['Administrator'] },
      { name: 'Member', color: '#3498DB', hoist: false, mentionable: false, permissions: ['ViewChannel', 'SendMessages'] },
    ],
    categories: [
      {
        name: '💬 GENERAL',
        channels: [
          { name: 'announcements', type: 'announcement', topic: 'Announcements' },
          { name: 'general', type: 'text', topic: 'General discussion' },
        ],
      },
      {
        name: '🔊 VOICE',
        channels: [
          { name: 'General Voice', type: 'voice' },
        ],
      },
    ],
  },
};

/**
 * Parses a free-form natural language prompt into a server blueprint.
 */
export function generatePlanFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return SERVER_TEMPLATES.community;
  }

  const p = prompt.toLowerCase();

  // Match keyword templates
  if (p.includes('game') || p.includes('gaming') || p.includes('clan') || p.includes('esports') || p.includes('stream')) {
    return SERVER_TEMPLATES.gaming;
  }
  if (p.includes('dev') || p.includes('code') || p.includes('software') || p.includes('programming') || p.includes('engineering') || p.includes('github') || p.includes('tech')) {
    return SERVER_TEMPLATES.software_dev;
  }
  if (p.includes('minimal') || p.includes('simple') || p.includes('basic')) {
    return SERVER_TEMPLATES.minimal;
  }

  // Fallback to community template
  return SERVER_TEMPLATES.community;
}

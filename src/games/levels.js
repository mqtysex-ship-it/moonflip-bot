import { getUser } from './economy.js';

/**
 * Level progression math:
 * Required XP for level L = Math.floor(100 * Math.pow(L, 1.5))
 */
export function getRequiredXpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function getTotalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += getRequiredXpForLevel(i);
  }
  return total;
}

export const LEVEL_TIERS = [
  { level: 50, roleName: 'High Roller Elite', color: '#8A2BE2', bonus: 15000 },
  { level: 35, roleName: 'Diamond VIP', color: '#00FFFF', bonus: 5000 },
  { level: 20, roleName: 'Gold Tier', color: '#FFD700', bonus: 2000 },
  { level: 10, roleName: 'Silver Tier', color: '#C0C0C0', bonus: 750 },
  { level: 5, roleName: 'Bronze Tier', color: '#CD7F32', bonus: 250 },
];

export function getUserLevelData(userId) {
  const user = getUser(userId);
  if (user.xp === undefined) user.xp = 0;
  if (user.level === undefined) user.level = 1;

  let currentLevel = user.level;
  let reqXp = getRequiredXpForLevel(currentLevel);

  return {
    userId,
    xp: user.xp,
    level: currentLevel,
    requiredXp: reqXp,
    progressPercent: Math.min(100, Math.floor((user.xp / reqXp) * 100)),
  };
}

export function addXp(userId, amount) {
  const user = getUser(userId);
  if (user.xp === undefined) user.xp = 0;
  if (user.level === undefined) user.level = 1;

  user.xp += amount;
  let leveledUp = false;
  let newLevel = user.level;
  let rewardedTier = null;
  let tokenBonus = 0;

  let reqXp = getRequiredXpForLevel(user.level);
  while (user.xp >= reqXp) {
    user.xp -= reqXp;
    user.level += 1;
    newLevel = user.level;
    leveledUp = true;

    // Check if hit a special tier
    const tier = LEVEL_TIERS.find((t) => t.level === newLevel);
    if (tier) {
      rewardedTier = tier;
      tokenBonus += tier.bonus;
    } else {
      tokenBonus += 100; // Base level up bonus
    }

    reqXp = getRequiredXpForLevel(user.level);
  }

  if (leveledUp && tokenBonus > 0) {
    user.balance += tokenBonus;
  }

  return {
    leveledUp,
    oldLevel: user.level - (leveledUp ? 1 : 0),
    newLevel,
    rewardedTier,
    tokenBonus,
    currentXp: user.xp,
    requiredXp: reqXp,
  };
}

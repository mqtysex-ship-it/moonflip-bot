import { validateSnapshot } from './snapshot.js';

// Cutover policy explicitly approved: remote wallet fields, local XP/level.
// Keep original sources separately; this function never mutates either source.
export function reconcileSources(local, remote) {
  const snapshot = structuredClone(local);
  if (!snapshot?.users || !Array.isArray(remote?.players)) throw new Error('Invalid source snapshots');
  const decisions = [];
  for (const [id, user] of Object.entries(snapshot.users)) {
    if (user.xp === undefined || user.level === undefined) {
      // Exactly matches legacy getUserLevelData initialization, not an inferred score.
      user.xp ??= 0;
      user.level ??= 1;
      decisions.push({ userId: id, action: 'legacy-default-level-initialization' });
    }
  }
  for (const player of remote.players) {
    const target = snapshot.users[player.userId];
    if (!target) throw new Error(`Remote user ${player.userId}: missing local XP; cannot invent a migration value`);
    const previousBalance = target.balance;
    for (const field of ['balance', 'totalBet', 'totalWon', 'gamesPlayed', 'createdAt']) target[field] = player[field];
    target.lastDaily = player.lastDaily ?? 0;
    for (const field of ['username', 'avatarUrl']) if (player[field] != null) target[field] = player[field];
    decisions.push({ userId: player.userId, action: 'remote-wallet-local-xp', previousBalance, balance: target.balance });
  }
  validateSnapshot(snapshot);
  return { snapshot, decisions };
}

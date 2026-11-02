// A public leaderboard is not a complete backup: it omits XP and level.
// Refuse incomplete snapshots instead of silently inventing player data.
export function validateSnapshot(snapshot) {
  if (!snapshot || !snapshot.users || typeof snapshot.users !== 'object' || Array.isArray(snapshot.users)) {
    throw new Error('Incomplete snapshot: expected the full users object, including xp and level');
  }
  const entries = Object.entries(snapshot.users);
  if (!entries.length) throw new Error('Snapshot is empty');
  const fields = ['balance', 'lastDaily', 'totalBet', 'totalWon', 'gamesPlayed', 'xp', 'level', 'createdAt'];
  for (const [id, user] of entries) {
    if (!/^[0-9]{1,20}$/.test(id)) throw new Error(`Invalid user ID: ${id}`);
    if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error(`Invalid user record: ${id}`);
    for (const field of fields) {
      const value = user[field];
      if (!Number.isSafeInteger(value) || value < (field === 'level' ? 1 : 0)) {
        throw new Error(`Invalid or missing ${field} for user ${id}`);
      }
    }
    for (const field of ['username', 'avatarUrl']) {
      if (user[field] != null && typeof user[field] !== 'string') throw new Error(`Invalid ${field} for user ${id}`);
    }
  }
  return snapshot;
}

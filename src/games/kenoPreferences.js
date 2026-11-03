const defaults = {
  betAmount: 100,
  riskMode: 'medium',
  picks: [3, 7, 11, 15, 19],
  lastDrawn: [],
  streak: 0,
  roundsPlayed: 0,
};

export function createKenoPreferences(store) {
  return {
    async load(userId) {
      const doc = await store.read('user_preferences', {});
      const raw = doc[userId]?.keno || {};
      const validPicks = Array.isArray(raw.picks) && raw.picks.length >= 2 ? raw.picks : defaults.picks;
      return {
        userId,
        betAmount: Number(raw.betAmount) || defaults.betAmount,
        riskMode: raw.riskMode || defaults.riskMode,
        picks: new Set(validPicks),
        lastDrawn: Array.isArray(raw.lastDrawn) ? raw.lastDrawn : [],
        streak: Number(raw.streak) || 0,
        roundsPlayed: Number(raw.roundsPlayed) || 0,
      };
    },
    async save(userId, session) {
      return store.update('user_preferences', {}, (doc) => {
        doc[userId] ||= {};
        doc[userId].keno = {
          betAmount: session.betAmount ?? defaults.betAmount,
          riskMode: session.riskMode ?? defaults.riskMode,
          picks: Array.from(session.picks ?? defaults.picks),
          lastDrawn: Array.isArray(session.lastDrawn) ? session.lastDrawn : [],
          streak: session.streak ?? 0,
          roundsPlayed: session.roundsPlayed ?? 0,
        };
        return doc[userId].keno;
      });
    },
  };
}

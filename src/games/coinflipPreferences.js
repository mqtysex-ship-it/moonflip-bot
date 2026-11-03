export function createCoinflipPreferences(store) {
  return {
    async load(userId) {
      const doc = await store.read('user_preferences', {});
      return Number(doc[userId]?.coinflip?.streak) || 0;
    },
    async save(userId, streak) {
      return store.update('user_preferences', {}, (doc) => {
        doc[userId] ||= {};
        doc[userId].coinflip = { ...(doc[userId].coinflip || {}), streak: Number(streak) || 0 };
        return doc[userId].coinflip;
      });
    },
  };
}

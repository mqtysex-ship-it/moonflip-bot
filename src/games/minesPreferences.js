const defaults = { bet: 100, bombs: 3 };

export function createMinesPreferences(store) {
  return {
    async load(userId) {
      const doc = await store.read('user_preferences', {});
      return { ...defaults, ...(doc[userId]?.mines || {}) };
    },
    async save(userId, prefs) {
      return store.update('user_preferences', {}, (doc) => {
        doc[userId] ||= {};
        doc[userId].mines = { ...defaults, ...(doc[userId].mines || {}), ...prefs };
        return doc[userId].mines;
      });
    },
  };
}

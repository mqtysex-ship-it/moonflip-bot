const defaults = { betAmount: 100, autoCashout: null, streak: 0 };
export function createCrashPreferences(store) {
  return {
    async load(userId) {
      const doc = await store.read('user_preferences', {});
      return { ...defaults, ...(doc[userId]?.crash || {}) };
    },
    async save(userId, prefs) {
      return store.update('user_preferences', {}, doc => {
        doc[userId] ||= {};
        doc[userId].crash = { ...defaults, ...(doc[userId].crash || {}), ...prefs };
        return doc[userId].crash;
      });
    },
  };
}

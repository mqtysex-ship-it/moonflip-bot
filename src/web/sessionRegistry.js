// The database stores only a hash of the bearer secret, never the token itself.
import { createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
export function createSessionRegistry(store) {
  return {
    async activate(userId, token) { await store.write(`web-session/${userId}`, { tokenHash: digest(token) }); },
    async isActive(userId, token) {
      const record = await store.read(`web-session/${userId}`);
      return !!record && record.tokenHash === digest(token);
    },
  };
}

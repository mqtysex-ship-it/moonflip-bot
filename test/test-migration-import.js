import assert from 'node:assert/strict';
import { importSnapshot } from '../src/migration/importSnapshot.js';

const player = { balance: 1234, lastDaily: 0, totalBet: 12, totalWon: 20, gamesPlayed: 2, xp: 9, level: 2, createdAt: 1700000000000 };
function fakeDb(existing = false, failInsert = false) {
  const queries = []; let released = false;
  return { queries, get released() { return released; }, async connect() { return {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('count(*)')) return { rows: [{ count: existing ? '1' : '0' }] };
      if (sql.includes('INSERT INTO') && failInsert) throw new Error('insert failed');
      return { rows: [] };
    }, release() { released = true; },
  }; } };
}
const snapshot = { users: { '123456789012345678': player } };
const pool = fakeDb();
assert.equal(await importSnapshot(pool, snapshot), 1);
assert.equal(pool.queries.at(-1).sql, 'COMMIT');
assert(pool.released);
const insert = pool.queries.find(q => q.sql.includes('INSERT INTO'));
assert.equal(insert.params[0], '123456789012345678');
assert.equal(insert.params[1], 1234);
assert.equal(insert.params[5], null);
const nonempty = fakeDb(true);
await assert.rejects(importSnapshot(nonempty, snapshot), /not empty/);
assert.equal(nonempty.queries.at(-1).sql, 'ROLLBACK');
assert(nonempty.released);
const broken = fakeDb(false, true);
await assert.rejects(importSnapshot(broken, snapshot), /insert failed/);
assert.equal(broken.queries.at(-1).sql, 'ROLLBACK');
assert(broken.released);
await assert.rejects(importSnapshot(fakeDb(), { players: [] }), /incomplete/i);
console.log('Migration import safeguards passed');

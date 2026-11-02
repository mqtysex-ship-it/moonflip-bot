import assert from 'node:assert/strict';
import { PostgresDocumentStore } from '../src/postgresDocumentStore.js';

// A transaction fake is necessary here to test failure propagation without a
// production connection; the SQL transaction is separately tested on Postgres.
let saved = { counter: 1, activeTickets: {} };
let commits = 0;
let rolledBack = 0;
const client = { async query(sql, args) {
  if (sql === 'COMMIT') { commits++; return {}; }
  if (sql === 'ROLLBACK') { rolledBack++; return {}; }
  if (sql.startsWith('SELECT')) return { rows: [{ value: structuredClone(saved) }] };
  if (sql.startsWith('UPDATE')) { saved = JSON.parse(args[1]); return {}; }
  return { rows: [] };
}, release() {} };
const store = new PostgresDocumentStore({ connect: async () => client, query: client.query });
const result = await store.update('tickets', {}, data => { data.counter++; return data.counter; });
assert.equal(result, 2);
assert.equal(saved.counter, 2);
assert.equal(commits, 1);
await assert.rejects(store.update('tickets', {}, () => { throw new Error('abort'); }), /abort/);
assert.equal(rolledBack, 1);
assert.equal(commits, 1);
assert.equal(saved.counter, 2);
await assert.rejects(store.update('', {}, () => {}), /document key/);
console.log('Document transaction commit and rollback passed');

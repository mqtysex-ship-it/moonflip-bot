import assert from 'node:assert/strict';
import { validateSnapshot } from '../src/migration/snapshot.js';

const player = { balance: 1234, lastDaily: 0, totalBet: 12, totalWon: 20, gamesPlayed: 2, xp: 9, level: 2, createdAt: 1700000000000 };
const snapshot = { users: { '123456789012345678': player } };
assert.deepEqual(validateSnapshot(snapshot).users, snapshot.users);
assert.throws(() => validateSnapshot({ players: [{ userId: '123456789012345678', ...player, xp: undefined }] }), /incomplete|xp/i);
assert.throws(() => validateSnapshot({ users: { '123456789012345678': { ...player, balance: -1 } } }), /balance/i);
assert.throws(() => validateSnapshot({ users: { '123456789012345678': { ...player, balance: Number.MAX_SAFE_INTEGER + 1 } } }), /balance/i);
assert.throws(() => validateSnapshot({ users: { 'bad': player } }), /user id/i);
assert.throws(() => validateSnapshot({ users: {} }), /empty/i);
console.log('Migration snapshot validation passed');

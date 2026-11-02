import assert from 'node:assert/strict';
import { createEconomyPool } from '../src/games/postgresPool.js';
let captured;
class FakePool { constructor(config) { captured = config; } }
const url = 'postgresql://test:secret@example.invalid:5432/postgres';
assert(createEconomyPool(url, FakePool) instanceof FakePool);
assert.equal(captured.connectionString, url);
assert.equal(captured.ssl.rejectUnauthorized, true);
assert(captured.max > 0 && captured.max <= 10);
assert.throws(() => createEconomyPool('', FakePool), /DATABASE_URL/);
assert.throws(() => createEconomyPool('https://example.invalid', FakePool), /Postgres/);
assert.throws(() => createEconomyPool(`${url}?sslmode=disable`, FakePool), /SSL/);
createEconomyPool('postgresql://postgres.project:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres', FakePool);
assert.match(captured.ssl.ca ?? '', /BEGIN CERTIFICATE/, 'Supabase connections must trust the official CA');
assert.equal(captured.ssl.rejectUnauthorized, true, 'Certificate verification must remain enabled');
createEconomyPool(url, FakePool);
assert.equal(captured.ssl.ca, undefined, 'Other database hosts use the default trust store');
console.log('Postgres pool configuration passed');

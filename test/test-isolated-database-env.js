import assert from 'node:assert/strict';
assert.equal(process.env.MOONFLIP_ISOLATED_TEST, '1');
assert.equal(process.env.DATABASE_URL, undefined, 'isolated tests must not receive a real database URL');
console.log('Isolated tests do not receive production database credentials');

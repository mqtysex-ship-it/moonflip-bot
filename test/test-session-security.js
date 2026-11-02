import assert from 'node:assert/strict';
import { signSession, verifySession } from '../src/web/sessionSecurity.js';

const secret = 'test-only-secret';
const now = 2_000_000_000_000;
const token = signSession({ u: '123', t: now }, secret);
assert.equal(verifySession(token, secret, now).u, '123');
assert.equal(verifySession(token, secret, now + 30 * 24 * 60 * 60 * 1000 + 1), null);
assert.equal(verifySession(token, 'wrong-secret', now), null);
assert.equal(verifySession(signSession({ u: '123' }, secret), secret, now), null);
console.log('Session security passed');

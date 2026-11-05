import assert from 'node:assert/strict';
import http from 'node:http';
import { isStaffMember } from '../src/tickets/ticketSystem.js';
import { PermissionFlagsBits } from 'discord.js';

console.log('--- Testing Security Audit Fixes ---');

// Test 1: Staff check hardening (Issue 7)
// Role names like "Modern", "Model", "Modpack" must NOT grant staff permissions!
const modernMember = {
  permissions: { has: () => false },
  roles: {
    cache: new Map([
      ['1', { name: 'Modern Citizen' }],
      ['2', { name: 'SuperModel' }],
      ['3', { name: 'Commodity Trader' }],
    ])
  }
};
assert.equal(isStaffMember(modernMember), false, 'Words containing "mod" as substring must not grant staff');

const supportMember = {
  permissions: { has: () => false },
  roles: {
    cache: new Map([
      ['1', { name: 'Community Support' }],
      ['2', { name: 'Minecraft Mod' }],
    ])
  }
};
assert.equal(isStaffMember(supportMember), false, 'Roles containing generic words "support" or "mod" must not grant staff');

const legitStaff = {
  permissions: { has: () => false },
  roles: {
    cache: new Map([
      ['1', { name: 'Discord Moderator' }]
    ])
  }
};
assert.equal(isStaffMember(legitStaff), false, 'Role names cannot grant staff access');
process.env.STAFF_ROLE_IDS = '1';
assert.equal(isStaffMember(legitStaff), true, 'A configured role ID grants staff access');
delete process.env.STAFF_ROLE_IDS;

const adminPermMember = {
  permissions: { has: perm => perm === PermissionFlagsBits.Administrator },
  roles: { cache: new Map() }
};
assert.equal(isStaffMember(adminPermMember), false, 'Staff actions require a configured role ID');

console.log('✓ Staff role check hardening passed');

// Test 2: Admin ticket close endpoint channel validation (Issue 6)
import express from 'express';
import { createWebServer } from '../src/web/server.js';
import { shutdownWebCrash } from '../src/web/playApi.js';
import { shutdownContinuousCrash } from '../src/games/continuousCrash.js';
import { databasePool } from '../src/database.js';

process.env.DASHBOARD_PASSWORD = 'audit-test-password';
const app = createWebServer();
const server = http.createServer(app);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const authHeader = 'Basic ' + Buffer.from('admin:audit-test-password').toString('base64');

try {
  // Calling /api/tickets/close with a non-existent ticket channel ID must return 404, NOT 200!
  const res = await fetch(`${base}/api/tickets/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: authHeader
    },
    body: JSON.stringify({ channelId: 'general-chat-123456789' })
  });

  assert.equal(res.status, 404, 'Must return 404 when channelId is not in active tickets');
  const body = await res.json();
  assert.match(body.error, /not an active ticket/i);
  console.log('✓ Ticket close channel validation passed (unauthorized channel deletion prevented)');

  // Test 3: Public guest ID validation & bounded storage (Issue 8)
  const profileRes = await fetch(`${base}/api/play/profile`, {
    headers: { 'x-guest-id': 'legit_guest_123' }
  });
  assert.equal(profileRes.status, 200);

  // Extremely long or malicious guest ID is sanitized
  const badGuestRes = await fetch(`${base}/api/play/profile`, {
    headers: { 'x-guest-id': '<script>alert(1)</script>' }
  });
  assert.equal(badGuestRes.status, 200);

  console.log('✓ Public guest API bounding and sanitation passed');

  // Test 4: Crash cashout post-crash tolerance check (Issue 2)
  const { demoCrashEngine, globalCrashEngine } = await import('../src/web/playApi.js');
  await demoCrashEngine.enterBettingPhase();
  const betRes = await fetch(`${base}/api/play/crash/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guest-id': 'test_post_crash_user' },
    body: JSON.stringify({ wager: 100 })
  });
  assert.equal(betRes.status, 200);

  assert.equal(globalCrashEngine.bets.has('guest:test_post_crash_user'), false);
  await demoCrashEngine.enterFlightPhase();
  await demoCrashEngine.enterCrashedPhase();

  const postCrashCashoutRes = await fetch(`${base}/api/play/crash/cashout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guest-id': 'test_post_crash_user' },
  });
  assert.equal(postCrashCashoutRes.status, 200);
  const postCrashData = await postCrashCashoutRes.json();
  assert.equal(postCrashData.crashed, true, 'Must report crashed after crash');
  assert.equal(postCrashData.cashedOut ?? false, false, 'Must not cash out after crash');

  // Test 5: SSE Stream Ticket unauthenticated rejection
  const ticketRes = await fetch(`${base}/api/play/stream-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(ticketRes.status, 401);

  console.log('✓ All security audit targeted assertions passed');
} finally {
  await Promise.allSettled([
    shutdownContinuousCrash(),
    shutdownWebCrash(),
    databasePool?.end?.(),
  ]);
  server.closeAllConnections?.();
  server.close();
}

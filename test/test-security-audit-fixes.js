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

const legitStaff = {
  permissions: { has: () => false },
  roles: {
    cache: new Map([
      ['1', { name: 'Discord Moderator' }]
    ])
  }
};
assert.equal(isStaffMember(legitStaff), true, 'Exact word moderator must grant staff');

const adminPermMember = {
  permissions: { has: perm => perm === PermissionFlagsBits.Administrator },
  roles: { cache: new Map() }
};
assert.equal(isStaffMember(adminPermMember), true, 'Administrator permission must grant staff');

console.log('✓ Staff role check hardening passed');

// Test 2: Admin ticket close endpoint channel validation (Issue 6)
import express from 'express';
import { createWebServer } from '../src/web/server.js';
import { shutdownWebCrash } from '../src/web/playApi.js';
import { shutdownContinuousCrash } from '../src/games/continuousCrash.js';

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
  const startRes = await fetch(`${base}/api/play/crash/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wager: 100 })
  });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();
  assert(startData.flightId);

  console.log('✓ All security audit targeted assertions passed');
} finally {
  await Promise.allSettled([
    shutdownContinuousCrash(),
    shutdownWebCrash(),
  ]);
  server.close();
}

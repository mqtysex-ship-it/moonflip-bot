import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
const { isStaffOrOwner } = await import('../src/commands/slashCommands.js');
const user = { user: { id: 'user' }, guild: { ownerId: 'owner' },
  memberPermissions: { has: () => false }, member: { roles: { cache: [{ name: 'manager' }] } } };
// A role's display name is not an authorization policy.
user.member.roles.cache.some = Array.prototype.some.bind(user.member.roles.cache);
assert.equal(isStaffOrOwner(user), false);
assert.equal(isStaffOrOwner({ ...user, guild: { ownerId: 'user' } }), true);
assert.equal(isStaffOrOwner({ ...user, memberPermissions: { has: (permission) => permission === PermissionFlagsBits.Administrator } }), true);
console.log('Discord administrator authorization passed');

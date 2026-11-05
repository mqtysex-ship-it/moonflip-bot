import assert from 'node:assert/strict';
import { generateMinesBombs, calculateMinesMultiplier, flipCoin } from '../src/games/rng.js';

for (let i = 0; i < 100; i++) {
  const bombs = generateMinesBombs(25, 5);
  assert.equal(bombs.size, 5, 'Must generate exactly 5 bombs');
  assert.ok(Array.from(bombs).every((b) => b >= 0 && b < 25), 'Bomb indices must be within 0..24');
}

const m1 = calculateMinesMultiplier(25, 3, 1);
assert.ok(m1 >= 1.01, 'Multiplier must scale with gems');

for (let i = 0; i < 50; i++) {
  const coin = flipCoin('heads', 100);
  assert.ok(coin === 'heads' || coin === 'tails', 'Coinflip outcome must be heads or tails');
}

console.log('RNG integrity passed');

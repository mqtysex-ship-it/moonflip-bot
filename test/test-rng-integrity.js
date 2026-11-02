import assert from 'node:assert/strict';
import { drawKenoNumbers } from '../src/games/rng.js';

for (let i = 0; i < 100; i++) {
  const numbers = drawKenoNumbers(40, 10);
  assert.equal(numbers.length, 10);
  assert.equal(new Set(numbers).size, 10, 'A Keno draw must not contain duplicate numbers');
  assert.ok(numbers.every((number) => number >= 1 && number <= 40));
}
console.log('Keno draw integrity passed');

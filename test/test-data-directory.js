import assert from 'node:assert/strict';
import path from 'node:path';
import { getDataDirectory } from '../src/dataDirectory.js';
const configured = path.resolve('isolated-persistent-data');
assert.equal(getDataDirectory(configured), configured);
assert.ok(path.isAbsolute(getDataDirectory()));
console.log('Configurable persistent data directory passed');

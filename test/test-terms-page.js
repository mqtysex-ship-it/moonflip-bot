import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../src/web/public/play/index.html', import.meta.url), 'utf8');
assert.match(index, /href="\/play\/terms\.html"[^>]*>Terms of Service<\/a>/);
const terms = await readFile(new URL('../src/web/public/play/terms.html', import.meta.url), 'utf8');
assert.match(terms, /Draft/i);
assert.match(terms, /18 years/i);
assert.match(terms, /cryptocurrency/i);
assert.match(terms, /gift cards/i);
console.log('Terms link and draft content verified');

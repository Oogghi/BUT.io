import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeWord } from '../games/bomb-party/src/index.ts';

// Rebuild the pinned local word list from Lexique 4.00's TSV, never during server startup.
const source = readFileSync(process.argv[2]);
const lines = source.toString('utf8').trim().split(/\r?\n/);
if (!lines.shift().startsWith('1_Mot\t'))
  throw new Error('Expected Lexique 4.00 TSV.');
const words = new Set();
for (const line of lines) {
  const original = line.split('\t', 1)[0];
  if (!/^[a-zà-öø-ÿœæ]+(?:[-'’][a-zà-öø-ÿœæ]+)*$/iu.test(original)) continue;
  const word = normalizeWord(original);
  if (/^[a-z]{2,40}$/.test(word)) words.add(word);
}
const folder = new URL('../games/bomb-party/data/', import.meta.url);
mkdirSync(folder, { recursive: true });
writeFileSync(
  new URL('french.txt', folder),
  [...words].sort().join('\n') + '\n',
);
console.log(
  JSON.stringify({
    words: words.size,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
  }),
);

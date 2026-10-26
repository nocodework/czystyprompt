// Buduje src/data/names.js z otwartych danych rejestru PESEL (dane.gov.pl).
// Uruchom: node scripts/build-data.mjs  (najpierw: ./scripts/fetch-data.sh)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => join(root, 'data-raw', f);

const FIRST_MIN = 200; // ~99% osób
const SURNAME_MIN = 100; // ~87% osób

function load(file) {
  const rows = readFileSync(raw(file), 'utf8').split(/\r?\n/).slice(1);
  const out = new Map();
  for (const row of rows) {
    const i = row.lastIndexOf(',');
    if (i < 0) continue;
    // liczby bywają zapisane z separatorem tysięcy, np. "139 325" (bez cudzysłowów)
    const name = row.slice(0, row.indexOf(',')).trim().toLocaleLowerCase('pl');
    const count = Number(row.slice(row.indexOf(',') + 1).replace(/[^\d]/g, ''));
    if (!name || !Number.isFinite(count)) continue;
    out.set(name, (out.get(name) ?? 0) + count);
  }
  return out;
}

const firstM = load('imiona_m.csv');
const firstF = load('imiona_k.csv');
const surM = load('nazwiska_m.csv');
const surF = load('nazwiska_k.csv');

const valid = (s) => /^[a-ząćęłńóśźż]+(?:-[a-ząćęłńóśźż]+)?$/.test(s) && s.length >= 3;

// Imię trafia do płci, w której występuje częściej
function pickFirst(own, other) {
  const out = [];
  for (const [name, n] of own) {
    if (n < FIRST_MIN || !valid(name)) continue;
    if ((other.get(name) ?? 0) > n) continue;
    out.push([name, n]);
  }
  return out.sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

const fem = (s) => {
  if (/(sk|ck|dzk|zk)i$/.test(s)) return s.slice(0, -1) + 'a';
  if (/[^aąeęioóuy]y$/.test(s)) return s.slice(0, -1) + 'a';
  return s;
};

const M = [...surM].filter(([s, n]) => n >= SURNAME_MIN && valid(s)).sort((a, b) => b[1] - a[1]).map(([s]) => s);
const derived = new Set(M.map(fem));
const F_EXTRA = [...surF]
  .filter(([s, n]) => n >= SURNAME_MIN && valid(s) && !derived.has(s))
  .sort((a, b) => b[1] - a[1])
  .map(([s]) => s);

const FIRST_M = pickFirst(firstM, firstF);
const FIRST_F = pickFirst(firstF, firstM);

const header = `// WYGENEROWANE przez scripts/build-data.mjs — nie edytuj ręcznie.
// Źródło: dane.gov.pl, rejestr PESEL (imiona pierwsze osób żyjących 2020-01-21 ≥ ${FIRST_MIN} osób,
// nazwiska 2019-04-15 ≥ ${SURNAME_MIN} osób). Dane publiczne, ponowne wykorzystanie bez ograniczeń.
`;
const js =
  header +
  `export const FIRST_M = ${JSON.stringify(FIRST_M.join('|'))};\n` +
  `export const FIRST_F = ${JSON.stringify(FIRST_F.join('|'))};\n` +
  `export const SURNAMES_M = ${JSON.stringify(M.join('|'))};\n` +
  `export const SURNAMES_F_EXTRA = ${JSON.stringify(F_EXTRA.join('|'))};\n`;

writeFileSync(join(root, 'src', 'data', 'names.js'), js);
console.log(`imiona m: ${FIRST_M.length}, ż: ${FIRST_F.length}; nazwiska m: ${M.length}, ż (dodatkowe): ${F_EXTRA.length}; ${(js.length / 1024).toFixed(0)} KB`);

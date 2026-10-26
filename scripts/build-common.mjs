// Buduje src/data/common.js: formy imion i nazwisk, które są też częstymi zwykłymi słowami
// (np. „Piątek”, „Wilk”, „Róża”). Na początku zdania takie słowo maskujemy tylko przy mocnym dowodzie.
// Źródło częstości: FrequencyWords (OpenSubtitles 2018, H. Dave), treść na licencji CC BY-SA 4.0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { paradigm, CASES } from '../src/declension.js';
import { FIRST_M, FIRST_F, SURNAMES_M, SURNAMES_F_EXTRA } from '../src/data/names.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOP = 30000;
const freq = new Set(
  readFileSync(join(root, 'data-raw', 'pl_50k.txt'), 'utf8').split('\n').slice(0, TOP).map((l) => l.split(' ')[0]).filter(Boolean),
);
const forms = new Set();
const add = (lemma, kind, g) => { const p = paradigm(lemma, kind, g); for (const c of CASES) forms.add(p[c]); };
for (const n of FIRST_M.split('|')) add(n, 'first', 'm');
for (const n of FIRST_F.split('|')) add(n, 'first', 'f');
for (const s of SURNAMES_M.split('|')) { add(s, 'last', 'm'); add(s.replace(/(sk|ck|dzk|zk)i$/, '$1a'), 'last', 'f'); }
for (const s of SURNAMES_F_EXTRA.split('|')) add(s, 'last', 'f');
// Napisy filmowe zawierają imiona i nazwiska postaci, więc częstość nie odróżnia ich od słów.
// Usuwamy formy imion (to zawsze imiona) i kilka nazwisk, które trafiły tam jako postacie.
const nameForms = new Set();
const addTo = (set, lemma, kind, g) => { const p = paradigm(lemma, kind, g); for (const c of CASES) set.add(p[c]); };
for (const n of FIRST_M.split('|')) addTo(nameForms, n, 'first', 'm');
for (const n of FIRST_F.split('|')) addTo(nameForms, n, 'first', 'f');
for (const s of ['kowalski', 'nowak', 'wiśniewski', 'miller', 'clark', 'hill']) addTo(nameForms, s, 'last', 'm');
for (const s of ['kowalska', 'wiśniewska']) addTo(nameForms, s, 'last', 'f');
const common = [...forms].filter((f) => freq.has(f) && !nameForms.has(f)).sort();
const js = `// WYGENEROWANE przez scripts/build-common.mjs — nie edytuj ręcznie.
// Formy imion/nazwisk będące częstymi słowami. Dane pochodne z FrequencyWords
// (github.com/hermitdave/FrequencyWords, OpenSubtitles 2018), licencja CC BY-SA 4.0.
export const COMMON_WORDS = ${JSON.stringify(common.join('|'))};
`;
writeFileSync(join(root, 'src', 'data', 'common.js'), js);
console.log('formy:', forms.size, 'częste:', common.length, (js.length / 1024).toFixed(0) + ' KB');
console.log(common.filter((x) => /^(nowak|kowalski|kowal|wilk|piątek|róża|lis|jan|anna|kot|mróz|zając|sowa|maj|marzec|kasia|adam|ewa|marek)$/.test(x)).join(', '));

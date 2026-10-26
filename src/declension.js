// Odmiana polskich imion i nazwisk przez przypadki.
// Reguły pokrywają typowe wzorce (rzeczownikowy męski, -a, przymiotnikowy -ski/-ska, -y,
// nieodmienne nazwiska kobiet). Nie jest to pełny słownik fleksyjny — w razie wątpliwości
// wykrywanie i tak sprawdza formę przez paradigm(), więc reguły muszą być spójne, nie idealne.

export const CASES = ['M', 'D', 'C', 'B', 'N', 'Ms', 'W'];

export const lower = (s) => s.toLocaleLowerCase('pl');

const VOWELS = 'aąeęioóuy';
const isVowel = (ch) => VOWELS.includes(ch);

// Tematy z nieregularnym zanikiem „e” (Kacper → Kacpra).
const IRREGULAR_STEMS = {
  kacper: 'kacpr',
  aleksander: 'aleksandr',
  lew: 'lw',
  wawrzyniec: 'wawrzyńc',
};

// Męskie imiona zakończone na -a (odmieniają się jak żeńskie).
export const MALE_A_FIRST_NAMES = new Set(['kuba', 'barnaba', 'bonawentura', 'kosma', 'jarema', 'zawisza', 'dyzma', 'sasza']);

// ---------- klasy ----------

export function firstNameClass(lemma, gender) {
  const l = lower(lemma);
  if (gender === 'f') return l.endsWith('a') ? 'a' : 'indecl';
  if (l.endsWith('a')) return 'a';
  if (/[^aąeęioóuy][yi]$/.test(l)) return 'adj'; // Jerzy, Antoni, Ignacy
  if (/[aąeęioóuy]$/.test(l)) return 'indecl'; // Bruno, Hugo itp. — upraszczamy
  return 'noun';
}

// adjHint: true, gdy wiadomo, że żeńskie -a jest przymiotnikowe (Biała, Konieczna)
export function surnameClass(lemma, gender, adjHint = false) {
  const l = lower(lemma);
  if (l.includes('-')) return 'compound';
  if (gender === 'f') {
    if (/(sk|ck|dzk|zk)a$/.test(l) || /[^aąeęioóuy](ow|ew)a$/.test(l)) return 'adj';
    if (l.endsWith('a')) return adjHint ? 'adj' : 'a';
    return 'indecl';
  }
  if (/(sk|ck|dzk|zk)i$/.test(l)) return 'adj';
  if (/[^aąeęioóuy][yi]$/.test(l)) return 'adj';
  if (l.endsWith('a')) return 'a';
  if (l.endsWith('o')) return 'o';
  if (/[aąeęiouyó]$/.test(l) || /[éè]$/.test(l)) return 'indecl';
  return 'noun';
}

// ---------- rzeczownikowa męska (Nowak, Piotr, Marek) ----------

export function obliqueStemMasc(l) {
  if (IRREGULAR_STEMS[l]) return IRREGULAR_STEMS[l];
  const n = l.length;
  if (n > 4 && l.endsWith('ień')) return l.slice(0, -3) + 'ni'; // Stępień → Stępnia
  if (l.endsWith('ń')) return l.slice(0, -1) + 'ni';
  if (l.endsWith('dź')) return l.slice(0, -2) + 'dzi';
  if (l.endsWith('ś')) return l.slice(0, -1) + 'si';
  if (l.endsWith('ć')) return l.slice(0, -1) + 'ci';
  if (l.endsWith('ź')) return l.slice(0, -1) + 'zi';
  // Maciek → Maćka, Rysiek → Ryśka, Heniek → Heńka
  const soft = l.match(/^(.+?)(dz|s|c|n|z)iek$/);
  if (n > 4 && soft) return soft[1] + { dz: 'dź', s: 'ś', c: 'ć', n: 'ń', z: 'ź' }[soft[2]] + 'k';
  if (n > 3 && /[^aąeęioóuy]ek$/.test(l)) return l.slice(0, -2) + 'k'; // Marek, Dudek
  if (n > 4 && l.endsWith('iec')) return l.slice(0, -3) + 'c'; // Kupiec → Kupca
  if (n > 3 && /[^aąeęioóuy]ec$/.test(l)) return l.slice(0, -2) + 'c';
  if (n > 4 && l.endsWith('ieł')) return l.slice(0, -3) + 'ł'; // Kozieł → Kozła
  if (n > 3 && /[^aąeęioóuy]eł$/.test(l)) return l.slice(0, -2) + 'ł'; // Paweł → Pawła
  if (n > 4 && l.endsWith('bel')) return l.slice(0, -3) + 'bl'; // Wróbel → Wróbla
  if (n > 4 && l.endsWith('giel')) return l.slice(0, -4) + 'gl'; // Węgiel → Węgla
  return l;
}

const SOFT_FINAL = /(sz|cz|rz|ż|dz|dż|c|l|j|i|x)$/;
const HARD_LOC = [
  ['st', 'ście'], ['zd', 'ździe'], ['sł', 'śle'], ['sn', 'śnie'], ['zn', 'źnie'],
  ['ch', 'chu'], ['k', 'ku'], ['g', 'gu'],
  ['t', 'cie'], ['d', 'dzie'], ['r', 'rze'], ['ł', 'le'], ['n', 'nie'], ['s', 'sie'],
  ['z', 'zie'], ['w', 'wie'], ['m', 'mie'], ['p', 'pie'], ['b', 'bie'], ['f', 'fie'],
];

function locMasc(stem) {
  if (SOFT_FINAL.test(stem)) return stem + 'u';
  for (const [end, rep] of HARD_LOC) {
    if (stem.endsWith(end)) return stem.slice(0, -end.length) + rep;
  }
  return stem + 'ie';
}

function nounMasc(l) {
  const s = obliqueStemMasc(l);
  const velar = /[kg]$/.test(s);
  const loc = locMasc(s);
  return { M: l, D: s + 'a', C: s + 'owi', B: s + 'a', N: s + (velar ? 'iem' : 'em'), Ms: loc, W: loc };
}

// ---------- przymiotnikowa (Kowalski, Kowalska, Jerzy, Biały) ----------

function adjMasc(l) {
  const stem = l.slice(0, -1);
  if (l.endsWith('i')) {
    return { M: l, D: stem + 'iego', C: stem + 'iemu', B: stem + 'iego', N: stem + 'im', Ms: stem + 'im', W: l };
  }
  return { M: l, D: stem + 'ego', C: stem + 'emu', B: stem + 'ego', N: stem + 'ym', Ms: stem + 'ym', W: l };
}

function adjFem(l) {
  const stem = l.slice(0, -1);
  const obl = /[kg]$/.test(stem) ? stem + 'iej' : stem + 'ej';
  return { M: l, D: obl, C: obl, B: stem + 'ą', N: stem + 'ą', Ms: obl, W: l };
}

// ---------- deklinacja na -a (Anna, Kasia, Sikora, Kuba) ----------

const HARD_DAT = [
  ['st', 'ście'], ['zd', 'ździe'], ['sł', 'śle'], ['sn', 'śnie'], ['zn', 'źnie'],
  ['k', 'ce'], ['g', 'dze'], ['ch', 'sze'],
  ['t', 'cie'], ['d', 'dzie'], ['r', 'rze'], ['ł', 'le'], ['n', 'nie'], ['s', 'sie'],
  ['z', 'zie'], ['w', 'wie'], ['m', 'mie'], ['p', 'pie'], ['b', 'bie'], ['f', 'fie'],
];

// isFirstName wpływa tylko na wołacz (Ola → Olu, ale Kula → Kulo)
function aDecl(l, { lemmaForVoc = null, isFirstName = false } = {}) {
  const stem = l.slice(0, -1);
  const M = l;
  const B = stem + 'ę';
  const N = stem + 'ą';
  let D, C, W;

  if (/(si|zi|ci|dzi)$/.test(stem) || (/ni$/.test(stem) && l.length <= 5)) {
    // Kasia, Zosia, Ania — zdrobnienia
    D = stem; C = stem; W = stem + 'u';
  } else if (/[^aąeęioóuy]i$/.test(stem)) {
    // Maria, Julia, Zofia — „ii”
    D = stem + 'i'; C = D; W = stem + 'o';
  } else if (stem.endsWith('j')) {
    const before = stem.at(-2);
    D = before && isVowel(before) ? stem.slice(0, -1) + 'i' : stem + 'i'; // Maja → Mai, Patrycja → Patrycji
    C = D; W = stem + 'o';
  } else if (stem.endsWith('l')) {
    D = stem + 'i'; C = D; W = isFirstName && l.length <= 4 ? stem + 'u' : stem + 'o';
  } else if (/(sz|cz|rz|ż|dz|dż|c)$/.test(stem)) {
    D = stem + 'y'; C = D; W = stem + 'o';
  } else {
    D = /[kg]$/.test(stem) ? stem + 'i' : stem + 'y';
    C = null;
    for (const [end, rep] of HARD_DAT) {
      if (stem.endsWith(end)) { C = stem.slice(0, -end.length) + rep; break; }
    }
    if (!C) C = stem + 'ie';
    W = stem + 'o';
  }
  return { M, D, C, B, N, Ms: C, W: lemmaForVoc ?? W };
}

function indecl(l) {
  return { M: l, D: l, C: l, B: l, N: l, Ms: l, W: l };
}

// ---------- API ----------

const cache = new Map();

// kind: 'first' | 'last'; gender: 'm' | 'f'
// Zwraca formy małymi literami: { M, D, C, B, N, Ms, W }
export function paradigm(lemma, kind, gender, opts = {}) {
  const l = lower(lemma);
  const key = `${kind}|${gender}|${opts.adjHint ? 1 : 0}|${l}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let p;
  if (kind === 'first') {
    const cls = firstNameClass(l, gender);
    if (cls === 'a') p = aDecl(l, { isFirstName: true });
    else if (cls === 'adj') p = adjMasc(l);
    else if (cls === 'noun') p = nounMasc(l);
    else p = indecl(l);
  } else {
    const cls = surnameClass(l, gender, opts.adjHint);
    if (cls === 'compound') {
      const parts = l.split('-').map((part) => paradigm(part, 'last', gender, opts));
      p = {};
      for (const c of CASES) p[c] = parts.map((x) => x[c]).join('-');
    } else if (cls === 'adj') p = gender === 'f' ? adjFem(l) : adjMasc(l);
    else if (cls === 'a') p = aDecl(l);
    else if (cls === 'o') p = aDecl(l.slice(0, -1) + 'a', { lemmaForVoc: l });
    else if (cls === 'noun') p = nounMasc(l);
    else p = indecl(l);
    if (cls === 'o') p = { ...p, M: l };
  }
  if (cache.size > 50000) cache.clear();
  cache.set(key, p);
  return p;
}

// Odwrócenie: forma → lista przypadków
export function casesOf(p, formLower) {
  const out = [];
  for (const c of CASES) if (p[c] === formLower) out.push(c);
  return out;
}

// Kandydaci na formę podstawową (nadmiarowo) — weryfikacja przez paradigm()
const LEMMA_ENDINGS = [
  '', 'a', 'o', 'i', 'y', 'ek', 'ec', 'iec', 'eł', 'ieł', 'bel', 'giel', 'ń', 'ień', 'ś', 'ć', 'ź', 'dź',
  'r', 't', 'd', 'ł', 'n', 's', 'z', 'w', 'm', 'p', 'b', 'f', 'st', 'zd', 'sł', 'sn', 'zn', 'k', 'g', 'ch',
  'ka', 'ga', 'cha', 'ta', 'da', 'ra', 'ła', 'na', 'sa', 'za', 'wa', 'ma', 'pa', 'ba', 'fa', 'sta', 'zda', 'sła', 'sna',
  'ia', 'ja', 'ciek', 'siek', 'niek', 'ziek', 'dziek',
  'ko', 'go', 'cho', 'to', 'do', 'ro', 'ło', 'no', 'so', 'zo', 'wo', 'mo', 'po', 'bo', 'fo', 'sto',
];

export function lemmaCandidates(tokenLower) {
  const t = tokenLower;
  const out = new Set();
  for (let k = 0; k <= 5 && k < t.length - 1; k++) {
    const stem = k === 0 ? t : t.slice(0, -k);
    for (const e of LEMMA_ENDINGS) out.add(stem + e);
  }
  for (const [lemma, stem] of Object.entries(IRREGULAR_STEMS)) {
    if (t.startsWith(stem)) out.add(lemma);
  }
  return out;
}

// Wielkość liter jak we wzorcu (Kowalski / KOWALSKI / kowalski)
export function casingOf(token) {
  if (token.length > 1 && token === token.toLocaleUpperCase('pl') && token !== token.toLocaleLowerCase('pl')) return 'upper';
  const first = token[0];
  if (first && first === first.toLocaleUpperCase('pl') && first !== first.toLocaleLowerCase('pl')) return 'title';
  return 'lower';
}

export function applyCasing(formLower, casing) {
  if (casing === 'upper') return formLower.toLocaleUpperCase('pl');
  if (casing === 'title') {
    return formLower
      .split('-')
      .map((part) => (part ? part[0].toLocaleUpperCase('pl') + part.slice(1) : part))
      .join('-');
  }
  return formLower;
}

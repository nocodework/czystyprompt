// Rozpoznawanie osób: lista „moi ludzie” (pewne trafienia w każdej odmianie),
// słownik imion i nazwisk z PESEL, tytuły („Pan Kowalski”) i końcówki nazwisk (-ski, -wicz).

import { paradigm, casesOf, lemmaCandidates, lower, CASES, surnameClass, casingOf } from './declension.js';
import { FIRST_M, FIRST_F, SURNAMES_M, SURNAMES_F_EXTRA } from './data/names.js';
import { COMMON_WORDS } from './data/common.js';
import { TITLES, HONORIFICS, PLACE_ADJ, NOT_SURNAMES, NOT_NAMES_UPPER, FIRST_NAME_SENTENCE_STOP, DIMINUTIVES, DIMINUTIVE_GENDER } from './data/lexicon.js';

const femOf = (s) => {
  if (/(sk|ck|dzk|zk)i$/.test(s)) return s.slice(0, -1) + 'a';
  if (/[^aąeęioóuy]y$/.test(s)) return s.slice(0, -1) + 'a';
  return s;
};

let DICT = null;

export function dictionary() {
  if (DICT) return DICT;
  const firstM = new Set(FIRST_M.split('|'));
  const firstF = new Set(FIRST_F.split('|'));
  // pozycja na liście PESEL (0 = najczęstsze) — rozstrzyga remisy płci („Alfredzie”)
  const rank = new Map();
  [...firstM].forEach((n, i) => rank.set('m|' + n, i));
  [...firstF].forEach((n, i) => rank.set('f|' + n, i));
  for (const dim of Object.keys(DIMINUTIVES)) (DIMINUTIVE_GENDER(dim) === 'f' ? firstF : firstM).add(dim);
  const surM = new Set(SURNAMES_M.split('|'));
  const surF = new Set();
  for (const s of surM) surF.add(femOf(s));
  for (const s of SURNAMES_F_EXTRA.split('|')) surF.add(s);
  const common = new Set(COMMON_WORDS.split('|'));

  // forma imienia → [{ lemma, gender, cases }]
  const firstForms = new Map();
  const addFirst = (lemma, gender) => {
    const p = paradigm(lemma, 'first', gender);
    for (const c of CASES) {
      const f = p[c];
      let arr = firstForms.get(f);
      if (!arr) firstForms.set(f, (arr = []));
      let e = arr.find((x) => x.lemma === lemma && x.gender === gender);
      if (!e) arr.push((e = { lemma, gender, cases: [] }));
      if (!e.cases.includes(c)) e.cases.push(c);
    }
  };
  for (const n of firstM) addFirst(n, 'm');
  for (const n of firstF) addFirst(n, 'f');

  // formalne imię → zdrobnienia
  const dimsOf = new Map();
  for (const [dim, formal] of Object.entries(DIMINUTIVES)) {
    if (!dimsOf.has(formal)) dimsOf.set(formal, []);
    dimsOf.get(formal).push(dim);
  }

  DICT = { firstM, firstF, surM, surF, common, firstForms, dimsOf, rank };
  return DICT;
}

export const adjHintFor = (dict, lemma) => {
  if (!lemma.endsWith('a')) return false;
  const stem = lemma.slice(0, -1);
  return dict.surM.has(stem + 'y') || dict.surM.has(stem + 'i');
};

export const formalFirst = (lemma) => DIMINUTIVES[lemma] ?? lemma;

// Kolejność ważna: najpierw nazwisko zaczynające się od „ski”, potem pozostałe
const SURNAME_SUFFIX = /(?:ski|cki|dzki|ska|cka|dzka|wicz|czyk|czak|ńczyk)$/;

export function surnameParadigm(dict, lemma, gender) {
  return paradigm(lemma, 'last', gender, { adjHint: gender === 'f' && adjHintFor(dict, lemma) });
}

// Nazwisko ze słownika: forma → [{ lemma, gender, cases }]
export function surnameLookup(dict, low) {
  const hits = [];
  if (low.length < 3) return hits;
  for (const lemma of lemmaCandidates(low)) {
    if (NOT_SURNAMES.has(lemma)) continue;
    for (const g of ['m', 'f']) {
      if (!(g === 'm' ? dict.surM : dict.surF).has(lemma)) continue;
      const cases = casesOf(surnameParadigm(dict, lemma, g), low);
      if (cases.length) hits.push({ lemma, gender: g, cases, source: 'dict' });
    }
  }
  return hits;
}

// Nazwisko dwuczłonowe w dowolnym przypadku: „Dąbrowską-Kot”, „Kowalskiego-Nowaka”.
// Każdy człon odmieniamy osobno; co najmniej jeden musi być w słowniku albo mieć typową końcówkę.
export function compoundLookup(dict, low, { allowGuess = false, gender = null, wantCases = null } = {}) {
  const parts = low.split('-');
  if (parts.length !== 2 || parts.some((p) => p.length < 2)) return [];
  const out = [];
  for (const g of gender ? [gender === 'f' ? 'f' : 'm'] : ['m', 'f']) {
    const per = parts.map((p) => [...surnameLookup(dict, p), ...suffixLookup(dict, p)].filter((h) => h.gender === g));
    const known = per.filter((h) => h.length).length;
    // bez imienia ani tytułu oba człony muszą być znanymi nazwiskami (inaczej „Bielsko-Biała” byłoby osobą)
    if (known === 0 || (!allowGuess && known < 2)) continue;
    const opts = per.map((h, i) => (h.length ? h : [guessSurname(dict, parts[i], g, wantCases)]));
    for (const a of opts[0]) for (const b of opts[1]) {
      const inter = a.cases.filter((c) => b.cases.includes(c));
      if (!inter.length) continue;
      const lemma = `${a.lemma}-${b.lemma}`;
      const cases = casesOf(surnameParadigm(dict, lemma, g), low);
      if (cases.length && !out.some((x) => x.lemma === lemma && x.gender === g)) out.push({ lemma, gender: g, cases, source: 'dict' });
    }
  }
  return out;
}

// Przyimek tuż przed nazwiskiem zawęża przypadek: „o Kasi” = Ms, „do Kasi” = D, „dzięki Kasi” = C
export const PREP_CASES = {
  z: ['N', 'D'], ze: ['N', 'D'], o: ['Ms', 'B'], w: ['Ms', 'B'], we: ['Ms', 'B'], na: ['Ms', 'B'], po: ['Ms', 'B'],
  przy: ['Ms'], u: ['D'], od: ['D'], ode: ['D'], do: ['D'], dla: ['D'], bez: ['D'], obok: ['D'], koło: ['D'],
  według: ['D'], zamiast: ['D'], oprócz: ['D'], prócz: ['D'], sprzed: ['D'], zza: ['D'], mimo: ['D'], wśród: ['D'],
  dzięki: ['C'], ku: ['C'], przeciw: ['C'], przeciwko: ['C'], wbrew: ['C'], przez: ['B'], za: ['B', 'N', 'D'],
  nad: ['N', 'B'], pod: ['N', 'B'], przed: ['N', 'B'], między: ['N', 'B'], pomiędzy: ['N', 'B'],
};

// Przypadki dopuszczone przez przyimek przed tokenem o indeksie i (pomija tytuły: „z panią Nowak”)
export function prepCasesBefore(text, toks, i) {
  let j = i - 1;
  let right = toks[i];
  while (j >= 0) {
    const t = toks[j];
    if (!/^\.?[ \u00a0]{1,2}$/.test(text.slice(t.end, right.start))) return null;
    if (TITLES.has(t.low) || TITLES.has(t.low + '.') || HONORIFICS.has(t.low)) { right = t; j--; continue; }
    return PREP_CASES[t.low] ?? null;
  }
  return null;
}

// Nieznane nazwisko z typową końcówką (Brzęczyszczykiewicz, Wiśniowiecka)
export function suffixLookup(dict, low) {
  const hits = [];
  if (low.length < 5) return hits;
  for (const lemma of lemmaCandidates(low)) {
    if (!SURNAME_SUFFIX.test(lemma) || NOT_SURNAMES.has(lemma)) continue;
    const g = /(ska|cka|dzka)$/.test(lemma) ? 'f' : 'm';
    const cases = casesOf(surnameParadigm(dict, lemma, g), low);
    if (cases.length) hits.push({ lemma, gender: g, cases, source: 'suffix' });
  }
  return hits;
}

// Nieznane nazwisko po imieniu: wybierz formę podstawową zgodną z przypadkiem imienia
export function guessSurname(dict, low, gender, wantCases) {
  const g = gender === 'f' ? 'f' : 'm';
  if (low.includes('-')) {
    const c = compoundLookup(dict, low, { allowGuess: true, gender: g, wantCases })
      .map((x) => ({ ...x, cases: wantCases ? x.cases.filter((k) => wantCases.includes(k)) : x.cases, source: 'guess' }))
      .filter((x) => x.cases.length);
    if (c.length) return c[0];
  }
  let best = null;
  const rank = (cls) => ({ noun: 1, adj: 2, a: 3, o: 4, compound: 5, indecl: 6 })[cls] ?? 9;
  for (const lemma of lemmaCandidates(low)) {
    if (lemma.length < 2) continue;
    const cases = casesOf(surnameParadigm(dict, lemma, g), low);
    const inter = wantCases ? cases.filter((c) => wantCases.includes(c)) : cases;
    if (!inter.length) continue;
    const score = (lemma === low ? 0 : 10) + rank(surnameClass(lemma, g, adjHintFor(dict, lemma)));
    if (!best || score < best.score) best = { lemma, gender: g, cases: inter, source: 'guess', score };
  }
  // Na wszelki wypadek: forma jak w tekście
  return best ?? { lemma: low, gender: g, cases: wantCases ?? ['M'], source: 'guess' };
}

// ---------- tokenizacja ----------

const WORD = /\p{L}[\p{L}\p{M}]*(?:[-'’]\p{L}[\p{L}\p{M}]*)*/gu;

export function tokenize(text) {
  const out = [];
  for (const m of text.matchAll(WORD)) {
    const raw = m[0];
    out.push({
      start: m.index,
      end: m.index + raw.length,
      raw,
      low: lower(raw),
      casing: casingOf(raw),
      sentStart: isSentenceStart(text, m.index),
    });
  }
  return out;
}

function isSentenceStart(text, index) {
  let i = index - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t' || text[i] === ' ')) i--;
  if (i < 0) return true;
  const ch = text[i];
  if (ch === '\n' || ch === '\r') return true;
  if ('.!?…:;•*#>|'.includes(ch)) return true;
  if ('-–—'.includes(ch)) {
    let j = i - 1;
    while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--;
    return j < 0 || text[j] === '\n';
  }
  return false;
}

// tylko spacje między tokenami (bez przecinka, kropki, nowej linii)
export const adjacent = (text, a, b) => /^[  ]{1,2}$/.test(text.slice(a.end, b.start));

const isCap = (t) => t.casing !== 'lower';
const isAcronym = (t) => t.casing === 'upper' && (t.raw.length <= 4 || NOT_NAMES_UPPER.has(t.low));

// ---------- lista „moi ludzie” ----------

// Wiersz: „Jan Kowalski”, „Kowalski Jan”, „KOWALSKA Anna; specjalistka”, „Nowak” …
export function parseList(text, dict = dictionary()) {
  const persons = [];
  const seen = new Set();
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim();
    if (!line) continue;
    const cell = line.split(/[\t;|,]/)[0].trim() || line;
    const words = [...cell.matchAll(WORD)].map((m) => m[0]).filter((w) => !TITLES.has(lower(w)));
    if (!words.length) continue;
    const isFirst = (w) => {
      const hits = dict.firstForms.get(lower(w)) ?? [];
      return hits.find((h) => h.lemma === lower(w) && h.cases.includes('M'));
    };
    let firstIdx = words.findIndex((w) => isFirst(w));
    let person;
    if (firstIdx >= 0) {
      const fh = isFirst(words[firstIdx]);
      const rest = words.filter((_, i) => i !== firstIdx);
      let first2 = null;
      const r2 = rest.findIndex((w) => isFirst(w));
      if (rest.length >= 2 && r2 >= 0) first2 = lower(rest.splice(r2, 1)[0]);
      const last = rest.length ? lower(rest.join('-').replace(/--+/g, '-')) : null;
      person = { first: fh.lemma, first2, last, gender: fh.gender };
      // „Nowak-Kowalska” zapisane ze spacją → łączymy myślnikiem
      if (rest.length > 1) person.last = rest.map(lower).join('-');
    } else {
      const last = lower(words.join('-'));
      const gender = /(ska|cka|dzka|owa)$/.test(last) ? 'f' : /(ski|cki|dzki)$/.test(last) ? 'm' : 'u';
      person = { first: null, first2: null, last, gender };
    }
    const key = `${person.first}|${person.first2}|${person.last}`;
    if (seen.has(key)) continue;
    seen.add(key);
    person.raw = line;
    persons.push(person);
  }
  return persons;
}

// forma → [{ person, part, cases, variant }]
export function buildListIndex(persons, dict = dictionary()) {
  const index = new Map();
  const add = (form, entry) => {
    let arr = index.get(form);
    if (!arr) index.set(form, (arr = []));
    const same = arr.find((x) => x.person === entry.person && x.part === entry.part && x.variant === entry.variant);
    if (same) { for (const c of entry.cases) if (!same.cases.includes(c)) same.cases.push(c); }
    else arr.push({ ...entry, cases: [...entry.cases] });
  };
  const addParadigm = (p, entry) => { for (const c of CASES) add(p[c], { ...entry, cases: [c] }); };
  persons.forEach((person, i) => {
    const genders = person.gender === 'u' ? ['m', 'f'] : [person.gender];
    for (const [part, lemma] of [['first', person.first], ['first2', person.first2]]) {
      if (!lemma) continue;
      const formal = formalFirst(lemma);
      const variants = new Set([lemma, formal, ...(dict.dimsOf.get(formal) ?? [])]);
      for (const v of variants) for (const g of genders) addParadigm(paradigm(v, 'first', g), { person: i, part, variant: v });
    }
    if (person.last) {
      for (const g of genders) {
        addParadigm(surnameParadigm(dict, person.last, g), { person: i, part: 'last', variant: person.last });
        // człon nazwiska dwuczłonowego też wskazuje osobę („Jeziorańska”)
        if (person.last.includes('-')) {
          for (const piece of person.last.split('-')) {
            if (piece.length >= 3) addParadigm(surnameParadigm(dict, piece, g), { person: i, part: 'last', variant: person.last, piece });
          }
        }
      }
    }
  });
  return index;
}

// ---------- wykrywanie w tekście ----------

// Zwraca wzmianki: { start, end, tokens: [{ tok, part, lemma, cases }], gender, listPerson?, source }
export function detectPeople(text, { dict = dictionary(), listIndex = null, useDictionary = true } = {}) {
  const toks = tokenize(text);
  const mentions = [];
  const used = new Set();

  const listHits = (t) => {
    if (!listIndex) return [];
    if (t.casing === 'lower' && dict.common.has(t.low)) return [];
    return listIndex.get(t.low) ?? [];
  };
  const firstHits = (t) => (isCap(t) && !isAcronym(t) ? dict.firstForms.get(t.low) ?? [] : []);
  const surHits = (t) => {
    if (!isCap(t) || isAcronym(t)) return [];
    const hits = surnameLookup(dict, t.low);
    return hits.length || !t.low.includes('-') ? hits : compoundLookup(dict, t.low);
  };
  const sufHits = (t) => (isCap(t) && !isAcronym(t) ? suffixLookup(dict, t.low) : []);
  const isTitle = (t) => TITLES.has(t.low) || (TITLES.has(t.low + '.') && text[t.end] === '.');
  const isHonorific = (t) => HONORIFICS.has(t.low) || (HONORIFICS.has(t.low + '.') && text[t.end] === '.');

  const push = (m) => {
    m.start = m.tokens[0].tok.start;
    m.end = m.tokens.at(-1).tok.end;
    const prep = prepCasesBefore(text, toks, toks.indexOf(m.tokens[0].tok));
    if (prep) {
      const inter = m.cases.filter((c) => prep.includes(c));
      if (inter.length) m.cases = inter;
    }
    for (const x of m.tokens) used.add(x.tok.start);
    mentions.push(m);
  };

  // 1) lista „moi ludzie”
  if (listIndex) {
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (used.has(t.start) || isAcronym(t) && !listIndex.has(t.low)) continue;
      const hits = listHits(t);
      if (!hits.length) continue;
      // inicjał: „J. Kowalski”
      const prev = toks[i - 1];
      const tokens = [];
      const n1 = toks[i + 1];
      const n2 = toks[i + 2];
      const pairable = (a, b) => b && adjacent(text, a, b) && !used.has(b.start);
      let chosen = null;
      if (pairable(t, n1)) {
        for (const h of hits) {
          const h1 = listHits(n1).find((x) => x.person === h.person && x.part !== h.part);
          if (!h1) continue;
          chosen = [[t, h], [n1, h1]];
          if (pairable(n1, n2)) {
            const h2 = listHits(n2).find((x) => x.person === h.person && x.part !== h.part && x.part !== h1.part);
            if (h2) chosen.push([n2, h2]);
          }
          break;
        }
      }
      if (!chosen) {
        // samo imię z listy na początku zdania, które jest zwykłym słowem — pomiń
        const h = hits[0];
        if (h.part !== 'last' && t.sentStart && FIRST_NAME_SENTENCE_STOP.has(t.low)) continue;
        chosen = [[t, h]];
        if (h.part === 'last' && prev && prev.raw.length === 1 && prev.casing === 'upper' && text[prev.end] === '.' && !used.has(prev.start)) {
          tokens.push({ tok: prev, part: 'initial', lemma: prev.low, cases: [] });
        }
      }
      for (const [tok, h] of chosen) tokens.push({ tok, part: h.part, lemma: h.variant, cases: h.cases, piece: h.piece });
      // przypadek wspólny dla całej wzmianki
      const named = tokens.filter((x) => x.part !== 'initial');
      let cases = named[0].cases;
      for (const x of named.slice(1)) {
        const inter = cases.filter((c) => x.cases.includes(c));
        if (inter.length) cases = inter;
      }
      push({ tokens, cases, listPerson: chosen[0][1].person, source: 'list' });
      i += chosen.length - 1;
    }
  }

  if (!useDictionary) return mentions.sort((a, b) => a.start - b.start);

  // 2) słownik + tytuły + końcówki
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (used.has(t.start)) continue;
    const next = toks[i + 1];
    const next2 = toks[i + 2];
    const free = (x) => x && !used.has(x.start);
    const capNext = free(next) && adjacent(text, t, next) && isCap(next) && !isAcronym(next) && !isTitle(next);

    // tytuł + nazwisko/imię („p. Kowalski” — dopuszczamy kropkę po skrócie)
    const capAfterTitle = free(next) && /^\.?[ \u00a0]{1,2}$/.test(text.slice(t.end, next.start)) && isCap(next) && !isAcronym(next) && !isTitle(next);
    if (isTitle(t) && capAfterTitle) {
      const fh = firstHits(next);
      const nn = free(next2) && adjacent(text, next, next2) && isCap(next2) && !isAcronym(next2) ? next2 : null;
      if (fh.length && nn) {
        const m = fullName(next, fh, nn);
        if (m) { push(m); i += 2; continue; }
      }
      const sh = [...surHits(next), ...sufHits(next)];
      // „pan Marek”, „pani Jadwiga”: forma imienia wygrywa z rzadkim nazwiskiem o tym samym brzmieniu
      if (fh.length) push(single(next, 'first', fh));
      else if (sh.length) push(single(next, 'last', sh));
      else if (isHonorific(t) && !NOT_SURNAMES.has(next.low)) push(single(next, 'last', [guessSurname(dict, next.low, null, null)]));
      else continue;
      i += 1;
      continue;
    }
    if (!isCap(t) || isAcronym(t)) continue;

    const fh = firstHits(t);
    // Imię + Nazwisko (+ drugie imię)
    if (fh.length && capNext && !NOT_SURNAMES.has(next.low)) {
      const nfh = firstHits(next);
      const nn = free(next2) && adjacent(text, next, next2) && isCap(next2) && !isAcronym(next2) ? next2 : null;
      if (nfh.length && nn && !firstHits(nn).length) {
        const m = fullName(t, fh, nn, next, nfh);
        if (m) { push(m); i += 2; continue; }
      }
      const m = fullName(t, fh, next);
      if (m) { push(m); i += 1; continue; }
    }

    const sh = surHits(t);
    // Nazwisko + Imię
    if (sh.length && capNext) {
      const nfh = firstHits(next);
      if (nfh.length) {
        const m = reversedName(t, sh, next, nfh);
        if (m) { push(m); i += 1; continue; }
      }
    }

    const strongStart = !t.sentStart;
    // „Uniwersytetu Warszawskiego”, „Bank Narodowy”: przymiotnik po wyrazie z wielkiej litery to część nazwy
    const prev = toks[i - 1];
    const afterProperNoun = prev && !used.has(prev.start) && isCap(prev) && adjacent(text, prev, t) && !isTitle(prev) && !firstHits(prev).length;
    // forma męska lematu: Wrocławska → wrocławski, Narodowa → narodowy
    const masc = (l) => (/(sk|ck|dzk)a$/.test(l) ? l.slice(0, -1) + 'i' : l.replace(/([^aąeęioóuy])a$/, '$1y'));
    const placeAdj = (h) => PLACE_ADJ.has(h.lemma) || PLACE_ADJ.has(masc(h.lemma));
    if (afterProperNoun && (sh.some(placeAdj) || sufHits(t).some(placeAdj))) continue;
    // „przed Bożym Narodzeniem”: po słowie stoi inny wyraz z wielkiej litery, który nie jest imieniem ani nazwiskiem
    const beforeProperNoun = capNext && !firstHits(next).length && !surHits(next).length && !sufHits(next).length;
    // „Róża wiatrów…”, „Wiktoria nad…” — na początku zdania to raczej zwykłe słowo
    if (!strongStart && FIRST_NAME_SENTENCE_STOP.has(t.low)) continue;
    // „Piotra”, „Bartek”, „Łukasz” bywają też nazwiskami, ale samodzielnie to prawie zawsze imię
    if (fh.length && (strongStart || !(FIRST_NAME_SENTENCE_STOP.has(fh[0].lemma) || dict.common.has(t.low)))) {
      push(single(t, 'first', fh));
      continue;
    }
    if (sh.length) {
      if (!beforeProperNoun && (strongStart || !dict.common.has(t.low))) push(single(t, 'last', sh));
      continue;
    }
    if (fh.length) continue;
    if (strongStart && !beforeProperNoun) {
      const xh = sufHits(t);
      if (xh.length) push(single(t, 'last', xh));
    }
  }

  return mentions.sort((a, b) => a.start - b.start);

  // --- pomocnicze ---
  function single(tok, part, hits) {
    const gender = pickGender(hits);
    const h = hits.find((x) => x.gender === gender) ?? hits[0];
    return { tokens: [{ tok, part, lemma: h.lemma, cases: h.cases }], cases: h.cases, gender: genderOf(hits, h), source: h.source ?? 'dict' };
  }

  function fullName(ft, fhits, lt, mt = null, mhits = null) {
    // wybierz imię i nazwisko o zgodnej płci i przypadku
    const lowL = lt.low;
    let best = null;
    for (const f of fhits) {
      let lh = [...surnameLookup(dict, lowL), ...suffixLookup(dict, lowL)].filter((x) => x.gender === f.gender);
      if (!lh.length) {
        if (NOT_SURNAMES.has(lowL)) continue;
        lh = [guessSurname(dict, lowL, f.gender, f.cases)];
      }
      for (const l of lh) {
        const inter = f.cases.filter((c) => l.cases.includes(c));
        if (!inter.length) continue;
        const score = (l.source === 'dict' ? 0 : l.source === 'suffix' ? 1 : 2) + (dict.rank.get(f.gender + '|' + f.lemma) ?? 5000) / 10000;
        if (!best || score < best.score) best = { f, l, cases: inter, score };
      }
    }
    if (!best) return null;
    const tokens = [{ tok: ft, part: 'first', lemma: best.f.lemma, cases: best.f.cases }];
    if (mt) {
      const m2 = mhits.find((x) => x.gender === best.f.gender) ?? mhits[0];
      tokens.push({ tok: mt, part: 'first2', lemma: m2.lemma, cases: m2.cases });
    }
    tokens.push({ tok: lt, part: 'last', lemma: best.l.lemma, cases: best.l.cases });
    return { tokens, cases: best.cases, gender: best.f.gender, source: 'dict' };
  }

  function reversedName(lt, lhits, ft, fhits) {
    for (const f of fhits) {
      for (const l of lhits.filter((x) => x.gender === f.gender)) {
        const inter = f.cases.filter((c) => l.cases.includes(c));
        if (!inter.length) continue;
        return {
          tokens: [{ tok: lt, part: 'last', lemma: l.lemma, cases: l.cases }, { tok: ft, part: 'first', lemma: f.lemma, cases: f.cases }],
          cases: inter, gender: f.gender, source: 'dict',
        };
      }
    }
    return null;
  }
}

// Płeć przy samym nazwisku: odmienione „Nowaka” → mężczyzna; „Nowak” → nieznana
function pickGender(hits) {
  const g = new Set(hits.map((h) => h.gender));
  if (g.size === 1) return [...g][0];
  const inflected = hits.filter((h) => !h.cases.includes('M'));
  if (inflected.length) return inflected[0].gender;
  return 'm';
}

function genderOf(hits, chosen) {
  const g = new Set(hits.map((h) => h.gender));
  if (g.size > 1 && chosen.cases.includes('M') && hits.every((h) => h.cases.includes('M'))) return 'u';
  return chosen.gender;
}

// Sesja: ukrywa dane w tekście i przywraca je w odpowiedzi AI.
// Słownik podmian żyje tylko w pamięci (i ewentualnie w pliku, który zapisze użytkownik).

import { detectStructured, normalizeValue, CATEGORIES } from './detectors.js';
import { dictionary, parseList, buildListIndex, detectPeople, tokenize, adjacent, surnameParadigm, formalFirst, adjHintFor, prepCasesBefore } from './people.js';
import { paradigm, CASES, applyCasing, lower } from './declension.js';
import { SENSITIVE_TOPICS, DIMINUTIVES } from './data/lexicon.js';
import { assignFake, bestVariant } from './pseudonyms.js';
import { hiddenCells } from './table.js';

export const DEFAULT_OPTIONS = {
  mode: 'natural', // 'natural' = zmyślone imiona i nazwiska, 'tags' = [OSOBA-1]
  people: true,
  useDictionary: true,
  categories: {
    email: true, profil: true, konto: true, karta: true, pesel: true, nip: true, regon: true,
    dokument: true, telefon: true, adres: true, urodzenie: true, wiek: true, kwota: false, data: false,
  },
  warnSensitive: true,
};

const PRIORITY = ['kolumna', 'email', 'profil', 'custom', 'konto', 'karta', 'pesel', 'nip', 'regon', 'dokument', 'urodzenie', 'wiek', 'adres', 'telefon', 'osoba', 'kwota', 'data'];
const CASE_ORDER = ['M', 'D', 'B', 'C', 'N', 'Ms', 'W'];
const pickCase = (cases) => CASE_ORDER.find((c) => cases.includes(c)) ?? 'M';
const kindOf = (part) => (part === 'last' ? 'last' : 'first');
const TAG_RE = /\[\s*([A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ0-9-]*?)\s*[-–_ ]\s*(\d+)\s*\]/giu;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseTerms(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*(?:=>|=|→)\s*(.+)$/);
    const term = (m ? m[1] : line).trim();
    const label = (m ? m[2] : 'UKRYTE').trim().toLocaleUpperCase('pl').replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9]+/g, '-').replace(/^-|-$/g, '') || 'UKRYTE';
    if (term.length >= 2) out.push({ term, label });
  }
  return out;
}

export class Session {
  constructor({ people = '', terms = '', keep = '', options = {} } = {}) {
    this.dict = dictionary();
    this.options = { ...DEFAULT_OPTIONS, ...options, categories: { ...DEFAULT_OPTIONS.categories, ...(options.categories ?? {}) } };
    this.entities = [];
    this.values = new Map(); // tag → Map(norm → { n, original })
    this.listEntity = new Map(); // indeks osoby z listy → encja
    this.setPeople(people);
    this.setTerms(terms);
    this.setKeep(keep);
  }

  // „Nie ukrywaj”: słowa, których użytkownik nie chce podmieniać (np. dział „Wilk”, nazwa produktu)
  setKeep(text) {
    this.keepText = text;
    this.keep = new Set(text.split(/\r?\n/).map((l) => lower(l.trim())).filter(Boolean));
  }

  #kept(text, s) {
    if (!this.keep.size) return false;
    if (this.keep.has(lower(text.slice(s.start, s.end)))) return true;
    if (s.cat === 'osoba') {
      const named = s.mention.tokens.filter((x) => x.part !== 'initial');
      if (this.keep.has(named.map((x) => lower(x.lemma ?? '')).join(' '))) return true;
      return named.every((x) => this.keep.has(x.tok.low) || this.keep.has(lower(x.lemma ?? '')));
    }
    return false;
  }

  setPeople(text) {
    this.peopleText = text;
    this.persons = parseList(text, this.dict);
    this.listIndex = this.persons.length ? buildListIndex(this.persons, this.dict) : null;
    this.listEntity = new Map();
    // encje z poprzedniej listy zostają (żeby dało się przywrócić starsze odpowiedzi)
    for (const e of this.entities) {
      if (e.source !== 'list') continue;
      const i = this.persons.findIndex((p) => p.first === e.first && p.last === e.last && p.first2 === e.first2);
      if (i >= 0) this.listEntity.set(i, e);
    }
  }

  setTerms(text) {
    this.termsText = text;
    this.terms = parseTerms(text).map((t) => ({
      ...t,
      re: new RegExp(`(?<![\\p{L}\\d])${escapeRe(t.term)}\\p{L}{0,4}(?![\\p{L}\\d])`, 'giu'),
    }));
  }

  setOptions(options) {
    this.options = { ...this.options, ...options, categories: { ...this.options.categories, ...(options.categories ?? {}) } };
  }

  reset() {
    this.entities = [];
    this.values = new Map();
    this.listEntity = new Map();
  }

  // ---------- encje ----------

  #taken() {
    const taken = new Set();
    const addName = (x) => {
      if (!x) return;
      if (x.includes('-')) for (const piece of x.split('-')) addName(piece);
      taken.add(x);
      taken.add(formalFirst(x));
      // Zieliński ↔ Zielińska: nie dajemy pseudonimu, który jest nazwiskiem kogoś z tekstu w innej płci
      if (/(sk|ck|dzk)a$/.test(x)) taken.add(x.slice(0, -1) + 'i');
      if (/(sk|ck|dzk)i$/.test(x)) taken.add(x.slice(0, -1) + 'a');
    };
    for (const e of this.entities) {
      for (const k of ['first', 'first2', 'last']) { addName(e[k]); if (e.fake?.[k]) addName(e.fake[k]); }
      for (const part of Object.values(e.fakeVariants ?? {})) for (const v of Object.values(part)) addName(v);
    }
    for (const p of this.persons) for (const k of ['first', 'first2', 'last']) addName(p[k]);
    return taken;
  }

  #newEntity(data) {
    const e = {
      id: this.entities.length + 1,
      source: data.source,
      gender: data.gender ?? 'u',
      first: data.first ?? null,
      first2: data.first2 ?? null,
      last: data.last ?? null,
      seen: { first: {}, first2: {}, last: {} }, // część → wariant → przypadek → forma z tekstu
      variants: {}, // wariant imienia (np. „kasia”) → liczba użyć
      fake: null,
      fakeVariants: { first: {}, first2: {} }, // wariant prawdziwy → wariant pseudonimu („kasia” → „ewka”)
      lastSeenAt: 0,
    };
    e.lastAdjHint = e.last ? adjHintFor(this.dict, e.last) : false;
    this.entities.push(e);
    return e;
  }

  #ensureFake(e, hints = {}) {
    e.lastAdjHint = e.last ? adjHintFor(this.dict, e.last) : false;
    assignFake(e, this.#taken(), this.dict.common, hints);
  }

  #entityFor(m) {
    if (m.source === 'list') {
      let e = this.listEntity.get(m.listPerson);
      if (!e) {
        const p = this.persons[m.listPerson];
        e = this.#newEntity({ source: 'list', gender: p.gender, first: p.first, first2: p.first2, last: p.last });
        this.listEntity.set(m.listPerson, e);
      }
      return e;
    }
    const part = (k) => m.tokens.find((x) => x.part === k);
    const f = part('first');
    const f2 = part('first2');
    const l = part('last');
    const firstLemma = f ? formalFirst(f.lemma) : null;
    const recent = (arr) => arr.sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];
    const genderOk = (e) => e.gender === 'u' || m.gender === 'u' || e.gender === m.gender;

    if (f && l) {
      const same = this.entities.find((e) => e.last === l.lemma && e.first && formalFirst(e.first) === firstLemma && genderOk(e));
      if (same) return same;
      // wcześniej samo nazwisko albo samo imię → uzupełniamy
      const lastOnly = this.entities.find((e) => e.last === l.lemma && !e.first && genderOk(e));
      if (lastOnly) {
        lastOnly.first = firstLemma; lastOnly.first2 = f2 ? formalFirst(f2.lemma) : null;
        if (lastOnly.gender === 'u') lastOnly.gender = m.gender;
        return lastOnly;
      }
      const firstOnly = this.entities.filter((e) => !e.last && e.first && formalFirst(e.first) === firstLemma && genderOk(e));
      if (firstOnly.length === 1) { firstOnly[0].last = l.lemma; return firstOnly[0]; }
      return this.#newEntity({ source: m.source, gender: m.gender, first: firstLemma, first2: f2 ? formalFirst(f2.lemma) : null, last: l.lemma });
    }
    if (l) {
      const cands = this.entities.filter((e) => e.last && (e.last === l.lemma || e.last.split('-').includes(l.lemma)) && genderOk(e));
      if (cands.length) return recent(cands);
      return this.#newEntity({ source: m.source, gender: m.gender, last: l.lemma });
    }
    const cands = this.entities.filter((e) => e.first && formalFirst(e.first) === firstLemma && genderOk(e));
    if (cands.length) return recent(cands);
    return this.#newEntity({ source: m.source, gender: m.gender, first: firstLemma });
  }

  // ---------- ukrywanie ----------

  // table: wynik detectTable(text), hide: [true/false dla kolumn] — komórki ukrytych kolumn → [WIEK-1]
  anonymize(text, { table = null, hide = [] } = {}) {
    const opts = this.options;
    const spans = [];

    if (table) {
      for (const c of hiddenCells(table, hide)) spans.push({ start: c.start, end: c.end, cat: 'kolumna', tag: c.tag, col: c.col, value: c.value, norm: lower(c.value) });
    }

    for (const t of this.terms) {
      for (const m of text.matchAll(t.re)) spans.push({ start: m.index, end: m.index + m[0].length, cat: 'custom', tag: t.label, value: m[0], norm: lower(t.term) });
    }
    for (const s of detectStructured(text, opts.categories)) {
      spans.push({ ...s, tag: CATEGORIES[s.cat].tag, norm: normalizeValue(s.cat, s.value) });
    }
    if (opts.people) {
      const mentions = detectPeople(text, { dict: this.dict, listIndex: this.listIndex, useDictionary: opts.useDictionary });
      for (const m of mentions) spans.push({ start: m.start, end: m.end, cat: 'osoba', mention: m });
    }

    // rozstrzyganie nakładania: ważniejsza kategoria, potem dłuższy fragment
    spans.sort((a, b) => PRIORITY.indexOf(a.cat) - PRIORITY.indexOf(b.cat) || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const chosen = [];
    for (const s of spans) {
      if (chosen.some((c) => s.start < c.end && c.start < s.end)) continue;
      chosen.push(s);
    }
    // „Nie ukrywaj” wygrywa z wykryciem, ale nie z ukrytą kolumną (tę użytkownik wybrał sam)
    for (let i = chosen.length - 1; i >= 0; i--) if (chosen[i].cat !== 'kolumna' && this.#kept(text, chosen[i])) chosen.splice(i, 1);
    chosen.sort((a, b) => a.start - b.start);

    const segments = [];
    let pos = 0;
    let tick = Date.now();
    const plain = (to) => { if (to > pos) segments.push({ text: text.slice(pos, to) }); pos = to; };

    // najpierw wszystkie osoby z tekstu, potem pseudonimy — żeby pseudonim nie trafił na kogoś z dalszej części
    // warianty imion z tego tekstu („kasia”, „tomek”) — pseudonim dobieramy tak, żeby miał pasujące zdrobnienie
    const hints = new Map();
    for (const s of chosen) {
      if (s.cat !== 'osoba') continue;
      s.entity = this.#entityFor(s.mention);
      s.entity.lastSeenAt = ++tick;
      const h = hints.get(s.entity) ?? { first: [], first2: [] };
      for (const x of s.mention.tokens) if (x.part === 'first' || x.part === 'first2') h[x.part].push(x.lemma);
      hints.set(s.entity, h);
    }
    if (opts.mode === 'natural') for (const s of chosen) if (s.entity) this.#ensureFake(s.entity, hints.get(s.entity));

    for (const s of chosen) {
      plain(s.start);
      if (s.cat === 'osoba') {
        const m = s.mention;
        const e = s.entity;
        const out = this.#renderMention(text, m, e);
        // forma podstawowa („Piotr Wilk”) — do listy „Nie ukrywaj”
        const base = m.tokens.filter((x) => x.part !== 'initial').map((x) => x.lemma).join(' ');
        segments.push({ text: out, original: text.slice(m.start, m.end), cat: 'osoba', entity: e.id, source: m.source, base });
      } else {
        const tag = this.#valueTag(s.tag, s.norm, s.value);
        segments.push({ text: tag, original: s.value, cat: s.cat, ...(s.col !== undefined ? { col: s.col } : {}) });
      }
      pos = s.end;
    }
    plain(text.length);

    const warnings = opts.warnSensitive ? sensitiveWarnings(text) : [];
    const stats = {};
    for (const seg of segments) if (seg.cat) stats[seg.cat] = (stats[seg.cat] ?? 0) + 1;
    stats.osoby = new Set(segments.filter((x) => x.entity).map((x) => x.entity)).size;
    return { text: segments.map((x) => x.text).join(''), segments, warnings, stats };
  }

  #valueTag(tag, norm, original) {
    if (!this.values.has(tag)) this.values.set(tag, new Map());
    const m = this.values.get(tag);
    if (!m.has(norm)) m.set(norm, { n: m.size + 1, original });
    return `[${tag}-${m.get(norm).n}]`;
  }

  #renderMention(text, m, e) {
    if (this.options.mode === 'tags' || !e.fake || m.tokens.some((x) => x.part !== 'initial' && !e.fake[x.part])) {
      return `[OSOBA-${e.id}]`;
    }
    const gender = e.gender === 'f' ? 'f' : 'm';
    let out = '';
    let pos = m.start;
    for (const x of m.tokens) {
      out += text.slice(pos, x.tok.start);
      if (x.part === 'initial') {
        const fakeFirst = e.fake.first ?? e.fake.last;
        out += applyCasing(fakeFirst[0], 'upper');
      } else {
        const cases = x.cases.filter((c) => m.cases.includes(c));
        const c = pickCase(cases.length ? cases : x.cases);
        const variant = x.part === 'last' ? e.last : x.lemma;
        // zapamiętaj oryginalną formę dla każdego możliwego przypadku
        if (!x.piece) {
          const bucket = (e.seen[x.part][variant] ??= {});
          for (const cc of cases.length ? cases : x.cases) bucket[cc] ??= x.tok.raw;
        }
        let fakeLemma = e.fake[x.part];
        if (x.part !== 'last') {
          e.variants[variant] = (e.variants[variant] ?? 0) + 1;
          fakeLemma = this.#fakeVariant(e, x.part, variant);
        }
        const p = x.part === 'last' ? surnameParadigm(this.dict, fakeLemma, gender) : paradigm(fakeLemma, 'first', gender);
        out += applyCasing(p[c], x.tok.casing);
      }
      pos = x.tok.end;
    }
    return out;
  }

  // „Kasia” dostaje zdrobnienie pseudonimu („Ewka”), „Katarzyna” — pełne imię („Ewa”)
  #fakeVariant(e, part, variant) {
    const map = (e.fakeVariants[part] ??= {});
    if (map[variant]) return map[variant];
    const formalFake = e.fake[part];
    let out = formalFake;
    if (DIMINUTIVES[variant] && formalFirst(variant) === e[part]) {
      const used = new Set(Object.values(map));
      const dims = Object.entries(DIMINUTIVES).filter(([, f]) => f === formalFake).map(([d]) => d)
        .filter((d) => !used.has(d) && !this.persons.some((p) => p.first === d) && !this.entities.some((x) => x !== e && x.first === formalFirst(d)));
      out = bestVariant(variant, formalFake, dims, e.gender);
    }
    map[variant] = out;
    return out;
  }

  // ---------- przywracanie ----------

  restore(text) {
    const segments = [];
    const warnings = [];
    // 1) znaczniki [PESEL-1], [OSOBA-2] …
    const tagged = [];
    for (const m of text.matchAll(TAG_RE)) {
      const tag = m[1].toLocaleUpperCase('pl');
      const n = Number(m[2]);
      let original = null;
      if (tag === 'OSOBA') {
        const e = this.entities.find((x) => x.id === n);
        if (e) original = this.#displayName(e);
      } else {
        for (const v of this.values.get(tag)?.values() ?? []) if (v.n === n) original = v.original;
      }
      if (original) tagged.push({ start: m.index, end: m.index + m[0].length, out: original, cat: tag === 'OSOBA' ? 'osoba' : 'wartosc' });
      else warnings.push(`Nie znam znacznika ${m[0]} — sprawdź, czy pochodzi z tej sesji.`);
    }

    // 2) pseudonimy w odmianie
    const index = new Map();
    for (const e of this.entities) {
      if (!e.fake) continue;
      const g = e.gender === 'f' ? 'f' : 'm';
      for (const part of ['first', 'first2', 'last']) {
        if (!e.fake[part]) continue;
        // pary: wariant prawdziwy → wariant pseudonimu
        let pairs;
        if (part === 'last') pairs = [[e.last, e.fake.last]];
        else {
          // dla każdego wariantu pseudonimu wybierz najczęściej używany wariant prawdziwy
          const byFake = new Map();
          for (const [real, fk] of Object.entries(e.fakeVariants?.[part] ?? {})) {
            const cur = byFake.get(fk);
            if (!cur || (e.variants[real] ?? 0) > (e.variants[cur] ?? 0)) byFake.set(fk, real);
          }
          // AI może użyć pełnego imienia pseudonimu, choć w tekście było zdrobnienie
          if (!byFake.has(e.fake[part])) {
            const top = Object.entries(e.variants).filter(([v]) => formalFirst(v) === e[part]).sort((a, b) => b[1] - a[1])[0];
            byFake.set(e.fake[part], top ? top[0] : e[part]);
          }
          pairs = [...byFake].map(([fk, real]) => [real, fk]);
        }
        for (const [realVariant, fakeLemma] of pairs) {
          const p = part === 'last' ? surnameParadigm(this.dict, fakeLemma, g) : paradigm(fakeLemma, 'first', g);
          for (const c of CASES) {
            let arr = index.get(p[c]);
            if (!arr) index.set(p[c], (arr = []));
            let hit = arr.find((h) => h.e === e && h.part === part);
            if (!hit) arr.push((hit = { e, part, realVariant, cases: [] }));
            if (!hit.cases.includes(c)) hit.cases.push(c);
          }
        }
      }
    }
    const allToks = tokenize(text);
    const toks = allToks.filter((t) => !tagged.some((s) => t.start < s.end && s.start < t.end));
    const found = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const hits = index.get(t.low);
      if (!hits || t.casing === 'lower') continue;
      // grupa sąsiednich słów tej samej osoby (imię + nazwisko)
      let group = [{ t, hits }];
      for (let j = i + 1; j < toks.length && group.length < 3; j++) {
        const nh = index.get(toks[j].low);
        if (!nh || !adjacent(text, toks[j - 1], toks[j]) || toks[j].casing === 'lower') break;
        group.push({ t: toks[j], hits: nh });
      }
      // wybierz osobę wspólną dla całej grupy
      let best = null;
      for (let len = group.length; len >= 1 && !best; len--) {
        const sub = group.slice(0, len);
        for (const h of sub[0].hits) {
          const parts = sub.map((g) => g.hits.find((x) => x.e === h.e));
          if (parts.some((x) => !x)) continue;
          if (new Set(parts.map((x) => x.part)).size !== parts.length) continue;
          best = { sub, parts, e: h.e };
          break;
        }
      }
      if (!best) continue;
      let cases = best.parts[0].cases;
      for (const p of best.parts.slice(1)) {
        const inter = cases.filter((c) => p.cases.includes(c));
        if (inter.length) cases = inter;
      }
      const prep = prepCasesBefore(text, allToks, allToks.indexOf(t));
      if (prep && cases.some((c) => prep.includes(c))) cases = cases.filter((c) => prep.includes(c));
      const c = pickCase(cases);
      // inicjał przed nazwiskiem: „M. Mazur” → „J. Kowalski”
      const prev = toks[i - 1];
      if (best.parts[0].part === 'last' && prev && prev.raw.length === 1 && text[prev.end] === '.' && best.e.first &&
          best.e.fake.first && prev.raw.toLocaleUpperCase('pl') === best.e.fake.first[0].toLocaleUpperCase('pl')) {
        found.push({ start: prev.start, end: prev.end, out: this.#realForm(best.e, 'first', 'M')[0].toLocaleUpperCase('pl'), cat: 'osoba' });
      }
      best.sub.forEach((g, k) => {
        const real = this.#realForm(best.e, best.parts[k].part, c, best.parts[k].realVariant);
        found.push({ start: g.t.start, end: g.t.end, out: applyCasing(lower(real), g.t.casing), cat: 'osoba', entity: best.e.id });
      });
      i += best.sub.length - 1;
    }

    const all = [...tagged, ...found].sort((a, b) => a.start - b.start);
    let pos = 0;
    for (const s of all) {
      if (s.start < pos) continue;
      if (s.start > pos) segments.push({ text: text.slice(pos, s.start) });
      segments.push({ text: s.out, original: text.slice(s.start, s.end), cat: s.cat });
      pos = s.end;
    }
    if (pos < text.length) segments.push({ text: text.slice(pos) });

    // 3) ślady pseudonimów, których nie umiemy odmienić (zdrobnienia, liczba mnoga)
    const restoredStarts = new Set(found.map((f) => f.start));
    const stems = [];
    for (const e of this.entities) for (const k of ['first', 'first2', 'last']) {
      const f = e.fake?.[k];
      if (f && f.length >= 5) stems.push(f.slice(0, Math.max(4, f.length - 2)));
    }
    const suspicious = new Set();
    for (const t of tokenize(text)) {
      if (t.casing === 'lower' || restoredStarts.has(t.start)) continue;
      if (stems.some((s) => t.low.startsWith(s)) && !index.has(t.low)) suspicious.add(t.raw);
    }
    if (suspicious.size) warnings.push(`Możliwe nieprzywrócone pseudonimy: ${[...suspicious].join(', ')}. Sprawdź je ręcznie.`);

    return { text: segments.map((s) => s.text).join(''), segments, warnings, count: all.length };
  }

  #realForm(e, part, c, variant = null) {
    if (!variant) {
      if (part === 'last') variant = e.last;
      else {
        // wariant imienia najczęściej używany w tekście (np. „Kasia” zamiast „Katarzyna”)
        const vs = Object.entries(e.variants).filter(([v]) => formalFirst(v) === e[part]).sort((a, b) => b[1] - a[1]);
        variant = vs.length ? vs[0][0] : e[part];
      }
    }
    const seen = e.seen[part]?.[variant]?.[c];
    if (seen) return seen;
    const g = e.gender === 'f' ? 'f' : 'm';
    if (part === 'last') {
      if (e.gender === 'u' && c === 'M') return applyCasing(e.last, 'title');
      return applyCasing(surnameParadigm(this.dict, e.last, g)[c], 'title');
    }
    return applyCasing(paradigm(variant, 'first', g)[c], 'title');
  }

  #displayName(e, { formal = false } = {}) {
    const parts = [];
    if (e.first) parts.push(this.#realForm(e, 'first', 'M', formal ? e.first : null));
    if (e.first2) parts.push(this.#realForm(e, 'first2', 'M', formal ? e.first2 : null));
    if (e.last) parts.push(this.#realForm(e, 'last', 'M'));
    return parts.map((x) => applyCasing(lower(x), 'title')).join(' ');
  }

  // Które kolumny tabeli ukryć: nagłówek z danymi osobowymi albo co najmniej połowa komórek z wykrytą osobą lub numerem
  suggestColumns(table) {
    const body = table.rows.slice(table.header ? 1 : 0);
    return table.columns.map((col) => {
      if (col.suggested) return true;
      // kolumny z notatkami zostają — nazwiska w nich i tak podmienimy, a reszta treści jest potrzebna AI
      if (/uwag|notatk|komentarz|opis|ocena|feedback|notes?$/i.test(col.name)) return false;
      const cells = body.map((r) => r.cells[col.index]?.text ?? '').filter(Boolean).slice(0, 50);
      if (!cells.length) return false;
      // kolumna z notatkami (dłuższe teksty) zostaje — nazwiska w niej i tak podmienimy
      const words = cells.reduce((n, c) => n + c.split(/\s+/).length, 0) / cells.length;
      if (words > 3) return false;
      let hits = 0;
      for (const c of cells) {
        const found = detectStructured(c, this.options.categories).length ||
          detectPeople(c, { dict: this.dict, listIndex: this.listIndex, useDictionary: this.options.useDictionary }).length;
        if (found) hits++;
      }
      return hits / cells.length >= 0.6;
    });
  }

  // ---------- podgląd słownika i zapis ----------

  mapping() {
    const rows = [];
    for (const e of this.entities) {
      const fake = this.options.mode === 'natural' && e.fake
        ? ['first', 'first2', 'last'].filter((k) => e[k]).map((k) => e.fake[k] ? applyCasing(e.fake[k], 'title') : '?').join(' ')
        : `[OSOBA-${e.id}]`;
      rows.push({ kind: 'osoba', original: this.#displayName(e, { formal: true }), replacement: fake, source: e.source });
    }
    for (const [tag, m] of this.values) for (const v of m.values()) rows.push({ kind: tag, original: v.original, replacement: `[${tag}-${v.n}]` });
    return rows;
  }

  toJSON() {
    return {
      format: 'czystyprompt-sesja',
      version: 1,
      options: this.options,
      people: this.peopleText,
      terms: this.termsText,
      keep: this.keepText,
      entities: this.entities,
      values: [...this.values].map(([tag, m]) => [tag, [...m]]),
    };
  }

  static fromJSON(data) {
    if (!['czystyprompt-sesja', 'maska-sesja'].includes(data?.format)) throw new Error('To nie jest plik sesji CzystyPrompt.');
    const s = new Session({ people: data.people ?? '', terms: data.terms ?? '', keep: data.keep ?? '', options: data.options ?? {} });
    s.entities = data.entities ?? [];
    s.values = new Map((data.values ?? []).map(([tag, arr]) => [tag, new Map(arr)]));
    s.setPeople(s.peopleText);
    return s;
  }
}

export function sensitiveWarnings(text) {
  const out = [];
  for (const t of SENSITIVE_TOPICS) {
    t.re.lastIndex = 0;
    // bez powtórzeń, ale w pisowni z tekstu („L4”, nie „l4”, które wygląda jak „14”)
    const found = new Map();
    for (const m of text.matchAll(t.re)) if (!found.has(m[0].toLocaleLowerCase('pl'))) found.set(m[0].toLocaleLowerCase('pl'), m[0]);
    if (found.size) out.push({ label: t.label, words: [...found.values()].slice(0, 5) });
  }
  return out;
}

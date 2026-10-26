// Pseudonimy: zmyślone imiona i nazwiska o tej samej płci i tym samym wzorze odmiany.
// Wzór odmiany ma znaczenie: z formy pseudonimu w odpowiedzi AI odczytujemy przypadek
// i wstawiamy prawdziwe nazwisko w tym samym przypadku. Najlepiej, gdy pseudonim ma
// te same formy wspólne dla kilku przypadków co prawdziwe imię („Kamili” = D, C, Ms → „Natalii”),
// bo wtedy AI dostaje tę samą dwuznaczność, a nie błąd gramatyczny („przekazać Moniki”).

import { surnameClass, paradigm, CASES } from './declension.js';
import { DIMINUTIVES } from './data/lexicon.js';

const list = (s) => s.trim().split(/\s+/);

export const POOLS = {
  firstM: list(`adam tomasz michał robert łukasz kamil damian dawid artur daniel szymon patryk sebastian konrad
    bartosz hubert oskar igor dominik wiktor marcin rafał grzegorz mateusz filip norbert emil adrian przemysław
    zbigniew jarosław sławomir radosław mirosław wojciech ryszard janusz roman bogdan edward witold leon olaf`),
  firstF: list(`ewa monika joanna beata marta iwona agata paulina karolina justyna dorota renata edyta aneta
    weronika magdalena halina bożena grażyna danuta elżbieta barbara jolanta teresa milena adrianna lena ilona
    sabina irena helena regina wanda lucyna marzena katarzyna agnieszka małgorzata ewelina sylwana
    natalia julia emilia urszula izabela klaudia sylwia patrycja oliwia kornelia`),
  lastMAdj: list(`zieliński lewandowski dąbrowski kozłowski jankowski wojciechowski kwiatkowski pawłowski michalski
    nowicki sadowski bielecki wróblewski jasiński zalewski sikorski baranowski szczepański górecki czarnecki
    rutkowski ostrowski malinowski jabłoński majewski olszewski borkowski czerwiński kaczmarski tomaszewski`),
  lastMNoun: list(`mazur kubiak pawlak walczak michalak wójcik krawczyk kowalczyk szymczak wawrzyniak jakubiak
    tomczak adamczyk dudziak marciniak pietrzak sobczak kołodziej kasprzak szulc bednarek kalinowicz maciejewicz
    grabarczyk jędrzejczak stasiak szewczyk gołębiewicz wolak frankowiak`),
  lastA: list(`sikora zawada gajda wrona kuźma kafara morawa zaręba kozera gruca bryła gałęza`),
};
POOLS.lastFAdj = POOLS.lastMAdj.map((s) => s.slice(0, -1) + 'a');

// Które przypadki mają wspólną formę: „kamila” → 0 1 1 3 4 1 6 (D = C = Ms)
export const caseSig = (p) => CASES.map((c) => CASES.findIndex((c2) => p[c2] === p[c])).join('');

const dimsOf = (formal) => Object.entries(DIMINUTIVES).filter(([, f]) => f === formal).map(([d]) => d);
const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
// „Mazurek” → „Mazur” zdradza za dużo; „Kowalski” → „Kowalczyk” też
const tooSimilar = (cand, reals) => reals.some((r) => r && commonPrefix(r, cand) >= 4);

// Jak dobrze wariant pseudonimu (np. „asia”) udaje prawdziwy wariant („kasia”): 0 = idealnie
function variantScore(fakeVariant, realVariant, g, isFormal) {
  const sigOk = caseSig(paradigm(fakeVariant, 'first', g)) === caseSig(paradigm(realVariant, 'first', g));
  let s = sigOk ? 0 : 10;
  if (isFormal) s += 1; // zdrobnienie zastępujemy zdrobnieniem, nie pełnym imieniem
  else {
    if (fakeVariant.slice(-2) !== realVariant.slice(-2)) s += 1; // Tomek → Bartek, nie Adaś
    if (fakeVariant.slice(-3) !== realVariant.slice(-3)) s += 0.5; // Kasia → Asia, nie Ewunia
    if (Math.abs(fakeVariant.length - realVariant.length) > 1) s += 0.25; // Ania → Renia, nie Ewunia
  }
  return s;
}

// Najlepsze zdrobnienie pseudonimu dla prawdziwego zdrobnienia (albo pełne imię, gdy brak lepszego)
export function bestVariant(realVariant, formalFake, dims, gender) {
  const g = gender === 'f' ? 'f' : 'm';
  let best = formalFake;
  let bestS = variantScore(formalFake, realVariant, g, true);
  for (const d of dims) {
    const s = variantScore(d, realVariant, g, false);
    if (s < bestS) { best = d; bestS = s; }
  }
  return best;
}

// Pula dla nazwiska wg wzoru odmiany prawdziwego nazwiska
function surnamePool(realLast, gender, adjHint) {
  const g = gender === 'f' ? 'f' : 'm';
  const cls = surnameClass(realLast, g, adjHint);
  if (gender === 'u') return POOLS.lastMNoun; // „Nowak” bez płci: ten sam napis pasuje do obu
  if (cls === 'a' || cls === 'o') return POOLS.lastA;
  if (g === 'f') return cls === 'indecl' ? POOLS.lastMNoun : POOLS.lastFAdj; // „Nowak” (kobieta) → „Kubiak” (nieodmienne)
  return cls === 'adj' ? POOLS.lastMAdj : POOLS.lastMNoun;
}

// Unikamy pseudonimów, które są zwykłymi słowami, prawdziwymi osobami z sesji albo są podobne do prawdziwych
function pick(pool, { taken, common, kind, gender, reals, score }) {
  const g = gender === 'f' ? 'f' : 'm';
  let best = null;
  let bestS = Infinity;
  for (const cand of pool) {
    if (taken.has(cand) || tooSimilar(cand, reals)) continue;
    const p = paradigm(cand, kind, g);
    if (CASES.some((c) => common.has(p[c]))) continue;
    const s = score ? score(cand) : 0;
    if (s < bestS) { best = cand; bestS = s; if (s === 0) break; }
  }
  if (best) taken.add(best);
  return best;
}

// entity: { gender, first, first2, last, lastAdjHint }; taken: Set nazw zajętych (prawdziwe + użyte)
// hints: { first: [warianty z tekstu, np. „kasia”], first2: [...] }
export function assignFake(entity, taken, common, hints = {}) {
  const fake = entity.fake ?? {};
  const gender = entity.gender;
  const g = gender === 'f' ? 'f' : 'm';
  const firstPool = gender === 'f' ? POOLS.firstF : POOLS.firstM;
  const reals = [entity.first, entity.first2, entity.last, ...(entity.last ?? '').split('-')];

  const firstScore = (part) => (cand) => {
    const realFormal = entity[part];
    let s = caseSig(paradigm(cand, 'first', g)) === caseSig(paradigm(realFormal, 'first', g)) ? 0 : 5;
    const dims = dimsOf(cand);
    for (const v of new Set(hints[part] ?? [])) {
      if (v === realFormal || DIMINUTIVES[v] !== realFormal) continue;
      s += Math.min(variantScore(cand, v, g, true), ...dims.map((d) => variantScore(d, v, g, false)));
    }
    return s;
  };
  for (const part of ['first', 'first2']) {
    if (entity[part] && !fake[part]) {
      fake[part] = pick(firstPool, { taken, common, kind: 'first', gender, reals: [...reals, ...(hints[part] ?? [])], score: firstScore(part) });
    }
  }
  if (entity.last && !fake.last) {
    const realSig = gender === 'u' ? null : caseSig(paradigm(entity.last, 'last', g, { adjHint: entity.lastAdjHint }));
    const score = realSig ? (cand) => (caseSig(paradigm(cand, 'last', g)) === realSig ? 0 : 1) : null;
    fake.last = pick(surnamePool(entity.last, gender, entity.lastAdjHint), { taken, common, kind: 'last', gender, reals, score });
  }
  entity.fake = fake;
  return fake;
}

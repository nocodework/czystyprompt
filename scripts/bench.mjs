// Benchmark na syntetycznych zdaniach: imiona i nazwiska z rejestru PESEL w różnych przypadkach.
// Mierzy: (1) ile osób zostało ukrytych, (2) czy przywrócenie daje dokładnie oryginał,
// (3) czy odpowiedź AI w INNYM przypadku wraca poprawnie, (4) fałszywe trafienia na tekście bez osób.
// Uruchom: node scripts/bench.mjs [liczba_zdań]
import { Session } from '../src/session.js';
import { paradigm } from '../src/declension.js';
import { FIRST_M, FIRST_F, SURNAMES_M } from '../src/data/names.js';
import { surnameParadigm, dictionary } from '../src/people.js';

const N = Number(process.argv[2] ?? 2000);
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const cap = (s) => s.split('-').map((p) => p[0].toLocaleUpperCase('pl') + p.slice(1)).join('-');
const fem = (s) => s.replace(/(sk|ck|dzk)i$/, '$1a').replace(/([^aąeęioóuy])y$/, '$1a');

const firstM = FIRST_M.split('|').slice(0, 300);
const firstF = FIRST_F.split('|').slice(0, 300);
const surnames = SURNAMES_M.split('|').slice(0, 8000);
const dict = dictionary();

// [szablon, przypadek, czasownik m/ż]
const TEMPLATES = [
  ['{X} złożył wniosek o urlop.', 'M', ['złożył', 'złożyła']],
  ['Wczoraj {X} przyszedł spóźniony.', 'M', ['przyszedł', 'przyszła']],
  ['Rozmawiałem z {X} o premii.', 'N'],
  ['Proszę przekazać umowę {X} do podpisu.', 'C'],
  ['Nie widziałem {X} od tygodnia.', 'D'],
  ['Zaprosiłam {X} na rozmowę okresową.', 'B'],
  ['Myślę o {X} w kontekście awansu.', 'Ms'],
  ['W zespole {X} jest dobra atmosfera.', 'D'],
  ['Kierowniczka pochwaliła {X} za projekt.', 'B'],
  ['Dzięki {X} wdrożenie poszło szybciej.', 'C'],
];

function person() {
  const g = rnd() < 0.5 ? 'm' : 'f';
  const first = pick(g === 'm' ? firstM : firstF);
  let last = pick(surnames);
  if (g === 'f') last = fem(last);
  return { g, first, last };
}

function nameIn(p, c, style) {
  const f = cap(paradigm(p.first, 'first', p.g)[c]);
  const l = cap(surnameParadigm(dict, p.last, p.g)[c]);
  return style === 'full' ? `${f} ${l}` : style === 'first' ? f : l;
}

let total = 0, hidden = 0, exact = 0, reinflectOk = 0, reinflectTotal = 0;
const by = { lista: [0, 0], slownik: [0, 0] };
const leaks = [];
for (let i = 0; i < N; i++) {
  const p = person();
  const [tpl, c, verbs] = pick(TEMPLATES);
  const style = rnd() < 0.6 ? 'full' : rnd() < 0.5 ? 'last' : 'first';
  const useList = rnd() < 0.5;
  const s = new Session({ people: useList ? `${cap(p.first)} ${cap(p.last)}` : '' });
  let sentence = tpl.replace('{X}', nameIn(p, c, style));
  if (verbs) sentence = sentence.replace(verbs[0], p.g === 'm' ? verbs[0] : verbs[1]);
  const a = s.anonymize(sentence);
  total++;
  const name = nameIn(p, c, style);
  const leaked = name.split(' ').some((w) => a.text.includes(w));
  if (!leaked) hidden++;
  const b = by[useList ? 'lista' : 'slownik'];
  b[1]++;
  if (!leaked) b[0]++;
  else if (leaks.length < 25) leaks.push(`${useList ? '[lista] ' : ''}${sentence}  →  ${a.text}`);
  if (s.restore(a.text).text === sentence) exact++;

  // odpowiedź AI w innym przypadku: bierzemy pseudonim i odmieniamy go sami
  const e = s.entities[0];
  if (!leaked && e?.fake && style === 'full' && e.fake.first && e.fake.last) {
    const c2 = pick(['M', 'D', 'C', 'B', 'N', 'Ms']);
    const g = e.gender === 'f' ? 'f' : 'm';
    const ai = `Warto docenić: ${cap(paradigm(e.fake.first, 'first', g)[c2])} ${cap(surnameParadigm(dict, e.fake.last, g)[c2])}.`;
    const want = `Warto docenić: ${nameIn(p, c2, 'full')}.`;
    reinflectTotal++;
    if (s.restore(ai).text === want) reinflectOk++;
    else if (leaks.length < 40) leaks.push(`[odmiana ${c2}] ${ai} → ${s.restore(ai).text} (oczekiwane: ${want})`);
  }
}

// fałszywe trafienia: zwykły tekst biznesowy bez osób
const CLEAN = `Zespół logistyki wdraża nowy proces zamówień od poniedziałku. Piątek jest dniem wolnym za święto.
W Warszawie i Krakowie otwieramy biura, a Bank Pekao obsłuży płatności. Polska firma rośnie szybciej niż rynek.
Kierownik działu kadr przygotuje harmonogram urlopów na lipiec i sierpień. Kodeks pracy wymaga zgody pracownika.
Raport kwartalny pokazuje wzrost sprzedaży o 12%. Excel, Teams i Outlook działają bez zarzutu.
Szkolenie BHP odbędzie się w sali konferencyjnej. Rekrutacja na stanowisko magazyniera trwa do końca miesiąca.
Wilk to zwierzę, a lis bywa sprytny. Maj i czerwiec to najlepsze miesiące na integrację zespołu.
Nowy regulamin pracy zdalnej wchodzi w życie 1 grudnia. Dział IT zaktualizuje laptopy w przyszłym tygodniu.
Benefit sportowy obejmuje siłownię i basen. Ocena okresowa odbywa się raz w roku, zwykle w styczniu.
Świadczenia socjalne wypłaca się z funduszu. Umowa o pracę na czas nieokreślony daje stabilność.
Róża wiatrów pokazuje kierunek. Na Mazurach jest piękne lato, a Zakopane przyciąga turystów zimą.`;
const s0 = new Session();
const r0 = s0.anonymize(CLEAN);
const falsePos = r0.segments.filter((x) => x.cat === 'osoba').map((x) => x.original);
const words = CLEAN.split(/\s+/).length;

const pct = (a, b) => ((100 * a) / b).toFixed(1) + '%';
console.log(`Zdania: ${total}`);
console.log(`Ukryte osoby: ${hidden}/${total} = ${pct(hidden, total)} (z listą: ${pct(...by.lista)}, tylko słownik: ${pct(...by.slownik)})`);
console.log(`Dokładny powrót (ukryj → przywróć): ${pct(exact, total)}`);
console.log(`Odpowiedź AI w innym przypadku → poprawna forma: ${reinflectOk}/${reinflectTotal} = ${pct(reinflectOk, reinflectTotal)}`);
console.log(`Fałszywe trafienia w tekście bez osób: ${falsePos.length} na ${words} słów ${falsePos.length ? '→ ' + falsePos.join(', ') : ''}`);
if (leaks.length) console.log('\nPrzykłady błędów:\n' + leaks.join('\n'));

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';

const NOTE = `Rozmowę z Janem Kowalskim przeprowadziła Anna Zielińska. Kasia z kadr potwierdziła, że Kowalski był w delegacji.`;

test('pełny obieg: ukryj → przywróć zwraca oryginał', () => {
  const s = new Session({ people: 'Jan Kowalski\nKatarzyna Nowak' });
  const a = s.anonymize(NOTE);
  assert.ok(!/Kowalsk|Zielińsk|Kasia/.test(a.text), a.text);
  assert.equal(s.restore(a.text).text, NOTE);
});

test('AI odpowiada w innym przypadku — przywracamy w tym samym przypadku', () => {
  const s = new Session({ people: 'Jan Kowalski\nAnna Zielińska' });
  s.anonymize('Jan Kowalski i Anna Zielińska pracują w logistyce.');
  const fake = s.mapping();
  const [jan, anna] = fake.map((r) => r.replacement.split(' '));
  const { paradigm } = await_import();
  // np. „Panu Adamowi Lewandowskiemu” → „Panu Janowi Kowalskiemu”
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  const jC = cap(paradigm(jan[0], 'first', 'm').C) + ' ' + cap(paradigm(jan[1], 'last', 'm').C);
  const aD = cap(paradigm(anna[0], 'first', 'f').D) + ' ' + cap(paradigm(anna[1], 'last', 'f').D);
  const aiText = `Proponuję podziękować ${jC} i poprosić o opinię ${aD}.`;
  assert.equal(s.restore(aiText).text, 'Proponuję podziękować Janowi Kowalskiemu i poprosić o opinię Anny Zielińskiej.');
});

test('zdrobnienie i pełne imię tej samej osoby wracają osobno', () => {
  const s = new Session({ people: 'Katarzyna Nowak' });
  const text = 'Kasia przyszła. Katarzyna Nowak podpisała wniosek.';
  const a = s.anonymize(text);
  assert.equal(s.restore(a.text).text, text);
});

test('zwykłe słowa, miasta i nazwy nie są maskowane', () => {
  const s = new Session();
  const text = 'Piątek był wolny. W Warszawie otwieramy biuro. Bank Pekao i Polska firma. Excel i Teams działają.';
  const a = s.anonymize(text);
  assert.equal(a.text, text);
});

test('osoby spoza listy ze słownika PESEL i z końcówki nazwiska', () => {
  const s = new Session();
  const a = s.anonymize('Spotkanie z Małgorzatą Wiśniewską i panem Brzęczyszczykiewiczem.');
  assert.ok(!/Wiśniewsk|Małgorzat|Brzęczyszczykiewicz/.test(a.text), a.text);
  assert.equal(s.restore(a.text).text, 'Spotkanie z Małgorzatą Wiśniewską i panem Brzęczyszczykiewiczem.');
});

test('lista: nazwisko będące zwykłym słowem maskujemy tylko pisane wielką literą', () => {
  const s = new Session({ people: 'Piotr Wilk' });
  const a = s.anonymize('Wilk spóźnił się. Głodny jak wilk.');
  assert.ok(!a.text.startsWith('Wilk'), a.text);
  assert.ok(a.text.endsWith('jak wilk.'), a.text);
});

test('tryb znaczników [OSOBA-1] i powrót', () => {
  const s = new Session({ people: 'Jan Kowalski', options: { mode: 'tags' } });
  const a = s.anonymize('Jan Kowalski, PESEL 44051401359.');
  assert.equal(a.text, '[OSOBA-1], PESEL [PESEL-1].');
  assert.equal(s.restore('Dane: [OSOBA-1], [PESEL-1].').text, 'Dane: Jan Kowalski, 44051401359.');
});

test('zapis i odczyt sesji z pliku', () => {
  const s = new Session({ people: 'Jan Kowalski' });
  const a = s.anonymize('Jan Kowalski dzwonił z numeru 601 234 567.');
  const copy = Session.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(copy.restore(a.text).text, 'Jan Kowalski dzwonił z numeru 601 234 567.');
});

test('ostrzeżenie o danych szczególnych kategorii', () => {
  const s = new Session();
  const a = s.anonymize('Pracownik przyniósł zwolnienie lekarskie i orzeczenie o niepełnosprawności.');
  assert.ok(a.warnings.some((w) => w.label === 'zdrowie'));
});

// pomocnicze: synchroniczny dostęp do paradigm w teście
import * as decl from '../src/declension.js';
function await_import() { return decl; }

test('samo imię i zdrobnienie łączą się z pełnym imieniem i nazwiskiem z tego samego tekstu', () => {
  const s = new Session();
  const t = 'Ocena: Krzysztof Mazurek. Krzysiek dobrze pracuje. Rozmawiałem z Bartkiem Sikorą, Bartek się zgodził. Laptop odbierze od Piotra.';
  const a = s.anonymize(t);
  const people = new Set(a.segments.filter((x) => x.entity).map((x) => x.entity));
  assert.equal(people.size, 3, a.text); // Krzysztof, Bartek, Piotr — nie pięć osób
  const piotr = s.entities.find((e) => e.first === 'piotr');
  assert.ok(piotr && piotr.fake.first && !piotr.fake.last, 'Piotra traktujemy jak imię, nie nazwisko');
  assert.equal(s.restore(a.text).text, t);
});

test('pseudonim ma te same formy wspólne dla kilku przypadków („przekazać Kamili”)', () => {
  const s = new Session();
  const t = 'Czy możesz przekazać Kamili, że raport przejmuje Kasia?';
  const a = s.anonymize(t);
  const kamila = s.entities.find((e) => e.first === 'kamila');
  const fake = a.segments.find((x) => x.original === 'Kamili').text;
  assert.match(fake, /(ii|li|ji|i)$/, `forma D=C=Ms, a nie „Moniki”: ${a.text}`);
  assert.notEqual(kamila.fake.first, 'monika');
  assert.equal(s.restore(a.text).text, t);
});

test('nazwisko dwuczłonowe w innym przypadku to ta sama osoba', () => {
  const s = new Session();
  const t = 'Kandydatka: Aleksandra Dąbrowska-Kot. Panią Dąbrowską-Kot zapraszamy na drugi etap.';
  const a = s.anonymize(t);
  assert.equal(new Set(a.segments.filter((x) => x.entity).map((x) => x.entity)).size, 1, a.text);
  assert.ok(!/Dąbrowsk|Kot/.test(a.text), a.text);
  assert.equal(s.restore(a.text).text, t);
});

test('pseudonim nie jest podobny do prawdziwego nazwiska', () => {
  const s = new Session();
  for (const name of ['Krzysztof Mazurek', 'Jan Kowalczyk', 'Anna Zielińska-Nowak', 'Marta Sikorska']) {
    const a = s.anonymize(`Ocena: ${name}.`);
    const fake = a.segments.find((x) => x.entity).text;
    for (const [r, f] of name.toLowerCase().split(/[ -]/).map((r, i) => [r, fake.toLowerCase().split(' ')[i] ?? ''])) {
      assert.ok(r.slice(0, 4) !== f.slice(0, 4), `${name} → ${fake}`);
    }
  }
});

test('przyimek wybiera przypadek („o Kasi” = miejscownik)', () => {
  const s = new Session({ people: 'Katarzyna Nowak' });
  const a = s.anonymize('Myślę o Kasi i o Katarzynie z księgowości.');
  const r = s.restore(a.text);
  assert.equal(r.text, 'Myślę o Kasi i o Katarzynie z księgowości.');
  // AI pisze w innym przypadku po przyimku — wraca poprawna forma
  const e = s.entities[0];
  const fakeKasia = Object.values(e.fakeVariants.first).find((v) => v !== e.fake.first) ?? e.fake.first;
  assert.ok(fakeKasia);
});

test('nazwy miejscowości z łącznikiem nie są osobami', () => {
  const s = new Session();
  const t = 'Jedziemy do Bielsko-Białej, Kędzierzyna-Koźla i Skarżyska-Kamiennej. Województwo Kujawsko-Pomorskie.';
  assert.equal(s.anonymize(t).text, t);
});

test('tabela z Excela: ukryte kolumny dostają znaczniki, reszta zostaje, powrót 1:1', async () => {
  const { detectTable } = await import('../src/table.js');
  const t = 'Imię\tNazwisko\tWiek\tDział\tWynagrodzenie\tUwagi\nJan\tKowalski\t34\tLogistyka\t6500\trozmawiał z Kasią\nAnna\tZielińska\t41\tKadry\t7200\t\nJan\tNowak\t29\tLogistyka\t6100\tL4';
  const s = new Session();
  const tb = detectTable(t);
  assert.ok(tb && tb.header);
  const hide = s.suggestColumns(tb);
  assert.deepEqual(hide, [true, true, true, false, true, false]); // „Uwagi” to notatki — zostają
  const a = s.anonymize(t, { table: tb, hide });
  assert.ok(!/Kowalski|Zielińska|6500|\t34\t/.test(a.text), a.text);
  assert.match(a.text, /\[IMIĘ-1\]\t\[NAZWISKO-1\]\t\[WIEK-1\]\tLogistyka/);
  assert.match(a.text, /\[IMIĘ-1\]\t\[NAZWISKO-3\]/); // ten sam „Jan” = ten sam znacznik
  assert.ok(!/Kasią/.test(a.text), 'nazwisko w notatce i tak podmienione');
  assert.equal(s.restore(a.text).text, t);
});

test('zwykły tekst i zdania ze średnikiem to nie tabela', async () => {
  const { detectTable } = await import('../src/table.js');
  assert.equal(detectTable('Zebranie; potem kawa; i tak dalej.\nDrugi wiersz bez średnika.'), null);
  assert.equal(detectTable('Jedna linia\tz tabulatorem'), null);
});

test('wiek: „34-letni”, „wiek: 52”, „lat 45” tak; staż „12 lat w firmie” nie', () => {
  const s = new Session();
  const a = s.anonymize('Kandydat 34-letni. Wiek: 52. Kowalski, lat 45. Pracuje u nas 12 lat, 10 lat doświadczenia.');
  assert.equal(a.stats.wiek, 3, a.text);
  assert.match(a.text, /12 lat/);
  assert.match(a.text, /10 lat doświadczenia/);
});

test('„Nie ukrywaj”: słowo z listy zostaje, pełne imię i nazwisko dalej ukryte', () => {
  const s = new Session({ keep: 'Wilk' });
  const a = s.anonymize('Zespół Wilk wygrał. Rozmawiałem z Piotrem Wilkiem.');
  assert.match(a.text, /Zespół Wilk wygrał/);
  assert.ok(!/Wilkiem/.test(a.text), a.text);
  const s2 = new Session({ keep: 'Piotr Wilk' });
  assert.match(s2.anonymize('Rozmawiałem z Piotrem Wilkiem.').text, /Piotrem Wilkiem/);
});

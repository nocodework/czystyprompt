import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStructured, validPesel, validNip, validIban, validIdCard, validRegon } from '../src/detectors.js';
import { DEFAULT_OPTIONS } from '../src/session.js';

const found = (text) => detectStructured(text, DEFAULT_OPTIONS.categories).map((f) => `${f.cat}:${f.value}`);

test('sumy kontrolne', () => {
  assert.ok(validPesel('44051401359'));
  assert.ok(!validPesel('44051401358'));
  assert.ok(validNip('123-456-32-18'));
  assert.ok(!validNip('1234563219'));
  assert.ok(validIban('PL61 1090 1014 0000 0712 1981 2874'));
  assert.ok(validIdCard('ABA300000'));
  assert.ok(validRegon('123456785'));
});

test('wykrywa typowe dane z notatki kadrowej', () => {
  const f = found('PESEL 44051401359, NIP 123-456-32-18, konto PL61 1090 1014 0000 0712 1981 2874, tel. +48 601 234 567, mail jan.kowalski@firma.pl.');
  for (const x of ['pesel:44051401359', 'nip:123-456-32-18', 'konto:PL61 1090 1014 0000 0712 1981 2874', 'telefon:+48 601 234 567', 'email:jan.kowalski@firma.pl']) {
    assert.ok(f.includes(x), `brak ${x} w ${f}`);
  }
});

test('adres i data urodzenia', () => {
  const f = found('Zam. ul. 3 Maja 12/4, 00-950 Warszawa, ur. 14 maja 1984 r.');
  assert.ok(f.includes('adres:ul. 3 Maja 12/4'));
  assert.ok(f.includes('adres:00-950 Warszawa'));
  assert.ok(f.includes('urodzenie:14 maja 1984 r.'));
});

test('nie myli kwoty z telefonem i nie bierze zwykłych liczb', () => {
  const f = found('Budżet 100 000 000 zł. Spotkanie 12 osób w sali 204, rok 2026.');
  assert.ok(!f.some((x) => x.startsWith('telefon')), f.join());
});

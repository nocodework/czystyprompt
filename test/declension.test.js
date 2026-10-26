import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paradigm } from '../src/declension.js';

const row = (lemma, kind, g) => Object.values(paradigm(lemma, kind, g)).join(' ');

test('imiona męskie: zanik e, zmiękczenia, przymiotnikowe', () => {
  assert.equal(row('Jan', 'first', 'm'), 'jan jana janowi jana janem janie janie');
  assert.equal(row('Marek', 'first', 'm'), 'marek marka markowi marka markiem marku marku');
  assert.equal(row('Paweł', 'first', 'm'), 'paweł pawła pawłowi pawła pawłem pawle pawle');
  assert.equal(row('Maciek', 'first', 'm'), 'maciek maćka maćkowi maćka maćkiem maćku maćku');
  assert.equal(row('Kacper', 'first', 'm'), 'kacper kacpra kacprowi kacpra kacprem kacprze kacprze');
  assert.equal(row('Jerzy', 'first', 'm'), 'jerzy jerzego jerzemu jerzego jerzym jerzym jerzy');
  assert.equal(row('Kuba', 'first', 'm'), 'kuba kuby kubie kubę kubą kubie kubo');
});

test('imiona żeńskie: twarde, miękkie, zdrobnienia', () => {
  assert.equal(row('Anna', 'first', 'f'), 'anna anny annie annę anną annie anno');
  assert.equal(row('Agnieszka', 'first', 'f'), 'agnieszka agnieszki agnieszce agnieszkę agnieszką agnieszce agnieszko');
  assert.equal(row('Maria', 'first', 'f'), 'maria marii marii marię marią marii mario');
  assert.equal(row('Maja', 'first', 'f'), 'maja mai mai maję mają mai majo');
  assert.equal(row('Kasia', 'first', 'f'), 'kasia kasi kasi kasię kasią kasi kasiu');
  assert.equal(row('Olga', 'first', 'f'), 'olga olgi oldze olgę olgą oldze olgo');
});

test('nazwiska: -ski/-ska, rzeczownikowe, nieodmienne żeńskie, -a, -o, dwuczłonowe', () => {
  assert.equal(row('Kowalski', 'last', 'm'), 'kowalski kowalskiego kowalskiemu kowalskiego kowalskim kowalskim kowalski');
  assert.equal(row('Kowalska', 'last', 'f'), 'kowalska kowalskiej kowalskiej kowalską kowalską kowalskiej kowalska');
  assert.equal(row('Nowak', 'last', 'm'), 'nowak nowaka nowakowi nowaka nowakiem nowaku nowaku');
  assert.equal(row('Nowak', 'last', 'f'), 'nowak nowak nowak nowak nowak nowak nowak');
  assert.equal(row('Wróbel', 'last', 'm'), 'wróbel wróbla wróblowi wróbla wróblem wróblu wróblu');
  assert.equal(row('Stępień', 'last', 'm'), 'stępień stępnia stępniowi stępnia stępniem stępniu stępniu');
  assert.equal(row('Sikora', 'last', 'm'), 'sikora sikory sikorze sikorę sikorą sikorze sikoro');
  assert.equal(row('Matejko', 'last', 'm'), 'matejko matejki matejce matejkę matejką matejce matejko');
  assert.equal(paradigm('Nowak-Jeziorańska', 'last', 'f').D, 'nowak-jeziorańskiej');
});

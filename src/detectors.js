// Wykrywanie danych o stałym formacie: PESEL, NIP, REGON, konto, karta, e-mail, telefon,
// dowód, paszport, adres, data urodzenia, kwoty, daty. Sumy kontrolne ograniczają fałszywe trafienia.

const digits = (s) => s.replace(/\D/g, '');

export function validPesel(raw) {
  const d = digits(raw);
  if (d.length !== 11) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += w[i] * Number(d[i]);
  if ((10 - (sum % 10)) % 10 !== Number(d[10])) return false;
  let month = Number(d.slice(2, 4)) % 20;
  const day = Number(d.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function validNip(raw) {
  const d = digits(raw);
  if (d.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += w[i] * Number(d[i]);
  const c = sum % 11;
  return c !== 10 && c === Number(d[9]);
}

export function validRegon(raw) {
  const d = digits(raw);
  const w = d.length === 9 ? [8, 9, 2, 3, 4, 5, 6, 7] : d.length === 14 ? [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8] : null;
  if (!w) return false;
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i] * Number(d[i]);
  return (sum % 11) % 10 === Number(d.at(-1));
}

export function validIban(raw) {
  let s = raw.replace(/\s/g, '').toUpperCase();
  if (/^\d{26}$/.test(s)) s = 'PL' + s;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const x of v) rem = (rem * 10 + Number(x)) % 97;
  }
  return rem === 1;
}

export function validLuhn(raw) {
  const d = digits(raw);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return sum % 10 === 0;
}

export function validIdCard(raw) {
  const s = raw.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{3}\d{6}$/.test(s)) return false;
  const w = [7, 3, 1, 9, 7, 3, 1, 7, 3];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const ch = s[i];
    const v = i < 3 ? ch.charCodeAt(0) - 55 : Number(ch);
    sum += v * w[i];
  }
  return sum % 10 === 0;
}

// Kategorie: klucz → etykieta w znaczniku i w interfejsie
export const CATEGORIES = {
  pesel: { label: 'PESEL', tag: 'PESEL' },
  nip: { label: 'NIP', tag: 'NIP' },
  regon: { label: 'REGON', tag: 'REGON' },
  konto: { label: 'Numer konta', tag: 'KONTO' },
  karta: { label: 'Karta płatnicza', tag: 'KARTA' },
  email: { label: 'E-mail', tag: 'EMAIL' },
  telefon: { label: 'Telefon', tag: 'TELEFON' },
  dokument: { label: 'Dowód / paszport', tag: 'DOKUMENT' },
  adres: { label: 'Adres', tag: 'ADRES' },
  profil: { label: 'Profil w sieci', tag: 'PROFIL' },
  urodzenie: { label: 'Data urodzenia', tag: 'DATA-UR' },
  wiek: { label: 'Wiek', tag: 'WIEK' },
  kwota: { label: 'Kwota', tag: 'KWOTA' },
  data: { label: 'Data', tag: 'DATA' },
};

const L = '\\p{L}';
const NB = '(?<![\\p{L}\\d])'; // początek „słowa” z polskimi literami
const NE = '(?![\\p{L}\\d])';
const MONTHS = 'stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia';
const DATE = `(?:\\d{1,2}[.\\-/]\\d{1,2}[.\\-/](?:\\d{4}|\\d{2})|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4})(?:\\s?r\\.)?`;

const contextBefore = (text, index, re, span = 30) => re.test(text.slice(Math.max(0, index - span), index));

const RULES = [
  {
    cat: 'email',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    cat: 'profil',
    re: /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com|github\.com|tiktok\.com\/@?)\/?[^\s,;)]+/gi,
  },
  {
    cat: 'konto',
    re: /(?<![\dA-Z])(?:[A-Z]{2}\s?)?\d{2}(?:\s?\d{4}){6}(?!\d)/g,
    ok: (m) => validIban(m) || digits(m).length === 26,
  },
  {
    cat: 'karta',
    re: /(?<!\d)\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}(?!\d)/g,
    ok: (m) => validLuhn(m),
  },
  {
    cat: 'pesel',
    re: /(?<!\d)\d{11}(?!\d)/g,
    ok: (m, text, i) => validPesel(m) || contextBefore(text, i, /pesel/i),
  },
  {
    cat: 'nip',
    re: /(?<![\dA-Z])(?:PL\s?)?(?:\d{3}-\d{3}-\d{2}-\d{2}|\d{3}-\d{2}-\d{2}-\d{3}|\d{10})(?!\d)/g,
    ok: (m, text, i) => validNip(m) || contextBefore(text, i, /nip/i),
  },
  {
    cat: 'regon',
    re: /(?<!\d)(?:\d{14}|\d{9})(?!\d)/g,
    ok: (m, text, i) => contextBefore(text, i, /regon/i),
  },
  {
    cat: 'dokument',
    re: /(?<![A-Za-z\d])[A-Z]{3}\s?\d{6}(?![A-Za-z\d])/g,
    ok: (m, text, i) => validIdCard(m) || contextBefore(text, i, /dow[oó]d|dokument/i),
  },
  {
    cat: 'dokument',
    re: /(?<![A-Za-z\d])[A-Z]{2}\s?\d{7}(?![A-Za-z\d])/g,
    ok: (m, text, i) => contextBefore(text, i, /paszport|dokument/i),
  },
  {
    cat: 'telefon',
    re: /(?<![\d+])(?:(?:\+|00)\s?48[\s-]?)?(?:\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{3}[\s-]?\d{3})(?![\d])/g,
    ok: (m, text, i) => {
      const d = digits(m);
      // „100 000 000 zł” to kwota, nie telefon
      if (/^\s*(zł|pln|złotych)/i.test(text.slice(i + m.length, i + m.length + 8))) return false;
      return d.length === 9 || d.length === 11;
    },
  },
  {
    cat: 'telefon',
    re: /(?<![\d+])\+(?!48)\d{1,3}[\s-]?\d{2,4}(?:[\s-]?\d{2,4}){2,4}(?!\d)/g,
  },
  {
    cat: 'adres',
    // ul. Długa 5/3, al. Armii Krajowej 10 m. 2, os. Tysiąclecia 12a
    re: new RegExp(
      `${NB}(?:ul\\.|ulica|ulicy|ulicę|al\\.|aleja|alei|aleję|os\\.|osiedle|osiedlu|pl\\.|plac|placu)\\s*` +
        `(?:(?:\\p{Lu}|\\d)[${L}\\d'’-]*\\.?\\s+|\\p{Ll}{1,4}\\.\\s+){0,5}` +
        `\\d+[a-zA-Z]?(?:\\s?\\/\\s?\\d+[a-zA-Z]?)?(?:\\s?(?:m\\.|lok\\.|mieszk\\.)\\s?\\d+[a-zA-Z]?)?${NE}`,
      'gu',
    ),
  },
  {
    cat: 'adres',
    // 00-950 Warszawa
    re: new RegExp(`(?<!\\d)\\d{2}-\\d{3}(?:\\s+\\p{Lu}[${L}-]+){1,2}`, 'gu'),
  },
  {
    cat: 'urodzenie',
    re: new RegExp(`(?:ur\\.|urodzon[${L}]*|data urodzenia:?|dat[${L}]* urodzenia:?)\\s*(?:dnia\\s+|w dniu\\s+)?(${DATE})`, 'giu'),
    group: 1,
  },
  // wiek: „34-letni”, „35-latka”, „wiek: 52”, „Kowalski, lat 45”, „ma 29 lat”, „(41 l.)”
  { cat: 'wiek', re: new RegExp(`${NB}\\d{1,3}\\s?-?\\s?(?:letni|latk|latek)[${L}]*`, 'giu') },
  { cat: 'wiek', re: new RegExp(`${NB}(?:wiek|wieku|lat)\\s*:?\\s+(\\d{1,3})${NE}`, 'giu'), group: 1 },
  { cat: 'wiek', re: new RegExp(`${NB}(?:ma|miał|miała|ma już|skończył|skończyła|skończy|kończy|ukończył|ukończyła)\\s+(\\d{1,3}\\s+(?:lat|lata|rok))${NE}`, 'giu'), group: 1 },
  { cat: 'wiek', re: /\((\d{2}\s?(?:l\.|lat|lata))\)/giu, group: 1 },
  {
    cat: 'kwota',
    re: new RegExp(`(?<![\\d,.])\\d+(?:[ \\u00a0.]\\d{3})*(?:,\\d{1,2})?\\s?(?:zł|PLN|złotych|EUR|euro|€)(?:\\s+(?:brutto|netto))?${NE}`, 'giu'),
  },
  {
    cat: 'data',
    re: new RegExp(`${NB}${DATE}`, 'giu'),
  },
];

// Zwraca znaleziska { start, end, value, cat } (mogą na siebie zachodzić — rozstrzyga sesja)
export function detectStructured(text, enabled) {
  const out = [];
  for (const rule of RULES) {
    if (!enabled[rule.cat]) continue;
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      let value = m[0];
      let start = m.index;
      if (rule.group) {
        value = m[rule.group];
        start = m.index + m[0].lastIndexOf(value);
      }
      if (rule.ok && !rule.ok(value, text, start)) continue;
      // przytnij końcowe spacje i interpunkcję (np. kropkę po linku)
      const trimmed = value.replace(rule.cat === 'profil' || rule.cat === 'email' ? /[\s.,;:!?)]+$/u : /\s+$/u, '');
      out.push({ start, end: start + trimmed.length, value: trimmed, cat: rule.cat });
    }
  }
  return out;
}

// Normalizacja do porównań (ten sam PESEL zapisany ze spacjami = ten sam znacznik)
export function normalizeValue(cat, value) {
  if (['pesel', 'nip', 'regon', 'konto', 'karta', 'telefon'].includes(cat)) return digits(value);
  return value.toLocaleLowerCase('pl').replace(/\s+/g, ' ').trim();
}

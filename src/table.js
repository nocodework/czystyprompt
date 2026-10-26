// Tabele wklejone z Excela / Arkuszy Google (kolumny rozdzielone tabulatorem) albo CSV ze średnikiem.
// Wykrywamy kolumny, podpowiadamy, które ukryć, a sesja zamienia ich komórki na znaczniki [WIEK-1].

const NAME_HEADER = /imi[eę]|nazwisk|osoba|pracownik|kandydat|imię i nazwisko/i;
// nagłówki kolumn, które domyślnie ukrywamy (dane identyfikujące, kontakt, wiek, pieniądze)
const SENSITIVE_HEADER = new RegExp(
  [
    'imi[eę]', 'nazwisk', 'osoba', 'pracownik', 'kandydat', 'pesel', 'e-?mail', 'mail', 'telefon', '\\btel\\b', 'komórk',
    'adres', 'ulica', 'miejscowo', 'kod poczt', 'wiek', 'urodz', 'wynagrodz', 'pensj', 'płac', 'zarob', 'stawk', 'brutto',
    'netto', 'pensja', 'konto', 'iban', 'rachun', 'dow[oó]d', 'paszport', '\\bnip\\b', 'linkedin', 'login',
  ].join('|'),
  'i',
);

const excelLetter = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Etykieta znacznika z nagłówka: „Wynagrodzenie brutto” → WYNAGRODZENIE-BRUTTO, „Imię i nazwisko” → OSOBA
export function columnTag(name, index) {
  if (!name) return `KOLUMNA-${excelLetter(index)}`;
  if (/imi[eę] i nazwisk|^osoba$|^pracownik$|^kandydat$/i.test(name.trim())) return 'OSOBA';
  const tag = name
    .toLocaleUpperCase('pl')
    .replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
  return /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(tag) ? tag : `KOLUMNA-${excelLetter(index)}`;
}

// Zwraca null albo { delim, header, rows: [{ cells: [{ start, end, text }] }], columns: [{ index, letter, name, tag, suggested }] }
export function detectTable(text) {
  const lines = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    lines.push({ start: pos, text: line });
    pos += raw.length + 1;
  }
  const filled = lines.filter((l) => l.text.trim());
  if (filled.length < 2) return null;

  for (const delim of ['\t', ';']) {
    const counts = filled.map((l) => l.text.split(delim).length);
    const withDelim = counts.filter((c) => c > 1).length;
    if (withDelim < 2 || withDelim / filled.length < 0.8) continue;
    // najczęstsza liczba kolumn
    const freq = new Map();
    for (const c of counts) if (c > 1) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [cols, n] = [...freq].sort((a, b) => b[1] - a[1])[0];
    if (n / withDelim < 0.8) continue;
    // średnik w zwykłym tekście: wymagamy krótkich komórek
    if (delim === ';' && filled.some((l) => l.text.split(';').some((c) => c.trim().length > 60))) continue;

    const rows = [];
    for (const l of lines) {
      if (!l.text.trim() || l.text.split(delim).length < 2) continue;
      const cells = [];
      let p = l.start;
      for (const part of l.text.split(delim)) {
        const lead = part.length - part.trimStart().length;
        const t = part.trim();
        cells.push({ start: p + lead, end: p + lead + t.length, text: t });
        p += part.length + delim.length;
      }
      rows.push({ cells });
    }
    const first = rows[0].cells.map((c) => c.text);
    const second = rows[1]?.cells.map((c) => c.text) ?? [];
    const header =
      first.every((c) => !/\d/.test(c)) &&
      (first.some((c) => SENSITIVE_HEADER.test(c) || NAME_HEADER.test(c)) || second.some((c) => /\d/.test(c)));
    const columns = [];
    for (let i = 0; i < cols; i++) {
      const name = header ? (first[i] ?? '').trim() : '';
      columns.push({ index: i, letter: excelLetter(i), name, tag: columnTag(name, i), suggested: !!name && SENSITIVE_HEADER.test(name) });
    }
    return { delim, header, rows, columns };
  }
  return null;
}

// Komórki ukrywanych kolumn (bez wiersza nagłówka) jako fragmenty do podmiany
export function hiddenCells(table, hide) {
  const out = [];
  table.rows.forEach((row, r) => {
    if (r === 0 && table.header) return;
    row.cells.forEach((cell, i) => {
      if (!hide[i] || !cell.text) return;
      out.push({ start: cell.start, end: cell.end, value: cell.text, col: i, tag: table.columns[i]?.tag ?? `KOLUMNA-${excelLetter(i)}` });
    });
  });
  return out;
}

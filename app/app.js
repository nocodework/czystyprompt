import { Session, CATEGORIES, VERSION, parseList } from '../src/index.js';

const $ = (s) => document.querySelector(s);
const safe = (storage) => ({
  get(k) { try { return storage().getItem(k); } catch { return null; } },
  set(k, v) { try { storage().setItem(k, v); } catch { /* prywatne okno — trudno */ } },
  del(k) { try { storage().removeItem(k); } catch { /* jw. */ } },
});
const local = safe(() => window.localStorage);
const tab = safe(() => window.sessionStorage);

const CAT_ORDER = ['pesel', 'nip', 'regon', 'konto', 'email', 'telefon', 'dokument', 'adres', 'urodzenie', 'profil', 'karta', 'kwota', 'data'];
const CAT_SHORT = { konto: 'Konto bankowe', dokument: 'Dowód, paszport', urodzenie: 'Data urodzenia', profil: 'Linki do profili', data: 'Wszystkie daty' };
const els = {
  people: $('#people'), terms: $('#terms'), cats: $('#cats'), optDict: $('#optDict'), remember: $('#remember'),
  src: $('#src'), masked: $('#masked'), stats: $('#stats'), warn: $('#warn'), copyMasked: $('#copyMasked'),
  ai: $('#ai'), restored: $('#restored'), rstats: $('#rstats'), rwarn: $('#rwarn'), copyRestored: $('#copyRestored'),
  rows: $('#rows'), dictCount: $('#dictCount'), peopleCount: $('#peopleCount'), toast: $('#toast'),
};

// ---------- ustawienia ----------

const defaults = new Session().options;
for (const cat of CAT_ORDER) {
  const label = document.createElement('label');
  label.className = 'check';
  label.innerHTML = `<input type="checkbox" data-cat="${cat}"><span class="box"></span>${CAT_SHORT[cat] ?? CATEGORIES[cat].label}`;
  els.cats.append(label);
}

function readOptions() {
  const categories = {};
  for (const i of els.cats.querySelectorAll('input')) categories[i.dataset.cat] = i.checked;
  return {
    mode: document.querySelector('input[name=mode]:checked').value,
    useDictionary: els.optDict.checked,
    categories,
  };
}

function writeOptions(o) {
  for (const i of els.cats.querySelectorAll('input')) i.checked = !!(o.categories ?? defaults.categories)[i.dataset.cat];
  els.optDict.checked = o.useDictionary !== false;
  const mode = o.mode === 'tags' ? 'tags' : 'natural';
  document.querySelector(`input[name=mode][value=${mode}]`).checked = true;
}

const remembered = local.get('czystyprompt.remember') === '1';
els.remember.checked = remembered;
if (remembered) {
  els.people.value = local.get('czystyprompt.people') ?? '';
  els.terms.value = local.get('czystyprompt.terms') ?? '';
  try { writeOptions(JSON.parse(local.get('czystyprompt.options') ?? '{}')); } catch { writeOptions(defaults); }
} else writeOptions(defaults);

function persistSettings() {
  if (els.remember.checked) {
    local.set('czystyprompt.remember', '1');
    local.set('czystyprompt.people', els.people.value);
    local.set('czystyprompt.terms', els.terms.value);
    local.set('czystyprompt.options', JSON.stringify(readOptions()));
  } else {
    for (const k of ['czystyprompt.remember', 'czystyprompt.people', 'czystyprompt.terms', 'czystyprompt.options']) local.del(k);
  }
}

// ---------- sesja ----------
// „committed” to słownik, z którego przywracamy. Podgląd liczymy na kopii, a zapisujemy dopiero przy kopiowaniu,
// żeby pisanie litera po literze nie tworzyło śmieciowych osób w słowniku.

let committed;
try {
  const saved = tab.get('czystyprompt.session');
  committed = saved ? Session.fromJSON(JSON.parse(saved)) : new Session();
} catch { committed = new Session(); }

const apply = (s) => {
  if (s.peopleText !== els.people.value) s.setPeople(els.people.value);
  if (s.termsText !== els.terms.value) s.setTerms(els.terms.value);
  s.setOptions(readOptions());
  return s;
};
const previewSession = () => apply(Session.fromJSON(JSON.parse(JSON.stringify(committed.toJSON()))));
const saveSession = () => tab.set('czystyprompt.session', JSON.stringify(committed.toJSON()));

// ---------- rysowanie ----------

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const catName = (cat) => {
  if (cat === 'osoba') return 'osoba';
  const label = CATEGORIES[cat]?.label ?? 'ukryte';
  return label === label.toLocaleUpperCase('pl') ? label : label.toLocaleLowerCase('pl'); // PESEL zostaje PESEL
};

function renderSegments(target, segments, kind) {
  target.innerHTML = segments
    .map((s) => {
      if (!s.cat) return esc(s.text);
      const title = kind === 'mask' ? `Ukryte (${catName(s.cat)}): ${s.original}` : `W odpowiedzi AI było: ${s.original}`;
      return `<mark class="${kind === 'mask' ? 'r' : 'back'}" data-cat="${esc(s.cat)}" title="${esc(title)}">${esc(s.text)}</mark>`;
    })
    .join('');
}

const plural = (n, one, few, many) => {
  const n10 = n % 10, n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
};

function statsLine(stats) {
  const parts = [];
  if (stats.osoby) parts.push(`<b>${stats.osoby}</b> ${plural(stats.osoby, 'osoba', 'osoby', 'osób')}`);
  for (const [cat, n] of Object.entries(stats)) {
    if (cat === 'osoby' || cat === 'osoba') continue;
    parts.push(`<b>${n}</b> × ${esc(cat === 'custom' ? 'słowo z listy' : catName(cat))}`);
  }
  return parts.length ? 'Ukryto: ' + parts.join(' · ') : 'Nie znaleziono danych osobowych. Przeczytaj tekst, zanim go wyślesz.';
}

let lastMasked = null;
function updateMasked() {
  const text = els.src.value;
  if (!text.trim()) {
    els.masked.innerHTML = '';
    els.stats.textContent = '';
    els.warn.hidden = true;
    els.copyMasked.disabled = true;
    lastMasked = null;
    return;
  }
  const r = previewSession().anonymize(text);
  lastMasked = r;
  renderSegments(els.masked, r.segments, 'mask');
  els.stats.innerHTML = statsLine(r.stats);
  els.copyMasked.disabled = false;
  if (r.warnings.length) {
    els.warn.hidden = false;
    els.warn.innerHTML = `<b>Uwaga: dane szczególnej kategorii.</b> W tekście są informacje o: ${r.warnings
      .map((w) => `${esc(w.label)} (${w.words.map(esc).join(', ')})`)
      .join('; ')}. CzystyPrompt ich nie usuwa, bo to nie są nazwiska ani numery. Zastanów się, czy AI naprawdę musi je dostać.`;
  } else els.warn.hidden = true;
}

function updateRestored() {
  const text = els.ai.value;
  if (!text.trim()) {
    els.restored.innerHTML = '';
    els.rstats.textContent = '';
    els.rwarn.hidden = true;
    els.copyRestored.disabled = true;
    return;
  }
  const r = committed.restore(text);
  renderSegments(els.restored, r.segments, 'back');
  els.copyRestored.disabled = false;
  els.rstats.innerHTML = r.count
    ? `Przywrócono: <b>${r.count}</b> ${plural(r.count, 'miejsce', 'miejsca', 'miejsc')}`
    : committed.entities.length || committed.values.size
      ? 'Nie znalazłem tu pseudonimów z tej sesji.'
      : 'Słownik sesji jest pusty — najpierw ukryj tekst w kroku 1 i skopiuj go.';
  if (r.warnings.length) {
    els.rwarn.hidden = false;
    els.rwarn.innerHTML = r.warnings.map(esc).join('<br>');
  } else els.rwarn.hidden = true;
}

function renderDict() {
  const rows = committed.mapping();
  els.dictCount.textContent = rows.length ? `${rows.length} ${plural(rows.length, 'pozycja', 'pozycje', 'pozycji')}` : 'pusty';
  els.rows.innerHTML = rows.length
    ? rows
        .map((r) => {
          const kind = r.kind === 'osoba' ? 'osoba' : r.kind.toLocaleLowerCase('pl');
          return `<li><span><span class="k">${esc(kind)}</span>${esc(r.original)}</span><span class="arrow">→</span><span class="fake">${esc(r.replacement)}</span></li>`;
        })
        .join('')
    : '<li class="empty">Tu zobaczysz, co na co zamieniliśmy. Słownik powstaje, gdy skopiujesz tekst w kroku 1.</li>';
}

function updatePeopleCount() {
  const n = parseList(els.people.value).length;
  els.peopleCount.textContent = n ? `${n} ${plural(n, 'osoba', 'osoby', 'osób')}` : '';
}

// ---------- kopiowanie ----------

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('on'), 2600);
}

async function copyMasked() {
  if (!els.src.value.trim()) return;
  apply(committed);
  const r = committed.anonymize(els.src.value);
  saveSession();
  renderDict();
  const ok = await copy(r.text);
  toast(ok ? 'Skopiowane. Wklej do AI, a odpowiedź wklej w kroku 2.' : 'Nie udało się skopiować — zaznacz tekst i skopiuj ręcznie.');
  updateRestored();
}

async function copyRestored() {
  const r = committed.restore(els.ai.value);
  const ok = await copy(r.text);
  toast(ok ? 'Skopiowane z prawdziwymi danymi.' : 'Nie udało się skopiować — zaznacz tekst i skopiuj ręcznie.');
}

// ---------- zakładki i skróty ----------

let step = 1;
function show(n) {
  step = n;
  $('#tab1').setAttribute('aria-selected', String(n === 1));
  $('#tab2').setAttribute('aria-selected', String(n === 2));
  $('#step1').hidden = n !== 1;
  $('#step2').hidden = n !== 2;
  if (n === 2) updateRestored();
}
$('#tab1').addEventListener('click', () => show(1));
$('#tab2').addEventListener('click', () => show(2));

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    step === 1 ? copyMasked() : copyRestored();
  }
});

// Ctrl+V poza polami: wklej do aktualnego kroku
document.addEventListener('paste', (e) => {
  const t = e.target;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return;
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  e.preventDefault();
  const field = step === 1 ? els.src : els.ai;
  field.value = text;
  field.dispatchEvent(new Event('input'));
  field.focus();
});

// ---------- zdarzenia ----------

let timer;
const debounce = (fn, ms = 120) => () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
els.src.addEventListener('input', debounce(updateMasked));
els.ai.addEventListener('input', debounce(updateRestored));
for (const el of [els.people, els.terms]) {
  el.addEventListener('input', debounce(() => { updatePeopleCount(); updateMasked(); persistSettings(); }, 200));
}
document.querySelector('aside.settings').addEventListener('change', (e) => {
  if (e.target === els.remember) { persistSettings(); toast(els.remember.checked ? 'Zapamiętam listę i ustawienia w tej przeglądarce.' : 'Usunięte z pamięci przeglądarki.'); return; }
  persistSettings();
  updateMasked();
});
els.copyMasked.addEventListener('click', copyMasked);
els.copyRestored.addEventListener('click', copyRestored);

$('#demo').addEventListener('click', () => {
  if (!els.people.value.trim()) els.people.value = 'Jan Kowalski\nKatarzyna Nowak-Jeziorańska\nWilk Piotr';
  if (!els.terms.value.trim()) els.terms.value = 'Transbud = Firma';
  els.src.value = `Notatka z rozmowy okresowej — Transbud, dział logistyki, 14.10.2026.

Rozmowę z Janem Kowalskim przeprowadziła Anna Zielińska. Kasia z kadr (p. Nowak-Jeziorańska) potwierdziła, że Kowalski chce przejść na pół etatu od stycznia.
Jan dobrze ocenia współpracę z Piotrem Wilkiem, ale ma uwagi do pana Brzęczyszczykiewicza. Wilk zgłosił się na mentora dla nowych osób.

Kontakt: jan.kowalski@transbud.pl, tel. 601 234 567. PESEL 44051401359, konto PL61 1090 1014 0000 0712 1981 2874.
Adres: ul. Długa 5/3, 00-950 Warszawa.`;
  updatePeopleCount();
  updateMasked();
  persistSettings();
});

$('#save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(committed.toJSON(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  a.download = `czystyprompt-sesja-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#load').addEventListener('click', () => $('#loadFile').click());
$('#loadFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    committed = Session.fromJSON(JSON.parse(await file.text()));
    els.people.value = committed.peopleText ?? '';
    els.terms.value = committed.termsText ?? '';
    writeOptions(committed.options);
    saveSession();
    renderDict();
    updatePeopleCount();
    updateMasked();
    updateRestored();
    toast('Sesja wczytana. Możesz przywracać odpowiedzi.');
  } catch (err) {
    toast(err.message || 'To nie jest plik sesji CzystyPrompt.');
  }
  e.target.value = '';
});
$('#clear').addEventListener('click', () => {
  if (!confirm('Wyczyścić słownik tej sesji? Odpowiedzi AI z wcześniejszych tekstów nie da się już przywrócić.')) return;
  committed.reset();
  tab.del('czystyprompt.session');
  renderDict();
  updateMasked();
  updateRestored();
});

// motyw
const theme = local.get('czystyprompt.theme');
if (theme) document.documentElement.dataset.theme = theme;
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  local.set('czystyprompt.theme', next);
});

// ustawienia na telefonie
const aside = $('#settings');
const toggle = $('#settingsToggle');
if (matchMedia('(max-width: 860px)').matches) aside.classList.add('collapsed');
toggle.addEventListener('click', () => {
  const collapsed = aside.classList.toggle('collapsed');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.textContent = collapsed ? 'Ustawienia ▸' : 'Ustawienia ▾';
});

document.title = `CzystyPrompt ${VERSION} — ukryj dane osobowe przed ChatGPT i innym AI`;

// Stopka: z dysku (file://) nie ma czego pobierać ani informacji o hostingu
if (location.protocol === 'file:') for (const el of document.querySelectorAll('.web-only')) el.remove();
// Zgłoszenie błędu: gotowy szablon maila, bez treści z pól (mogą zawierać prawdziwe dane)
$('#report').href = 'mailto:czystyprompt@nocodework.io?subject=' + encodeURIComponent(`CzystyPrompt ${VERSION} — zgłoszenie`) + '&body=' + encodeURIComponent(
  'Uwaga: nie wklejaj prawdziwych danych osobowych. Przepisz przykład ze zmyślonymi imionami i nazwiskami.\n\n' +
  'Tekst (zmyślony):\n\n\nCo zrobił CzystyPrompt:\n\n\nCo powinna zrobić:\n\n\n' +
  `Wersja: ${VERSION}, przeglądarka: ${navigator.userAgent}`);
if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) for (const k of document.querySelectorAll('kbd.mod')) k.textContent = '⌘';
updatePeopleCount();
renderDict();
updateMasked();

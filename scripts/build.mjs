// Składa aplikację w JEDEN plik index.html: moduły JS, CSS i fonty w środku, zero zależności.
// Uruchom: node scripts/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

// --- mini-bundler: każdy moduł we własnym zakresie, importy → odczyt z rejestru ---
const modules = new Map();
function load(id) {
  if (modules.has(id)) return;
  modules.set(id, null);
  let code = read(id);
  const exports = [];
  const deps = [];
  const dep = (spec) => {
    const target = relative(root, resolve(dirname(join(root, id)), spec));
    deps.push(target);
    return target;
  };
  const names = (list) =>
    list.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      const [a, b] = x.split(/\s+as\s+/);
      return { from: a.trim(), to: (b ?? a).trim() };
    });
  code = code.replace(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, list, spec) => {
    const t = dep(spec);
    const n = names(list);
    exports.push(...n.map((x) => x.to));
    return `const { ${n.map((x) => (x.from === x.to ? x.from : `${x.from}: ${x.to}`)).join(', ')} } = __m[${JSON.stringify(t)}];`;
  });
  code = code.replace(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, list, spec) => {
    const t = dep(spec);
    const n = names(list);
    return `const { ${n.map((x) => (x.from === x.to ? x.from : `${x.from}: ${x.to}`)).join(', ')} } = __m[${JSON.stringify(t)}];`;
  });
  if (/^\s*import\s/m.test(code)) throw new Error(`Nieobsługiwany import w ${id}`);
  code = code.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
    exports.push(name);
    return `${kw} ${name}`;
  });
  if (/^export\s/m.test(code)) throw new Error(`Nieobsługiwany eksport w ${id}`);
  for (const d of deps) load(d);
  modules.set(id, { code, exports, deps });
}
load('app/app.js');

// kolejność: zależności przed modułami, które ich używają
const order = [];
const seen = new Set();
const visit = (id) => {
  if (seen.has(id)) return;
  seen.add(id);
  for (const d of modules.get(id).deps) visit(d);
  order.push(id);
};
visit('app/app.js');

const bundle =
  'const __m = Object.create(null);\n' +
  order
    .map((id) => {
      const m = modules.get(id);
      return `// ===== ${id} =====\n__m[${JSON.stringify(id)}] = (() => {\n${m.code}\nreturn { ${m.exports.join(', ')} };\n})();`;
    })
    .join('\n');

const font = (file, weight) =>
  `@font-face{font-family:'Sora';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(join(root, 'app/fonts', file)).toString('base64')}) format('woff2')}`;
const fonts = [font('Sora-Regular.woff2', 400), font('Sora-SemiBold.woff2', 600), font('Sora-Bold.woff2', 700)].join('\n');

// znaczniki podstawiamy funkcją, żeby „$&” w kodzie nie zostało potraktowane jako wzorzec
const html = read('app/index.html')
  .replace('{{FONTS}}', () => fonts)
  .replace('{{STYLE}}', () => read('app/style.css'))
  .replace('{{SCRIPT}}', () => bundle.replace(/<\/script/gi, '<\\/script'))
  .replace(/\{\{VERSION\}\}/g, () => pkg.version);

writeFileSync(join(root, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB, moduły: ${order.join(', ')}`);

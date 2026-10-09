// Bundles the whole Chemculator suite into www/ for Capacitor, leaving every source
// folder (and the hosted web versions) untouched.
//
//   www/                      <- azlanyaacob92.github.io (the hub: the app's home screen)
//   www/yieldcalculator/      <- lives inside the hub folder
//   www/chemulator/           <- this project (Atomic Emission Spectra + Titration)
//   www/concentrationtrainer/ <- ../concentrationtrainer
//   www/orbitalvisualiser/    <- ../orbitalvisualiser
//   www/stoichiomathics/      <- ../Stoichiomathics
//
// Links to https://azlanyaacob92.github.io/... become relative links so everything works offline.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const parent = path.join(root, '..');
const out = path.join(root, 'www');
const SITE = 'https://azlanyaacob92.github.io/';

// Never copied, at any depth.
const SKIP_NAMES = new Set(['node_modules', '.git', '.claude', '.github', '.vscode', '.idea']);
const SKIP_FILE = /^(test-.*\.js|.*\.md|.*\.zip|LICENSE|package(-lock)?\.json|capacitor\.config\.json|\.gitignore|.*\.code-workspace)$/i;
// Never copied from the top level of the chemulator project (native + tooling folders).
const SKIP_ROOT = new Set(['android', 'ios', 'www', 'assets', 'scripts']);

const SOURCES = [
  { from: path.join(parent, 'azlanyaacob92.github.io'), to: '' },
  { from: root, to: 'chemulator', skipRoot: true },
  { from: path.join(parent, 'concentrationtrainer'), to: 'concentrationtrainer' },
  { from: path.join(parent, 'orbitalvisualiser'), to: 'orbitalvisualiser' },
  { from: path.join(parent, 'Stoichiomathics'), to: 'stoichiomathics' },
];

let fileCount = 0;

function copyDir(src, dest, atRoot, skipRoot) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_NAMES.has(e.name)) continue;
    if (atRoot && skipRoot && SKIP_ROOT.has(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d, false, skipRoot);
    else if (!SKIP_FILE.test(e.name)) { fs.copyFileSync(s, d); fileCount++; }
  }
}

function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, fn); else fn(p);
  }
}

// href="https://azlanyaacob92.github.io/foo/" -> href="../foo/index.html" (relative to the page).
function localiseLinks(file) {
  const up = path.relative(path.dirname(file), out).split(path.sep).join('/');
  const prefix = up ? up + '/' : '';
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(/href=(["'])https:\/\/azlanyaacob92\.github\.io\/([^"']*)\1/g, (m, q, rest) => {
    let target = rest;
    if (target === '' || target.endsWith('/')) target += 'index.html';
    // GitHub Pages is case-insensitive about folder names; the app bundle is not.
    target = target.replace(/^Stoichiomathics\//, 'stoichiomathics/');
    return 'href=' + q + prefix + target + q;
  });
  if (next !== html) fs.writeFileSync(file, next);
}

// The hub's cards link to "folder/"; point them at the page itself.
function dirLinksToPages(file) {
  const t = fs.readFileSync(file, 'utf8');
  const n = t
    .replace(/(path:\s*')([^']*\/)(')/g, '$1$2index.html$3')
    .replace(/("path":\s*")([^"]*\/)(")/g, '$1$2index.html$3');
  if (n !== t) fs.writeFileSync(file, n);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const s of SOURCES) {
  if (!fs.existsSync(s.from)) throw new Error('Missing source folder: ' + s.from);
  copyDir(s.from, path.join(out, s.to), true, s.skipRoot);
}

walk(out, (f) => { if (f.endsWith('.html')) localiseLinks(f); });
for (const f of ['app.js', 'apps.json']) dirLinksToPages(path.join(out, f));

// Anything still pointing at the website is a bug in this script, not something to ship.
const leftovers = [];
walk(out, (f) => {
  if (!/\.(html|js|json)$/.test(f)) return;
  const t = fs.readFileSync(f, 'utf8');
  if (/(href|src|action)=["']https?:\/\/azlanyaacob92\.github\.io/.test(t)) leftovers.push(path.relative(out, f));
});
if (leftovers.length) throw new Error('Unlocalised website links in: ' + leftovers.join(', '));

console.log('www/ built: ' + fileCount + ' files from ' + SOURCES.length + ' folders');

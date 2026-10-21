#!/usr/bin/env node
// Byggsteg för Vercel (prestandaplanen Batch B1/B2/B4, Session 158i).
//
//   node scripts/build.mjs            → public/ (Vercels outputDirectory)
//
// Vad som händer:
//   1. esbuild bundlar js/app.js (31 moduler) + supabase-js (npm, samma version
//      som CDN-URL:en i supabase-client.js) till EN fil: public/dist/app.<hash>.js.
//   2. css/styles.css kopieras till public/css/styles.<hash>.css.
//   3. index.html skrivs om: hashade sökvägar, CDN-raderna bort.
//   4. service-worker.js skrivs om: CACHE_VERSION = innehållshash, precache-listan
//      får bundlen, CSS:en och fonterna → cache-först på hashade filer.
//   5. Övriga statiska filer kopieras (ikoner, bilder, fonter, manifest, sidor).
//
// KÄLLFILERNA RÖRS INTE. Utan bygget (GitHub Pages-backupen, den lokala
// förhandsvisningen, Playwright-harnessen) fungerar appen som förut: omoduler
// från js/ med ?v=-versionen i index.html. Versionsbump-ritualen behövs alltså
// bara för backupen — på Vercel sköter hasharna det.
//
// api/ ligger kvar i repo-roten och blir serverless-funktioner som vanligt
// (Vercel bygger api/ oavsett outputDirectory).

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const h8 = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 8);
const kb = (n) => `${Math.round(n / 1024)} kB`;

// Supabase-klienten importeras från jsdelivr i källan (fungerar obyggt). I bundlen
// ersätts URL:en med npm-paketet — version pinnad i package.json (exakt samma).
const CDN_RE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[\d.]+\/\+esm$/;
const cdnAlias = {
  name: 'supabase-cdn-till-npm',
  setup(b) {
    b.onResolve({ filter: /^https:\/\/cdn\.jsdelivr\.net\// }, async (args) => {
      if (!CDN_RE.test(args.path)) throw new Error(`Okänd CDN-import i bundlen: ${args.path}`);
      const r = await b.resolve('@supabase/supabase-js', { kind: 'import-statement', resolveDir: ROOT });
      if (r.errors.length) return { errors: r.errors };
      return { path: r.path };
    });
  },
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'dist'), { recursive: true });
mkdirSync(path.join(OUT, 'css'), { recursive: true });

// 1. Bundle
const result = await build({
  entryPoints: [path.join(ROOT, 'js', 'app.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020', 'safari15'],
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,   // läsbara stackspår i produktion — brotli tar mellanskillnaden
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [cdnAlias],
  write: false,
  logLevel: 'warning',
});
const js = Buffer.from(result.outputFiles[0].contents);
const jsHash = h8(js);
const jsPath = `dist/app.${jsHash}.js`;
writeFileSync(path.join(OUT, jsPath), js);

// 2. CSS
const css = readFileSync(path.join(ROOT, 'css', 'styles.css'));
const cssHash = h8(css);
const cssPath = `css/styles.${cssHash}.css`;
writeFileSync(path.join(OUT, cssPath), css);

// 3. Statiska filer
const STATIC_DIRS = ['icons', 'images', 'fonts'];
const STATIC_FILES = ['manifest.webmanifest', 'roadmap.html', 'architecture.html'];
for (const d of STATIC_DIRS) if (existsSync(path.join(ROOT, d))) cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true });
for (const f of STATIC_FILES) if (existsSync(path.join(ROOT, f))) cpSync(path.join(ROOT, f), path.join(OUT, f));
const fontFiles = existsSync(path.join(ROOT, 'fonts')) ? readdirSync(path.join(ROOT, 'fonts')).filter((f) => f.endsWith('.woff2')).sort() : [];

// 4. index.html
let html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const must = (re, what) => { if (!re.test(html)) throw new Error(`index.html: hittar inte ${what}`); };
must(/css\/styles\.css\?v=\d+/, 'styles.css?v=');
must(/js\/app\.js\?v=\d+/, 'app.js?v=');
html = html.replace(/css\/styles\.css\?v=\d+/, cssPath).replace(/js\/app\.js\?v=\d+/, jsPath);
html = html.split(/\r?\n/).filter((line) => !line.includes('cdn.jsdelivr.net')).join('\n');

// 5. Service worker
let sw = readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const buildHash = h8(Buffer.concat([js, css, Buffer.from(fontFiles.join(','))]));
const swMust = (re, what) => { if (!re.test(sw)) throw new Error(`service-worker.js: hittar inte ${what}`); };
swMust(/const CACHE_VERSION = '[^']+';/, 'CACHE_VERSION');
swMust(/'\.\/css\/styles\.css\?v=\d+',/, 'precache-CSS');
swMust(/'\.\/index\.html',/, 'precache-index');
sw = sw.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = 'receptbok-b${buildHash}';   // BYGGT av scripts/build.mjs`)
  .replace(/'\.\/css\/styles\.css\?v=\d+',/, `'./${cssPath}',`)
  .replace(/'\.\/index\.html',/, `'./index.html',\n  './${jsPath}',\n${fontFiles.map((f) => `  './fonts/${f}',`).join('\n')}`);
writeFileSync(path.join(OUT, 'index.html'), html);
writeFileSync(path.join(OUT, 'service-worker.js'), sw);

// Kvitto
const size = (p) => statSync(path.join(OUT, p)).size;
console.log(`public/ byggd (${buildHash})`);
console.log(`  ${jsPath}  ${kb(size(jsPath))}  (${result.outputFiles.length} fil)`);
console.log(`  ${cssPath}  ${kb(size(cssPath))}`);
console.log(`  fonter: ${fontFiles.length} · bilder: ${readdirSync(path.join(OUT, 'images', 'recipes')).filter((f) => f.endsWith('.webp')).length} + miniatyrer`);
void rel;

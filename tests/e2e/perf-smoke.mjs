// Perf-harness — Fas 0 i docs/prestanda-plan-2026-09.md.
//
// Kör appen i en riktig webbläsare mot en STUBBAD Supabase (tests/e2e/fixtures/
// supabase-stub.js) och rapporterar reproducerbara siffror: antal requests,
// antal databasfrågor, boot-milstolpar, render- och flikbytestider, DOM-storlek.
//
// Siffrorna är RELATIVA — de jämför commit mot commit, de är inte mobiltid.
// Den absoluta sanningen kommer från Joakims iPhone (Fas 0.2 i planen).
//
// Körning (inga npm-scripts i projektet — allt körs med node):
//   node tests/e2e/perf-smoke.mjs
//   node tests/e2e/perf-smoke.mjs --browser=webkit      # kräver webkit-binären
//   node tests/e2e/perf-smoke.mjs --latency=0            # bara klientarbete
//   node tests/e2e/perf-smoke.mjs --json=docs/snapshots/perf-baseline.json
//
// Playwright hämtas från den GLOBALA installationen om projektet saknar den
// (repot har medvetet nästan inga beroenden). Webbläsarbinärer förväntas ligga
// i PLAYWRIGHT_BROWSERS_PATH; saknas den valda binären avbryts körningen med
// ett tydligt besked i stället för att försöka ladda ner något.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── Argument ─────────────────────────────────────────────────────────────────

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const BROWSER = args.get('browser') || 'chromium';
const LATENCY = Number(args.get('latency') ?? 120);
const JSON_OUT = args.get('json') || null;
const KEEP = args.get('keep') === 'true';

// ── Statisk server (beroendefri) ─────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      // Ingen väg utanför repot.
      if (!file.startsWith(ROOT)) { res.writeHead(403).end('nej'); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        // Samma headers som produktionen (mätningen ska likna verkligheten).
        'Cache-Control': 'public, max-age=0, must-revalidate',
      }).end(body);
    } catch {
      res.writeHead(404).end('saknas');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── Playwright-upplösning ────────────────────────────────────────────────────

async function loadPlaywright() {
  const tries = ['playwright', '@playwright/test'];
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (globalRoot) tries.push(path.join(globalRoot, 'playwright', 'index.js'));
  } catch { /* npm saknas → nöj dig med de vanliga */ }
  for (const spec of tries) {
    try {
      const mod = await import(spec);
      // Playwright är CJS — named exports finns ibland bara på default.
      const api = mod.chromium ? mod : mod.default;
      if (api?.chromium) return api;
    } catch { /* nästa */ }
  }
  throw new Error(
    'Playwright hittades inte. Installera i projektet (npm i -D playwright) eller globalt (npm i -g playwright).',
  );
}

// ── Mätning av ett scenario ──────────────────────────────────────────────────

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

async function withRoutes(page, counters) {
  const stubBody = await readFile(path.join(ROOT, 'tests/e2e/fixtures/supabase-stub.js'), 'utf8');

  await page.route(SUPABASE_ESM, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: stubBody }));

  // Fonter: tom CSS → deterministiskt och offline. Fontnedladdningarnas vikt
  // mäts separat i planen (curl mot produktionen), inte här.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '/* stub */' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

  // Egna API-anrop: svar med SAMMA form som de riktiga endpointsen, annars
  // mäter vi appen i ett läge den aldrig är i på riktigt.
  await page.route('**/api/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    counters.apiCalls.push(url.pathname);
    let action = null;
    try { action = JSON.parse(req.postData() || '{}').action || null; } catch { /* GET */ }

    let body = {};
    if (url.pathname.includes('dispatch-to-willys')) {
      body = { featureAvailable: false, stores: [] };
    } else if (action === 'get_preferences') {
      body = { blockedBrands: [], preferOrganic: {}, preferSwedish: {} };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Ska aldrig träffas — stubben går inte på nätet. Larmar om det läcker.
  await page.route('**/*.supabase.co/**', (route) => {
    counters.leaks.push(route.request().url());
    return route.abort();
  });
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || null;
    const res = performance.getEntriesByType('resource');
    const marks = performance.getEntriesByName
      ? performance.getEntriesByType('mark').filter((m) => m.name.startsWith('rb:'))
        .map((m) => ({ name: m.name.slice(3), t: Math.round(m.startTime) }))
      : [];
    return {
      nav: nav ? {
        ttfb: Math.round(nav.responseStart),
        domInteractive: Math.round(nav.domInteractive),
        dcl: Math.round(nav.domContentLoadedEventEnd),
      } : null,
      resources: res.length,
      resourceBytes: res.reduce((s, r) => s + (r.transferSize || 0), 0),
      marks,
      report: typeof window.perfReport === 'function' ? window.perfReport() : null,
      stubQueries: window.__stub ? window.__stub.queries.length : null,
      stubByTable: window.__stub ? { ...window.__stub.byTable } : null,
      channels: window.__stub ? [...window.__stub.channels] : null,
      domNodes: document.querySelectorAll('*').length,
      views: {
        idag: document.querySelectorAll('#todayView *').length,
        matsedel: document.querySelectorAll('#weekDeluxe *').length,
        recept: document.querySelectorAll('#recipeGrid *').length,
        inkop: document.querySelectorAll('#shopContent *').length,
        listor: document.querySelectorAll('#listsContent *').length,
      },
      spans: window.__perfSpansForTest || null,
    };
  });
}

// Spans bor i modulens closure — exponera dem för harnessen via rapporten.
// Vi parsar Render-raden ur perfReport() i stället för att öppna upp modulen.
function parseSpans(report) {
  if (!report) return {};
  const line = report.split('\n').find((l) => l.startsWith('Render/flikar:'));
  if (!line) return {};
  const out = {};
  for (const part of line.replace('Render/flikar:', '').split('·')) {
    const m = part.trim().match(/^(\S+)\s+×(\d+)\s+senast\s+(\d+)\s+max\s+(\d+)$/);
    if (m) out[m[1]] = { count: Number(m[2]), last: Number(m[3]), max: Number(m[4]) };
  }
  return out;
}

// Mäter ETT flikbyte inifrån sidan: från klicket (capture-fas) till att
// flikens innehåll faktiskt har en synlig yta. Playwrights click() gör egna
// väntor före själva klicket, så wall-clock runt den mäter harnessen, inte appen.
async function measureTab(page, { name, btn, wait }, settleMs) {
  const qBefore = await page.evaluate(() => (window.__stub ? window.__stub.queries.length : 0));

  await page.evaluate((sel) => {
    window.__lastClickT = null;
    window.__visibleT = new Promise((resolve) => {
      const tick = () => {
        const el = document.querySelector(sel);
        const shown = el
          && getComputedStyle(el).display !== 'none'
          && el.getBoundingClientRect().height > 0;
        if (shown && window.__lastClickT != null) return resolve(performance.now());
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, wait);

  await page.locator(btn).first().click();
  await page.waitForSelector(wait, { state: 'visible', timeout: 20000 });
  const t = await page.evaluate(async () => ({
    t0: window.__lastClickT,
    t1: await window.__visibleT,
  }));

  await page.waitForTimeout(settleMs);
  const after = await page.evaluate(() => ({
    q: window.__stub ? window.__stub.queries.length : 0,
    report: typeof window.perfReport === 'function' ? window.perfReport() : null,
  }));
  const spans = parseSpans(after.report);
  const key = { shop: 'flik:Inköp', listor: 'flik:Listor' }[name];
  const loadSpan = key ? spans[key] : null;

  return {
    tab: name,
    ms: t.t0 != null && t.t1 != null ? Math.round(t.t1 - t.t0) : null,
    frågor: after.q - qBefore,
    laddning: loadSpan ? `×${loadSpan.count} max ${loadSpan.max} ms` : '—',
  };
}

async function run() {
  const { chromium, webkit, firefox } = await loadPlaywright();
  const engines = { chromium, webkit, firefox };
  const engine = engines[BROWSER];
  if (!engine) throw new Error(`Okänd webbläsare: ${BROWSER} (chromium|webkit|firefox)`);

  const exe = engine.executablePath?.();
  if (exe && !existsSync(exe)) {
    console.error(
      `\nAVBRUTET: binären för ${BROWSER} saknas (${exe}).\n` +
      `Den här miljön har bara Chromium förinstallerad. Kör utan --browser för Chromium,\n` +
      `eller installera binären där du har rättigheter att göra det.\n`,
    );
    process.exitCode = 2;
    return;
  }

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await engine.launch();
  const counters = { apiCalls: [], leaks: [], requests: 0 };
  const results = {};

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },      // iPhone-format (huvudenheten)
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    await page.addInitScript((ms) => {
      window.__stubLatency = ms;
      // Capture-fas: stämplas FÖRE appens onclick → flikbytet mäts från trycket.
      document.addEventListener('click', () => { window.__lastClickT = performance.now(); }, true);
    }, LATENCY);
    await withRoutes(page, counters);

    page.on('request', () => { counters.requests++; });
    const errors = [];
    page.on('pageerror', (e) => {
      const where = String(e.stack || '').split('\n')[1] || '';
      errors.push(`${e.message || e}${where ? ` @${where.trim()}` : ''}`);
    });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const loc = m.location();
      errors.push(`${m.text()}${loc?.url ? ` @${loc.url.split('/').pop()}:${loc.lineNumber}` : ''}`);
    });

    // ── Scenario 1: kallstart ────────────────────────────────────────────────
    const coldRequests0 = counters.requests;
    await page.goto(`${base}/?perf=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#todayView .today-date', { timeout: 20000 });
    const cold = await readMetrics(page);
    cold.networkRequests = counters.requests - coldRequests0;
    cold.spans = parseSpans(cold.report);
    results.kallstart = cold;

    // ── Scenario 2: flikrundan ──────────────────────────────────────────────
    // Klicka på den flikknapp som FAKTISKT syns: i mobilbredd är headerns
    // flikar dolda och bottennavet används (samma data-tab-attribut på båda).
    const tabs = [
      ['shop', '[data-tab="shop"]:visible', '#shopContent'],
      ['vecka', '[data-tab="vecka"]:visible', '#weekDeluxe'],
      ['recept', '[data-tab="recept"]:visible', '#recipeGrid'],
      ['listor', '[data-tab="listor"]:visible', '#listsContent'],
      ['idag', '[data-tab="idag"]:visible', '#todayView .today-date'],
    ];
    const settle = Math.max(400, LATENCY * 4);
    const tabTimings = [];
    for (const [name, btn, wait] of tabs) {
      tabTimings.push(await measureTab(page, { name, btn, wait }, settle));
    }
    const afterTabs = await readMetrics(page);
    afterTabs.spans = parseSpans(afterTabs.report);
    results.flikar = { timings: tabTimings, ...afterTabs };

    // ── Scenario 3: andra flikrundan (allt redan laddat en gång) ────────────
    const secondRound = [];
    for (const [name, btn, wait] of tabs) {
      secondRound.push(await measureTab(page, { name, btn, wait }, settle));
    }
    const after2 = await readMetrics(page);
    results.flikarAndraRundan = {
      timings: secondRound,
      stubQueries: after2.stubQueries - afterTabs.stubQueries,
      spans: parseSpans(after2.report),
    };

    // ── Scenario 4: varmstart (HTTP-cache + service worker aktiv) ───────────
    const warm0 = counters.requests;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#todayView .today-date', { timeout: 20000 });
    const warm = await readMetrics(page);
    warm.networkRequests = counters.requests - warm0;
    warm.spans = parseSpans(warm.report);
    results.varmstart = warm;

    // ── Scenario 5: utan ?perf=1 ────────────────────────────────────────────
    // Skyddsnät: instrumenteringen ska vara helt inert när flaggan är av. Boot
    // rörs av Fas 0, så en krasch här får aldrig gå obemärkt förbi.
    // EGEN kontext: perf-flaggan är medvetet beständig i localStorage (så att
    // kallstart från hemskärmsikonen går att mäta), så "av"-läget måste testas
    // med tom lagring — annars mäter vi bara att flaggan minns sig själv.
    const plainCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const plain = await plainCtx.newPage();
    await plain.addInitScript((ms) => { window.__stubLatency = ms; }, LATENCY);
    await withRoutes(plain, counters);
    const plainErrors = [];
    plain.on('pageerror', (e) => plainErrors.push(String(e.message || e)));
    plain.on('console', (m) => { if (m.type() === 'error') plainErrors.push(m.text()); });
    await plain.goto(base, { waitUntil: 'domcontentloaded' });
    await plain.waitForSelector('#todayView .today-date', { timeout: 20000 });
    results.utanFlagga = {
      overlay: await plain.evaluate(() => !!document.getElementById('perfOverlay')),
      perfMark: await plain.evaluate(() => typeof window.perfMark),
      fel: plainErrors,
    };
    await plainCtx.close();

    results.fel = [...errors, ...results.utanFlagga.fel];
    results.apiAnrop = counters.apiCalls;
    results.supabaseLackage = counters.leaks;

    if (!KEEP) await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  report(results);

  if (JSON_OUT) {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(path.join(ROOT, JSON_OUT)), { recursive: true });
    await writeFile(
      path.join(ROOT, JSON_OUT),
      JSON.stringify({
        körd: new Date().toISOString(),
        webbläsare: BROWSER,
        stubLatensMs: LATENCY,
        resultat: results,
      }, null, 2) + '\n',
    );
    console.log(`\nJSON skriven: ${JSON_OUT}`);
  }

  // Röktest-delen: harnessen ska failas om appen kraschar eller läcker nät.
  const hardFail = results.fel.length > 0
    || results.supabaseLackage.length > 0
    || results.utanFlagga.overlay
    || results.utanFlagga.perfMark !== 'undefined';
  if (hardFail) {
    console.error('\nFEL: sidan loggade fel eller försökte nå Supabase på riktigt (se ovan).');
    process.exitCode = 1;
  }
}

// ── Utskrift ─────────────────────────────────────────────────────────────────

function line(label, value) {
  console.log(`  ${String(label).padEnd(22)} ${value}`);
}

function report(r) {
  const c = r.kallstart;
  console.log(`\n═══ Perf-harness · ${BROWSER} · stub-latens ${LATENCY} ms ═══`);

  console.log('\nKALLSTART (tom cache, ingen service worker)');
  if (c.nav) line('TTFB / DOM / DCL', `${c.nav.ttfb} / ${c.nav.domInteractive} / ${c.nav.dcl} ms`);
  line('Nätverksrequests', c.networkRequests);
  line('Resurser (timing)', `${c.resources} st · ${Math.round(c.resourceBytes / 1024)} kB`);
  line('Databasfrågor', `${c.stubQueries} st`);
  line('Frågor per tabell', Object.entries(c.stubByTable || {}).map(([k, v]) => `${k}×${v}`).join(', '));
  line('Realtime-kanaler', (c.channels || []).length);
  line('Boot-milstolpar', (c.marks || []).map((m) => `${m.name} ${m.t}`).join(' · ') + ' ms');
  line('Renderingar', Object.entries(c.spans).map(([k, s]) => `${k} ×${s.count} (max ${s.max} ms)`).join(' · ') || '—');
  line('DOM-noder', `${c.domNodes} totalt · Idag ${c.views.idag} · Recept ${c.views.recept}`);

  console.log('\nFLIKRUNDAN (första besöket per flik)');
  for (const t of r.flikar.timings) {
    line(t.tab, `${String(t.ms).padStart(4)} ms till synligt · ${t.frågor} frågor · laddning ${t.laddning}`);
  }
  line('Frågor totalt efter', `${r.flikar.stubQueries} st`);
  line('Renderingar', Object.entries(r.flikar.spans).map(([k, s]) => `${k} ×${s.count} (max ${s.max} ms)`).join(' · ') || '—');
  line('DOM-noder', `${r.flikar.domNodes} totalt`);

  console.log('\nFLIKRUNDAN IGEN (allt redan laddat en gång)');
  for (const t of r.flikarAndraRundan.timings) {
    line(t.tab, `${String(t.ms).padStart(4)} ms till synligt · ${t.frågor} frågor · laddning ${t.laddning}`);
  }
  line('NYA frågor', `${r.flikarAndraRundan.stubQueries} st  ← noll vore målet efter Batch C`);

  console.log('\nVARMSTART (omladdning, cache + service worker)');
  line('Nätverksrequests', r.varmstart.networkRequests);
  line('Databasfrågor', `${r.varmstart.stubQueries} st`);
  line('Boot-milstolpar', (r.varmstart.marks || []).map((m) => `${m.name} ${m.t}`).join(' · ') + ' ms');

  console.log('\nUTAN ?perf=1 (instrumenteringen ska vara inert)');
  line('Overlay byggd', r.utanFlagga.overlay ? 'JA — FEL' : 'nej (rätt)');
  line('window.perfMark', r.utanFlagga.perfMark === 'undefined' ? 'odefinierad (rätt)' : `${r.utanFlagga.perfMark} — FEL`);
  line('Fel', r.utanFlagga.fel.length ? r.utanFlagga.fel.join(' | ') : 'inga');

  console.log('\nHÄLSA');
  line('JS-fel / konsolfel', r.fel.length ? r.fel.slice(0, 5).join(' | ') : 'inga');
  line('Riktiga Supabase-anrop', r.supabaseLackage.length ? r.supabaseLackage.join(', ') : 'inga (bra)');
  line('/api/-anrop', r.apiAnrop.length ? [...new Set(r.apiAnrop)].join(', ') : 'inga');
  console.log('');
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

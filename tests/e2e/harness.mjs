// Delad infrastruktur för webbläsarharnessen (tests/e2e/perf-smoke.mjs och
// scenarierna i tests/e2e/scenarios/). Allt körs mot en STUBBAD Supabase
// (fixtures/supabase-stub.js) och stubbade /api/*-svar — aldrig mot den
// riktiga databasen, de riktiga endpointsen eller live-deployen.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── Argument ─────────────────────────────────────────────────────────────────

export function parseArgs(argv = process.argv.slice(2)) {
  return new Map(
    argv.map((a) => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
    }),
  );
}

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

export function startServer() {
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

export async function loadPlaywright() {
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

// ── Nätverksstubbar ──────────────────────────────────────────────────────────

// Appen pinnar en exakt version (js/supabase-client.js + modulepreload i
// index.html). Matcha VILKEN version som helst, annars går en versionsbump
// förbi stubben, den riktiga CDN:en laddas och booten hänger.
export const SUPABASE_ESM = /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^/]+\/\+esm/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (route, status, body) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// counters: { apiCalls: [pathname], api: [{method, path, action, body, t}], leaks: [url] }
// opts.apiLatency: fördröjning (ms) för de skrivande stubbarna (replace-recipe, day).
// counters.failReplace (sätts när som helst): /api/replace-recipe svarar 500.
export async function withRoutes(page, counters, { apiLatency = 0 } = {}) {
  counters.apiCalls ||= [];
  counters.api ||= [];
  counters.leaks ||= [];
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
  let pickSeq = 0;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch { /* inte JSON */ }
    const action = body?.action || null;
    counters.apiCalls.push(url.pathname);
    counters.api.push({ method, path: url.pathname, action, body, t: Date.now() });

    // /api/replace-recipe — samma form som api/replace-recipe.js:
    // { recipe: <titel>, recipeId, saving, savingMatches } (+ shoppingList när
    // servern byggt om listan; utelämnas här). Skrivningen speglas i stubbens
    // tabeller så en senare omhämtning ser samma tillstånd.
    if (url.pathname.endsWith('/api/replace-recipe')) {
      if (method === 'OPTIONS') return route.fulfill({ status: 200, body: '' });   // uppvärmning
      if (method !== 'POST') return json(route, 405, { error: 'Metod ej tillåten' });
      await sleep(apiLatency);
      // counters.failReplace = true → simulera serverfel (inget skrivs i stubben).
      if (counters.failReplace) return json(route, 500, { error: 'Kunde inte byta recept just nu.' });
      const out = await page.evaluate(({ b, seq }) => {
        const T = window.__stubTables;
        const row = T.meal_days.find((r) => r.date === b.date && r.plan_id != null);
        if (!row) return { status: 404, body: { error: 'Dagen hittades inte i veckoplanen.' } };
        const taken = new Set([...(b.weekRecipeIds || []), b.currentRecipeId, ...(b.excludeIds || [])]
          .filter((x) => x != null).map(Number));
        // Förhandsval (preview): bara läsning — tre kandidater, inget skrivs.
        if (b.preview === true) {
          const pool = T.recipes.filter((r) => !taken.has(r.id));
          const start = (100 + seq * 7) % Math.max(1, pool.length);
          const candidates = [0, 1, 2].map((i) => pool[(start + i) % pool.length])
            .filter((r, i, arr) => r && arr.findIndex((x) => x.id === r.id) === i)
            .map((r) => ({ id: r.id, title: r.title }));
          return { status: 200, body: { candidates } };
        }
        let rec;
        if (b.random === true && b.newRecipeId != null) {
          // Slumpa med förhandsval: kandidaten godtas om den fortfarande är ledig
          // (window.__stubRejectCandidate = true → servern väljer själv).
          const ok = !taken.has(Number(b.newRecipeId)) && !window.__stubRejectCandidate;
          const pool = T.recipes.filter((r) => !taken.has(r.id));
          rec = ok ? T.recipes.find((r) => r.id === Number(b.newRecipeId)) : pool[(100 + seq * 7) % pool.length];
        } else if (b.newRecipeId != null) {
          rec = T.recipes.find((r) => r.id === Number(b.newRecipeId));
          if (!rec) return { status: 404, body: { error: 'Receptet hittades inte.' } };
        } else {
          // Deterministisk "slump": första lediga recept efter en löpande offset.
          const pool = T.recipes.filter((r) => !taken.has(r.id));
          rec = pool[(100 + seq * 7) % pool.length];
        }
        row.recipe_id = rec.id;
        row.recipe_title_snapshot = rec.title;
        const reply = { recipe: rec.title, recipeId: rec.id, saving: row.saving ?? null, savingMatches: row.saving_matches ?? null };
        // window.__stubReplaceShop = true → servern "bygger om" inköpslistan som
        // rebuildActiveList: ny lista med nya rad-id:n, gamla avaktiveras,
        // täckningspekarna flyttas — och svaret bär listId/itemIds/coveredDates.
        if (window.__stubReplaceShop) {
          const old = T.shopping_lists.find((l) => l.is_active);
          const listId = `list-${String(T.shopping_lists.length + 1).padStart(4, '0')}`;
          const covered = [...new Set([
            ...T.meal_days.filter((r) => old && r.shopping_list_id === old.id && !r.shopped_at).map((r) => r.date),
            b.date,
          ])].sort();
          const oldItems = old ? T.shopping_items.filter((i) => i.list_id === old.id) : [];
          const recipeItems = {};
          const checkedItems = {};
          const itemIds = {};
          const manualItems = [];
          let n = 0;
          const byCat = {};
          for (const it of oldItems.filter((i) => i.source === 'recipe').sort((a, c) => a.position - c.position)) {
            (byCat[it.category] ||= []).push(it);
          }
          for (const [cat, list] of Object.entries(byCat)) {
            recipeItems[cat] = [];
            list.forEach((it, pos) => {
              const id = `${listId}-it-${n++}`;
              T.shopping_items.push({ ...it, id, list_id: listId, position: pos });
              recipeItems[cat].push(it.name);
              itemIds[`recipe::${cat}::${pos}`] = id;
              if (it.checked) checkedItems[`recipe::${cat}::${pos}`] = true;
            });
          }
          oldItems.filter((i) => i.source === 'manual').sort((a, c) => a.position - c.position).forEach((it, idx) => {
            const id = `${listId}-it-${n++}`;
            T.shopping_items.push({ ...it, id, list_id: listId, position: idx });
            manualItems.push(it.name);
            itemIds[`manual::${it.name}`] = id;
            if (it.checked) checkedItems[`manual::${it.name}`] = true;
          });
          T.shopping_lists.forEach((l) => { l.is_active = false; });
          T.shopping_lists.push({ id: listId, household_id: old?.household_id, is_active: true,
            recipe_items_moved_at: old?.recipe_items_moved_at || new Date().toISOString(), created_at: new Date().toISOString() });
          const changedDates = [];
          for (const r of T.meal_days) {
            if (covered.includes(r.date)) { r.shopping_list_id = listId; changedDates.push(r.date); }
            else if (old && r.shopping_list_id === old.id && !r.shopped_at) { r.shopping_list_id = null; changedDates.push(r.date); }
          }
          window.__stubLastRebuild = { oldListId: old?.id || null, listId, changedDates };
          reply.shoppingList = {
            listId, generated: new Date().toISOString().slice(0, 10), startDate: covered[0], endDate: covered[covered.length - 1],
            recipeItems, recipeItemsMovedAt: old?.recipe_items_moved_at || null, manualItems, checkedItems, itemIds,
            coveredDates: covered,
          };
        }
        return { status: 200, body: reply };
      }, { b: body || {}, seq: pickSeq++ });
      return json(route, out.status, out.body);
    }

    // /api/day — bara POST. Minimal giltig form (se buildResponse i api/day.js):
    // oförändrad plan + egna dagar, noop — stubben roterar inga dagar.
    if (url.pathname.endsWith('/api/day')) {
      if (method === 'OPTIONS') return route.fulfill({ status: 200, body: '' });   // uppvärmning
      if (method !== 'POST') return json(route, 405, { error: 'Metod ej tillåten' });
      await sleep(apiLatency);
      const out = await page.evaluate(() => {
        const T = window.__stubTables;
        const plan = T.weekly_plans.find((p) => p.is_active);
        const rows = [...T.meal_days].sort((a, b) => (a.date < b.date ? -1 : 1));
        const planRows = plan ? rows.filter((r) => r.plan_id === plan.id) : [];
        const weeklyPlan = planRows.length ? {
          startDate: planRows[0].date,
          endDate: planRows[planRows.length - 1].date,
          confirmedAt: plan.confirmed_at || null,
          days: planRows.map((d) => ({
            date: d.date, recipe: d.recipe_title_snapshot || null, recipeId: d.recipe_id ?? null,
            saving: d.saving ?? null, savingMatches: d.saving_matches ?? null,
            locked: d.locked === true, blocked: d.blocked === true,
            shoppedAt: d.shopped_at ?? null, listId: d.shopping_list_id ?? null,
          })),
        } : null;
        const customDays = { entries: {} };
        for (const r of rows) {
          if (r.plan_id != null) continue;
          if (r.custom_note == null && r.recipe_id == null && !r.recipe_title_snapshot && r.blocked !== true) continue;
          customDays.entries[r.date] = {
            note: r.custom_note || '', recipeId: r.recipe_id ?? null,
            recipeTitle: r.recipe_title_snapshot || '', blocked: r.blocked === true,
            shoppedAt: r.shopped_at ?? null, listId: r.shopping_list_id ?? null,
          };
        }
        return { ok: true, weeklyPlan, customDays, noop: true };
      });
      return json(route, 200, out);
    }

    let out = {};
    if (url.pathname.includes('dispatch-to-willys')) {
      out = { featureAvailable: false, stores: [] };
    } else if (action === 'get_preferences') {
      out = { blockedBrands: [], preferOrganic: {}, preferSwedish: {} };
    }
    return json(route, 200, out);
  });

  // Ska aldrig träffas — stubben går inte på nätet. Larmar om det läcker.
  await page.route('**/*.supabase.co/**', (route) => {
    counters.leaks.push(route.request().url());
    return route.abort();
  });
}

// Samlar JS-fel och konsolfel med ursprung (fil:rad) i errors-arrayen.
export function collectErrors(page, errors) {
  page.on('pageerror', (e) => {
    const where = String(e.stack || '').split('\n')[1] || '';
    errors.push(`${e.message || e}${where ? ` @${where.trim()}` : ''}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location();
    errors.push(`${m.text()}${loc?.url ? ` @${loc.url.split('/').pop()}:${loc.lineNumber}` : ''}`);
  });
}

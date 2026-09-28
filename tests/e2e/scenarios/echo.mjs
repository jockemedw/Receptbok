// Scenario "echo" — egna ändringar ska inte följas av en dold omladdning.
//
//   node tests/e2e/perf-smoke.mjs --scenario=echo
//   node tests/e2e/perf-smoke.mjs --scenario=echo --api-latency=600 --shots=/tmp/echo
//
// Delscenarier (allt mot stubben — ingen riktig databas eller endpoint):
//   a) ekoEfterSvar: Slumpa → när svaret landat spelas ett meal_days-event upp
//      som stämmer med nya läget → räkna följdfrågor i 6 s (mål: 0).
//   b) ekoFöreSvar: ekot spelas upp i samma ögonblick som servern skrivit (före
//      svaret hunnit fram) → radkollen vid fönstrets slut ska känna igen det.
//   c) partnerIFönster: direkt efter ett eget byte ändrar "partnern" en annan
//      dag (annat recept) → planen hämtas om när fönstret löpt ut.
//   d) partnerUtanförFönster: partnerns ändring utan eget byte → omhämtning direkt.
//   e) bytMedLista: servern bygger om inköpslistan (listId/itemIds i svaret) →
//      Inköp-fliken visar nya listan utan spinner, ekon (meal_days-pekare +
//      shopping_lists) ger ingen omladdning, och en bockning skrivs till NYA
//      listans rad-id.
//   f) indikator: dagoperation — snabbt svar visar ingen helskärmsslöja, långsamt
//      visar den efter ~250 ms (skärmdumpar i ljust/mörkt med --shots).
//
// Failar (exitkod 1) på JS-fel, läckta Supabase-anrop och brutna förväntningar.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { startServer, loadPlaywright, withRoutes, collectErrors } from '../harness.mjs';

const WINDOW_MS = 6000;

async function openSession(browser, base, { latency, apiLatency, counters, errors }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript(({ ms }) => { window.__stubLatency = ms; }, { ms: latency });
  await withRoutes(page, counters, { apiLatency });
  collectErrors(page, errors);
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#todayView .today-date', { timeout: 20000 });
  await page.locator('[data-tab="vecka"]:visible').first().click();
  await page.waitForSelector('#weekDeluxe [data-date]', { timeout: 10000 });
  return { context, page };
}

async function futureDays(page) {
  return page.evaluate(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return (window._lastPlan?.days || []).filter((x) => x.date > today && x.recipeId != null).map((x) => x.date);
  });
}

async function openSheet(page, date) {
  await page.evaluate((date) => window.dlxWeekGoto?.(date), date);
  await page.locator(`#weekDeluxe [data-date="${date}"]`).first().click();
  await page.waitForSelector('#dlxSheet.open', { timeout: 5000 });
}

async function shuffle(page, date, { onWrite = null } = {}) {
  const oldId = await page.evaluate((d) => window._lastPlan.days.find((x) => x.date === d).recipeId, date);
  await openSheet(page, date);
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Byt recept' }).first().click();
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Slumpa' }).first().click();
  if (onWrite) {
    // Servern har skrivit raden (stubben speglar) — spela upp ekot DIREKT.
    await page.waitForFunction(({ d, oldId }) =>
      window.__stubTables.meal_days.find((r) => r.date === d && r.plan_id != null).recipe_id !== oldId,
    { d: date, oldId }, { timeout: 10000, polling: 5 });
    await onWrite();
  }
  await page.waitForFunction(({ d, oldId }) => {
    const x = window._lastPlan?.days?.find((y) => y.date === d);
    return x && x.recipeId !== oldId && !window._opBusy;
  }, { d: date, oldId }, { timeout: 10000 });
}

const emitRow = (page, date) => page.evaluate((date) => {
  const row = window.__stubTables.meal_days.find((r) => r.date === date);
  return window.__stubEmit('meal_days', { eventType: 'UPDATE', new: { ...row }, old: { id: row.id } });
}, date);

async function countQueries(page, fn, ms = WINDOW_MS) {
  const q0 = await page.evaluate(() => window.__stub.queries.length);
  await fn();
  await page.waitForTimeout(ms);
  return page.evaluate((q0) => {
    const qs = window.__stub.queries.slice(q0);
    const byTable = {};
    for (const q of qs) byTable[`${q.table}:${q.op}`] = (byTable[`${q.table}:${q.op}`] || 0) + 1;
    return { n: qs.length, byTable, planReload: qs.some((q) => q.table === 'weekly_plans') };
  }, q0);
}

const waitWindowOut = (page) => page.waitForFunction(() => !window._planMutateUntil || Date.now() > window._planMutateUntil + 100, null, { timeout: 15000 });

// Partner ändrar receptet på en dag direkt i "databasen" och eventet kommer.
const partnerChange = (page, date) => page.evaluate((date) => {
  const T = window.__stubTables;
  const row = T.meal_days.find((r) => r.date === date);
  const used = new Set(T.meal_days.map((r) => r.recipe_id));
  const rec = T.recipes.find((r) => !used.has(r.id));
  row.recipe_id = rec.id;
  row.recipe_title_snapshot = rec.title;
  window.__stubEmit('meal_days', { eventType: 'UPDATE', new: { ...row }, old: { id: row.id } });
  return rec.title;
}, date);

export async function run({ args, browserName = 'chromium', latency = 120 }) {
  const apiLatency = Number(args.get('api-latency') ?? 600);
  const shots = args.get('shots') || null;
  const pw = await loadPlaywright();
  const engine = pw[browserName];
  const exe = engine.executablePath?.();
  if (exe && !existsSync(exe)) { console.error(`AVBRUTET: ${browserName} saknas (${exe}).`); process.exitCode = 2; return; }

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await engine.launch();
  const errors = [];
  const counters = { api: [], apiCalls: [], leaks: [] };
  const out = { scenario: 'echo', apiLatensMs: apiLatency, stubLatensMs: latency };
  const expect = [];
  const check = (ok, what) => { if (!ok) expect.push(what); };

  try {
    const { page } = await openSession(browser, base, { latency, apiLatency, counters, errors });
    const days = await futureDays(page);
    if (days.length < 3) throw new Error('För få framtida plandagar i stubben');
    const [a, b, c] = days;
    // e) på en o-inhandlad dag (stubbens två första plandagar är inhandlade).
    const eDay = await page.evaluate((ds) => ds.find((d) => !window._lastPlan.days.find((x) => x.date === d)?.shoppedAt), days.slice(3)) || c;

    // a) eko efter svaret
    await shuffle(page, a);
    out.ekoEfterSvar = await countQueries(page, () => emitRow(page, a));
    check(out.ekoEfterSvar.n === 0, 'a) matchande eko efter svaret gav följdfrågor');
    await waitWindowOut(page);

    // b) eko före svaret
    out.ekoFöreSvar = await countQueries(page, () => shuffle(page, b, { onWrite: () => emitRow(page, b) }));
    check(!out.ekoFöreSvar.planReload, 'b) tidigt eko ledde till omhämtning av planen');
    await waitWindowOut(page);

    // c) partner ändrar en annan dag mitt i vårt ekofönster
    let partnerTitle = null;
    out.partnerIFönster = await countQueries(page, async () => {
      await shuffle(page, a);
      partnerTitle = await partnerChange(page, c);
    });
    out.partnerIFönster.syns = await page.evaluate(({ d, t }) => window._lastPlan.days.find((x) => x.date === d)?.recipe === t, { d: c, t: partnerTitle });
    check(out.partnerIFönster.planReload && out.partnerIFönster.syns, 'c) partnerns ändring i fönstret syntes inte');
    await waitWindowOut(page);

    // d) partner utanför fönstret
    out.partnerUtanförFönster = await countQueries(page, async () => { partnerTitle = await partnerChange(page, b); }, 1500);
    out.partnerUtanförFönster.syns = await page.evaluate(({ d, t }) => window._lastPlan.days.find((x) => x.date === d)?.recipe === t, { d: b, t: partnerTitle });
    check(out.partnerUtanförFönster.planReload && out.partnerUtanförFönster.syns, 'd) partnerns ändring syntes inte');
    await waitWindowOut(page);

    // e) byte som bygger om inköpslistan
    await page.locator('[data-tab="shop"]:visible').first().click();
    await page.waitForSelector('#shopContent .shopping-item', { timeout: 10000 });
    await page.locator('[data-tab="vecka"]:visible').first().click();
    await page.evaluate(() => { window.__stubReplaceShop = true; });
    await shuffle(page, eDay);
    const rebuild = await page.evaluate(() => window.__stubLastRebuild);
    const e = {
      nyLista: rebuild.listId,
      klientensLista: await page.evaluate(() => window._shopListId),
      aktivLista: await page.evaluate(() => window._activeShopListId),
      påListan: await page.evaluate((d) => !!window._timelineByDate?.[d]?.onList, eDay),
    };
    e.ekon = await countQueries(page, () => page.evaluate(({ changedDates: dates, listId, oldListId }) => {
      for (const d of dates) {
        const row = window.__stubTables.meal_days.find((r) => r.date === d);
        window.__stubEmit('meal_days', { eventType: 'UPDATE', new: { ...row }, old: { id: row.id } });
      }
      window.__stubEmit('shopping_lists', { eventType: 'UPDATE', new: { id: oldListId, is_active: false } });
      window.__stubEmit('shopping_lists', { eventType: 'UPDATE', new: { id: listId, is_active: true } });
    }, rebuild));
    // Spinner-vakt på Inköp-fliken, sedan flikbyte.
    await page.evaluate(() => {
      window.__spinnerSeen = false;
      const el = document.getElementById('shopLoading');
      new MutationObserver(() => { if (el.style.display !== 'none') window.__spinnerSeen = true; })
        .observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    await page.locator('[data-tab="shop"]:visible').first().click();
    await page.waitForTimeout(latency * 4 + 300);
    e.spinnerVidFlikbyte = await page.evaluate(() => window.__spinnerSeen);
    e.täckning = await page.evaluate(() => (window._shopCoverage || []).map((r) => `${r.date}${r.shopped_at ? ' (inhandlad)' : ''}`));
    e.täckningsrad = await page.evaluate(() => document.getElementById('shopCoverage')?.innerText.trim() || '');
    const w0 = await page.evaluate(() => window.__stub.writes.length);
    const key = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#shopContent .shopping-item[data-key^="recipe::"]:not(.checked):not(.pantry)')]
        .find((x) => x.getBoundingClientRect().height > 0);
      return el?.dataset.key || null;
    });
    await page.locator(`#shopContent .shopping-item[data-key="${key}"]`).first().click();
    await page.waitForTimeout(1200);   // debouncad flush (600 ms) + latens
    const writes = await page.evaluate((w0) => window.__stub.writes.slice(w0).filter((w) => w.table === 'shopping_items'), w0);
    const ids = writes.flatMap((w) => w.filters.filter((f) => f.col === 'id').flatMap((f) => (Array.isArray(f.val) ? f.val : [f.val])));
    e.bockadNyckel = key;
    e.skrevTillId = ids;
    e.förväntatId = await page.evaluate((k) => window._shopItemIds?.[k], key);
    e.idHörTillNyaListan = ids.length > 0 && ids.every((id) => String(id).startsWith(`${rebuild.listId}-`));
    out.bytMedLista = e;
    check(e.klientensLista === rebuild.listId && e.aktivLista === rebuild.listId, 'e) klienten tog inte över nya listans id');
    check(e.påListan, 'e) "på listan"-chipet följde inte nya listan');
    check(!e.ekon.planReload && e.ekon.n === 0, 'e) ekona efter listombygget gav följdfrågor');
    check(!e.spinnerVidFlikbyte, 'e) spinnern blinkade vid flikbyte');
    check(e.täckning.includes(eDay), 'e) täckningsraden följde inte nya listan');
    check(e.idHörTillNyaListan, 'e) bockningen skrevs inte till nya listans rad');
    await page.evaluate(() => { window.__stubReplaceShop = false; });
    await page.locator('[data-tab="vecka"]:visible').first().click();
    await page.waitForTimeout(300);

    // f) indikatorn för dagoperationer
    const overlayRun = async (ms, shot) => {
      await openSheet(page, c);
      await page.evaluate(() => {
        window.__overlayAt = null;
        const t0 = performance.now();
        const tick = () => {
          if (document.querySelector('.dlx-op-overlay') && window.__overlayAt == null) window.__overlayAt = Math.round(performance.now() - t0);
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        window.dlxSheetNoDinner('Rester');
      });
      if (shot) {
        await page.waitForSelector('.dlx-op-overlay.open', { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(150);
        await page.screenshot({ path: shot });
      }
      await page.waitForFunction(() => !window._opBusy, null, { timeout: 10000 });
      await page.waitForTimeout(300);
      return page.evaluate(() => window.__overlayAt);
    };
    out.indikator = { slöjaEfterMs: await overlayRun(apiLatency, null) };
    check(out.indikator.slöjaEfterMs == null || out.indikator.slöjaEfterMs >= 230, 'f) slöjan visades före 250 ms');
    if (shots) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(shots, { recursive: true });
      await overlayRun(apiLatency, path.join(shots, 'op-overlay-light.png'));
      await page.locator('[data-tab="shop"]:visible').first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(shots, 'shop-light.png') });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(shots, 'shop-dark.png') });
      await page.locator('[data-tab="vecka"]:visible').first().click();
      await page.waitForTimeout(300);
      await overlayRun(apiLatency, path.join(shots, 'op-overlay-dark.png'));
    }
    out.apiAnrop = counters.api.map((x) => `${x.method} ${x.path}${x.action ? ` ${x.action}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }

  out.fel = errors;
  out.supabaseLackage = counters.leaks;
  out.bruttaFörväntningar = expect;
  console.log(JSON.stringify(out, null, 2));
  if (errors.length || counters.leaks.length || expect.length) {
    console.error('\nFEL: se "fel", "supabaseLackage" och "bruttaFörväntningar" ovan.');
    process.exitCode = 1;
  }
}

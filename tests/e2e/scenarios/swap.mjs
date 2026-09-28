// Scenario "swap" — byt recept på en dag i Matsedel och mät hur det KÄNNS.
//
//   node tests/e2e/perf-smoke.mjs --scenario=swap
//   node tests/e2e/perf-smoke.mjs --scenario=swap --api-latency=1500 --latency=120
//   node tests/e2e/perf-smoke.mjs --scenario=swap --plan-offset=7   # bara planen nästa vecka
//   node tests/e2e/perf-smoke.mjs --scenario=swap --json=/tmp/swap.json
//
// Delscenarier (allt mot stubben — ingen riktig databas eller endpoint):
//   a) slumpa: dag-sheet → Byt recept → Slumpa. Tid från trycket tills dagkortet
//      visar den nya titeln, och tills något väntar-tillstånd syns.
//   b) välj själv: Byt recept → Välj själv → (1) tryck på kortets titel,
//      (2) tryck på Välj-knappen. Tid tills Matsedel visar den nya titeln på
//      rätt datum + antal replace-anrop. Körs med planen denna vecka OCH nästa.
//   d) fel: servern svarar 500 → återställd titel, toast, ingen felrad kvar i bannern.
//   e) dubbeltryck på ett kort i väljläget → exakt ett replace-anrop.
//   c) eko: direkt efter (a) spelas ett meal_days-event upp som stämmer med det
//      nya läget; räkna följdfrågorna mot Supabase de närmaste 6 sekunderna.
//
// Rapporterar UX-siffror som JSON utan att faila på trösklar — men failar på
// JS-fel/konsolfel och på läckta anrop mot riktiga Supabase.

import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  ROOT, startServer, loadPlaywright, withRoutes, collectErrors,
} from '../harness.mjs';

const ECHO_WINDOW_MS = 6000;

// ── Sidhjälpare ──────────────────────────────────────────────────────────────

async function openSession(browser, base, { latency, planOffset, apiLatency, counters, errors }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.addInitScript(({ ms, offset }) => {
    window.__stubLatency = ms;
    window.__planOffset = offset;
    // Capture-fas: stämplas FÖRE appens onclick → mätningen startar vid trycket.
    document.addEventListener('click', () => { window.__lastClickT = performance.now(); }, true);
  }, { ms: latency, offset: planOffset });
  await withRoutes(page, counters, { apiLatency });
  collectErrors(page, errors);
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#todayView .today-date', { timeout: 20000 });
  await page.locator('[data-tab="vecka"]:visible').first().click();
  await page.waitForSelector('#weekDeluxe [data-date]', { timeout: 10000 });
  return { context, page };
}

// Första plandag efter idag som har ett recept (lokal tid, som appen).
async function pickTarget(page, skip = 0) {
  return page.evaluate((skip) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const days = (window._lastPlan?.days || []).filter((x) => x.date > today && x.recipeId != null);
    return days[skip]?.date || days[0]?.date || null;
  }, skip);
}

const dayRecipe = (page, date) =>
  page.evaluate((date) => window._lastPlan?.days?.find((x) => x.date === date)?.recipe || null, date);

// Visar Matsedel datumet utan att användaren bläddrar? (info för plan-nästa-vecka)
const dateShown = (page, date) => page.evaluate((date) => {
  const el = document.querySelector(`#weekDeluxe [data-date="${date}"]`);
  return !!el && el.getBoundingClientRect().height > 0;
}, date);

async function gotoWeekOf(page, date) {
  if (await dateShown(page, date)) return;
  await page.evaluate((date) => window.dlxWeekGoto?.(date), date);
  await page.waitForFunction((date) => {
    const el = document.querySelector(`#weekDeluxe [data-date="${date}"]`);
    return !!el && el.getBoundingClientRect().height > 0;
  }, date, { timeout: 5000 });
}

async function openByt(page, date) {
  await gotoWeekOf(page, date);
  await page.locator(`#weekDeluxe [data-date="${date}"]`).first().click();
  await page.waitForSelector('#dlxSheet.open', { timeout: 5000 });
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Byt recept' }).first().click();
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Slumpa' }).first().waitFor({ timeout: 5000 });
}

// rAF-samplare i sidan: loggar varje ändring av (dagkortets text, väntar-läge,
// flik, synlighet). Tider räknas från trycket (window.__lastClickT).
async function startSampler(page, date, limitMs) {
  await page.evaluate(({ date, limitMs }) => {
    window.__lastClickT = null;
    const samples = [];
    window.__samples = samples;
    const t0 = performance.now();
    let last = '';
    const busyRe = /(^|[\s-])(pending|loading|busy|saving)([\s-]|$)/;
    const tick = () => {
      const els = [...document.querySelectorAll(`#weekDeluxe [data-date="${date}"]`)];
      const text = els.map((e) => e.innerText).join(' ').replace(/\s+/g, ' ').trim();
      const tab = document.body.dataset.activeTab || '';
      const visible = tab === 'vecka' && els.some((e) => e.getBoundingClientRect().height > 0);
      const pending = !!document.querySelector('.dlx-op-overlay.open')
        || els.some((e) => e.getAttribute('aria-busy') === 'true' || busyRe.test(e.className)
          || !!e.querySelector('[aria-busy="true"], [class*="pending"], [class*="loading"], [class*="skeleton"]'));
      const sig = `${text}|${pending}|${tab}|${visible}`;
      if (sig !== last) {
        last = sig;
        samples.push({ at: performance.now(), text, pending, tab, visible });
      }
      if (performance.now() - t0 < limitMs) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { date, limitMs });
}

async function readSampler(page) {
  return page.evaluate(() => ({ tap: window.__lastClickT, samples: window.__samples || [] }));
}

// Tider (ms efter trycket) ur samplarens logg.
function timings({ tap, samples }, { newTitle, oldTitle }) {
  if (tap == null) return { tapRegistrerat: false };
  const rel = (s) => Math.round(s.at - tap);
  const after = samples.filter((s) => s.at >= tap - 1);
  const firstPending = after.find((s) => s.pending);
  const titleShown = newTitle ? after.find((s) => s.visible && s.text.includes(newTitle)) : null;
  const oldGone = oldTitle ? after.find((s) => !s.text.includes(oldTitle)) : null;
  // Blinkar den gamla titeln tillbaka efter att den nya visats?
  const flicker = titleShown && oldTitle
    ? after.some((s) => s.at > titleShown.at && s.text.includes(oldTitle)) : false;
  return {
    msTillVäntarläge: firstPending ? rel(firstPending) : null,
    msTillGammalTitelBorta: oldGone ? rel(oldGone) : null,
    msTillNyTitelSynlig: titleShown ? rel(titleShown) : null,
    gammalTitelBlinkadeTillbaka: flicker,
    ändringar: after.length,
  };
}

// Skrivande byten — förhandsval (preview) och uppvärmning räknas inte.
const replaceCalls = (counters) => counters.api.filter((c) =>
  c.path.endsWith('/api/replace-recipe') && c.method === 'POST' && !c.body?.preview).length;
const previewCalls = (counters) => counters.api.filter((c) =>
  c.path.endsWith('/api/replace-recipe') && c.body?.preview === true).length;

// Slumpa med förhandsval (P5): sheeten hämtar kandidater i bakgrunden, trycket
// visar nya rätten direkt. Mäter också: andra Slumpa tar nästa kandidat, dubbel-
// tryck under sparningen köar (tappas inte), fel → återställning + toast,
// avvisad kandidat → serverns val ersätter.
const toastText = (page) => page.evaluate(() => document.querySelector('.toast')?.textContent?.trim() || null);
const waitIdle = (page, ms) => page.waitForFunction(() => !window._opBusy, null, { timeout: ms }).catch(() => {});

async function tapShuffleMeasured(page, date, apiLatency) {
  const oldTitle = await dayRecipe(page, date);
  await startSampler(page, date, apiLatency + 3000);
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Slumpa' }).first().click();
  await page.waitForTimeout(250);
  const shownTitle = await dayRecipe(page, date);
  const t = timings(await readSampler(page), { newTitle: shownTitle !== oldTitle ? shownTitle : null, oldTitle });
  return { oldTitle, shownTitle, ...t };
}

async function scenarioShufflePrefetch(page, date, { apiLatency, counters }) {
  const out = {};
  // (1) Förhandsval hinner landa → direkt titel.
  const p0 = previewCalls(counters);
  await openByt(page, date);
  await page.waitForTimeout(apiLatency + 300);
  out.förhandsvalAnrop = previewCalls(counters) - p0;
  const r0 = replaceCalls(counters);
  const first = await tapShuffleMeasured(page, date, apiLatency);
  await waitIdle(page, apiLatency + 3000);
  const afterFirst = await dayRecipe(page, date);
  out.första = { msTillNyTitelSynlig: first.msTillNyTitelSynlig, msTillVäntarläge: first.msTillVäntarläge,
    visadTitelBlevKvar: afterFirst === first.shownTitle, gammalTitelBlinkadeTillbaka: first.gammalTitelBlinkadeTillbaka };
  // (2) Andra Slumpa direkt (utan ny väntan) → nästa kandidat, annan rätt.
  await openByt(page, date);
  const second = await tapShuffleMeasured(page, date, apiLatency);
  await waitIdle(page, apiLatency + 3000);
  out.andra = { msTillNyTitelSynlig: second.msTillNyTitelSynlig,
    annanÄnFörsta: second.shownTitle !== first.shownTitle && second.shownTitle !== first.oldTitle };
  out.replaceAnrop = replaceCalls(counters) - r0;

  // (3) Dubbeltryck under bakgrundssparningen → andra trycket köar och körs.
  await openByt(page, date);
  await page.waitForTimeout(apiLatency + 300);
  const r1 = replaceCalls(counters);
  const before = await dayRecipe(page, date);
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Slumpa' }).first().click();
  await page.evaluate((d) => { window.dlxShuffle(d); }, date);   // returnera inte löftet — det köar
  await page.waitForTimeout(100);
  const pendingDirekt = await page.evaluate((d) => !!document.querySelector(`#weekDeluxe article[data-date="${d}"].dlx-pending`), date);
  await page.waitForFunction(() => !window._opBusy, null, { timeout: apiLatency * 3 + 4000 }).catch(() => {});
  await page.waitForTimeout(200);
  out.dubbeltryck = { replaceAnrop: replaceCalls(counters) - r1, pendingDirekt, bytt: (await dayRecipe(page, date)) !== before };

  // (4) Upptagen (vanlig dagoperation pågår, ingen bakgrundssparning) → toast.
  await page.evaluate(() => { window._opBusy = true; });
  await page.evaluate((d) => { window.dlxShuffle(d); }, date);
  await page.waitForTimeout(150);
  out.upptagenToast = await toastText(page);
  await page.evaluate(() => { window._opBusy = false; });
  await page.waitForTimeout(3500);   // låt toasten försvinna

  // (5) Fel efter optimistisk visning → återställning + toast.
  await openByt(page, date);
  await page.waitForTimeout(apiLatency + 300);
  const failOld = await dayRecipe(page, date);
  counters.failReplace = true;
  const f = await tapShuffleMeasured(page, date, apiLatency);
  await waitIdle(page, apiLatency + 3000);
  await page.waitForTimeout(150);
  counters.failReplace = false;
  out.fel = { msTillNyTitelSynlig: f.msTillNyTitelSynlig, återställd: (await dayRecipe(page, date)) === failOld,
    toast: await toastText(page),
    kvarMarkerad: await page.evaluate((d) => !!document.querySelector(`#weekDeluxe article[data-date="${d}"].dlx-pending`), date) };
  await page.waitForTimeout(3500);

  // (6) Servern avvisar kandidaten → serverns val ersätter den visade.
  await openByt(page, date);
  await page.waitForTimeout(apiLatency + 300);
  await page.evaluate(() => { window.__stubRejectCandidate = true; });
  const rj = await tapShuffleMeasured(page, date, apiLatency);
  await waitIdle(page, apiLatency + 3000);
  await page.evaluate(() => { window.__stubRejectCandidate = false; });
  const finalTitle = await dayRecipe(page, date);
  const stub = await page.evaluate((d) => window.__stubTables.meal_days.find((r) => r.date === d && r.plan_id != null)?.recipe_title_snapshot, date);
  out.avvisadKandidat = { visadFörst: rj.shownTitle, slutlig: finalTitle, sammaSomServern: finalTitle === stub };
  return out;
}

// Slumpa utan förhandsval: skärmdump av väntar-läget (ljust + mörkt).
async function shotShuffling(page, date, file, apiLatency) {
  await page.evaluate(() => window.dlxDropShufflePreviews?.());
  await page.evaluate((d) => { window.dlxShuffle(d); }, date);
  await page.waitForTimeout(120);
  const el = page.locator(`#weekDeluxe article[data-date="${date}"]`).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: file });
  const info = await page.evaluate((d) => {
    const a = document.querySelector(`#weekDeluxe article[data-date="${d}"]`);
    return { shuffling: a?.classList.contains('dlx-shuffling'), ariaBusy: a?.getAttribute('aria-busy') };
  }, date);
  await waitIdle(page, apiLatency + 3000);
  return info;
}

// ── Delscenarier ─────────────────────────────────────────────────────────────

async function scenarioRandom(page, date, { apiLatency, counters }) {
  const oldTitle = await dayRecipe(page, date);
  await openByt(page, date);
  const r0 = replaceCalls(counters);
  await startSampler(page, date, apiLatency + 3000);
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Slumpa' }).first().click();
  // Vänta tills svaret landat i planen (eller ge upp efter latens + marginal).
  await page.waitForFunction(({ date, oldTitle }) => {
    const r = window._lastPlan?.days?.find((x) => x.date === date)?.recipe;
    return r && r !== oldTitle;
  }, { date, oldTitle }, { timeout: apiLatency + 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const newTitle = await dayRecipe(page, date);
  const t = timings(await readSampler(page), { newTitle: newTitle !== oldTitle ? newTitle : null, oldTitle });
  return { datum: date, replaceAnrop: replaceCalls(counters) - r0, bytt: newTitle !== oldTitle, ...t };
}

async function scenarioEcho(page, date) {
  const q0 = await page.evaluate(() => window.__stub.queries.length);
  const handlers = await page.evaluate((date) => {
    const row = window.__stubTables.meal_days.find((r) => r.date === date && r.plan_id != null);
    return window.__stubEmit('meal_days', { eventType: 'UPDATE', new: { ...row }, old: { id: row.id } });
  }, date);
  await page.waitForTimeout(ECHO_WINDOW_MS);
  const after = await page.evaluate((q0) => {
    const qs = window.__stub.queries.slice(q0);
    const byTable = {};
    for (const q of qs) byTable[q.table] = (byTable[q.table] || 0) + 1;
    return { n: qs.length, byTable };
  }, q0);
  return { lyssnare: handlers, följdfrågor: after.n, perTabell: after.byTable, fönsterMs: ECHO_WINDOW_MS };
}

// Välj själv: tar receptboken fram, returnerar ett kort som inte redan ligger i veckan.
async function enterPick(page, date, skipIds = []) {
  await openByt(page, date);
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Välj själv' }).first().click();
  await page.waitForSelector('#recipeGrid .recipe-card', { state: 'visible', timeout: 5000 });
  return page.evaluate((skip) => {
    const week = new Set((window._lastPlan?.days || []).map((d) => d.recipeId));
    const card = [...document.querySelectorAll('#recipeGrid .recipe-card')].find((c) => {
      const id = Number(c.dataset.id);
      return c.getBoundingClientRect().height > 0 && !week.has(id) && !skip.includes(id);
    });
    return card ? { id: Number(card.dataset.id), title: card.querySelector('.card-title')?.textContent.trim() } : null;
  }, skipIds);
}

async function measurePickTap(page, date, card, selector, { apiLatency, counters }) {
  const oldTitle = await dayRecipe(page, date);
  const r0 = replaceCalls(counters);
  await startSampler(page, date, apiLatency + 3000);
  const loc = page.locator(`#recipeGrid .recipe-card[data-id="${card.id}"] ${selector}`).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click();
  await page.waitForFunction(({ date, title }) =>
    document.body.dataset.activeTab === 'vecka'
      && [...document.querySelectorAll(`#weekDeluxe [data-date="${date}"]`)].some((e) => e.innerText.includes(title)),
  { date, title: card.title }, { timeout: apiLatency + 2500 }).catch(() => {});
  await page.waitForTimeout(300);
  const t = timings(await readSampler(page), { newTitle: card.title, oldTitle });
  // Låt bakgrundssparningen (optimistiskt val) bli klar innan nästa steg —
  // annars vägrar den delade spärren (_opBusy) nästa val, som den ska.
  await page.waitForFunction(() => !window._opBusy, null, { timeout: apiLatency + 3000 }).catch(() => {});
  const state = await page.evaluate((id) => ({
    kvarIVäljläge: !!window.replaceMode,
    kortUtfällt: !!document.querySelector(`#recipeGrid .recipe-card[data-id="${id}"].open, #recipeGrid .recipe-card[data-id="${id}"].expanded`),
    flik: document.body.dataset.activeTab,
  }), card.id);
  return {
    recept: card.id,
    replaceAnrop: replaceCalls(counters) - r0,
    planensTitel: (await dayRecipe(page, date)) === card.title ? 'ny' : 'oförändrad',
    ...state,
    ...t,
  };
}

async function scenarioManual(page, date, opts) {
  const shownWithoutNav = await dateShown(page, date);
  // (1) Tryck på kortets titel — det naturliga trycket för många.
  const cardA = await enterPick(page, date);
  if (!cardA) return { datum: date, fel: 'Hittade inget valbart receptkort' };
  const titleTap = await measurePickTap(page, date, cardA, '.card-title', opts);
  // Städa: lämna väljläget om vi fortfarande är kvar (annars påverkas nästa steg).
  if (await page.evaluate(() => !!window.replaceMode)) {
    await page.evaluate(() => { window.exitReplaceMode?.(); window.switchTab?.('vecka'); });
    await page.waitForTimeout(200);
  }
  // (2) Tryck på Välj-knappen.
  const cardB = await enterPick(page, date, [cardA.id]);
  const selectTap = cardB ? await measurePickTap(page, date, cardB, '.select-btn', opts) : { fel: 'inget kort' };
  return { datum: date, synligUtanBläddring: shownWithoutNav, tryckPåTitel: titleTap, tryckPåVälj: selectTap };
}

// Fel: servern svarar 500 → dagen ska återställas, en toast visas och bannern
// ska inte bära med sig någon felrad när man går in i väljläget igen.
async function scenarioFailure(page, date, { apiLatency, counters }) {
  const oldTitle = await dayRecipe(page, date);
  const card = await enterPick(page, date);
  if (!card) return { fel: 'inget kort' };
  counters.failReplace = true;
  const r0 = replaceCalls(counters);
  await page.locator(`#recipeGrid .recipe-card[data-id="${card.id}"] .card-title`).first().click();
  await page.waitForFunction(() => document.querySelector('.toast'), null, { timeout: apiLatency + 3000 }).catch(() => {});
  await page.waitForTimeout(200);
  counters.failReplace = false;
  const after = await page.evaluate((date) => ({
    toast: document.querySelector('.toast')?.textContent?.trim() || null,
    pending: !!document.querySelector(`#weekDeluxe article[data-date="${date}"].dlx-pending`),
    visible: [...document.querySelectorAll(`#weekDeluxe [data-date="${date}"]`)].some((e) => e.getBoundingClientRect().height > 0),
    opBusy: !!window._opBusy,
  }), date);
  const restored = (await dayRecipe(page, date)) === oldTitle;
  // Gå in i väljläget igen — ingen kvarglömd felrad.
  await enterPick(page, date);
  const bannerErr = await page.evaluate(() => !!document.querySelector('#replaceBanner .replace-err, #customPickBanner .replace-err'));
  await page.evaluate(() => { window.exitReplaceMode?.(); window.switchTab?.('vecka'); });
  await page.waitForTimeout(200);
  return {
    replaceAnrop: replaceCalls(counters) - r0, återställd: restored, toast: after.toast,
    kvarMarkerad: after.pending, dagenSynlig: after.visible, spärrKvar: after.opBusy, felradVidNyttVal: bannerErr,
  };
}

// Dubbeltryck: två snabba tryck på samma kort → exakt ETT anrop.
async function scenarioDoubleTap(page, date, { apiLatency, counters }) {
  const card = await enterPick(page, date);
  if (!card) return { fel: 'inget kort' };
  const r0 = replaceCalls(counters);
  await page.evaluate((id) => {
    const h = document.querySelector(`#recipeGrid .recipe-card[data-id="${id}"] .card-header`);
    h.click(); h.click();
  }, card.id);
  await page.waitForTimeout(apiLatency + 800);
  return { replaceAnrop: replaceCalls(counters) - r0, planensTitel: (await dayRecipe(page, date)) === card.title ? 'ny' : 'oförändrad' };
}

// Pulsen syns på riktigt: under bakgrundssparningen ska dagkortet ha en
// verklig (inte nollad) animation och opaciteten faktiskt variera.
async function scenarioPendingVisible(page, date, { apiLatency }) {
  const card = await enterPick(page, date);
  if (!card) return { fel: 'inget kort' };
  await page.locator(`#recipeGrid .recipe-card[data-id="${card.id}"] .card-title`).first().click();
  const probe = await page.evaluate(({ date, ms }) => new Promise((resolve) => {
    const t0 = performance.now();
    let minOp = 1; const seen = {};
    const tick = () => {
      const el = document.querySelector(`#weekDeluxe article[data-date="${date}"]`);
      if (el && el.classList.contains('dlx-pending')) {
        const cs = getComputedStyle(el);
        seen[cs.animationName] = cs.animationDuration;
        if (cs.animationName === 'dlxPendingPulse') minOp = Math.min(minOp, Number(cs.opacity));
      }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else resolve({ animationer: seen, minOpacitetUnderPuls: Math.round(minOp * 100) / 100 });
    };
    requestAnimationFrame(tick);
  }), { date, ms: Math.max(200, apiLatency - 150) });
  await page.waitForFunction(() => !window._opBusy, null, { timeout: apiLatency + 3000 }).catch(() => {});
  return probe;
}

// Välj själv och DIREKT därefter Slumpa på en annan dag: Slumpa ska köa bakom
// bakgrundssparningen och köras — inte tappas tyst.
async function scenarioPickThenShuffle(page, date, otherDate, { apiLatency, counters }) {
  const card = await enterPick(page, date);
  if (!card || !otherDate) return { fel: 'inget kort/ingen annan dag' };
  const otherOld = await dayRecipe(page, otherDate);
  const r0 = replaceCalls(counters);
  await page.locator(`#recipeGrid .recipe-card[data-id="${card.id}"] .card-title`).first().click();
  await page.waitForTimeout(200);
  const busyVidSlumpa = await page.evaluate(() => !!window._opBusy);
  await openByt(page, otherDate);
  await page.locator('#dlxSheet .dlx-sheet-row', { hasText: 'Slumpa' }).first().click();
  const pulsDirekt = await page.evaluate((d) => !!document.querySelector(`#weekDeluxe article[data-date="${d}"].dlx-pending`), otherDate);
  await page.waitForFunction(({ d, old }) => {
    const r = window._lastPlan?.days?.find((x) => x.date === d)?.recipe;
    return r && r !== old && !window._opBusy;
  }, { d: otherDate, old: otherOld }, { timeout: apiLatency * 2 + 4000 }).catch(() => {});
  return {
    spärrVidSlumpa: busyVidSlumpa, pulsDirekt,
    replaceAnrop: replaceCalls(counters) - r0,
    valtRecept: (await dayRecipe(page, date)) === card.title ? 'nytt' : 'oförändrat',
    slumpadDag: (await dayRecipe(page, otherDate)) !== otherOld ? 'bytt' : 'oförändrad',
  };
}

// Chevronen i väljläget fäller ut kortet (kolla receptet) utan att välja.
async function scenarioChevronPeek(page, date, { counters }) {
  const card = await enterPick(page, date);
  if (!card) return { fel: 'inget kort' };
  const r0 = replaceCalls(counters);
  const chev = page.locator(`#recipeGrid .recipe-card[data-id="${card.id}"] .card-chevron`).first();
  const box = await chev.boundingBox();
  await chev.click();
  await page.waitForTimeout(150);
  const res = await page.evaluate((id) => ({
    utfällt: !!document.querySelector(`#recipeGrid .recipe-card[data-id="${id}"].open`),
    kvarIVäljläge: !!window.replaceMode,
  }), card.id);
  await page.evaluate(() => { window.exitReplaceMode?.(); window.switchTab?.('vecka'); });
  await page.waitForTimeout(200);
  return { ...res, replaceAnrop: replaceCalls(counters) - r0, tryckyta: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null };
}

// ── Körning ──────────────────────────────────────────────────────────────────

export async function run({ args, browserName = 'chromium', latency = 120 }) {
  const apiLatency = Number(args.get('api-latency') ?? 1500);
  const onlyOffset = args.has('plan-offset') ? Number(args.get('plan-offset')) : null;
  const jsonOut = args.get('json') || null;

  const pw = await loadPlaywright();
  const engine = pw[browserName];
  if (!engine) throw new Error(`Okänd webbläsare: ${browserName}`);
  const exe = engine.executablePath?.();
  if (exe && !existsSync(exe)) {
    console.error(`AVBRUTET: binären för ${browserName} saknas (${exe}).`);
    process.exitCode = 2;
    return;
  }

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await engine.launch();
  const errors = [];
  const leaks = [];
  const result = {
    scenario: 'swap', webbläsare: browserName, stubLatensMs: latency, apiLatensMs: apiLatency,
    körd: new Date().toISOString(),
  };

  try {
    const offsets = onlyOffset != null ? [onlyOffset] : [0, 7];
    for (const planOffset of offsets) {
      const counters = { api: [], apiCalls: [], leaks };
      const { context, page } = await openSession(browser, base, { latency, planOffset, apiLatency, counters, errors });
      const key = `planOffset${planOffset}`;
      const out = {};
      const target = await pickTarget(page);
      if (!target) {
        out.hoppadÖver = 'Ingen plandag efter idag i den här planen';
      } else {
        if (planOffset === offsets[0]) {
          out.slumpa = await scenarioRandom(page, target, { apiLatency, counters });
          out.eko = await scenarioEcho(page, target);
        }
        // Välj själv på en ANNAN dag (om planen har en) så (a) inte skymmer.
        const manualTarget = await pickTarget(page, 1);
        out.väljSjälv = await scenarioManual(page, manualTarget, { apiLatency, counters });
        out.väljSjälvFel = await scenarioFailure(page, manualTarget, { apiLatency, counters });
        out.väljSjälvDubbeltryck = await scenarioDoubleTap(page, manualTarget, { apiLatency, counters });
        out.väljSjälvPuls = await scenarioPendingVisible(page, manualTarget, { apiLatency, counters });
        out.väljSjälvSedanSlumpa = await scenarioPickThenShuffle(page, manualTarget, await pickTarget(page, 2), { apiLatency, counters });
        out.väljSjälvKikaPåRecept = await scenarioChevronPeek(page, manualTarget, { counters });
        out.slumpaFörhandsval = await scenarioShufflePrefetch(page, target, { apiLatency, counters });
        const shotDir = args.get('shots');
        if (shotDir && planOffset === offsets[0]) {
          const { mkdir } = await import('node:fs/promises');
          await mkdir(shotDir, { recursive: true });
          out.skärmdumpLjus = await shotShuffling(page, target, path.join(shotDir, 'shuffling-light.png'), apiLatency);
          await page.emulateMedia({ colorScheme: 'dark' });
          await page.waitForTimeout(200);
          out.skärmdumpMörk = await shotShuffling(page, target, path.join(shotDir, 'shuffling-dark.png'), apiLatency);
          await page.emulateMedia({ colorScheme: 'light' });
        }
      }
      out.apiAnrop = counters.api.map((c) => `${c.method} ${c.path}${c.action ? ` ${c.action}` : ''}`);
      result[key] = out;
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Webbläsarens egen logg av det AVSIKTLIGA 500-svaret i fel-scenariot är
  // inget appfel — allt annat räknas.
  result.fel = errors.filter((e) => !/status of 500 .*@replace-recipe/.test(e));
  result.supabaseLackage = leaks;
  console.log(JSON.stringify(result, null, 2));

  if (jsonOut) {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const file = path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(result, null, 2) + '\n');
    console.log(`\nJSON skriven: ${jsonOut}`);
  }

  if (result.fel.length || leaks.length) {
    console.error('\nFEL: sidan loggade JS-/konsolfel eller försökte nå Supabase på riktigt (se "fel" ovan).');
    process.exitCode = 1;
  }
}

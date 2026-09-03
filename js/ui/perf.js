// Perf-instrumentering — mätfasen (Fas 0) i docs/prestanda-plan-2026-09.md.
//
// PASSIV SOM STANDARD. Utan flaggan registreras inga observers, ingen overlay
// byggs och hjälparna på window sätts inte alls (anropsställena använder
// `window.perfMark?.()` och blir no-ops). Normal drift är alltså opåverkad.
// Slås PÅ med `?perf=1` i URL:en, AV med `?perf=0`.
//
// Flaggan sparas i localStorage. Skälet: kallstarten från hemskärmsikonen (PWA)
// är själva saken vi vill mäta, och manifestets start_url kan inte bära en
// query-parameter. Det är en device-lokal diagnostikflagga, inte delat
// familjeinnehåll — CLAUDE.md:s localStorage-förbud gäller delad data
// (matsedel, inköpslista, bockar), och samma mönster används redan för
// household_id-cachen i supabase-client.js.
//
// Vad som mäts:
//   • Navigation timing (TTFB, DOM) + resource timing (filer, byte)
//   • Boot-milstolpar: js → auth → hushåll → recept → receptvy → idag → matsedel
//   • Supabase-frågor och /api/-anrop, styck och millisekunder
//   • Spans: render:Idag, render:Matsedel, flik:Inköp, flik:Listor, flikbyte:*
//   • Scroll-jämnhet (bildrutor + hackiga rutor) och långa uppgifter
//
// Overlayen har en Kopiera-knapp så siffrorna kan klistras in i en session utan
// devtools — det är hela poängen med att den finns på mobilen.

import { escapeHtml } from '../utils.js';

const FLAG_KEY = 'perf:enabled';

function readFlag() {
  try {
    const q = new URLSearchParams(window.location.search).get('perf');
    if (q === '1') { localStorage.setItem(FLAG_KEY, '1'); return true; }
    if (q === '0') { localStorage.removeItem(FLAG_KEY); return false; }
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    // Privat läge / blockerad lagring → mät bara den här sidvisningen om ?perf=1.
    try { return new URLSearchParams(window.location.search).get('perf') === '1'; } catch { return false; }
  }
}

const ON = readFlag();

export function perfEnabled() { return ON; }

// ── Insamling ────────────────────────────────────────────────────────────────

const state = {
  marks: [],                    // [{ name, t }] — ms sedan navigationsstart
  markSeen: new Set(),
  spans: new Map(),             // namn → { count, total, last, max }
  queries: [],                  // [{ label, ms }] — Supabase REST/auth
  api: [],                      // [{ label, ms }] — egna /api/-anrop
  assets: { count: 0, bytes: 0 },
  longTasks: { count: 0, max: 0 },
  scroll: { frames: 0, janky: 0, worst: 0 },
};

const now = () => Math.round(performance.now());

function perfMark(name) {
  if (!ON) return;
  state.marks.push({ name, t: now() });
  try { performance.mark(`rb:${name}`); } catch { /* mark-kvot slut → strunt i det */ }
  scheduleRender();
}

// Milstolpe som bara ska registreras första gången (t.ex. "Idag renderad").
function perfMarkOnce(name) {
  if (!ON || state.markSeen.has(name)) return;
  state.markSeen.add(name);
  perfMark(name);
}

function perfSpan(name) {
  if (!ON) return null;
  const t0 = performance.now();
  return () => {
    const ms = performance.now() - t0;
    const s = state.spans.get(name) || { count: 0, total: 0, last: 0, max: 0 };
    s.count++;
    s.total += ms;
    s.last = ms;
    if (ms > s.max) s.max = ms;
    state.spans.set(name, s);
    scheduleRender();
  };
}

// Wrappar en window-funktion med en span. Anropas sent (efter att alla moduler
// registrerat sina egna wrappers) så vi mäter det YTTERSTA lagret — det som
// användarens tryck faktiskt startar.
function wrapWindowFn(name, labelFor) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__perfWrapped) return;
  const wrapped = function (...args) {
    const end = perfSpan(labelFor(...args));
    try { return orig.apply(this, args); } finally { end?.(); }
  };
  wrapped.__perfWrapped = true;
  window[name] = wrapped;
}

export function perfInstallLateHooks() {
  if (!ON) return;
  // switchTab: mäter den SYNKRONA delen av flikbytet. Den asynkrona
  // dataladdningen mäts separat (flik:Inköp / flik:Listor) — uppdelningen visar
  // om spinnertiden är nätverk eller rendering.
  wrapWindowFn('switchTab', (tab) => `flikbyte:${String(tab || '?')}`);
}

// ── Resource timing: frågor, API-anrop, filer ────────────────────────────────

function shortLabel(url) {
  try {
    const u = new URL(url, window.location.href);
    const rest = u.pathname.match(/\/(?:rest|auth)\/v1\/([^/?]+)/);
    if (rest) return rest[1];
    if (u.pathname.includes('/api/')) return u.pathname.slice(u.pathname.indexOf('/api/'));
    return u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    return String(url).slice(0, 40);
  }
}

function takeResource(entry) {
  const url = entry.name || '';
  const ms = Math.round(entry.duration);
  if (/supabase\.co\//.test(url)) {
    if (/\/(?:rest|auth)\/v1\//.test(url)) state.queries.push({ label: shortLabel(url), ms });
    return;
  }
  if (/\/api\//.test(url) && url.startsWith(window.location.origin)) {
    state.api.push({ label: shortLabel(url), ms });
    return;
  }
  state.assets.count++;
  // transferSize är 0 för cache-träffar och för cross-origin utan
  // Timing-Allow-Origin — siffran är därför "minst så här mycket".
  state.assets.bytes += entry.transferSize || 0;
}

function startObservers() {
  try {
    performance.getEntriesByType('resource').forEach(takeResource);
    new PerformanceObserver((list) => {
      list.getEntries().forEach(takeResource);
      scheduleRender();
    }).observe({ type: 'resource', buffered: true });
  } catch { /* ingen resource timing → hoppa */ }

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longTasks.count++;
        if (e.duration > state.longTasks.max) state.longTasks.max = e.duration;
      }
      scheduleRender();
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* Safari saknar longtask — scroll-mätningen nedan täcker jank */ }
}

// Scroll-jämnhet: samplar bildrutor bara medan användaren faktiskt scrollar,
// så mätningen inte själv kostar batteri. En ruta över ~24 ms betyder att
// 60 fps-budgeten missats (det Joakim upplever som hack).
function startScrollSampler() {
  let raf = null;
  let last = 0;
  let idle = null;
  function step(ts) {
    if (last) {
      const dt = ts - last;
      state.scroll.frames++;
      if (dt > 24) state.scroll.janky++;
      if (dt > state.scroll.worst) state.scroll.worst = dt;
    }
    last = ts;
    raf = requestAnimationFrame(step);
  }
  window.addEventListener('scroll', () => {
    if (raf == null) { last = 0; raf = requestAnimationFrame(step); }
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      scheduleRender();
    }, 200);
  }, { passive: true });
}

// ── Rapport ──────────────────────────────────────────────────────────────────

const fmtMs = (ms) => `${Math.round(ms)} ms`;

function navRow() {
  const [n] = performance.getEntriesByType('navigation');
  if (!n) return null;
  return {
    ttfb: Math.round(n.responseStart),
    dom: Math.round(n.domInteractive),
    dcl: Math.round(n.domContentLoadedEventEnd),
  };
}

function sumMs(list) { return list.reduce((s, q) => s + q.ms, 0); }

function topList(list, max = 6) {
  const byLabel = new Map();
  for (const item of list) {
    const cur = byLabel.get(item.label) || { label: item.label, count: 0, ms: 0 };
    cur.count++;
    cur.ms += item.ms;
    byLabel.set(item.label, cur);
  }
  return [...byLabel.values()].sort((a, b) => b.ms - a.ms).slice(0, max);
}

function displayMode() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return 'PWA';
    if (window.navigator.standalone) return 'PWA';
  } catch { /* struntsak */ }
  return 'webbläsare';
}

// Textrapport för Kopiera-knappen — formaterad för att klistras in i en session.
function reportText() {
  const nav = navRow();
  const lines = [];
  lines.push(`Receptboken perf — ${new Date().toLocaleString('sv-SE')} · ${displayMode()}`);
  if (nav) lines.push(`Nät: TTFB ${nav.ttfb} ms · DOM ${nav.dom} ms · DCL ${nav.dcl} ms`);
  lines.push(`Filer: ${state.assets.count} st · minst ${Math.round(state.assets.bytes / 1024)} kB överfört`);
  if (state.marks.length) {
    lines.push(`Start: ${state.marks.map((m) => `${m.name} ${m.t}`).join(' · ')} (ms från start)`);
  }
  if (state.queries.length) {
    lines.push(`Frågor: ${state.queries.length} st, ${Math.round(sumMs(state.queries))} ms totalt — ${topList(state.queries).map((q) => `${q.label} ${Math.round(q.ms)}${q.count > 1 ? `/${q.count}st` : ''}`).join(', ')}`);
  }
  if (state.api.length) {
    lines.push(`API: ${state.api.length} st — ${topList(state.api).map((a) => `${a.label} ${Math.round(a.ms)}`).join(', ')}`);
  }
  if (state.spans.size) {
    lines.push(`Render/flikar: ${[...state.spans].map(([k, s]) => `${k} ×${s.count} senast ${Math.round(s.last)} max ${Math.round(s.max)}`).join(' · ')}`);
  }
  if (state.scroll.frames) {
    lines.push(`Scroll: ${state.scroll.frames} rutor, ${state.scroll.janky} hackiga, värst ${Math.round(state.scroll.worst)} ms`);
  }
  if (state.longTasks.count) {
    lines.push(`Långa uppgifter: ${state.longTasks.count} st, max ${Math.round(state.longTasks.max)} ms`);
  }
  return lines.join('\n');
}

// ── Overlay ──────────────────────────────────────────────────────────────────

let host = null;
let expanded = false;
let renderQueued = false;
let lastHtml = '';

function scheduleRender() {
  if (!ON || renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; renderOverlay(); }, 250);
}

function row(label, value) {
  if (!value) return '';
  return `<div class="perf-row"><span class="perf-key">${escapeHtml(label)}</span><span class="perf-val">${escapeHtml(value)}</span></div>`;
}

function renderOverlay() {
  if (!ON) return;
  if (!host) return;

  const nav = navRow();
  const lastMark = state.marks[state.marks.length - 1];
  const pill = `⏱ ${lastMark ? `${lastMark.name} ${lastMark.t} ms` : 'mäter…'} · ${state.queries.length} frågor`;

  let body = '';
  if (expanded) {
    body =
      row('Läge', displayMode()) +
      (nav ? row('Nät', `TTFB ${nav.ttfb} · DOM ${nav.dom} · DCL ${nav.dcl} ms`) : '') +
      row('Filer', `${state.assets.count} st · ≥${Math.round(state.assets.bytes / 1024)} kB`) +
      row('Start', state.marks.map((m) => `${m.name} ${m.t}`).join(' · ')) +
      row('Frågor', state.queries.length
        ? `${state.queries.length} st / ${Math.round(sumMs(state.queries))} ms — ${topList(state.queries).map((q) => `${q.label} ${Math.round(q.ms)}${q.count > 1 ? `×${q.count}` : ''}`).join(', ')}`
        : '') +
      row('API', state.api.length
        ? topList(state.api).map((a) => `${a.label} ${Math.round(a.ms)}`).join(', ')
        : '') +
      row('Render', [...state.spans].map(([k, s]) => `${k} ×${s.count} ${Math.round(s.last)}/${Math.round(s.max)} ms`).join(' · ')) +
      row('Scroll', state.scroll.frames
        ? `${state.scroll.frames} rutor · ${state.scroll.janky} hackiga · värst ${fmtMs(state.scroll.worst)}`
        : '') +
      row('Långa', state.longTasks.count ? `${state.longTasks.count} st · max ${fmtMs(state.longTasks.max)}` : '') +
      `<div class="perf-actions">
         <button type="button" class="perf-btn" data-perf="copy">Kopiera</button>
         <button type="button" class="perf-btn" data-perf="reset">Nolla</button>
         <button type="button" class="perf-btn" data-perf="off">Stäng av</button>
       </div>`;
  }

  const html = `<button type="button" class="perf-pill" data-perf="toggle">${escapeHtml(pill)}</button>${body ? `<div class="perf-body">${body}</div>` : ''}`;
  if (html === lastHtml) return;
  lastHtml = html;
  host.innerHTML = html;
}

async function copyReport(btn) {
  const text = reportText();
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // iOS utan clipboard-behörighet → textarea + execCommand som reserv.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch { ok = false; }
  }
  btn.textContent = ok ? 'Kopierat ✓' : 'Kunde inte kopiera';
  setTimeout(() => { lastHtml = ''; renderOverlay(); }, 1500);
}

function resetCounters() {
  state.spans.clear();
  state.queries.length = 0;
  state.api.length = 0;
  state.scroll = { frames: 0, janky: 0, worst: 0 };
  state.longTasks = { count: 0, max: 0 };
  lastHtml = '';
  renderOverlay();
}

function turnOff() {
  try { localStorage.removeItem(FLAG_KEY); } catch { /* struntsak */ }
  host?.remove();
  host = null;
}

function mountOverlay() {
  if (!ON || host) return;
  host = document.createElement('div');
  host.id = 'perfOverlay';
  host.className = 'perf-overlay';
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-perf]');
    if (!btn) return;
    const action = btn.dataset.perf;
    if (action === 'toggle') { expanded = !expanded; lastHtml = ''; renderOverlay(); }
    else if (action === 'copy') copyReport(btn);
    else if (action === 'reset') resetCounters();
    else if (action === 'off') turnOff();
  });
  document.body.appendChild(host);
  renderOverlay();
}

// ── Uppstart ─────────────────────────────────────────────────────────────────

if (ON) {
  window.perfMark = perfMark;
  window.perfMarkOnce = perfMarkOnce;
  window.perfSpan = perfSpan;
  window.perfReport = reportText;

  perfMark('js');
  startObservers();
  startScrollSampler();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountOverlay);
  } else {
    mountOverlay();
  }
}

window.perfInstallLateHooks = perfInstallLateHooks;

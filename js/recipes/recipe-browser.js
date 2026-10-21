// Receptbläddrare (ny design 2026-10, docs/design/HANDOFF-ny-design.md):
// desktop = master–detail (smal lista till vänster, valt recept till höger),
// mobil = fotogrid två i bredd. Filterchips + gruppering högst upp, inga
// flytande knappar. Detaljen renderas av recipe-detail.js.
//
// Läser state: RECIPES, groupBy, recipeQuick, recipeFilters, replaceMode, customPickMode
// Skriver state: groupBy, recipeQuick, _recipeDetailId, RECIPES[].tested

import { proteinLabel, timeStr, escapeHtml, jsStringAttr, PROTEIN_COLOR, svCompare, recipeImage, recipeImgAttrs } from '../utils.js';

// ── Grupperingsdefinitioner ───────────────────────────────────────────────────
// Varje grupp är en lista av sektioner. Sektionerna utvärderas i ordning;
// första matchen vinner (ett recept hamnar bara i en sektion).
const TYPE_TAGS    = ['soppa', 'pasta', 'wok', 'curry', 'gryta', 'sallad', 'ramen', 'ugn'];
const CUISINE_TAGS = ['italienskt', 'mexikanskt', 'medelhavet', 'mellanöstern', 'indiskt', 'thailändskt', 'japanskt', 'koreanskt', 'kinesiskt', 'vietnamesiskt', 'asiatiskt', 'franskt'];

// Huvudingrediens — keyword-matchning över ingredient-listan, första match vinner.
// Ordning är viktig: specifik före bred. Returnerar null = "annat".
const MAIN_INGREDIENT_RULES = [
  ['lax',       /\blax/i],
  ['räkor',     /\bräkor\b|\bräka\b/i],
  ['kyckling',  /\bkyckling/i],
  ['tofu',      /\btofu\b/i],
  ['tempeh',    /\btempeh\b/i],
  ['kikärtor',  /\bkikärt/i],
  ['linser',    /\blinser\b/i],
  ['bönor',     /\b(svarta|vita|röda|kidney|cannellini|borlotti|pinto|adzuki)\s*bönor\b|\bbönor\b|\bedamame\b/i],
  ['quinoa',    /\bquinoa\b/i],
  ['svamp',     /\b(svamp|champinjon|portobello|shiitake|kantarell|karljohan|trattkantarell)/i],
];

function mainIngredientOf(r) {
  const text = r.ingredients.join('\n');
  for (const [name, pattern] of MAIN_INGREDIENT_RULES) {
    if (pattern.test(text)) return name;
  }
  return 'annat';
}

const GROUP_DEFS = {
  time: {
    label: 'Vardag / helg',
    sections: [
      { id: 'vardag30', label: 'Vardag · under 30 min',    match: r => timeBucket(r) === 'vardag30' },
      { id: 'helg60',   label: 'Helg · upp till en timme', match: r => timeBucket(r) === 'helg60' },
      { id: 'longer',   label: 'Längre eller okänt',       match: r => timeBucket(r) === 'longer' },
    ],
  },
  cuisine: {
    label: 'Kök',
    sections: [
      ...CUISINE_TAGS.map(tag => ({
        id: tag,
        label: tag.charAt(0).toUpperCase() + tag.slice(1),
        match: r => r.tags.includes(tag),
      })),
      { id: 'doh',   label: 'Dishing out health', match: r => r.tags.includes('doh') },
      { id: 'ovrig', label: 'Övrigt',             match: r => !CUISINE_TAGS.some(t => r.tags.includes(t)) },
    ],
  },
  type: {
    label: 'Typ',
    sections: [
      ...TYPE_TAGS.map(tag => ({
        id: tag,
        label: tag.charAt(0).toUpperCase() + tag.slice(1),
        match: r => r.tags.includes(tag),
      })),
      { id: 'ovrig', label: 'Övrigt', match: r => !TYPE_TAGS.some(t => r.tags.includes(t)) },
    ],
  },
  mainIngredient: {
    label: 'Huvudingrediens',
    sections: [
      { id: 'lax',       label: 'Lax' },
      { id: 'räkor',     label: 'Räkor' },
      { id: 'kyckling',  label: 'Kyckling' },
      { id: 'tofu',      label: 'Tofu' },
      { id: 'tempeh',    label: 'Tempeh' },
      { id: 'kikärtor',  label: 'Kikärtor' },
      { id: 'linser',    label: 'Linser' },
      { id: 'bönor',     label: 'Bönor' },
      { id: 'quinoa',    label: 'Quinoa' },
      { id: 'svamp',     label: 'Svamp' },
      { id: 'annat',     label: 'Annat' },
    ].map(s => ({ ...s, match: r => mainIngredientOf(r) === s.id })),
  },
  tested: {
    label: 'Status',
    sections: [
      { id: 'provat',  label: 'Provat',                 match: r => statusBucket(r) === 'provat' },
      { id: 'oprovat', label: 'Inte provat än',         match: r => statusBucket(r) === 'oprovat' },
      { id: 'doh',     label: 'Importerat — granska',   match: r => statusBucket(r) === 'doh' },
    ],
  },
};

// ── Snabbfilter (chips högst upp — ett i taget, "Alla" nollar) ───────────────
const QUICK_FILTERS = [
  { id: 'all',      label: 'Alla',            match: () => true },
  { id: 'veg',      label: 'Vegetariskt',     match: r => r.protein === 'vegetarisk' },
  { id: 'fisk',     label: 'Fisk & skaldjur', match: r => r.protein === 'fisk' },
  { id: 'kyckling', label: 'Kyckling',        match: r => r.protein === 'kyckling' },
  { id: 'under30',  label: 'Under 30 min',    match: r => !!r.time && r.time <= 30 },
  { id: 'provade',  label: 'Provade',         match: r => r.tested },
  { id: 'ugn',      label: 'Ugn',             match: r => r.tags.includes('ugn') },
];

function quickDef() {
  return QUICK_FILTERS.find(q => q.id === (window.recipeQuick || 'all')) || QUICK_FILTERS[0];
}

function renderChips() {
  const host = document.getElementById('recipeChips');
  if (!host) return;
  const cur = quickDef().id;
  host.innerHTML = QUICK_FILTERS.map(q =>
    `<button type="button" class="recipe-chip${q.id === cur ? ' on' : ''}" aria-pressed="${q.id === cur}"
             onclick="setRecipeQuick('${q.id}')">${escapeHtml(q.label)}</button>`).join('');
}

export function setRecipeQuick(id) {
  window.recipeQuick = id;
  renderRecipeBrowser();
}

function renderSortSelect() {
  const sel = document.getElementById('recipeSort');
  if (!sel || sel.dataset.built) return;
  sel.innerHTML = Object.entries(GROUP_DEFS).map(([k, d]) => `<option value="${k}">${escapeHtml(d.label)}</option>`).join('');
  sel.value = window.groupBy || 'time';
  sel.dataset.built = '1';
  sel.addEventListener('change', () => setGroupBy(sel.value));
}

// ── Receptkort — EN markup för listrad (desktop) och fotoruta (mobil) ────────
const ICON_POT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/></svg>';
const ICON_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>';

// Metaraden: proteinprick · protein · tid · ✓ Provat (bara när provat — "Oprövat" visas inte).
export function cardMetaHtml(r) {
  const t = timeStr(r);
  const parts = [escapeHtml(proteinLabel[r.protein] || r.protein || '')];
  if (t) parts.push(escapeHtml(t));
  return `<span class="rc-dot" style="--p:${PROTEIN_COLOR[r.protein] || 'var(--birch)'}"></span>${parts.filter(Boolean).join(' · ')}` +
    (r.tested ? `<span class="rc-tested">${ICON_TICK}Provat</span>` : '');
}

export function thumbHtml(r, cls = 'rc-thumb') {
  const image = recipeImgAttrs(r, '(min-width: 900px) 56px, 45vw');
  return image
    ? `<img class="${cls}" ${image} alt="" loading="lazy" decoding="async" width="56" height="56" onerror="recipeThumbFallback(this)">`
    : `<span class="${cls} is-empty" aria-hidden="true">${ICON_POT}</span>`;
}

// Trasig bildfil → samma gryt-platshållare som recept utan bild (ingen trasig <img>).
window.recipeThumbFallback = function (img) {
  const span = document.createElement('span');
  span.className = img.className + ' is-empty';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICON_POT;
  img.replaceWith(span);
};

export function renderCard(r) {
  const selected = window._recipeDetailId === r.id;
  return `
<article class="recipe-card${selected ? ' is-selected' : ''}" data-id="${r.id}" data-title="${escapeHtml(r.title).toLowerCase()}" data-tested="${r.tested}"
         style="--rail:${PROTEIN_COLOR[r.protein] || 'var(--birch-soft)'}">
  <button type="button" class="rc-main" onclick="recipeCardTap(event, ${r.id})" aria-current="${selected ? 'true' : 'false'}">
    ${thumbHtml(r)}
    <span class="rc-body">
      <span class="card-title">${escapeHtml(r.title)}</span>
      <span class="card-meta">${cardMetaHtml(r)}</span>
    </span>
  </button>
  <button type="button" class="rc-peek" aria-label="Visa receptet" title="Visa receptet"
          onclick="recipeCardPeek(event, ${r.id})">›</button>
</article>`;
}

// Väljläge (Välj själv / egen dag): ett tryck på kortet VÄLJER receptet — det
// är vad bannern lovar. Annars öppnas receptet i detaljpanelen.
export function recipeCardTap(event, id) {
  if (window.replaceMode || window.customPickMode) {
    const r = window.RECIPES?.find(x => x.id === id);
    if (r) window.selectRecipeForDay(event, id, r.title);
    return;
  }
  openRecipeDetail(id);
}

// "›" visar alltid receptet — även i väljläget, så man kan kolla ingredienser
// innan man väljer (väljknappen finns i detaljen).
export function recipeCardPeek(event, id) {
  event?.stopPropagation?.();
  openRecipeDetail(id);
}

function isDesktop() {
  return !!(window.matchMedia && window.matchMedia('(min-width: 900px)').matches);
}

export function openRecipeDetail(id) {
  const r = window.RECIPES.find(x => x.id === id);
  if (!r) return;
  const prev = window._recipeDetailId;
  window._recipeDetailId = id;
  const grid = document.getElementById('recipeGrid');
  if (grid && prev !== id) {
    grid.querySelectorAll('.recipe-card.is-selected').forEach(c => { c.classList.remove('is-selected'); c.querySelector('.rc-main')?.setAttribute('aria-current', 'false'); });
    const card = grid.querySelector(`.recipe-card[data-id="${id}"]`);
    if (card) { card.classList.add('is-selected'); card.querySelector('.rc-main')?.setAttribute('aria-current', 'true'); }
  }
  window.renderRecipeDetail?.(id);
  const rv = document.getElementById('receptView');
  if (!isDesktop() && rv && !rv.classList.contains('rv-detail-open')) {
    rv.classList.add('rv-detail-open');
    document.body.classList.add('rv-detail-lock');
    window.pushSheetHistory?.();   // bakåtknappen stänger detaljen (F196-mönstret)
  }
  const pane = document.getElementById('recipeDetailPane');
  if (pane) pane.scrollTop = 0;
}

export function closeRecipeDetail() {
  const rv = document.getElementById('receptView');
  if (!rv?.classList.contains('rv-detail-open')) return;
  rv.classList.remove('rv-detail-open');
  document.body.classList.remove('rv-detail-lock');
  window.popSheetHistory?.();
}

// ── Sökning + filter + gruppering + render ────────────────────────────────────
// F1 (prestandaplanen): söktexten byggs EN gång per receptobjekt (lazy, cachad
// som r._haystack) i stället för fem toLowerCase-svep per recept och tangent.
// Editorn ersätter objektet vid spar (RECIPES[idx] = updated / push) → ny cache.
// toggleTested muterar bara r.tested, som inte ingår i texten.
function haystack(r) {
  return r._haystack || (r._haystack = [r.title, r.protein || '', ...(r.tags || []), ...(r.ingredients || []), ...(r.instructions || [])].join('\n').toLowerCase());
}
function matchesSearch(r, q) {
  if (!q) return true;
  return haystack(r).includes(q);
}

function timeBucket(r) {
  if (r.time && r.time <= 30) return 'vardag30';
  if (r.time && r.time <= 60) return 'helg60';
  return 'longer';
}

function statusBucket(r) {
  if (r.tested) return 'provat';
  if (r.tags.includes('doh')) return 'doh';
  return 'oprovat';
}

function seasonBucket(r) {
  return r.seasons || [];
}

function passesFilters(r) {
  if (!quickDef().match(r)) return false;
  const f = window.recipeFilters;
  if (!f) return true;
  if (f.tested.size         > 0 && !f.tested.has(statusBucket(r)))               return false;
  if (f.mainIngredient.size > 0 && !f.mainIngredient.has(mainIngredientOf(r)))   return false;
  if (f.time.size           > 0 && !f.time.has(timeBucket(r)))                   return false;
  if (f.tags.size           > 0 && !r.tags.some(t => f.tags.has(t.toLowerCase()))) return false;
  if (f.season.size         > 0 && !seasonBucket(r).some(s => f.season.has(s)))  return false;
  return true;
}

export function renderRecipeBrowser() {
  const grid    = document.getElementById('recipeGrid');
  const empty   = document.getElementById('emptyState');
  const info    = document.getElementById('resultsInfo');
  const q       = document.getElementById('search').value.toLowerCase().trim();
  const groupBy = window.groupBy || 'time';
  const def     = GROUP_DEFS[groupBy] || GROUP_DEFS.time;

  renderChips();
  renderSortSelect();

  const matched = window.RECIPES.filter(r => matchesSearch(r, q) && passesFilters(r));

  const buckets = def.sections.map(s => ({ ...s, recipes: [] }));
  for (const r of matched) {
    const bucket = buckets.find(b => b.match(r));
    if (bucket) bucket.recipes.push(r);
  }
  for (const b of buckets) {
    b.recipes.sort((a, b) => svCompare(a.title, b.title));
  }
  const nonEmpty = buckets.filter(b => b.recipes.length > 0);

  const total = window.RECIPES.length;
  const countEl = document.getElementById('recipeCountLabel');
  if (countEl) countEl.textContent = `${total} recept`;
  const search = document.getElementById('search');
  if (search && total) search.placeholder = `Sök bland ${total} recept…`;

  if (nonEmpty.length === 0) {
    grid.innerHTML  = '';
    empty.style.display = 'block';
    info.textContent = '';
    return;
  }
  empty.style.display = 'none';

  // Desktop: alltid ett valt recept i detaljpanelen (mockup B-Master-detail).
  if (isDesktop() && !matched.some(r => r.id === window._recipeDetailId)) {
    window._recipeDetailId = nonEmpty[0].recipes[0].id;
    window.renderRecipeDetail?.(window._recipeDetailId);
  }

  grid.innerHTML = nonEmpty.map(b => `
    <section class="recipe-section" data-section="${b.id}">
      <h3 class="recipe-section-header">
        <span class="recipe-section-label">${b.label}</span>
        <span class="recipe-section-count">${b.recipes.length}</span>
      </h3>
      <div class="recipe-section-cards">${b.recipes.map(renderCard).join('')}</div>
    </section>
  `).join('');

  const filtersActive =
    (window.recipeFilters &&
    (window.recipeFilters.tested.size + window.recipeFilters.mainIngredient.size + window.recipeFilters.time.size + window.recipeFilters.tags.size + window.recipeFilters.season.size > 0))
    || quickDef().id !== 'all';

  info.textContent = (q || filtersActive)
    ? `Visar ${matched.length} av ${total} recept`
    : '';

  refreshStickyObserver();
}

let stickyObserver = null;
function refreshStickyObserver() {
  if (stickyObserver) stickyObserver.disconnect();

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top, 0px);width:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const safeTopPx = probe.getBoundingClientRect().height;
  probe.remove();

  stickyObserver = new IntersectionObserver(
    entries => entries.forEach(e => e.target.classList.toggle('stuck', e.intersectionRatio < 1)),
    { threshold: [1], rootMargin: `-${safeTopPx + 1}px 0px 0px 0px` }
  );
  document.querySelectorAll('.recipe-section-header').forEach(h => stickyObserver.observe(h));
}

export function setGroupBy(value) {
  window.groupBy = value;
  const sel = document.getElementById('recipeSort');
  if (sel && sel.value !== value) sel.value = value;
  renderRecipeBrowser();
}

export function jumpToRecipe(title) {
  window.switchTab('recept');
  document.getElementById('search').value = '';
  window.updateSearchClear?.();
  renderRecipeBrowser();
  const r = window.RECIPES.find(x => x.title.toLowerCase() === String(title).toLowerCase());
  if (r) {
    openRecipeDetail(r.id);
    const card = document.querySelector(`.recipe-card[data-id="${r.id}"]`);
    card?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
}

export async function toggleTested(event, id) {
  // I väljläget är statusen bara information — trycket går vidare till kortet
  // (som väljer receptet) i stället för att av misstag ändra "provat".
  if (window.replaceMode || window.customPickMode) return;
  event?.stopPropagation?.();
  const btn = event?.currentTarget;
  if (btn) btn.style.opacity = '0.5';
  try {
    const r = window.RECIPES.find(r => r.id === id);
    if (!r) throw new Error();
    const newTested = !r.tested;
    const householdId = await window.getHouseholdId();
    const { error } = await window.db
      .from('recipes')
      .update({ tested: newTested })
      .eq('id', id)
      .eq('household_id', householdId);
    if (error) throw error;
    r.tested = newTested;
    renderRecipeBrowser();
    if (window._recipeDetailId === id) window.renderRecipeDetail?.(id);
  } catch {
    if (btn) {
      btn.style.outline = '2px solid var(--rust)';
      setTimeout(() => { btn.style.outline = ''; }, 1500);
    }
  } finally {
    if (btn) btn.style.opacity = '';
  }
}

window.recipeCardTap       = recipeCardTap;
window.recipeCardPeek      = recipeCardPeek;
window.openRecipeDetail    = openRecipeDetail;
window.closeRecipeDetail   = closeRecipeDetail;
window.setRecipeQuick      = setRecipeQuick;
window.renderRecipeBrowser = renderRecipeBrowser;
window.setGroupBy          = setGroupBy;
window.jumpToRecipe        = jumpToRecipe;
window.toggleTested        = toggleTested;

// Receptbläddrare: rendering av receptkort, gruppering, sökning.
// Läser state: RECIPES, groupBy, isSnapping, scrollUpAccum
// Skriver state: isSnapping, scrollUpAccum

import { proteinLabel, timeStr, renderDetailInner, escapeHtml } from '../utils.js';

// ── Grupperingsdefinitioner ───────────────────────────────────────────────────
// Varje grupp är en lista av sektioner. Sektionerna utvärderas i ordning;
// första matchen vinner (ett recept hamnar bara i en sektion).
const TYPE_TAGS    = ['soppa', 'pasta', 'wok', 'curry', 'gryta', 'sallad', 'ramen', 'ugn'];
const CUISINE_TAGS = ['italienskt', 'mexikanskt', 'medelhavet', 'mellanöstern', 'indiskt', 'thailändskt', 'japanskt', 'koreanskt', 'kinesiskt', 'vietnamesiskt', 'asiatiskt', 'franskt'];

// Huvudingrediens — keyword-matchning över ingredient-listan, första match vinner.
// Ordning är viktig: specifik före bred. Returnerar null = "annat".
const MAIN_INGREDIENT_RULES = [
  ['lax',       /\blax(filé)?(\b|er|en)/i],
  ['räkor',     /\bräkor\b|\bräka\b/i],
  ['kyckling',  /\bkyckling/i],
  ['tofu',      /\btofu\b/i],
  ['tempeh',    /\btempeh\b/i],
  ['kikärtor',  /\bkikärt/i],
  ['linser',    /\blinser\b/i],
  ['bönor',     /\b(svarta|vita|röda|kidney|cannellini|borlotti|pinto|adzuki)\s*bönor\b|\bbönor\b|\bedamame\b/i],
  ['quinoa',    /\bquinoa\b/i],
  ['svamp',     /\b(svamp(ar)?|champinjon|portobello|shiitake|kantarell|karljohan|trattkantarell)\b/i],
];

function mainIngredientOf(r) {
  const text = r.ingredients.join('\n');
  for (const [name, pattern] of MAIN_INGREDIENT_RULES) {
    if (pattern.test(text)) return name;
  }
  return 'annat';
}

const GROUP_DEFS = {
  tested: {
    sections: [
      { id: 'provat',  label: '✓ Provat',                 match: r => r.tested },
      { id: 'oprovat', label: 'Oprövat',                  match: r => !r.tested && !r.tags.includes('doh') },
      { id: 'doh',     label: 'Importerat — granska',     match: r => !r.tested && r.tags.includes('doh') },
    ],
  },
  mainIngredient: {
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
  time: {
    sections: [
      { id: 'vardag30', label: 'Vardag · ≤30 min',     match: r => r.time && r.time <= 30 },
      { id: 'helg60',   label: 'Helg · 31–60 min',     match: r => r.time && r.time > 30 && r.time <= 60 },
      { id: 'longer',   label: 'Längre eller okänt',   match: r => !r.time || r.time > 60 },
    ],
  },
  type: {
    sections: [
      ...TYPE_TAGS.map(tag => ({
        id: tag,
        label: tag.charAt(0).toUpperCase() + tag.slice(1),
        match: r => r.tags.includes(tag),
      })),
      { id: 'ovrig', label: 'Övrigt', match: r => !TYPE_TAGS.some(t => r.tags.includes(t)) },
    ],
  },
  cuisine: {
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
};

// ── Receptkort ────────────────────────────────────────────────────────────────
export function renderCard(r) {
  const t = timeStr(r);
  return `
<div class="recipe-card"
     data-id="${r.id}"
     data-title="${escapeHtml(r.title).toLowerCase()}"
     data-protein="${r.protein}"
     data-tags="${r.tags.join(' ')}"
     data-tested="${r.tested}"
     data-time="${r.time || 999}">
  <div class="card-header" onclick="toggleCard(this.closest('.recipe-card'))">
    <div class="recipe-num">${r.id}</div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(r.title)}</div>
      <div class="card-meta">
        <span class="pill pill-protein">${proteinLabel[r.protein] || r.protein}</span>
        ${t ? `<span class="pill pill-time">⏱ ${t}</span>` : ''}
        <span class="pill ${r.tested ? 'pill-tested' : 'pill-untested'} pill-toggle"
              onclick="toggleTested(event, ${r.id})">${r.tested ? '✓ Provat' : 'Ej provat'}</span>
      </div>
    </div>
    <button class="select-btn"
            onclick="selectRecipeForDay(event,${r.id},'${escapeHtml(r.title).replace(/'/g, "\\'")}')">Välj</button>
    <span class="card-chevron">›</span>
  </div>
  <div class="recipe-detail">
    <div class="detail-inner">${renderDetailInner(r)}</div>
  </div>
</div>`;
}

export function toggleCard(card) {
  const wasOpen = card.classList.contains('open');
  document.querySelectorAll('.recipe-card.open').forEach(c => c.classList.remove('open'));
  if (!wasOpen) {
    card.classList.add('open');
    window.isSnapping   = true;
    window.scrollUpAccum = 0;
    document.querySelector('header').classList.remove('header-hidden');
    setTimeout(() => {
      const hh  = document.querySelector('header').offsetHeight;
      const top = card.getBoundingClientRect().top + window.scrollY - hh - 12;
      window.smoothScrollTo(top, 420);
    }, 680);
  }
}

// ── Sökning + filter + gruppering + render ────────────────────────────────────
function matchesSearch(r, q) {
  if (!q) return true;
  if (r.title.toLowerCase().includes(q))                               return true;
  if (r.protein.toLowerCase().includes(q))                             return true;
  if (r.tags.some(t => t.toLowerCase().includes(q)))                   return true;
  if (r.ingredients.some(i => i.toLowerCase().includes(q)))            return true;
  if (r.instructions.some(s => s.toLowerCase().includes(q)))           return true;
  return false;
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
  const groupBy = window.groupBy || 'tested';
  const def     = GROUP_DEFS[groupBy] || GROUP_DEFS.tested;

  const matched = window.RECIPES.filter(r => matchesSearch(r, q) && passesFilters(r));

  const buckets = def.sections.map(s => ({ ...s, recipes: [] }));
  for (const r of matched) {
    const bucket = buckets.find(b => b.match(r));
    if (bucket) bucket.recipes.push(r);
  }
  for (const b of buckets) {
    b.recipes.sort((a, b) => a.title.localeCompare(b.title, 'sv'));
  }
  const nonEmpty = buckets.filter(b => b.recipes.length > 0);

  const total = window.RECIPES.length;

  if (nonEmpty.length === 0) {
    grid.innerHTML  = '';
    empty.style.display = 'block';
    info.textContent = '';
    return;
  }
  empty.style.display = 'none';

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
    window.recipeFilters &&
    (window.recipeFilters.tested.size + window.recipeFilters.mainIngredient.size + window.recipeFilters.time.size + window.recipeFilters.tags.size + window.recipeFilters.season.size > 0);

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
  renderRecipeBrowser();
}

export function jumpToRecipe(title) {
  window.switchTab('recept');
  document.getElementById('search').value = '';
  renderRecipeBrowser();
  setTimeout(() => {
    document.querySelectorAll('.recipe-card').forEach(card => {
      if (card.dataset.title === title.toLowerCase()) {
        toggleCard(card);
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    });
  }, 50);
}

export async function toggleTested(event, id) {
  event.stopPropagation();
  const pill = event.currentTarget;
  pill.style.opacity = '0.5';
  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_tested', id }),
    });
    if (!res.ok) throw new Error();
    const { tested } = await res.json();
    const r = window.RECIPES.find(r => r.id === id);
    if (r) r.tested = tested;
    pill.className   = `pill ${tested ? 'pill-tested' : 'pill-untested'} pill-toggle`;
    pill.textContent = tested ? '✓ Provat' : 'Ej provat';
    pill.closest('.recipe-card').dataset.tested = tested;
  } catch {
    pill.style.outline = '2px solid var(--rust)';
    setTimeout(() => { pill.style.outline = ''; }, 1500);
  } finally {
    pill.style.opacity = '';
  }
}

// Bakåtkompatibla stubs — recipe-editor.js anropar dessa
function initFilters() { /* no-op: gruppering ersätter filtersystemet */ }

window.renderCard          = renderCard;
window.toggleCard          = toggleCard;
window.renderRecipeBrowser = renderRecipeBrowser;
window.setGroupBy          = setGroupBy;
window.applyFilters        = renderRecipeBrowser;  // alias för bakåtkompat
window.jumpToRecipe        = jumpToRecipe;
window.toggleTested        = toggleTested;
window.initFilters         = initFilters;

// Matsedelsgenerering: datumväljare, inställningar, genereringsknapp.

import { fmtIso, fmtShort, daysBetween, getHolidayName } from '../utils.js';

export function initDatePickers() {
  const today = new Date();
  const end   = new Date(today);
  end.setDate(today.getDate() + 6);

  document.getElementById('startDate').value = fmtIso(today);
  document.getElementById('endDate').value   = fmtIso(end);
  document.getElementById('startDate').addEventListener('change', () => { updateDateHint(); updateSettingsPreview(); });
  document.getElementById('endDate').addEventListener('change',   () => { updateDateHint(); updateSettingsPreview(); });
  updateDateHint();
  updateSettingsPreview();
  initServingsSetting();
}

// ── Portionsskalning (backlog #12): "Vi är X portioner" ──────────────────────
// Hushållets portionsmål bor i households.target_servings (migration 003).
// Går kolumnen inte att läsa (migration ej körd) förblir raden dold — appen
// beter sig då exakt som före funktionen.
async function initServingsSetting() {
  try {
    const householdId = await window.getHouseholdId();
    const { data, error } = await window.db
      .from('households').select('target_servings').eq('id', householdId).maybeSingle();
    if (error || data?.target_servings == null) return;
    const input = document.getElementById('targetServings');
    if (input) input.value = data.target_servings;
    document.getElementById('servingsRow')?.style.setProperty('display', '');
    document.getElementById('servingsDivider')?.style.setProperty('display', '');
  } catch { /* raden förblir dold */ }
}

export function stepServings(delta) {
  const input = document.getElementById('targetServings');
  if (!input) return;
  const min = parseInt(input.min) || 1;
  const max = parseInt(input.max) || 12;
  input.value = Math.min(max, Math.max(min, (parseInt(input.value) || 4) + delta));
  saveTargetServings();
}

let _servingsSaveTimer = null;
export function saveTargetServings() {
  const input = document.getElementById('targetServings');
  if (!input) return;
  const v = Math.min(12, Math.max(1, parseInt(input.value) || 4));
  input.value = v;
  // Debounce: flera snabba +/− blir en enda skrivning.
  clearTimeout(_servingsSaveTimer);
  _servingsSaveTimer = setTimeout(async () => {
    try {
      const householdId = await window.getHouseholdId();
      const { error } = await window.db
        .from('households').update({ target_servings: v }).eq('id', householdId);
      if (error) throw error;
      window.showToast?.(`Sparat — nästa inköpslista skalas till ${v} portioner.`, { type: 'success' });
    } catch {
      window.showToast?.('Kunde inte spara portionsantalet — prova igen.', { type: 'error' });
    }
  }, 600);
}

// Samma säsongsindelning som backend (api/generate.js → getCurrentSeason).
function seasonForDate(dateStr) {
  if (!dateStr) return null;
  const month = parseInt(dateStr.slice(5, 7), 10);
  if (month >= 3 && month <= 5)  return 'vår';
  if (month >= 6 && month <= 8)  return 'sommar';
  if (month >= 9 && month <= 11) return 'höst';
  return 'vinter';
}

export function getSelectedProteins() {
  return Array.from(document.querySelectorAll('.prot-btn.active')).map(b => b.dataset.prot);
}

export function toggleProtein(btn) {
  const willDeactivate = btn.classList.contains('active');
  const activeCount    = document.querySelectorAll('.prot-btn.active').length;
  if (willDeactivate && activeCount <= 1) {
    document.getElementById('protWarning').classList.add('visible');
    return;
  }
  document.getElementById('protWarning').classList.remove('visible');
  btn.classList.toggle('active');
  updateSettingsPreview();
}

export function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  const arrow = document.getElementById('settingsArrow');
  const open  = panel.classList.toggle('open');
  arrow.classList.toggle('open', open);
}

export function updateSettingsPreview() {
  const preview = document.getElementById('settingsPreview');
  if (!preview || !window._allRecipes) return;

  const allowed    = new Set(getSelectedProteins());
  const untestedOk = parseInt(document.getElementById('untestedCount').value) || 0;

  const matching = window._allRecipes.filter(r => {
    if (!allowed.has(r.protein)) return false;
    if (!untestedOk && !r.tested) return false;
    const tags = r.tags || [];
    return tags.includes('vardag30') || tags.includes('helg60');
  });

  const protCounts = {};
  for (const r of window._allRecipes) {
    const tags = r.tags || [];
    if (tags.includes('vardag30') || tags.includes('helg60')) {
      protCounts[r.protein] = (protCounts[r.protein] || 0) + 1;
    }
  }
  document.querySelectorAll('.prot-btn').forEach(btn => {
    const prot  = btn.dataset.prot;
    const count = protCounts[prot] || 0;
    const label = btn.textContent.replace(/\s*\(\d+\)/, '');
    btn.textContent = `${label} (${count})`;
  });

  const startVal = document.getElementById('startDate').value;
  const endVal   = document.getElementById('endDate').value;
  const vegDays  = parseInt(document.getElementById('vegetarianDays').value) || 0;
  const tureDays = parseInt(document.getElementById('tureDays').value) || 0;
  if (startVal && endVal) {
    const diff = daysBetween(startVal, endVal);
    if (vegDays > diff) document.getElementById('vegetarianDays').value = diff;
    if (tureDays > diff) document.getElementById('tureDays').value = diff;
    if (vegDays + tureDays > diff) {
      document.getElementById('vegetarianDays').value = Math.max(0, diff - tureDays);
    }
    document.getElementById('vegetarianDays').max  = diff;
    document.getElementById('tureDays').max        = diff;
    document.getElementById('untestedCount').max   = diff;
  }

  const seasonOn = !!document.getElementById('seasonWeight')?.checked;
  const season   = seasonOn ? seasonForDate(startVal) : null;
  if (season) {
    const inSeason = matching.filter(r => (r.seasons || []).includes(season)).length;
    const seasonLabel = { 'vår': 'våren', sommar: 'sommaren', 'höst': 'hösten', vinter: 'vintern' }[season] || season;
    preview.textContent = `${matching.length} recept matchar dina filter · ${inSeason} i säsong (${seasonLabel})`;
  } else {
    preview.textContent = `${matching.length} recept matchar dina filter`;
  }
  preview.style.color  = matching.length < 3 ? 'var(--rust)' : 'var(--lichen)';
}

const DAY_ABBR = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

export function updateDateHint() {
  const startVal = document.getElementById('startDate').value;
  const endVal   = document.getElementById('endDate').value;
  const hint     = document.getElementById('dateHint');

  if (!startVal || !endVal) { hint.textContent = ''; renderDayToggles([]); return; }

  const diff = daysBetween(startVal, endVal);

  if (diff < 1) {
    hint.textContent = 'Slutdatum måste vara efter startdatum';
    hint.style.color = 'var(--rust)';
    renderDayToggles([]);
    return;
  }
  if (diff > 15) {
    hint.textContent = 'Max 15 dagar';
    hint.style.color = 'var(--rust)';
    renderDayToggles([]);
    return;
  }
  hint.style.color = 'var(--lichen)';

  // Bygg dagslista och rendera toggles
  const days = [];
  const cur  = new Date(startVal + 'T12:00:00');
  for (let i = 0; i < diff; i++) {
    days.push({
      date: cur.toISOString().slice(0, 10),
      abbr: DAY_ABBR[cur.getDay()],
      day:  cur.getDate(),
    });
    cur.setDate(cur.getDate() + 1);
  }
  renderDayToggles(days);

  const blocked = getBlockedDates();
  const active  = diff - blocked.length;
  hint.textContent = active < diff
    ? `${active} av ${diff} dagar planeras (${blocked.length} blockerade)`
    : `${diff} dag${diff !== 1 ? 'ar' : ''} planeras`;
}

function renderDayToggles(days) {
  const container = document.getElementById('dayToggles');
  if (!container) return;
  if (!days.length) { container.innerHTML = ''; container.style.display = 'none'; return; }

  container.style.display = '';
  container.innerHTML = '<p class="day-toggles-hint">Tryck på en dag för att blockera den</p>' +
    days.map(d => {
      const holiday = getHolidayName(d.date);
      const holidayDot = holiday
        ? `<span class="holiday-dot" title="${holiday}" aria-label="${holiday}"></span>`
        : '';
      const isWeekend = d.abbr === 'Lör' || d.abbr === 'Sön';
      const cls = 'day-toggle-chip' + (isWeekend ? ' weekend' : '') + (holiday ? ' holiday' : '');
      return `<button class="${cls}" data-date="${d.date}" onclick="toggleDayBlock(this)"
        ${holiday ? `title="${holiday}"` : ''}>
        <span class="day-toggle-abbr">${d.abbr}</span>
        <span class="day-toggle-num">${d.day}</span>
        ${holidayDot}
      </button>`;
    }).join('');
}

export function toggleDayBlock(btn) {
  btn.classList.toggle('blocked');
  updateDateHint();
  updateSettingsPreview();
}

export function getBlockedDates() {
  return Array.from(document.querySelectorAll('.day-toggle-chip.blocked'))
    .map(b => b.dataset.date);
}

export async function generatePlan() {
  const startVal = document.getElementById('startDate').value;
  const endVal   = document.getElementById('endDate').value;
  const status   = document.getElementById('triggerStatus');
  const btn      = document.getElementById('generateBtn');

  if (!startVal || !endVal) {
    status.textContent = 'Välj start- och slutdatum.';
    status.className   = 'trigger-status error';
    return;
  }
  const diff = daysBetween(startVal, endVal);
  if (diff < 1 || diff > 15) return;

  // Rea-varning: Willys-kampanjer gäller oftast bara innevarande vecka.
  // Slutdatum mer än 7 dagar bort = hög risk att erbjudanden hunnit löpa ut
  // innan familjen handlar. Fråga användaren innan vi kör optimeringen.
  const optimizePricesEl = document.getElementById('optimizePrices');
  const wantsOptimize = !!(optimizePricesEl && optimizePricesEl.checked);
  if (wantsOptimize) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(endVal + 'T00:00:00');
    const daysAhead = Math.round((end - today) / 86400000);
    if (daysAhead > 7) {
      const ok = await window.confirmDialog({
        title: 'Prisoptimera så långt fram?',
        message: 'Reapriserna gäller oftast bara innevarande vecka. Din matsedel sträcker sig ' +
          `till ${endVal} — en del erbjudanden kan ha löpt ut när du handlar.`,
        confirmLabel: 'Fortsätt',
      });
      if (!ok) return;
    }
  }

  btn.disabled       = true;
  status.textContent = 'Genererar matsedel…';
  status.className   = 'trigger-status';

  try {
    const seasonWeightEl = document.getElementById('seasonWeight');
    const wantsSeason = !!(seasonWeightEl && seasonWeightEl.checked);
    const body = {
      start_date:       startVal,
      end_date:         endVal,
      allowed_proteins: getSelectedProteins().join(','),
      untested_count:   parseInt(document.getElementById('untestedCount').value) || 0,
      vegetarian_days:  parseInt(document.getElementById('vegetarianDays').value) || 0,
      ture_days:        parseInt(document.getElementById('tureDays').value) || 0,
      skip_shopping: true,
      blocked_dates:    getBlockedDates(),
      optimize_prices:  wantsOptimize,
      season_weight:    wantsSeason,
    };
    const res  = await window.apiFetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    status.textContent = `✓ Klar! ${data.days} dagar planerade. Bekräfta matsedeln för att bygga inköpslistan.`;
    status.className   = 'trigger-status success';
    btn.disabled       = false;
    // Tyst prisdegradering: Willys-feeden svarade inte/gav inget parsebart.
    // Matsedeln är ändå komplett — berätta diskret att reapriserna saknas.
    if (wantsOptimize && data.pricingDegraded) {
      window.showToast?.('Reapriserna kunde inte hämtas just nu — matsedeln skapades utan prisoptimering.', { type: 'info', duration: 6000 });
    }
    if (data.weeklyPlan) {
      // Hämta arkiv + custom-dagar från Supabase efter generering
      let archive = { plans: [] };
      let customDays = window._customDays || { entries: {} };
      try {
        const householdId = await window.getHouseholdId();
        const [ar, cd] = await Promise.all([
          window.db.from('plan_archives').select('*').eq('household_id', householdId).order('archived_at', { ascending: false }),
          window.db.from('meal_days').select('*').eq('household_id', householdId).is('plan_id', null),
        ]);
        if (ar.data) {
          archive = {
            plans: ar.data.map(row => ({
              startDate:  row.start_date,
              endDate:    row.end_date,
              archivedAt: row.archived_at,
              days:       row.days || [],
            }))
          };
        }
        if (cd.data) {
          const entries = {};
          for (const row of cd.data) {
            entries[row.date] = { note: row.custom_note || '', recipeId: row.recipe_id ?? null, recipeTitle: row.recipe_title_snapshot || '' };
          }
          customDays = { entries };
        }
      } catch { /* OK, kör utan uppdatering */ }
      window.renderWeeklyPlanData(data.weeklyPlan, null, true, archive, customDays);
    }
    // Veckans fynd: spara rea-förslagen och öppna popupen en gång.
    window._weeklyDeals = data.deals || null;
    window.switchTab('vecka');
    // Stäng wizard-sheeten — förslaget + bekräfta-raden är nu det viktiga.
    window.closeBottomSheet?.('planSheet');
    window.showToast?.(`Förslag klart — ${data.days} dagar planerade. Bekräfta för att bygga inköpslistan.`, { type: 'success', duration: 5000 });
    if (window._weeklyDeals?.candidates?.length && window.openDealsPopup) {
      setTimeout(() => window.openDealsPopup(), 400);
    }
  } catch (err) {
    status.textContent = `Fel: ${err.message}`;
    status.className   = 'trigger-status error';
    btn.disabled       = false;
  }
}

// ── Wizard-sheeten (designförslag 2026-07, steg 4) ──────────────────────────
// Genereringen bor i en fokuserad bottensheet i två steg. Fält-ID:na är
// oförändrade — all läsning ovan fungerar oavsett var markupen bor.
export function wizGo(step) {
  const p1 = document.getElementById('wizPage1');
  const p2 = document.getElementById('wizPage2');
  if (!p1 || !p2) return;
  p1.style.display = step === 1 ? '' : 'none';
  p2.style.display = step === 2 ? '' : 'none';
  document.getElementById('wizDot1')?.classList.toggle('on', step >= 1);
  document.getElementById('wizDot2')?.classList.toggle('on', step >= 2);
  document.querySelector('#planSheet .bottom-sheet-panel')?.scrollTo({ top: 0 });
  if (step === 2) updateSettingsPreview();
}

export function toggleTrigger() {
  wizGo(1);
  const status = document.getElementById('triggerStatus');
  if (status) { status.textContent = ''; status.className = 'trigger-status'; }
  window.openBottomSheet?.('planSheet');
}

// CTA från tomma matsedelsvyn: samma sheet.
export function openNewPlan() {
  toggleTrigger();
}

// Touch-vänliga −/+-knappar runt sifferfälten i inställningarna.
export function stepNum(id, delta) {
  const input = document.getElementById(id);
  if (!input) return;
  const min = parseInt(input.min) || 0;
  const max = parseInt(input.max) || 15;
  const cur = parseInt(input.value) || 0;
  input.value = Math.min(max, Math.max(min, cur + delta));
  updateSettingsPreview();
}

window.initDatePickers      = initDatePickers;
window.getSelectedProteins  = getSelectedProteins;
window.toggleProtein        = toggleProtein;
window.toggleSettings       = toggleSettings;
window.updateSettingsPreview = updateSettingsPreview;
window.updateDateHint       = updateDateHint;
window.toggleDayBlock       = toggleDayBlock;
window.getBlockedDates      = getBlockedDates;
window.generatePlan         = generatePlan;
window.toggleTrigger        = toggleTrigger;
window.openNewPlan          = openNewPlan;
window.wizGo                = wizGo;
window.stepNum              = stepNum;
window.stepServings         = stepServings;
window.saveTargetServings   = saveTargetServings;

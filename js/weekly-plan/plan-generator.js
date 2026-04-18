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
  arrow.textContent = open ? '▴' : '▾';
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
  if (startVal && endVal) {
    const diff = daysBetween(startVal, endVal);
    if (vegDays > diff) document.getElementById('vegetarianDays').value = diff;
    document.getElementById('vegetarianDays').max  = diff;
    document.getElementById('untestedCount').max   = diff;
  }

  preview.textContent  = `${matching.length} recept matchar dina filter`;
  preview.style.color  = matching.length < 3 ? 'var(--terracotta)' : 'var(--warm-brown)';
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
    hint.style.color = 'var(--terracotta)';
    renderDayToggles([]);
    return;
  }
  if (diff > 15) {
    hint.textContent = 'Max 15 dagar';
    hint.style.color = 'var(--terracotta)';
    renderDayToggles([]);
    return;
  }
  hint.style.color = 'var(--warm-brown)';

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

  btn.disabled       = true;
  status.textContent = 'Genererar matsedel…';
  status.className   = 'trigger-status';

  try {
    const optimizePricesEl = document.getElementById('optimizePrices');
    const body = {
      start_date:       startVal,
      end_date:         endVal,
      allowed_proteins: getSelectedProteins().join(','),
      untested_count:   parseInt(document.getElementById('untestedCount').value) || 0,
      vegetarian_days:  parseInt(document.getElementById('vegetarianDays').value) || 0,
      skip_shopping: true,
      blocked_dates:    getBlockedDates(),
      optimize_prices:  !!(optimizePricesEl && optimizePricesEl.checked),
    };
    const res  = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Okänt fel');

    status.textContent = `✓ Klar! ${data.days} dagar planerade. Bekräfta matsedeln för att bygga inköpslistan.`;
    status.className   = 'trigger-status success';
    btn.disabled       = false;
    if (data.weeklyPlan) {
      // Arkivet + custom-dagar kan ha uppdaterats — hämta om dem innan rendering.
      let archive = { plans: [] };
      let customDays = window._customDays || { entries: {} };
      try {
        const [ar, cd] = await Promise.all([
          fetch('plan-archive.json?t=' + Date.now()),
          fetch('custom-days.json?t=' + Date.now()),
        ]);
        if (ar.ok) archive = await ar.json();
        if (cd.ok) {
          const cdData = await cd.json();
          customDays = { entries: cdData.entries || {} };
        }
      } catch { /* OK, kör utan uppdatering */ }
      window.renderWeeklyPlanData(data.weeklyPlan, null, true, archive, customDays);
    }
    window.switchTab('vecka');
  } catch (err) {
    status.textContent = `Fel: ${err.message}`;
    status.className   = 'trigger-status error';
    btn.disabled       = false;
  }
}

export function toggleTrigger() {
  document.getElementById('triggerSection').classList.remove('collapsed');
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

// Matsedelsgenerering: datumväljare, inställningar, genereringsknapp.

import { fmtIso, fmtShort } from '../utils.js';

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
    const diff = Math.round(
      (new Date(endVal + 'T12:00:00') - new Date(startVal + 'T12:00:00')) / 864e5
    ) + 1;
    if (vegDays > diff) document.getElementById('vegetarianDays').value = diff;
    document.getElementById('vegetarianDays').max  = diff;
    document.getElementById('untestedCount').max   = diff;
  }

  preview.textContent  = `${matching.length} recept matchar dina filter`;
  preview.style.color  = matching.length < 3 ? 'var(--terracotta)' : 'var(--warm-brown)';
}

export function updateDateHint() {
  const startVal = document.getElementById('startDate').value;
  const endVal   = document.getElementById('endDate').value;
  const hint     = document.getElementById('dateHint');

  if (!startVal || !endVal) { hint.textContent = ''; return; }

  const diff = Math.round(
    (new Date(endVal + 'T12:00:00') - new Date(startVal + 'T12:00:00')) / 864e5
  ) + 1;

  if (diff < 1) {
    hint.textContent = 'Slutdatum måste vara efter startdatum';
    hint.style.color = 'var(--terracotta)';
    return;
  }
  if (diff > 15) {
    hint.textContent = 'Max 15 dagar';
    hint.style.color = 'var(--terracotta)';
    return;
  }
  hint.textContent = `${diff} dag${diff !== 1 ? 'ar' : ''} planeras`;
  hint.style.color = 'var(--warm-brown)';
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
  const diff = Math.round(
    (new Date(endVal + 'T12:00:00') - new Date(startVal + 'T12:00:00')) / 864e5
  ) + 1;
  if (diff < 1 || diff > 15) return;

  btn.disabled       = true;
  status.textContent = 'Genererar matsedel…';
  status.className   = 'trigger-status';

  try {
    const body = {
      start_date:       startVal,
      end_date:         endVal,
      allowed_proteins: getSelectedProteins().join(','),
      untested_count:   parseInt(document.getElementById('untestedCount').value) || 0,
      vegetarian_days:  parseInt(document.getElementById('vegetarianDays').value) || 0,
      skip_shopping: true,
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
    if (data.weeklyPlan) window.renderWeeklyPlanData(data.weeklyPlan, null, true);
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
window.generatePlan         = generatePlan;
window.toggleTrigger        = toggleTrigger;

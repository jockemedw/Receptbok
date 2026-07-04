// Listor-fliken (P1 Familjehubben, M1 gemensamma listor — Cozi-ersättaren).
// Fria delade kom-ihåg-listor: packlistor, ärenden, presentidéer. Allt synkas
// live mellan telefonerna via samma Realtime-mönster som inköpslistan.
//
// Listorna är ofta ÅTERKOMMANDE (packlistor) — därför finns "Nollställ
// bockarna" som synlig knapp: listan blir redo inför nästa resa utan att
// raderna skrivs om.
//
// Data bor i Supabase-tabellerna family_lists + family_list_items
// (db/migrations/005_family_lists.sql). Skrivningar går direkt från klienten —
// RLS skyddar (samma mönster som skafferimarkeringarna). Saknas tabellerna
// (migrationen ej körd) visas ett vänligt "aktiveras snart"-läge.

import { escapeHtml } from '../utils.js';

// ── State (modul-scopat — inget delas med andra slices) ─────────────────────
let _lists = [];          // family_lists-rader (kind='list', även arkiverade)
let _allItems = [];       // ALLA family_list_items i hushållet (familjeskala — litet)
let _openListId = null;   // öppen lista (detaljvy) eller null (översikt)
let _householdId = null;
let _supported = null;    // null = okänt ännu, false = migration 005 ej körd
let _channel = null;
let _editMode = false;    // ✎ Ändra i detaljvyn: ✕ per rad + list-åtgärder
let _renaming = false;
let _showArchived = false;
let _showCreateForm = false;
let _refreshTimer = null;
let _saveTimer = null;
let _tmpSeq = 0;
const _pendingChecks = new Map(); // id → önskat checked-värde (debouncad batch)

function itemsOf(listId) {
  // Sortera alltid på sort_order (inte arrayordning) så en Ångrad rad hamnar
  // tillbaka på sin plats även innan nästa DB-omhämtning.
  return _allItems
    .filter((i) => i.list_id === listId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function isTemp(id) {
  return String(id).startsWith('tmp-');
}

// PostgREST-svaret när tabellen saknas (migration 005 ej körd) — samma
// feature-detect-princip som pantry_items i shopping-list.js.
function isMissingTable(error) {
  const msg = `${error?.code || ''} ${error?.message || ''}`;
  return /42P01|PGRST205|does not exist|schema cache/i.test(msg);
}

// ── Dataladdning ─────────────────────────────────────────────────────────────
async function refreshData() {
  const { data: lists, error } = await window.db
    .from('family_lists')
    .select('*')
    .eq('household_id', _householdId)
    .eq('kind', 'list')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) { _supported = false; return; }
    throw error;
  }
  _supported = true;
  _lists = lists || [];

  const { data: items, error: itemsErr } = await window.db
    .from('family_list_items')
    .select('*')
    .eq('household_id', _householdId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (itemsErr) throw itemsErr;
  _allItems = items || [];
}

export async function loadListsTab() {
  const host = document.getElementById('listsContent');
  if (host && !host.innerHTML) {
    host.innerHTML = `${headingHtml('Listor')}<div class="no-data">Hämtar listorna…</div>`;
  }
  try {
    _householdId = await window.getHouseholdId();
    await refreshData();
  } catch {
    if (_supported !== false && host) {
      host.innerHTML = `${headingHtml('Listor')}
        <div class="no-data"><div class="no-data-icon">📋</div>
          Listorna kunde inte hämtas — prova igen.<br><br>
          <button type="button" class="today-btn today-btn-quiet" onclick="loadListsTab()">Försök igen</button>
        </div>`;
      return;
    }
  }
  render();
  subscribe();
}

// ── Realtime (samma mönster som inköpslistan) ────────────────────────────────
function subscribe() {
  if (_channel || !_householdId || !_supported) return;
  _channel = window.db
    .channel(`family_lists:${_householdId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'family_lists', filter: `household_id=eq.${_householdId}` },
      onRealtime)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'family_list_items', filter: `household_id=eq.${_householdId}` },
      onRealtime)
    .subscribe();
}

function onRealtime(payload) {
  const { table, eventType, new: newRow, old: oldRow } = payload;

  // Eko-dämpning via värdejämförelse (som inköpslistan): den egna optimistiska
  // skrivningen har redan satt samma värde lokalt → serverns event är no-op.
  if (table === 'family_list_items') {
    if (eventType === 'UPDATE' && newRow) {
      const local = _allItems.find((i) => i.id === newRow.id);
      if (local && local.checked === newRow.checked && local.text === newRow.text) return;
    }
    if (eventType === 'INSERT' && newRow && _allItems.some((i) => i.id === newRow.id)) return;
    if (eventType === 'DELETE' && oldRow && !_allItems.some((i) => i.id === oldRow.id)) return;
  } else if (table === 'family_lists') {
    if (eventType === 'UPDATE' && newRow) {
      const local = _lists.find((l) => l.id === newRow.id);
      if (local && local.title === newRow.title && local.archived === newRow.archived
          && local.pinned === newRow.pinned) {
        // Bara updated_at ändrad (parent-touch-triggern) — uppdatera tyst.
        local.updated_at = newRow.updated_at;
        return;
      }
    }
    if (eventType === 'INSERT' && newRow && _lists.some((l) => l.id === newRow.id)) return;
    if (eventType === 'DELETE' && oldRow && !_lists.some((l) => l.id === oldRow.id)) return;
  }
  scheduleRefresh();
}

// Debouncad omhämtning vid ändringar från andra enheter — flera events i följd
// (t.ex. partnern bockar av hela packlistan) blir en enda reload + render.
function scheduleRefresh() {
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    try {
      await refreshData();
      if (_openListId && !_lists.some((l) => l.id === _openListId)) {
        // Öppna listan togs bort på en annan enhet
        _openListId = null;
        window.showToast?.('Listan togs bort på en annan enhet.', { type: 'info' });
      }
      render({ keepAddFocus: true });
    } catch { /* tyst — nästa event eller fliköppning försöker igen */ }
  }, 350);
}

// ── Rendering ────────────────────────────────────────────────────────────────
function headingHtml(title) {
  return `<div class="content-heading"><h1 class="content-heading-title">${escapeHtml(title)}</h1></div>`;
}

// Re-render utan att tappa fokus/halvskriven text i "lägg till"-fältet —
// viktigt när partnern ändrar samtidigt eller vid snabb inmatning av rader.
function render(opts = {}) {
  const host = document.getElementById('listsContent');
  if (!host) return;

  const active = document.activeElement;
  const keepId = (active && (active.id === 'flAddInput' || active.id === 'flNewListInput')) ? active.id : null;
  const keepVal = keepId ? active.value : '';

  if (_supported === false) {
    host.innerHTML = `${headingHtml('Listor')}
      <div class="no-data"><div class="no-data-icon">📋</div>
        Listorna är nästan klara — ett databassteg återstår.<br>
        De dyker upp här av sig själva när det är kört.
      </div>`;
    return;
  }

  const openList = _openListId ? _lists.find((l) => l.id === _openListId) : null;
  host.innerHTML = openList ? detailHtml(openList) : overviewHtml();

  const restoreId = keepId || (opts.keepAddFocus && openList ? 'flAddInput' : null);
  if (restoreId) {
    const inp = document.getElementById(restoreId);
    if (inp) {
      inp.value = keepVal;
      inp.focus();
    }
  }
}

function listMetaHtml(list) {
  const items = itemsOf(list.id);
  if (!items.length) return '<span class="fl-card-meta">Tom lista</span>';
  const left = items.filter((i) => !i.checked).length;
  if (left === 0) return `<span class="fl-card-meta fl-meta-done">Allt avbockat ✓ · ${items.length} rader</span>`;
  return `<span class="fl-card-meta">${left} kvar av ${items.length}</span>`;
}

function overviewHtml() {
  const activeLists = _lists.filter((l) => !l.archived);
  const archivedLists = _lists.filter((l) => l.archived);

  let cards;
  if (!activeLists.length && !archivedLists.length) {
    cards = `<div class="no-data"><div class="no-data-icon">📋</div>
      Inga listor ännu.<br>Skapa familjens första — till exempel en packlista.</div>`;
  } else if (!activeLists.length) {
    cards = '<div class="no-data">Inga aktiva listor — ta fram en arkiverad eller skapa en ny.</div>';
  } else {
    cards = activeLists.map((l) => `
      <button type="button" class="fl-card" onclick="flOpenList('${l.id}')">
        <span class="fl-card-title">${escapeHtml(l.title)}</span>
        ${listMetaHtml(l)}
      </button>`).join('');
  }

  const createHtml = _showCreateForm
    ? `<form class="fl-add-form" onsubmit="flCreateList(event)">
         <input id="flNewListInput" class="fl-input" maxlength="80" autocomplete="off"
                placeholder="Namn, t.ex. Packning fjällen" aria-label="Namn på nya listan">
         <button type="submit" class="today-btn today-btn-primary">Skapa</button>
       </form>`
    : `<button type="button" class="today-btn today-btn-primary fl-create-btn" onclick="flShowCreate()">+ Ny lista</button>`;

  let archivedHtml = '';
  if (archivedLists.length) {
    const rows = _showArchived ? archivedLists.map((l) => `
      <div class="fl-card fl-card-archived">
        <span class="fl-card-title">${escapeHtml(l.title)}</span>
        <span class="fl-archived-actions">
          <button type="button" class="today-btn today-btn-quiet" onclick="flUnarchiveList('${l.id}')">Ta fram</button>
          <button type="button" class="today-btn today-btn-quiet fl-btn-danger" onclick="flDeleteList('${l.id}')">Ta bort</button>
        </span>
      </div>`).join('') : '';
    archivedHtml = `
      <button type="button" class="fl-archived-toggle" onclick="flToggleArchived()"
              aria-expanded="${_showArchived}">
        ${_showArchived ? '▾' : '▸'} Arkiverade (${archivedLists.length})
      </button>${rows}`;
  }

  return `${headingHtml('Listor')}
    <div class="fl-wrap">
      ${cards}
      ${createHtml}
      ${archivedHtml}
    </div>`;
}

function detailHtml(list) {
  const items = itemsOf(list.id);
  const checkedCount = items.filter((i) => i.checked).length;

  const titleHtml = _renaming
    ? `<form class="fl-add-form fl-rename-form" onsubmit="flRenameList(event)">
         <input id="flRenameInput" class="fl-input" maxlength="80" autocomplete="off"
                value="${escapeHtml(list.title)}" aria-label="Nytt namn på listan">
         <button type="submit" class="today-btn today-btn-primary">Spara</button>
         <button type="button" class="today-btn today-btn-quiet" onclick="flCancelRename()">Avbryt</button>
       </form>`
    : `<div class="content-heading fl-detail-heading"><h1 class="content-heading-title">${escapeHtml(list.title)}</h1></div>`;

  const rows = items.map((i) => `
    <li class="shopping-item${i.checked ? ' checked' : ''}" onclick="flToggleItem(this,'${i.id}')">
      <span class="item-checkbox">${i.checked ? '✓' : ''}</span>
      <span class="item-text">${escapeHtml(i.text)}</span>
      ${_editMode ? `<button type="button" class="fl-remove" aria-label="Ta bort raden"
        onclick="event.stopPropagation();flRemoveItem('${i.id}')">✕</button>` : ''}
    </li>`).join('');

  const listHtml = items.length
    ? `<div class="fl-progress" id="flProgress">${checkedCount} av ${items.length} avbockade</div>
       <ul class="fl-items">${rows}</ul>`
    : '<div class="no-data">Inga rader ännu — lägg till nedanför.</div>';

  const actionsHtml = `
    <div class="fl-actions">
      ${items.length ? `<button type="button" class="today-btn today-btn-quiet" onclick="flResetChecks()">↺ Nollställ bockarna</button>` : ''}
      ${_editMode ? `
        <button type="button" class="today-btn today-btn-quiet" onclick="flStartRename()">Byt namn</button>
        <button type="button" class="today-btn today-btn-quiet" onclick="flArchiveList()">Arkivera listan</button>` : ''}
    </div>`;

  return `
    <div class="fl-detail-top">
      <button type="button" class="fl-back" onclick="flBack()">‹ Listor</button>
      <button type="button" class="fl-edit-toggle${_editMode ? ' active' : ''}" onclick="flToggleEdit()">
        ${_editMode ? '✓ Klar' : '✎ Ändra'}
      </button>
    </div>
    ${titleHtml}
    ${listHtml}
    <form class="fl-add-form" onsubmit="flAddItem(event)">
      <input id="flAddInput" class="fl-input" maxlength="200" autocomplete="off"
             placeholder="Lägg till rad…" aria-label="Ny rad">
      <button type="submit" class="today-btn today-btn-quiet fl-add-btn" aria-label="Lägg till">+</button>
    </form>
    ${actionsHtml}`;
}

function updateDetailProgress() {
  const el = document.getElementById('flProgress');
  if (!el || !_openListId) return;
  const items = itemsOf(_openListId);
  el.textContent = `${items.filter((i) => i.checked).length} av ${items.length} avbockade`;
}

// ── Navigering inom fliken ───────────────────────────────────────────────────
export function flOpenList(id) {
  _openListId = id;
  _editMode = false;
  _renaming = false;
  render();
  window.scrollTo({ top: 0 });
}

export function flBack() {
  _openListId = null;
  _editMode = false;
  _renaming = false;
  render();
}

export function flToggleEdit() {
  _editMode = !_editMode;
  _renaming = false;
  render();
}

export function flToggleArchived() {
  _showArchived = !_showArchived;
  render();
}

// ── Bockning (optimistisk + debouncad batch-skrivning, som inköpslistan) ────
export function flToggleItem(el, id) {
  if (_editMode || isTemp(id)) return;
  const it = _allItems.find((i) => i.id === id);
  if (!it) return;
  it.checked = !it.checked;
  el.classList.toggle('checked', it.checked);
  el.querySelector('.item-checkbox').textContent = it.checked ? '✓' : '';
  updateDetailProgress();
  _pendingChecks.set(id, it.checked);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushPendingChecks, 600);
}

async function flushPendingChecks() {
  if (!_pendingChecks.size) return;
  const entries = [..._pendingChecks];
  _pendingChecks.clear();
  const toCheck = entries.filter(([, v]) => v).map(([id]) => id);
  const toUncheck = entries.filter(([, v]) => !v).map(([id]) => id);
  try {
    if (toCheck.length) {
      const { error } = await window.db.from('family_list_items')
        .update({ checked: true }).in('id', toCheck);
      if (error) throw error;
    }
    if (toUncheck.length) {
      const { error } = await window.db.from('family_list_items')
        .update({ checked: false }).in('id', toUncheck);
      if (error) throw error;
    }
  } catch {
    window.showToast?.('Kunde inte spara bockarna — prova igen.', { type: 'error' });
  }
}

// ── Rader: lägg till / ta bort ───────────────────────────────────────────────
export async function flAddItem(ev) {
  ev.preventDefault();
  const inp = document.getElementById('flAddInput');
  const text = (inp?.value || '').trim();
  if (!text || !_openListId) return;
  if (inp) inp.value = '';

  const listItems = itemsOf(_openListId);
  const sortOrder = Math.max(0, ...listItems.map((i) => i.sort_order || 0)) + 1;
  const temp = {
    id: `tmp-${++_tmpSeq}`, list_id: _openListId, household_id: _householdId,
    text, checked: false, sort_order: sortOrder,
  };
  _allItems.push(temp);
  render({ keepAddFocus: true });

  try {
    const { data, error } = await window.db.from('family_list_items')
      .insert({ list_id: _openListId, household_id: _householdId, text, sort_order: sortOrder })
      .select().single();
    if (error) throw error;
    const t = _allItems.find((i) => i.id === temp.id);
    if (t) t.id = data.id;
    render({ keepAddFocus: true });
  } catch {
    _allItems = _allItems.filter((i) => i.id !== temp.id);
    render();
    window.showToast?.('Kunde inte lägga till raden — prova igen.', { type: 'error' });
  }
}

export async function flRemoveItem(id) {
  const it = _allItems.find((i) => i.id === id);
  if (!it || isTemp(id)) return;
  _allItems = _allItems.filter((i) => i.id !== id);
  render();
  try {
    const { error } = await window.db.from('family_list_items').delete().eq('id', id);
    if (error) throw error;
    window.showToast?.(`${it.text} borttagen`, {
      type: 'success',
      action: {
        label: 'Ångra',
        onClick: async () => {
          try {
            const { data, error: insErr } = await window.db.from('family_list_items')
              .insert({
                list_id: it.list_id, household_id: it.household_id,
                text: it.text, checked: it.checked, sort_order: it.sort_order,
              })
              .select().single();
            if (insErr) throw insErr;
            _allItems.push(data);
            render();
          } catch {
            window.showToast?.('Kunde inte ångra — lägg till raden igen.', { type: 'error' });
          }
        },
      },
    });
  } catch {
    _allItems.push(it);
    render();
    window.showToast?.('Kunde inte ta bort raden — prova igen.', { type: 'error' });
  }
}

// ── "Nollställ bockarna" — gör en återkommande lista (packlista) redo igen ──
export async function flResetChecks() {
  const checked = itemsOf(_openListId).filter((i) => i.checked && !isTemp(i.id));
  if (!checked.length) {
    window.showToast?.('Inga bockar att nollställa.', { type: 'info' });
    return;
  }
  const ok = await window.confirmDialog({
    title: 'Nollställ bockarna?',
    message: `${checked.length} ${checked.length === 1 ? 'bock' : 'bockar'} tas bort — raderna behålls.`,
    confirmLabel: 'Nollställ',
  });
  if (!ok) return;
  checked.forEach((i) => { i.checked = false; });
  render();
  try {
    const { error } = await window.db.from('family_list_items')
      .update({ checked: false }).in('id', checked.map((i) => i.id));
    if (error) throw error;
    window.showToast?.('Bockarna nollställda — listan är redo igen.', { type: 'success' });
  } catch {
    checked.forEach((i) => { i.checked = true; });
    render();
    window.showToast?.('Kunde inte nollställa — prova igen.', { type: 'error' });
  }
}

// ── Listor: skapa / byt namn / arkivera / ta bort ───────────────────────────
export function flShowCreate() {
  _showCreateForm = true;
  render();
  document.getElementById('flNewListInput')?.focus();
}

export async function flCreateList(ev) {
  ev.preventDefault();
  const inp = document.getElementById('flNewListInput');
  const title = (inp?.value || '').trim();
  if (!title) return;
  try {
    const { data, error } = await window.db.from('family_lists')
      .insert({ household_id: _householdId, title })
      .select().single();
    if (error) throw error;
    _lists.unshift(data);
    _showCreateForm = false;
    flOpenList(data.id);
    document.getElementById('flAddInput')?.focus();
  } catch {
    window.showToast?.('Kunde inte skapa listan — prova igen.', { type: 'error' });
  }
}

export function flStartRename() {
  _renaming = true;
  render();
  const inp = document.getElementById('flRenameInput');
  if (inp) { inp.focus(); inp.select(); }
}

export function flCancelRename() {
  _renaming = false;
  render();
}

export async function flRenameList(ev) {
  ev.preventDefault();
  const list = _lists.find((l) => l.id === _openListId);
  const inp = document.getElementById('flRenameInput');
  const title = (inp?.value || '').trim();
  if (!list || !title || title === list.title) { flCancelRename(); return; }
  const oldTitle = list.title;
  list.title = title;
  _renaming = false;
  render();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ title }).eq('id', list.id);
    if (error) throw error;
  } catch {
    list.title = oldTitle;
    render();
    window.showToast?.('Kunde inte byta namn — prova igen.', { type: 'error' });
  }
}

export async function flArchiveList() {
  const list = _lists.find((l) => l.id === _openListId);
  if (!list) return;
  list.archived = true;
  flBack();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ archived: true }).eq('id', list.id);
    if (error) throw error;
    window.showToast?.(`${list.title} arkiverad`, {
      type: 'success',
      action: { label: 'Ångra', onClick: () => flUnarchiveList(list.id) },
    });
  } catch {
    list.archived = false;
    render();
    window.showToast?.('Kunde inte arkivera — prova igen.', { type: 'error' });
  }
}

export async function flUnarchiveList(id) {
  const list = _lists.find((l) => l.id === id);
  if (!list) return;
  list.archived = false;
  render();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ archived: false }).eq('id', id);
    if (error) throw error;
  } catch {
    list.archived = true;
    render();
    window.showToast?.('Kunde inte ta fram listan — prova igen.', { type: 'error' });
  }
}

export async function flDeleteList(id) {
  const list = _lists.find((l) => l.id === id);
  if (!list) return;
  const count = itemsOf(id).length;
  const ok = await window.confirmDialog({
    title: 'Ta bort listan?',
    message: count
      ? `"${list.title}" och dess ${count} rader tas bort permanent.`
      : `"${list.title}" tas bort permanent.`,
    confirmLabel: 'Ta bort',
    danger: true,
  });
  if (!ok) return;
  try {
    const { error } = await window.db.from('family_lists').delete().eq('id', id);
    if (error) throw error;
    _lists = _lists.filter((l) => l.id !== id);
    _allItems = _allItems.filter((i) => i.list_id !== id);
    if (_openListId === id) _openListId = null;
    render();
    window.showToast?.(`${list.title} borttagen`, { type: 'success' });
  } catch {
    window.showToast?.('Kunde inte ta bort listan — prova igen.', { type: 'error' });
  }
}

// ── Exponering för inline-onclick (mönstret i hela appen) ────────────────────
window.loadListsTab     = loadListsTab;
window.flOpenList       = flOpenList;
window.flBack           = flBack;
window.flToggleEdit     = flToggleEdit;
window.flToggleArchived = flToggleArchived;
window.flToggleItem     = flToggleItem;
window.flAddItem        = flAddItem;
window.flRemoveItem     = flRemoveItem;
window.flResetChecks    = flResetChecks;
window.flShowCreate     = flShowCreate;
window.flCreateList     = flCreateList;
window.flStartRename    = flStartRename;
window.flCancelRename   = flCancelRename;
window.flRenameList     = flRenameList;
window.flArchiveList    = flArchiveList;
window.flUnarchiveList  = flUnarchiveList;
window.flDeleteList     = flDeleteList;

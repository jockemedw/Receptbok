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
let _lists = [];          // family_lists-rader med kind='list' (även arkiverade)
let _notes = [];          // family_lists-rader med kind='note' (P2 anteckningar)
let _allItems = [];       // ALLA family_list_items i hushållet (familjeskala — litet)
let _openListId = null;   // öppen lista (detaljvy) eller null
let _openNoteId = null;   // öppen anteckning (detaljvy) eller null — högst en av dem
let _householdId = null;
let _supported = null;    // null = okänt ännu, false = migration 005 ej körd
let _channel = null;
let _editMode = false;    // ✎ Ändra i detaljvyn: ✕ per rad + list-åtgärder
let _renaming = false;
let _showArchived = false;
let _showCreateForm = false;
let _showCreateNote = false;
let _quickAddListId = null;   // vilken lista har snabbtillägg (L2) öppet på översikten
let _importing = false;       // Excel-import-vyn öppen
let _importText = '';         // inklistrad/inläst text (i state så den överlever re-render)
let _importParsed = [];       // [{title, items[]}] efter förhandsgranskning
let _decorSupported = null;    // L3: null=okänt, false=migration 006 ej körd (ikon/färg-kolumner saknas)

// L3 — färgnycklar → temavariabler (adapterar till ljust/mörkt) + ikonuppsättning.
const LIST_COLORS = {
  lichen: 'var(--lichen)', rust: 'var(--rust)', ochre: 'var(--ochre)',
  fisk: 'var(--p-fisk)', kott: 'var(--p-kott)', veg: 'var(--p-veg)',
};
const LIST_ICONS = ['🛒', '🏠', '🧳', '💊', '🎁', '🍎', '🔧', '🧺', '🎒', '🌱', '📋', '🐾'];
let _refreshTimer = null;
let _saveTimer = null;
let _noteSaveTimer = null;
let _tmpSeq = 0;
const _pendingChecks = new Map(); // id → önskat checked-värde (debouncad batch)

// Alla family_lists-rader oavsett kind — för realtime-ekodämpning + arkiv.
function allRows() { return _lists.concat(_notes); }
function rowById(id) { return allRows().find((r) => r.id === id); }

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
  // En query för både listor och anteckningar (samma tabell, kind skiljer dem);
  // splittas lokalt. Sorterad så pinnade + senast använda kommer först.
  const { data: rows, error } = await window.db
    .from('family_lists')
    .select('*')
    .eq('household_id', _householdId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) { _supported = false; return; }
    throw error;
  }
  _supported = true;
  _lists = (rows || []).filter((r) => r.kind !== 'note');
  _notes = (rows || []).filter((r) => r.kind === 'note');

  // L3-feature-detect: finns ikon/färg-kolumnerna (migration 006)? Avgörs av om
  // en laddad rad har nyckeln — PostgREST tar med null-kolumner men utelämnar
  // kolumner som inte finns. Kan bara avgöras när minst en rad finns.
  const probe = rows && rows[0];
  if (probe) _decorSupported = 'color' in probe;

  const { data: items, error: itemsErr } = await window.db
    .from('family_list_items')
    .select('*')
    .eq('household_id', _householdId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (itemsErr) throw itemsErr;
  _allItems = items || [];

  // Egna bockar som väntar på debouncad skrivning får inte "hoppa tillbaka"
  // om en omhämtning (t.ex. partnerns ändring) hinner före flushen.
  for (const [id, checked] of _pendingChecks) {
    const it = _allItems.find((i) => i.id === id);
    if (it) it.checked = checked;
  }
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
      const local = allRows().find((l) => l.id === newRow.id);
      if (local && local.title === newRow.title && local.archived === newRow.archived
          && local.pinned === newRow.pinned && local.body === newRow.body) {
        // Bara updated_at ändrad (parent-touch-triggern) — uppdatera tyst.
        local.updated_at = newRow.updated_at;
        return;
      }
    }
    if (eventType === 'INSERT' && newRow && allRows().some((l) => l.id === newRow.id)) return;
    if (eventType === 'DELETE' && oldRow && !allRows().some((l) => l.id === oldRow.id)) return;
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
      if (_openNoteId && !_notes.some((n) => n.id === _openNoteId)) {
        _openNoteId = null;
        window.showToast?.('Anteckningen togs bort på en annan enhet.', { type: 'info' });
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
const KEEP_FIELDS = ['flAddInput', 'flNewListInput', 'flNewNoteInput', 'flNoteTitle', 'flNoteBody', 'flQuickAddInput', 'flImportText', 'flRenameInput'];

function render(opts = {}) {
  const host = document.getElementById('listsContent');
  if (!host) return;

  // Bevara fokus + text + markörläge över en re-render (partnern ändrar
  // samtidigt, snabb inmatning). Gäller list- OCH anteckningsfälten.
  const active = document.activeElement;
  const keepId = (active && KEEP_FIELDS.includes(active.id)) ? active.id : null;
  const keepVal = keepId ? active.value : '';
  const keepStart = keepId && active.selectionStart != null ? active.selectionStart : null;
  const keepEnd = keepId && active.selectionEnd != null ? active.selectionEnd : null;

  if (_supported === false) {
    host.innerHTML = `${headingHtml('Listor')}
      <div class="no-data"><div class="no-data-icon">📋</div>
        Listorna är nästan klara — ett databassteg återstår.<br>
        De dyker upp här av sig själva när det är kört.
      </div>`;
    return;
  }

  const openList = _openListId ? _lists.find((l) => l.id === _openListId) : null;
  const openNote = _openNoteId ? _notes.find((n) => n.id === _openNoteId) : null;
  host.innerHTML = _importing ? importHtml()
    : openNote ? noteDetailHtml(openNote)
    : openList ? detailHtml(openList)
    : overviewHtml();

  const restoreId = keepId || (opts.keepAddFocus && openList ? 'flAddInput' : null);
  if (restoreId) {
    const inp = document.getElementById(restoreId);
    if (inp) {
      inp.value = keepVal;
      inp.focus();
      if (keepStart != null && inp.setSelectionRange) {
        try { inp.setSelectionRange(keepStart, keepEnd); } catch { /* type stödjer ej — strunt */ }
      }
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

function notePreview(note) {
  const body = (note.body || '').replace(/\s+/g, ' ').trim();
  if (!body) return '<span class="fl-note-preview fl-note-empty">Tom anteckning</span>';
  return `<span class="fl-note-preview">${escapeHtml(body)}</span>`;
}

// L1 — förhandsvisning av vad som står på listan (de första oavbockade raderna).
function listPreviewHtml(list) {
  const pending = itemsOf(list.id).filter((i) => !i.checked);
  if (!pending.length) return '';
  const shown = pending.slice(0, 3);
  const more = pending.length - shown.length;
  const lines = shown.map((i) => `<span class="fl-prev-line">${escapeHtml(i.text)}</span>`).join('');
  return `<span class="fl-card-preview">${lines}${more ? `<span class="fl-prev-more">+${more} till</span>` : ''}</span>`;
}

// L2 — snabbtillägg av rad direkt från översikten (utan att öppna listan).
function quickAddRowHtml(list) {
  if (_quickAddListId === list.id) {
    return `<form class="fl-quickadd-form" onsubmit="flQuickAddItem(event)">
      <input id="flQuickAddInput" class="fl-input fl-quickadd-input" maxlength="200" autocomplete="off"
             placeholder="Lägg till rad…" aria-label="Ny rad i ${escapeHtml(list.title)}">
      <button type="submit" class="today-btn today-btn-quiet fl-add-btn" aria-label="Lägg till">+</button>
      <button type="button" class="fl-quickadd-close" onclick="flCloseQuickAdd()" aria-label="Stäng">✕</button>
    </form>`;
  }
  return `<button type="button" class="fl-quickadd-trigger" onclick="flShowQuickAdd('${list.id}')">＋ Lägg till rad</button>`;
}

function listCardHtml(list) {
  // L3 — färgband i vänsterkant + ikon före titeln (om satta, migration 006).
  const accent = list.color && LIST_COLORS[list.color] ? LIST_COLORS[list.color] : '';
  const style = accent ? ` style="--fl-accent:${accent}"` : '';
  const cls = accent ? 'fl-card fl-list-card fl-has-accent' : 'fl-card fl-list-card';
  const icon = list.icon ? `<span class="fl-card-icon" aria-hidden="true">${escapeHtml(list.icon)}</span>` : '';
  return `
    <div class="${cls}"${style}>
      <button type="button" class="fl-card-open" onclick="flOpenList('${list.id}')">
        <span class="fl-card-head">
          <span class="fl-card-title">${icon}${escapeHtml(list.title)}</span>
          ${listMetaHtml(list)}
        </span>
        ${listPreviewHtml(list)}
      </button>
      ${quickAddRowHtml(list)}
    </div>`;
}

function overviewHtml() {
  const activeLists = _lists.filter((l) => !l.archived);
  const activeNotes = _notes.filter((n) => !n.archived);
  const archivedRows = allRows().filter((r) => r.archived);

  // ── Listor ──
  let listCards;
  if (!activeLists.length) {
    listCards = `<div class="no-data no-data-slim">
      Inga listor ännu — skapa en, till exempel en packlista.</div>`;
  } else {
    listCards = activeLists.map(listCardHtml).join('');
  }

  const createListHtml = _showCreateForm
    ? `<form class="fl-add-form" onsubmit="flCreateList(event)">
         <input id="flNewListInput" class="fl-input" maxlength="80" autocomplete="off"
                placeholder="Namn, t.ex. Packning fjällen" aria-label="Namn på nya listan">
         <button type="submit" class="today-btn today-btn-primary">Skapa</button>
       </form>`
    : `<div class="fl-create-row">
         <button type="button" class="today-btn today-btn-primary fl-create-btn" onclick="flShowCreate()">+ Ny lista</button>
         <button type="button" class="fl-import-link" onclick="flShowImport()">Importera från Excel</button>
       </div>`;

  // ── Anteckningar (P2) — eget segment under listorna ──
  let noteCards;
  if (!activeNotes.length) {
    noteCards = `<div class="no-data no-data-slim">
      Delade lappar för familjen — wifi-lösenord, skostorlekar, telefonnummer.</div>`;
  } else {
    noteCards = activeNotes.map((n) => `
      <button type="button" class="fl-card fl-note-card" onclick="flOpenNote('${n.id}')">
        <span class="fl-note-head">
          <span class="fl-card-title">${escapeHtml(n.title)}</span>
          ${n.pinned ? '<span class="fl-pin-flag" aria-label="Fäst på Idag">📌</span>' : ''}
        </span>
        ${notePreview(n)}
      </button>`).join('');
  }

  const createNoteHtml = _showCreateNote
    ? `<form class="fl-add-form" onsubmit="flCreateNote(event)">
         <input id="flNewNoteInput" class="fl-input" maxlength="80" autocomplete="off"
                placeholder="Rubrik, t.ex. Wifi stugan" aria-label="Rubrik på nya anteckningen">
         <button type="submit" class="today-btn today-btn-primary">Skapa</button>
       </form>`
    : `<button type="button" class="today-btn today-btn-quiet fl-create-btn" onclick="flShowCreateNote()">+ Ny anteckning</button>`;

  // ── Arkiverade (listor + anteckningar) ──
  let archivedHtml = '';
  if (archivedRows.length) {
    const rows = _showArchived ? archivedRows.map((r) => `
      <div class="fl-card fl-card-archived">
        <span class="fl-card-title">${escapeHtml(r.title)}${r.kind === 'note' ? ' <span class="fl-archived-kind">anteckning</span>' : ''}</span>
        <span class="fl-archived-actions">
          <button type="button" class="today-btn today-btn-quiet" onclick="flUnarchiveList('${r.id}')">Ta fram</button>
          <button type="button" class="today-btn today-btn-quiet fl-btn-danger" onclick="flDeleteList('${r.id}')">Ta bort</button>
        </span>
      </div>`).join('') : '';
    archivedHtml = `
      <button type="button" class="fl-archived-toggle" onclick="flToggleArchived()"
              aria-expanded="${_showArchived}">
        ${_showArchived ? '▾' : '▸'} Arkiverade (${archivedRows.length})
      </button>${rows}`;
  }

  return `${headingHtml('Listor')}
    <div class="fl-wrap">
      ${listCards}
      ${createListHtml}
      <div class="fl-section-label">Anteckningar</div>
      ${noteCards}
      ${createNoteHtml}
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
    ${_editMode && _decorSupported ? decorPickerHtml(list) : ''}
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

// L3 — utseende-väljare (färg + ikon) i Ändra-läget. Visas bara när migration 006
// är körd (_decorSupported). Val sparas direkt (optimistiskt), "Ingen" nollar.
function decorPickerHtml(list) {
  const colors = Object.keys(LIST_COLORS).map((key) => `
    <button type="button" class="fl-swatch${list.color === key ? ' active' : ''}"
            style="--fl-accent:${LIST_COLORS[key]}" aria-label="Färg ${key}"
            aria-pressed="${list.color === key ? 'true' : 'false'}"
            onclick="flSetColor('${key}')"></button>`).join('');
  const icons = LIST_ICONS.map((emoji) => `
    <button type="button" class="fl-icon-opt${list.icon === emoji ? ' active' : ''}"
            aria-pressed="${list.icon === emoji ? 'true' : 'false'}"
            onclick="flSetIcon('${emoji}')">${emoji}</button>`).join('');
  return `
    <div class="fl-decor">
      <div class="fl-decor-row">
        <span class="fl-decor-label">Färg</span>
        <div class="fl-swatches">${colors}
          <button type="button" class="fl-swatch fl-swatch-none${list.color ? '' : ' active'}"
                  aria-label="Ingen färg" onclick="flSetColor('')">✕</button>
        </div>
      </div>
      <div class="fl-decor-row">
        <span class="fl-decor-label">Ikon</span>
        <div class="fl-icon-opts">${icons}
          <button type="button" class="fl-icon-opt fl-icon-none${list.icon ? '' : ' active'}"
                  aria-label="Ingen ikon" onclick="flSetIcon('')">✕</button>
        </div>
      </div>
    </div>`;
}

// ── Anteckningsdetaljen (P2) ─────────────────────────────────────────────────
function noteDetailHtml(note) {
  return `
    <div class="fl-detail-top">
      <button type="button" class="fl-back" onclick="flBack()">‹ Listor</button>
      <button type="button" class="fl-pin-btn${note.pinned ? ' active' : ''}"
              onclick="flTogglePin()" aria-pressed="${note.pinned ? 'true' : 'false'}">
        📌 ${note.pinned ? 'Fäst' : 'Fäst på Idag'}
      </button>
    </div>
    <input id="flNoteTitle" class="fl-note-title" maxlength="80" autocomplete="off"
           value="${escapeHtml(note.title)}" placeholder="Rubrik" aria-label="Rubrik"
           oninput="flNoteInput()" onblur="flSaveNote()">
    <textarea id="flNoteBody" class="fl-note-body" maxlength="4000" rows="10"
              placeholder="Skriv här — syns för hela familjen." aria-label="Anteckningens text"
              oninput="flNoteInput()" onblur="flSaveNote()">${escapeHtml(note.body || '')}</textarea>
    <div class="fl-note-status" id="flNoteStatus" aria-live="polite"></div>
    <div class="fl-actions">
      <button type="button" class="today-btn today-btn-quiet" onclick="flArchiveNote()">Arkivera</button>
      <button type="button" class="today-btn today-btn-quiet fl-btn-danger" onclick="flDeleteNote()">Ta bort</button>
    </div>`;
}

function setNoteStatus(text) {
  const el = document.getElementById('flNoteStatus');
  if (el) el.textContent = text;
}

// ── Navigering inom fliken ───────────────────────────────────────────────────
export function flOpenList(id) {
  _openListId = id;
  _openNoteId = null;
  _editMode = false;
  _renaming = false;
  render();
  window.scrollTo({ top: 0 });
}

export function flBack() {
  flushNoteSave();       // spara ev. pågående anteckningsredigering innan vi lämnar
  _openListId = null;
  _openNoteId = null;
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

// L2 — snabbtillägg från översikten (samma insert som flAddItem, men mot en
// namngiven lista i stället för den öppna; håller fältet öppet för snabb inmatning).
export function flShowQuickAdd(id) {
  _quickAddListId = id;
  render();
  document.getElementById('flQuickAddInput')?.focus();
}

export function flCloseQuickAdd() {
  _quickAddListId = null;
  render();
}

export async function flQuickAddItem(ev) {
  ev.preventDefault();
  const listId = _quickAddListId;
  const inp = document.getElementById('flQuickAddInput');
  const text = (inp?.value || '').trim();
  if (!text || !listId) return;
  if (inp) inp.value = '';

  const sortOrder = Math.max(0, ...itemsOf(listId).map((i) => i.sort_order || 0)) + 1;
  const temp = {
    id: `tmp-${++_tmpSeq}`, list_id: listId, household_id: _householdId,
    text, checked: false, sort_order: sortOrder,
  };
  _allItems.push(temp);
  render();   // aktiv-elementbevarandet håller kvar fokus i flQuickAddInput

  try {
    const { data, error } = await window.db.from('family_list_items')
      .insert({ list_id: listId, household_id: _householdId, text, sort_order: sortOrder })
      .select().single();
    if (error) throw error;
    const t = _allItems.find((i) => i.id === temp.id);
    if (t) t.id = data.id;
    render();
  } catch {
    _allItems = _allItems.filter((i) => i.id !== temp.id);
    render();
    window.showToast?.('Kunde inte lägga till raden — prova igen.', { type: 'error' });
  }
}

// ── Excel-import (klistra in tabell / CSV-fil) ───────────────────────────────
// Tabbar = kolumner (Excel-copy ger TSV): varje kolumn blir en lista, översta
// raden = listnamn. Utan tabbar: en rad per sak, första raden blir listnamnet.
function parseImport(text) {
  const rows = text.split(/\r?\n/);
  const hasTab = rows.some((l) => l.includes('\t'));
  const out = [];
  if (hasTab) {
    const grid = rows.map((l) => l.split('\t'));
    const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
    for (let c = 0; c < cols; c++) {
      const title = (grid[0][c] || '').trim().slice(0, 80);
      if (!title) continue;
      const items = [];
      for (let r = 1; r < grid.length; r++) {
        const cell = (grid[r][c] || '').trim();
        if (cell) items.push(cell.slice(0, 200));
      }
      out.push({ title, items });
    }
  } else {
    const lines = rows.map((l) => l.trim()).filter(Boolean);
    if (lines.length) out.push({ title: lines[0].slice(0, 80), items: lines.slice(1).map((s) => s.slice(0, 200)) });
  }
  return out;
}

// CSV-fil: normalisera avgränsare till tabb (svensk Excel-export använder ofta ';').
// Görs BARA för filer — inte för inklistrad text, där kommatecken kan ingå i raden.
function normalizeToTabs(text) {
  if (text.includes('\t')) return text;
  const first = text.split(/\r?\n/)[0] || '';
  if (first.includes(';')) return text.replace(/;/g, '\t');
  if (first.includes(',')) return text.replace(/,/g, '\t');
  return text;
}

function importHtml() {
  const preview = _importParsed.length
    ? `<div class="fl-import-preview">
         <div class="fl-import-preview-head">Skapar ${_importParsed.length} ${_importParsed.length === 1 ? 'lista' : 'listor'}:</div>
         ${_importParsed.map((l) => `<div class="fl-import-row">
            <span class="fl-import-name">${escapeHtml(l.title)}</span>
            <span class="fl-import-count">${l.items.length} ${l.items.length === 1 ? 'rad' : 'rader'}</span>
          </div>`).join('')}
       </div>`
    : '';
  const n = _importParsed.length;
  return `
    <div class="fl-detail-top">
      <button type="button" class="fl-back" onclick="flCloseImport()">‹ Listor</button>
    </div>
    <div class="content-heading fl-detail-heading"><h1 class="content-heading-title">Importera</h1></div>
    <p class="fl-import-hjalp">Klistra in celler från Excel: <strong>varje kolumn blir en lista</strong> (översta raden = listnamn). Eller en rad per sak för en enda lista — då blir första raden namnet.</p>
    <textarea id="flImportText" class="fl-note-body fl-import-text" rows="8" autocomplete="off"
              placeholder="Klistra in här…" oninput="flImportInput(this.value)">${escapeHtml(_importText)}</textarea>
    <div class="fl-import-actions">
      <label class="today-btn today-btn-quiet fl-import-file">
        Välj CSV-fil<input type="file" accept=".csv,.tsv,.txt" onchange="flImportFile(event)" hidden>
      </label>
      <button type="button" class="today-btn today-btn-quiet" onclick="flImportPreview()">Förhandsgranska</button>
    </div>
    ${preview}
    <div class="fl-actions">
      <button type="button" class="today-btn today-btn-primary" onclick="flDoImport()"${n ? '' : ' disabled'}>
        ${n ? `Skapa ${n} ${n === 1 ? 'lista' : 'listor'}` : 'Skapa listor'}
      </button>
    </div>`;
}

export function flShowImport() {
  _importing = true;
  _openListId = null;
  _openNoteId = null;
  _quickAddListId = null;
  render();
  window.scrollTo({ top: 0 });
}

export function flCloseImport() {
  _importing = false;
  _importText = '';
  _importParsed = [];
  render();
}

export function flImportInput(val) {
  _importText = val;   // ingen re-render medan man skriver (fokus/caret bevaras)
}

export function flImportPreview() {
  _importParsed = parseImport(_importText);
  if (!_importParsed.length) {
    window.showToast?.('Hittade inga listor i texten — klistra in celler från Excel.', { type: 'info' });
  }
  render();
}

export function flImportFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    _importText = normalizeToTabs(String(reader.result || ''));
    _importParsed = parseImport(_importText);
    render();
  };
  reader.onerror = () => window.showToast?.('Kunde inte läsa filen — prova att klistra in i stället.', { type: 'error' });
  reader.readAsText(file);
}

export async function flDoImport() {
  const parsed = _importParsed.filter((l) => l.title);
  if (!parsed.length) {
    window.showToast?.('Inget att importera — klistra in och förhandsgranska först.', { type: 'info' });
    return;
  }
  let created = 0;
  try {
    for (const l of parsed) {
      const { data: listRow, error } = await window.db.from('family_lists')
        .insert({ household_id: _householdId, title: l.title, kind: 'list' })
        .select().single();
      if (error) throw error;
      if (l.items.length) {
        const rowsToInsert = l.items.map((text, idx) => ({
          list_id: listRow.id, household_id: _householdId, text, sort_order: idx + 1,
        }));
        const { error: itemsErr } = await window.db.from('family_list_items').insert(rowsToInsert);
        if (itemsErr) throw itemsErr;
      }
      created++;
    }
    _importing = false;
    _importText = '';
    _importParsed = [];
    await refreshData();
    render();
    window.showToast?.(`Importerade ${created} ${created === 1 ? 'lista' : 'listor'}.`, { type: 'success' });
  } catch {
    await refreshData();
    render();
    window.showToast?.(created
      ? `Importerade ${created} listor, men något gick fel sen — kolla resultatet.`
      : 'Kunde inte importera — prova igen.', { type: 'error' });
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

// L3 — sätt färg/ikon (optimistiskt, tomt värde = nolla). Guardad av _decorSupported.
async function setDecor(field, value) {
  const list = _lists.find((l) => l.id === _openListId);
  if (!list || !_decorSupported) return;
  const prev = list[field] || null;
  const next = value || null;
  if (prev === next) return;
  list[field] = next;
  render();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ [field]: next }).eq('id', list.id);
    if (error) throw error;
  } catch {
    list[field] = prev;
    render();
    window.showToast?.('Kunde inte spara utseendet — prova igen.', { type: 'error' });
  }
}

export function flSetColor(key) { setDecor('color', key); }
export function flSetIcon(emoji) { setDecor('icon', emoji); }

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
  const row = rowById(id);            // fungerar för både listor och anteckningar
  if (!row) return;
  row.archived = false;
  render();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ archived: false }).eq('id', id);
    if (error) throw error;
  } catch {
    row.archived = true;
    render();
    window.showToast?.('Kunde inte ta fram den — prova igen.', { type: 'error' });
  }
}

export async function flDeleteList(id) {
  const row = rowById(id);
  if (!row) return;
  const isNote = row.kind === 'note';
  const count = itemsOf(id).length;
  const ok = await window.confirmDialog({
    title: isNote ? 'Ta bort anteckningen?' : 'Ta bort listan?',
    message: count
      ? `"${row.title}" och dess ${count} rader tas bort permanent.`
      : `"${row.title}" tas bort permanent.`,
    confirmLabel: 'Ta bort',
    danger: true,
  });
  if (!ok) return;
  try {
    const { error } = await window.db.from('family_lists').delete().eq('id', id);
    if (error) throw error;
    _lists = _lists.filter((l) => l.id !== id);
    _notes = _notes.filter((n) => n.id !== id);
    _allItems = _allItems.filter((i) => i.list_id !== id);
    if (_openListId === id) _openListId = null;
    if (_openNoteId === id) _openNoteId = null;
    render();
    window.showToast?.(`${row.title} borttagen`, { type: 'success' });
  } catch {
    window.showToast?.('Kunde inte ta bort — prova igen.', { type: 'error' });
  }
}

// ── Anteckningar (P2): skapa / öppna / redigera / fästa / arkivera / ta bort ─
export function flShowCreateNote() {
  _showCreateNote = true;
  render();
  document.getElementById('flNewNoteInput')?.focus();
}

export async function flCreateNote(ev) {
  ev.preventDefault();
  const inp = document.getElementById('flNewNoteInput');
  const title = (inp?.value || '').trim();
  if (!title) return;
  try {
    const { data, error } = await window.db.from('family_lists')
      .insert({ household_id: _householdId, title, kind: 'note' })
      .select().single();
    if (error) throw error;
    _notes.unshift(data);
    _showCreateNote = false;
    flOpenNote(data.id);
    document.getElementById('flNoteBody')?.focus();
  } catch {
    window.showToast?.('Kunde inte skapa anteckningen — prova igen.', { type: 'error' });
  }
}

export function flOpenNote(id) {
  _openNoteId = id;
  _openListId = null;
  _editMode = false;
  _renaming = false;
  render();
  window.scrollTo({ top: 0 });
}

// Fritext sparas debouncat medan man skriver (som bock-batchen) — ingen re-render
// under skrivandet, bara en diskret statusrad uppdateras direkt i DOM.
export function flNoteInput() {
  setNoteStatus('Sparar…');
  clearTimeout(_noteSaveTimer);
  _noteSaveTimer = setTimeout(() => { flSaveNote(); }, 900);
}

export async function flSaveNote() {
  clearTimeout(_noteSaveTimer);
  const note = _openNoteId ? _notes.find((n) => n.id === _openNoteId) : null;
  const titleEl = document.getElementById('flNoteTitle');
  const bodyEl = document.getElementById('flNoteBody');
  if (!note || !titleEl || !bodyEl) return;
  const title = titleEl.value.trim() || 'Utan rubrik';
  const body = bodyEl.value;
  if (note.title === title && note.body === body) { setNoteStatus('Sparad'); return; }
  note.title = title;
  note.body = body;
  try {
    const { error } = await window.db.from('family_lists')
      .update({ title, body }).eq('id', note.id);
    if (error) throw error;
    setNoteStatus('Sparad');
  } catch {
    setNoteStatus('Kunde inte spara');
    window.showToast?.('Kunde inte spara anteckningen — prova igen.', { type: 'error' });
  }
}

// Anropas av flBack: spara direkt om en debouncad skrivning väntar.
function flushNoteSave() {
  if (_noteSaveTimer) { clearTimeout(_noteSaveTimer); _noteSaveTimer = null; flSaveNote(); }
}

export async function flTogglePin() {
  await flSaveNote();       // säkra ev. text först
  const note = _openNoteId ? _notes.find((n) => n.id === _openNoteId) : null;
  if (!note) return;
  const next = !note.pinned;
  note.pinned = next;
  render();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ pinned: next }).eq('id', note.id);
    if (error) throw error;
    window.showToast?.(next ? 'Fäst på Idag.' : 'Borttagen från Idag.', { type: 'success' });
  } catch {
    note.pinned = !next;
    render();
    window.showToast?.('Kunde inte ändra — prova igen.', { type: 'error' });
  }
}

export async function flArchiveNote() {
  flushNoteSave();
  const note = _openNoteId ? _notes.find((n) => n.id === _openNoteId) : null;
  if (!note) return;
  note.archived = true;
  flBack();
  try {
    const { error } = await window.db.from('family_lists')
      .update({ archived: true }).eq('id', note.id);
    if (error) throw error;
    window.showToast?.(`${note.title} arkiverad`, {
      type: 'success',
      action: { label: 'Ångra', onClick: () => flUnarchiveList(note.id) },
    });
  } catch {
    note.archived = false;
    render();
    window.showToast?.('Kunde inte arkivera — prova igen.', { type: 'error' });
  }
}

export async function flDeleteNote() {
  const note = _openNoteId ? _notes.find((n) => n.id === _openNoteId) : null;
  if (!note) return;
  clearTimeout(_noteSaveTimer);
  const ok = await window.confirmDialog({
    title: 'Ta bort anteckningen?',
    message: `"${note.title}" tas bort permanent.`,
    confirmLabel: 'Ta bort',
    danger: true,
  });
  if (!ok) return;
  try {
    const { error } = await window.db.from('family_lists').delete().eq('id', note.id);
    if (error) throw error;
    _notes = _notes.filter((n) => n.id !== note.id);
    _openNoteId = null;
    render();
    window.showToast?.(`${note.title} borttagen`, { type: 'success' });
  } catch {
    window.showToast?.('Kunde inte ta bort — prova igen.', { type: 'error' });
  }
}

// Pinnade anteckningar för Idag-fliken (P2). Egen lättviktsquery så Idag inte
// beror på att Listor-fliken öppnats. Tyst [] om tabellen saknas/fel.
export async function loadPinnedNotes() {
  try {
    const householdId = await window.getHouseholdId();
    const { data, error } = await window.db
      .from('family_lists')
      .select('id, title, body')
      .eq('household_id', householdId)
      .eq('kind', 'note')
      .eq('pinned', true)
      .eq('archived', false)
      .order('updated_at', { ascending: false });
    if (error) return [];
    return data || [];
  } catch {
    return [];
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
window.flSetColor       = flSetColor;
window.flSetIcon        = flSetIcon;
window.flShowQuickAdd   = flShowQuickAdd;
window.flCloseQuickAdd  = flCloseQuickAdd;
window.flQuickAddItem   = flQuickAddItem;
window.flShowImport     = flShowImport;
window.flCloseImport    = flCloseImport;
window.flImportInput    = flImportInput;
window.flImportPreview  = flImportPreview;
window.flImportFile     = flImportFile;
window.flDoImport       = flDoImport;
window.flShowCreateNote = flShowCreateNote;
window.flCreateNote     = flCreateNote;
window.flOpenNote       = flOpenNote;
window.flNoteInput      = flNoteInput;
window.flSaveNote       = flSaveNote;
window.flTogglePin      = flTogglePin;
window.flArchiveNote    = flArchiveNote;
window.flDeleteNote     = flDeleteNote;
window.loadPinnedNotes  = loadPinnedNotes;

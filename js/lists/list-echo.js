// Eko-kontroll för family_lists-realtime: stämmer ett UPDATE-event redan med
// den lokala raden? Då är det vårt eget eko (eller bara parent-touch-triggerns
// updated_at) och listvyn behöver inte hämtas om. Ren funktion — inga DOM-
// eller window-beroenden, testas i tests/list-echo.test.js.
//
// Alla fält som klienten skriver måste jämföras — annars tappas partnerns
// ändring (färg/ikon via setDecor syntes inte förrän nästa omhämtning).
// color/icon kan saknas helt (migration 006 ej körd) → undefined = null.

export const LIST_ECHO_FIELDS = ['title', 'archived', 'pinned', 'body', 'color', 'icon'];

const norm = (v) => (v === undefined ? null : v);

export function isListRowEcho(local, newRow) {
  if (!local || !newRow) return false;
  return LIST_ECHO_FIELDS.every((k) => norm(local[k]) === norm(newRow[k]));
}

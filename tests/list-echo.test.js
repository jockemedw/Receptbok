// Regressiontester för js/lists/list-echo.js — ekokontrollen som avgör om ett
// family_lists-UPDATE från realtime redan stämmer med den lokala raden.
// Körs med `node tests/list-echo.test.js` — inga deps.
//
// Bevakar:
//   1. Bara updated_at ändrad (parent-touch / eget eko) → eko
//   2. Partnerns färg- eller ikonbyte → INTE eko (omhämtning)
//   3. Övriga fält (titel, arkiverad, fäst, anteckningstext) → INTE eko
//   4. color/icon-kolumnerna saknas (migration 006 ej körd) → eko
//   5. Saknad lokal rad → inte eko

import { isListRowEcho } from "../js/lists/list-echo.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: ${e}\n     faktisk:   ${a}`);
  }
}

const row = (over = {}) => ({
  id: "L1", household_id: "h", title: "Packlista", archived: false, pinned: false,
  body: null, color: "lichen", icon: "🎒", updated_at: "2026-10-17T10:00:00+00:00", ...over,
});

// ── 1. Eko ────────────────────────────────────────────────────────────────────
assertEq(isListRowEcho(row(), row({ updated_at: "2026-10-17T10:05:00+00:00" })), true,
  "bara updated_at ändrad → eko");

// ── 2. Färg/ikon ──────────────────────────────────────────────────────────────
assertEq(isListRowEcho(row(), row({ color: "rust" })), false, "bara color ändrad → inte eko");
assertEq(isListRowEcho(row(), row({ color: null })), false, "color borttagen → inte eko");
assertEq(isListRowEcho(row(), row({ icon: "🏖️" })), false, "bara icon ändrad → inte eko");
assertEq(isListRowEcho(row({ icon: null }), row({ icon: "🏖️" })), false, "icon tillagd → inte eko");

// ── 3. Övriga fält ────────────────────────────────────────────────────────────
assertEq(isListRowEcho(row(), row({ title: "Packlista fjällen" })), false, "titel ändrad → inte eko");
assertEq(isListRowEcho(row(), row({ archived: true })), false, "arkiverad → inte eko");
assertEq(isListRowEcho(row(), row({ pinned: true })), false, "fäst → inte eko");
assertEq(isListRowEcho(row({ body: "a" }), row({ body: "ab" })), false, "anteckningstext ändrad → inte eko");

// ── 4. Kolumner saknas (migration 006 ej körd) ───────────────────────────────
{
  const strip = ({ color, icon, ...r }) => r;
  assertEq(isListRowEcho(strip(row()), strip(row({ updated_at: "x" }))), true,
    "color/icon saknas på båda sidor → eko");
}

// ── 5. Saknad lokal rad ───────────────────────────────────────────────────────
assertEq(isListRowEcho(undefined, row()), false, "ingen lokal rad → inte eko");

// ── Resultat ──────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(failures.join("\n\n"));
}
console.log(`${passed} passerade, ${failed} failade.`);
if (failed > 0) process.exit(1);
console.log("✓ Alla list-echo-tester godkända.");

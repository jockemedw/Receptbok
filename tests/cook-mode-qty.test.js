// Test av R10-fixen: fmtQty/parseQty i js/ui/cook-mode.js.
// Icke-exporterade funktioner — klipp ut källkoden mellan QTY_UNITS och
// slutet av fmtQty och kör den via new Function (samma teknik som används
// för att testa andra icke-exporterade hjälpfunktioner i repot).
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../js/ui/cook-mode.js'), 'utf8');

const startMarker = 'const QTY_UNITS';
const endMarker = '\nlet _cookIngs';
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) {
  throw new Error('Kunde inte hitta QTY_UNITS…fmtQty i cook-mode.js — har filen ändrats?');
}
const snippet = src.slice(startIdx, endIdx);

const fn = new Function(`${snippet}\nreturn { parseQty, fmtQty };`);
const { parseQty, fmtQty } = fn();

let passed = 0;
function assertEq(actual, expected, msg) {
  assert.strictEqual(actual, expected, msg);
  passed++;
}

// ── Faktor 1: raden ska vara oförändrad (ingLineHtml-nivån testas inte här,
// men fmtQty ska ändå ge rimliga värden om den anropas direkt) ─────────────
{
  const p = parseQty('0,1 kg mjöl');
  assertEq(p.num, 0.1, 'parseQty: 0,1 kg mjöl → num 0.1');
  assertEq(fmtQty(p.num * 1, p.unit), '0,1 kg', 'fmtQty vid faktor 1: 0,1 kg oförändrat (inget 0,25-golv)');
}

{
  const p = parseQty('0,3 kg smör');
  assertEq(fmtQty(p.num * 1, p.unit), '0,3 kg', 'fmtQty vid faktor 1: 0,3 kg oförändrat');
}

{
  const p = parseQty('0,7 dl grädde');
  assertEq(fmtQty(p.num * 1, p.unit), '0,7 dl', 'fmtQty vid faktor 1: 0,7 dl oförändrat');
}

{
  const p = parseQty('½ dl vatten');
  assert.ok(p, 'parseQty ska tolka inledande ½ som mängd');
  assertEq(p.num, 0.5, 'parseQty: ½ dl → num 0.5');
  assertEq(p.unit, 'dl', 'parseQty: ½ dl → unit dl');
  assertEq(fmtQty(p.num * 1, p.unit), '0,5 dl', 'fmtQty vid faktor 1: ½ dl → 0,5 dl');
}

// ── "1½" som blandad mängd ──────────────────────────────────────────────
{
  const p = parseQty('1½ dl mjölk');
  assert.ok(p, 'parseQty ska tolka "1½" som mängd');
  assertEq(p.num, 1.5, 'parseQty: 1½ dl → num 1.5');
}

// ── Faktor 2: verklig skalning, inget kvarts-golv för kg/l/dl/cl/ml/g ────
{
  const p = parseQty('0,1 kg mjöl');
  assertEq(fmtQty(p.num * 2, p.unit), '0,2 kg', 'fmtQty vid faktor 2: 0,1 kg → 0,2 kg');
}

{
  const p = parseQty('0,3 kg smör');
  assertEq(fmtQty(p.num * 2, p.unit), '0,6 kg', 'fmtQty vid faktor 2: 0,3 kg → 0,6 kg');
}

{
  const p = parseQty('0,7 dl grädde');
  assertEq(fmtQty(p.num * 2, p.unit), '1,4 dl', 'fmtQty vid faktor 2: 0,7 dl → 1,4 dl');
}

{
  const p = parseQty('½ dl vatten');
  assertEq(fmtQty(p.num * 2, p.unit), '1 dl', 'fmtQty vid faktor 2: ½ dl → 1 dl (trimmad decimal)');
}

// ── Styck-artade enheter behåller kvartar/bråk ───────────────────────────
{
  const p = parseQty('1 st gurka');
  assertEq(fmtQty(p.num * 2, p.unit), '2 st', 'fmtQty vid faktor 2: 1 st → 2 st');
}

console.log(`cook-mode-qty.test.js: ${passed} assertions OK`);

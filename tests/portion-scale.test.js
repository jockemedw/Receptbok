// Regressiontester för js/ui/portion-scale.js.
// Körs med `node tests/portion-scale.test.js` — inga externa deps.
//
// Bevakar att portionsskalningen i matlagningsläget:
//   1. Skalar ledande mängd ("600 g torsk")
//   2. Skalar doh-format i parentes ("zucchini (400 g)")
//   3. Hanterar bråk, decimaler (komma) och intervall
//   4. Lämnar mängdlösa skafferivaror och faktor 1 orörda
//   5. Formaterar tillbaka snyggt (heltal / bråk / decimal)

import { scaleIngredient, fmtNum } from "../js/ui/portion-scale.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: ${JSON.stringify(expected)}\n     faktisk:   ${JSON.stringify(actual)}`);
  }
}

// ─── Ledande mängd ────────────────────────────────────────────────
assertEq(scaleIngredient("600 g torsk", 2), "1200 g torsk", "ledande g ×2");
assertEq(scaleIngredient("600 g torsk", 0.5), "300 g torsk", "ledande g ×0.5");
assertEq(scaleIngredient("2 dl grädde", 2), "4 dl grädde", "ledande dl ×2");
assertEq(scaleIngredient("4 vitlöksklyftor", 0.5), "2 vitlöksklyftor", "ledande styck ×0.5");
assertEq(scaleIngredient("1 gul lök", 2), "2 gul lök", "ledande 1 ×2");

// ─── Doh-format (parentes) ────────────────────────────────────────
assertEq(scaleIngredient("zucchini (400 g)", 2), "zucchini (800 g)", "doh-parentes ×2");
assertEq(scaleIngredient("purjolök (1 st)", 2), "purjolök (2 st)", "doh-parentes styck ×2");
assertEq(scaleIngredient("lax (mittbit, 560 g)", 0.5), "lax (mittbit, 280 g)", "doh-parentes med klausul ×0.5");

// ─── Bråk in och ut ───────────────────────────────────────────────
assertEq(scaleIngredient("½ dl olja", 2), "1 dl olja", "½ ×2 → 1");
assertEq(scaleIngredient("1 dl grädde", 0.5), "½ dl grädde", "1 ×0.5 → ½");
assertEq(scaleIngredient("1½ msk smör", 2), "3 msk smör", "1½ ×2 → 3");
assertEq(scaleIngredient("3 dl mjölk", 0.5), "1½ dl mjölk", "3 ×0.5 → 1½");

// ─── Decimaler (svenskt komma) ────────────────────────────────────
assertEq(scaleIngredient("2,5 dl buljong", 2), "5 dl buljong", "2,5 ×2 → 5");
assertEq(scaleIngredient("2,4 dl vatten", 0.5), "1,2 dl vatten", "2,4 ×0.5 → 1,2 (komma bevaras)");

// ─── Intervall ────────────────────────────────────────────────────
assertEq(scaleIngredient("4-6 dl vatten", 2), "8-12 dl vatten", "intervall ×2");
assertEq(scaleIngredient("2–3 vitlöksklyftor", 2), "4–6 vitlöksklyftor", "intervall (en-dash) ×2");

// ─── Gruppetikett (kolon) ─────────────────────────────────────────
assertEq(scaleIngredient("Sås: 2 dl grädde", 2), "Sås: 4 dl grädde", "kolon: skala efter etiketten");
assertEq(scaleIngredient("Topping:", 2), "Topping:", "kolon utan värde → orört");

// ─── Orörda fall ──────────────────────────────────────────────────
assertEq(scaleIngredient("salt och peppar", 2), "salt och peppar", "skafferivara utan mängd → orört");
assertEq(scaleIngredient("600 g torsk", 1), "600 g torsk", "faktor 1 → identiskt");
assertEq(scaleIngredient("olja till stekning", 2), "olja till stekning", "ingen siffra → orört");
assertEq(scaleIngredient("", 2), "", "tom sträng → tom");

// ─── fmtNum direkt ────────────────────────────────────────────────
assertEq(fmtNum(2), "2", "fmtNum heltal");
assertEq(fmtNum(0.5), "½", "fmtNum 0.5 → ½");
assertEq(fmtNum(0.25), "¼", "fmtNum 0.25 → ¼");
assertEq(fmtNum(1.5), "1½", "fmtNum 1.5 → 1½");
assertEq(fmtNum(1.2), "1,2", "fmtNum 1.2 → 1,2 (komma)");

// ─── Slutrapport ──────────────────────────────────────────────────
console.log(`\n${passed} passerade, ${failed} failade.`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla portion-scale-tester godkända.");

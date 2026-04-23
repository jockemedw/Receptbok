// Regressiontester för Willys-dispatch-kedjan: sök, cart-klient, matcher, endpoint.
// Körs med `node tests/dispatch-to-willys.test.js` — inga externa deps.
// Hook: se .claude/settings.json — blockerar commit vid regression.

import { extractOfferCanon, rejectsMatch } from "../api/_shared/willys-matcher.js";

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

function assertTrue(cond, desc) { assertEq(!!cond, true, desc); }
function assertFalse(cond, desc) { assertEq(!!cond, false, desc); }

// ─── Task 1: extractOfferCanon + rejectsMatch är exporterade ──────
assertEq(extractOfferCanon({ name: "Mellanmjölk 1,5%", brandLine: "" }), "mjölk", "extractOfferCanon mjölk");
assertEq(extractOfferCanon({ name: "Laxfilé", brandLine: "" }), "lax", "extractOfferCanon laxfilé");
assertTrue(rejectsMatch("grädde", { name: "Spraygrädde Vispgrädde 35%", brandLine: "" }), "rejectsMatch spraygrädde för grädde");
assertFalse(rejectsMatch("grädde", { name: "Matlagningsgrädde 15%", brandLine: "" }), "rejectsMatch tillåter matlagningsgrädde");

console.log(`\n${passed} passerade, ${failed} failade`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}

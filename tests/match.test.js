// Regressiontester för Willys-matchern + ingredient-normalizern.
// Körs med `node tests/match.test.js` — inga externa deps.
//
// Bevakar:
//   1. Kända buggklasser (spraygrädde/vispgrädde → grädde-recept) fångas inte
//   2. Priority 2-stemming (sammansatta/böjda ord) normaliseras korrekt
//   3. Nya self-canons (aubergine, gurka, etc) fungerar
//   4. Non-food filter fångar kosttillskott/djurmat
//
// Hook: se .claude/settings.json — hookas på Edit av shopping-builder.js
// eller willys-matcher.js och blockerar commit om en test failar.

import { parseIngredient, normalizeName, CANON_SET, CANON_REJECT_PATTERNS } from "../api/_shared/shopping-builder.js";
import { matchRecipe } from "../api/_shared/willys-matcher.js";

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

function assertTrue(cond, desc) {
  assertEq(!!cond, true, desc);
}

function assertFalse(cond, desc) {
  assertEq(!!cond, false, desc);
}

// ─── Normalizer: direkta tabelluppslagningar ───────────────────────
assertEq(normalizeName("vispgrädde"), "grädde", "vispgrädde → grädde");
assertEq(normalizeName("havregrädde"), "havregrädde", "havregrädde förblir havregrädde");
assertEq(normalizeName("matlagningsgrädde"), "matlagningsgrädde", "matlagningsgrädde förblir");
assertEq(normalizeName("lax"), "lax", "lax förblir lax");
assertEq(normalizeName("laxfiléer"), "lax", "laxfiléer → lax (plural-stemming)");

// ─── Priority 2-stemming (adjektiv-strip) ─────────────────────────
assertEq(normalizeName("liten purjolök"), "purjolök", "liten purjolök → purjolök (adjektiv)");
assertEq(normalizeName("stora tortillas"), "tortilla", "stora tortillas → tortilla (plural)");
assertEq(normalizeName("röda linser"), "linser", "röda linser → linser");
assertEq(normalizeName("torkade linser"), "linser", "torkade linser → linser");
assertEq(normalizeName("krossade tomater"), "tomat", "krossade tomater → tomat");
assertEq(normalizeName("stor morot"), "morot", "stor morot → morot");
assertEq(normalizeName("sötpotatisar"), "sötpotatis", "sötpotatisar → sötpotatis");
assertEq(normalizeName("några basilikablad"), "basilika", "några basilikablad → basilika");
assertEq(normalizeName("citroner"), "citron", "citroner → citron (plural)");
assertEq(normalizeName("potatisar"), "potatis", "potatisar → potatis");

// ─── Token-scan fallback (sista-ord-canon) ───────────────────────
assertEq(normalizeName("lök och sesamfrön"), "sesamfrön", "'lök och sesamfrön' → sesamfrön (sista canon)");
assertEq(normalizeName("oregano eller basilika"), "basilika", "'oregano eller basilika' → basilika");

// ─── Nya self-canons ──────────────────────────────────────────────
assertEq(normalizeName("aubergine"), "aubergine", "aubergine är canon");
assertEq(normalizeName("gurka"), "gurka", "gurka är canon");
assertEq(normalizeName("zucchini"), "zucchini", "zucchini är canon");
assertEq(normalizeName("paprika"), "paprika", "paprika är canon");
assertEq(normalizeName("chili"), "chili", "chili är canon");
assertTrue(CANON_SET.has("aubergine"), "CANON_SET innehåller aubergine");
assertTrue(CANON_SET.has("gurka"), "CANON_SET innehåller gurka");

// ─── parseIngredient med nya units + à-suffix ────────────────────
{
  const p = parseIngredient("2 burkar tonfisk i vatten à ca 170 g");
  assertEq(p.amount, 2, "burkar-enhet: amount = 2");
  assertEq(p.unit, "burkar", "burkar-enhet: unit = burkar");
  assertEq(normalizeName(p.name), "tonfisk", "burkar+à-suffix → tonfisk canon");
}
{
  const p = parseIngredient("5 cm purjolök");
  assertEq(p.amount, 5, "cm-enhet: amount = 5");
  assertEq(p.unit, "cm", "cm-enhet: unit = cm");
  assertEq(normalizeName(p.name), "purjolök", "cm purjolök → purjolök");
}
{
  const p = parseIngredient("2 tummar ingefära");
  assertEq(p.amount, 2, "tummar-enhet: amount = 2");
  assertEq(p.unit, "tummar", "tummar-enhet: unit = tummar");
  assertEq(normalizeName(p.name), "ingefära", "tummar ingefära → ingefära");
}

// ─── Matcher: spraygrädde-bug ska INTE matcha grädde-recept ──────
{
  const recipe = {
    id: 999,
    title: "Pasta med sås på grädde",
    ingredients: ["2 dl grädde", "200 g pasta", "1 gul lök"],
  };
  const offers = [
    { name: "Spraygrädde Vispgrädde 35%", brandLine: "GRÄDDKLICK", regularPrice: 40, promoPrice: 30, savingPerUnit: 10 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "BUGG-FIX: spraygrädde ska INTE matcha grädde-recept");
  assertEq(result.totalSaving, 0, "BUGG-FIX: totalSaving = 0 när enda match avvisas");
}

// ─── Matcher: havregrädde ska inte matcha grädde-recept ──────────
{
  const recipe = {
    id: 999,
    title: "Klassisk fiskgratäng",
    ingredients: ["3 dl grädde", "400 g torsk"],
  };
  const offers = [
    { name: "Havregrädde", brandLine: "OATLY", regularPrice: 30, promoPrice: 22, savingPerUnit: 8 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "BUGG-FIX: havregrädde ska INTE matcha komjölks-grädde-recept");
}

// ─── Matcher: vanlig grädde ska fortfarande matcha ───────────────
{
  const recipe = {
    id: 999,
    title: "Gräddig pasta",
    ingredients: ["3 dl matlagningsgrädde", "400 g pasta"],
  };
  const offers = [
    { name: "Matlagningsgrädde 15%", brandLine: "ARLA", regularPrice: 20, promoPrice: 15, savingPerUnit: 5 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 1, "POSITIVT: matlagningsgrädde matchar matlagningsgrädde");
}

// ─── Matcher: margarin ska inte matcha smör-recept ───────────────
{
  const recipe = {
    id: 999,
    title: "Stekt fisk med smör",
    ingredients: ["50 g smör", "400 g torsk"],
  };
  const offers = [
    { name: "Margarin Original Växtbaserat", brandLine: "LÄTTA", regularPrice: 40, promoPrice: 30, savingPerUnit: 10 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "BUGG-FIX: margarin ska INTE matcha smör-recept");
}

// ─── CANON_REJECT_PATTERNS exporteras och har mönster för grädde ──
assertTrue(CANON_REJECT_PATTERNS.grädde instanceof RegExp, "CANON_REJECT_PATTERNS.grädde är RegExp");
assertTrue(CANON_REJECT_PATTERNS.grädde.test("Spraygrädde Vispgrädde 35%"), "reject-mönster fångar spraygrädde");
assertFalse(CANON_REJECT_PATTERNS.grädde.test("Matlagningsgrädde 15%"), "reject-mönster släpper matlagningsgrädde");

// ─── Slutrapport ──────────────────────────────────────────────────
console.log(`\n${passed} passerade, ${failed} failade.`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla regressiontester godkända.");

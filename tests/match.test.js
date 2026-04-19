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

// ─── Small-usage filter (Session 36): små mängder ska INTE krediteras ──
// Vitlöksklyftor: 2 klyftor av ett huvud → full huvud-saving är missvisande.
{
  const recipe = {
    id: 1001,
    title: "Pasta aglio olio",
    ingredients: ["2 vitlöksklyftor", "400 g pasta", "2 msk olivolja"],
  };
  const offers = [
    { name: "Vitlök", brandLine: null, regularPrice: 15, promoPrice: 8, savingPerUnit: 7 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "SMALL-USAGE: 2 vitlöksklyftor ska INTE matcha hela huvudet");
  assertEq(result.totalSaving, 0, "SMALL-USAGE: vitlöksklyftor ger 0 saving vid små mängder");
}

// 1 gul lök (av en 1 kg-påse) → ingen saving-kredit.
{
  const recipe = {
    id: 1002,
    title: "Snabb tomatsoppa",
    ingredients: ["1 gul lök", "2 burkar krossade tomater", "3 dl grädde"],
  };
  const offers = [
    { name: "Gul Lök Klass 1", brandLine: "ICA", regularPrice: 20, promoPrice: 12, savingPerUnit: 8 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "SMALL-USAGE: 1 gul lök ska INTE kreditera hela påsen");
}

// 1 citron (för skal + saft) → ingen saving-kredit.
{
  const recipe = {
    id: 1003,
    title: "Citronsill",
    ingredients: ["1 citron", "200 g sill"],
  };
  const offers = [
    { name: "Citron Gul", brandLine: null, regularPrice: 30, promoPrice: 20, savingPerUnit: 10 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "SMALL-USAGE: 1 citron ska INTE kreditera hela citronnätet");
}

// "2 kvistar timjan" → ingen saving-kredit.
{
  const recipe = {
    id: 1004,
    title: "Örtsmörstekt kyckling",
    ingredients: ["2 kvistar timjan", "600 g kycklingfilé"],
  };
  const offers = [
    { name: "Timjan Färsk", brandLine: null, regularPrice: 25, promoPrice: 15, savingPerUnit: 10 },
    { name: "Kycklingfilé 600g", brandLine: "KRONFÅGEL", regularPrice: 100, promoPrice: 70, savingPerUnit: 30 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 1, "SMALL-USAGE: kvistar timjan droppar, kyckling behålls");
  assertEq(result.matches[0].canon, "kycklingfilé", "SMALL-USAGE: bara kyckling-matchen kvar");
  assertEq(result.totalSaving, 30, "SMALL-USAGE: totalSaving = bara kyckling (timjan droppas)");
}

// "2 msk smör" → ingen saving-kredit (smör-paket räcker veckor).
{
  const recipe = {
    id: 1005,
    title: "Smörstekt fisk",
    ingredients: ["2 msk smör", "400 g torsk"],
  };
  const offers = [
    { name: "Smör Normalsaltat", brandLine: "ARLA", regularPrice: 40, promoPrice: 30, savingPerUnit: 10 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "SMALL-USAGE: 2 msk smör ska INTE kreditera hela paketet");
}

// POSITIVT: substantiell mängd lök (200 g) → full saving kvar.
{
  const recipe = {
    id: 1006,
    title: "Löksoppa",
    ingredients: ["500 g lök", "1 liter buljong"],
  };
  const offers = [
    { name: "Gul Lök", brandLine: null, regularPrice: 20, promoPrice: 12, savingPerUnit: 8 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 1, "SUBSTANTIAL: 500 g lök behåller saving");
  assertEq(result.totalSaving, 8, "SUBSTANTIAL: lök-saving bevaras vid stor mängd");
}

// POSITIVT: icke-aromat (lax) med liten mängd → saving kvar (inte i small-usage-listan).
{
  const recipe = {
    id: 1007,
    title: "Laxtartar",
    ingredients: ["1 laxfilé", "1 dl creme fraiche"],
  };
  const offers = [
    { name: "Laxfilé ASC", brandLine: null, regularPrice: 100, promoPrice: 75, savingPerUnit: 25 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 1, "POSITIVT: lax är inte small-usage — saving bevaras");
  assertEq(result.totalSaving, 25, "POSITIVT: lax-saving bevaras oavsett mängd");
}

// EDGE: blandad användning av samma canon — om NÅGON rad är substantiell, behåll saving.
{
  const recipe = {
    id: 1008,
    title: "Stekt lök överallt",
    ingredients: ["1 liten lök", "400 g gul lök"],
  };
  const offers = [
    { name: "Gul Lök", brandLine: null, regularPrice: 20, promoPrice: 12, savingPerUnit: 8 },
  ];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 1, "MIXED: substantiell rad räddar saving även när small finns");
}

// ─── Slutrapport ──────────────────────────────────────────────────
console.log(`\n${passed} passerade, ${failed} failade.`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla regressiontester godkända.");

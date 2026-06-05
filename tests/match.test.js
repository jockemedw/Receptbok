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
import { matchRecipe, extractOfferCanon, relevantToCanon, brandBlocked, rejectsMatch } from "../api/_shared/willys-matcher.js";

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
assertEq(normalizeName("kefir"), "kefir", "kefir är canon");
assertEq(extractOfferCanon({ name: "Kefir Naturell Cultura Laktosfri 2,5%", brandLine: "ARLA" }), "kefir", "produktnamn med kefir → kefir-canon");
assertTrue(CANON_SET.has("aubergine"), "CANON_SET innehåller aubergine");
assertTrue(CANON_SET.has("gurka"), "CANON_SET innehåller gurka");
assertTrue(CANON_SET.has("kefir"), "CANON_SET innehåller kefir");

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

// ─── BUGG-FIX: smör ska inte matcha popcorn ──
assertTrue(CANON_REJECT_PATTERNS.smör.test("Mikropopcorn Extra Stora Smör 3-pack"), "reject-mönster fångar popcorn-smör");
assertFalse(CANON_REJECT_PATTERNS.smör.test("Normalsaltat Svenskt Smör 500g"), "reject-mönster släpper vanligt smör");
{
  const recipe = { id: 99, ingredients: ["smör"], tags: ["vardag30"], protein: "vegetarisk" };
  const offers = [{ name: "Mikropopcorn Extra Stora Smör 3-pack", brandLine: "GARANT, 270g", regularPrice: 18.83, promoPrice: 16, savingPerUnit: 5.66 }];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "BUGG-FIX: popcorn ska INTE matcha smör-recept");
}

// ─── BUGG-FIX: rapsolja ska inte matcha sardeller/konserver i olja ──
assertTrue(CANON_REJECT_PATTERNS.rapsolja.test("Sardeller i Olja 100g"), "reject-mönster fångar sardeller i olja");
assertTrue(CANON_REJECT_PATTERNS.rapsolja.test("Tonfisk i Olja 185g"), "reject-mönster fångar tonfisk i olja");
assertFalse(CANON_REJECT_PATTERNS.rapsolja.test("Rapsolja 1l"), "reject-mönster släpper vanlig rapsolja");
{
  const recipe = { id: 98, ingredients: ["2 msk rapsolja"], tags: ["vardag30"], protein: "kyckling" };
  const offers = [{ name: "Sardeller i Olja", brandLine: "GARANT, 100g", regularPrice: 37.76, promoPrice: 33.9, savingPerUnit: 3.86 }];
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "BUGG-FIX: sardeller i olja ska INTE matcha rapsolja-recept");
}

// ─── relevantToCanon: sök-fallback för vanliga varor ──────────────
// Positiva: produktnamn som stemmar till annan/ingen canon men ändå är rätt.
assertTrue(relevantToCanon("färs", "Nötfärs 12% Sverige"), "färs → Nötfärs (suffix-stam)");
assertTrue(relevantToCanon("färs", "Blandfärs Nöt/Fläsk"), "färs → Blandfärs (suffix-stam)");
assertTrue(relevantToCanon("bananer", "Banan Klass 1"), "bananer → Banan (canon är plural)");
assertTrue(relevantToCanon("banan", "Bananer Ekologiska"), "banan → Bananer (produkt är plural)");
assertTrue(relevantToCanon("toalettpapper", "Toalettpapper Lambi Mjukt"), "toalettpapper → Toalettpapper");
assertTrue(relevantToCanon("potatis", "Potatis Fast Klass 1"), "potatis → Potatis Fast");
// Negativa: irrelevanta träffar ska INTE accepteras i fallbacken.
assertFalse(relevantToCanon("vitlöksklyftor", "Lök Vit Stor Klass 1"), "vitlöksklyftor ⊄ Lök Vit Stor (skydd)");
assertFalse(relevantToCanon("grytbit", "Potatis Klass 1"), "grytbit ⊄ Potatis");
assertFalse(relevantToCanon("ris", "Färsk Pasta Tagliatelle"), "för kort canon (≤3) → ingen fallback");

// ─── Session 80: reject-mönster för smaksatta/processade varianter ──
assertTrue(CANON_REJECT_PATTERNS.yoghurt.test("Yoghurt Körsbär 2%"), "yoghurt-reject fångar körsbärsyoghurt");
assertTrue(CANON_REJECT_PATTERNS.yoghurt.test("Jordgubbsyoghurt"), "yoghurt-reject fångar jordgubbsyoghurt");
assertFalse(CANON_REJECT_PATTERNS.yoghurt.test("Yoghurt Naturell 3%"), "yoghurt-reject släpper naturell");
assertTrue(CANON_REJECT_PATTERNS.citron.test("Citron Kolsyrat Vatten"), "citron-reject fångar kolsyrat vatten");
assertFalse(CANON_REJECT_PATTERNS.citron.test("Citron Klass 1"), "citron-reject släpper färsk citron");
assertTrue(CANON_REJECT_PATTERNS.mjölk.test("Kondenserad Mjölk Sötad"), "mjölk-reject fångar kondenserad mjölk");
assertFalse(CANON_REJECT_PATTERNS.mjölk.test("Mellanmjölk 1,5%"), "mjölk-reject släpper mellanmjölk");

// Session 80b: yoghurt-dessert, sallad-endive, globalt färdigrätts-skydd
assertTrue(rejectsMatch("yoghurt", { name: "Samoa Original Yoghurt", brandLine: "" }), "yoghurt-reject fångar Samoa-dessertyoghurt");
assertFalse(rejectsMatch("yoghurt", { name: "Yoghurt Naturell 3%", brandLine: "Arla" }), "yoghurt-reject släpper naturell");
assertTrue(rejectsMatch("sallad", { name: "Salad Endive Frisé", brandLine: "" }), "sallad-reject fångar endive");
assertFalse(rejectsMatch("sallad", { name: "Sallad Blandad Klass 1", brandLine: "" }), "sallad-reject släpper vanlig sallad");
assertTrue(rejectsMatch("ost", { name: "Mac & Cheese Färdigrätt", brandLine: "" }), "globalt skydd fångar Mac & Cheese oavsett canon");
assertTrue(rejectsMatch("köttfärs", { name: "Köttbullar Färdigrätt", brandLine: "" }), "globalt skydd fångar färdigrätt");
assertFalse(rejectsMatch("ost", { name: "Riven Ost Cheddar", brandLine: "" }), "globalt skydd släpper vanlig ost");

// ─── Session 80: lexikon-täckning för vanliga inköpsvaror ───────────
assertEq(normalizeName("frysta gröna ärter"), "ärtor", "frysta gröna ärter → ärtor");
assertEq(normalizeName("lätt färskost"), "färskost", "lätt färskost → färskost");
assertEq(normalizeName("kycklingbröst utan ben och skinn"), "kycklingfilé", "kycklingbröst … → kycklingfilé");
assertEq(normalizeName("bananer"), "banan", "bananer → banan (self-canon)");
assertEq(normalizeName("toalettpapper"), "toalettpapper", "toalettpapper är canon");
assertTrue(CANON_SET.has("ärtor"), "CANON_SET innehåller ärtor");
assertTrue(CANON_SET.has("färskost"), "CANON_SET innehåller färskost");

// ─── Session 80: brandBlocked-hjälpare ──────────────────────────────
assertTrue(brandBlocked({ name: "Krossade Tomater", brandLine: "Eldorado" }, ["eldorado"]), "eldorado blockas via brandLine");
assertTrue(brandBlocked({ name: "Eldorado Pasta", brandLine: "" }, ["eldorado"]), "eldorado blockas via namn");
assertFalse(brandBlocked({ name: "Krossade Tomater", brandLine: "Mutti" }, ["eldorado"]), "Mutti passerar när bara eldorado blockas");
assertFalse(brandBlocked({ name: "Pasta", brandLine: "Garant" }, []), "tom blocklist blockerar inget");

// ─── Session 81 (nattjobb): konservativ täckningsutökning ───────────
assertEq(normalizeName("havregryn"), "havregryn", "havregryn är canon");
assertEq(normalizeName("couscous"), "couscous", "couscous är canon");
assertEq(normalizeName("dijonsenap"), "senap", "dijonsenap → senap");
assertEq(normalizeName("muscovadosocker"), "socker", "muscovadosocker → socker");
assertEq(normalizeName("risnudlar"), "nudlar", "risnudlar → nudlar");
assertEq(normalizeName("udonnudlar"), "nudlar", "udonnudlar → nudlar");
assertEq(normalizeName("isbergssallad"), "sallad", "isbergssallad → sallad");
assertEq(normalizeName("palsternackor"), "palsternacka", "palsternackor → palsternacka");
assertEq(normalizeName("jordgubb"), "jordgubbar", "jordgubb → jordgubbar");
assertEq(normalizeName("fullkornsspaghetti"), "spaghetti", "fullkornsspaghetti → spaghetti");
assertTrue(CANON_SET.has("edamame"), "CANON_SET innehåller edamame");
assertTrue(CANON_SET.has("kärnmjölk"), "CANON_SET innehåller kärnmjölk");
assertTrue(CANON_SET.has("sparris"), "CANON_SET innehåller sparris");
// extractOfferCanon hittar de nya canons i Willys-produktnamn
assertEq(extractOfferCanon({ name: "Färsk Sparris Grön Klass 1", brandLine: "" }), "sparris", "produktnamn → sparris-canon");
assertEq(extractOfferCanon({ name: "Havregryn Glutenfria", brandLine: "AXA" }), "havregryn", "produktnamn → havregryn-canon");

// ─── Session 81 (nattjobb fas 3): robusthet mot saknat produktnamn ──
assertFalse(rejectsMatch("mjölk", { brandLine: "Arla" }), "rejectsMatch kraschar inte på saknat name");
assertEq(extractOfferCanon({ brandLine: "Mellanmjölk" }), "mjölk", "extractOfferCanon läser brandLine när name saknas");
assertEq(extractOfferCanon({ name: undefined, brandLine: undefined }), null, "extractOfferCanon → null på helt tomt erbjudande");

// ─── Slutrapport ──────────────────────────────────────────────────
console.log(`\n${passed} passerade, ${failed} failade.`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla regressiontester godkända.");

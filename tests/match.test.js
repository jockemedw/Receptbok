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
import { matchRecipe, extractOfferCanon, relevantToCanon, brandBlocked, rejectsMatch, buildDealCandidates, weightedSaving } from "../api/_shared/willys-matcher.js";

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
// F307 (audit v7): krossade tomater (konserv) är en egen self-canon i NORMALIZATION_TABLE
// numera (direktlookup, inte adjektiv-strip) — får inte mergas med färsk tomat.
assertEq(normalizeName("krossade tomater"), "krossade tomater", "krossade tomater → egen canon (F307)");
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

// ─── Veckans fynd: brusrensning av besparings-matchningen (Session 90) ──
// Skafferi + matlagningsfett ska aldrig matchas (de blåste upp besparingen
// och drog in skräpprodukter som "Salt Hallon Ferrari"/"Nötspett Peppar").
{
  const offers = [
    { name: "Salt Hallon Ferrari Påse", brandLine: "TOMS, 120g", regularPrice: 13.2, promoPrice: 11.7, savingPerUnit: 4.5 },
    { name: "Nötspett Peppar", brandLine: "SCAN, 400g", regularPrice: 87.9, promoPrice: 74.9, savingPerUnit: 13 },
    { name: "Olivolja Extra Virgin", brandLine: "TERRA DELYSSA, 1l", regularPrice: 125, promoPrice: 99, savingPerUnit: 26 },
    { name: "Smör-&rapsolja Flytande Original 80%", brandLine: "ARLA KÖKET, 5dl", regularPrice: 23.5, promoPrice: 19.9, savingPerUnit: 3.6 },
  ];
  const recipe = {
    id: 500, tags: ["helg60"], protein: "fisk",
    ingredients: ["1 nypa salt", "svartpeppar", "2 msk olivolja", "50 g smör", "600 g torsk"],
  };
  const result = matchRecipe(recipe, offers);
  assertEq(result.matches.length, 0, "skafferi/fett-recept matchar inga skräp-erbjudanden");
  assertEq(result.totalSaving, 0, "skafferi/fett ger ingen uppblåst besparing");
}

// Reject-mönster: rökt lax, marinerad vitlök, barnmat ("Från X Månader")
assertTrue(rejectsMatch("lax", { name: "Kallrökt Lax Skivor", brandLine: "FALKENBERG, 300g" }), "kallrökt lax avvisas för lax-recept");
assertFalse(rejectsMatch("lax", { name: "Laxfilé Färsk", brandLine: "" }), "färsk laxfilé släpps igenom");
assertTrue(rejectsMatch("vitlöksklyftor", { name: "Vitlöksklyftor Marinerade", brandLine: "RIDDERHEIMS, 160g" }), "marinerad vitlök avvisas");
assertFalse(rejectsMatch("vitlöksklyftor", { name: "Vitlök Klass 1", brandLine: "" }), "färsk vitlök släpps igenom");
assertTrue(rejectsMatch("äpple", { name: "Fruktsmoothie Äpple Banan Jordgubb Från 6 Månader", brandLine: "NESTLÉ, 90g" }), "barnmat (från 6 mån) avvisas");
assertFalse(rejectsMatch("ost", { name: "Parmesan Lagrad 24 Månader", brandLine: "" }), "lagrad ost (utan 'från') släpps igenom");

// ─── Veckans fynd: buildDealCandidates (Session 89) ──────────────────
{
  const savingsById = {
    10: { total: 45, matches: [{ canon: "torsk" }] },   // störst besparing
    20: { total: 12, matches: [{ canon: "lax" }] },
    30: { total: 8,  matches: [{ canon: "ris" }] },      // under tröskel (10)
    40: { total: 30, matches: [{ canon: "kyckling" }] }, // men redan vald
  };
  const lookup = (id) => ({
    10: { id: 10, title: "Torskgryta", protein: "fisk", time: 40 },
    20: { id: 20, title: "Laxpasta", protein: "fisk", time: 25 },
    30: { id: 30, title: "Risrätt", protein: "vegetarisk", time: 20 },
    40: { id: 40, title: "Kycklingwok", protein: "kyckling", time: 30 },
  }[id]);

  const cands = buildDealCandidates(savingsById, [40], lookup);
  assertEq(cands.length, 2, "buildDealCandidates: vald (40) + under tröskel (30) exkluderas");
  assertEq(cands[0].recipeId, 10, "buildDealCandidates: störst besparing först");
  assertEq(cands[0].saving, 45, "buildDealCandidates: saving avrundas/följer med");
  assertEq(cands[0].title, "Torskgryta", "buildDealCandidates: titel slås upp");
  assertEq(cands[1].recipeId, 20, "buildDealCandidates: näst störst (lax) tvåa");
  assertTrue(cands.every((c) => c.recipeId !== 40), "buildDealCandidates: valda recept aldrig med");
  assertTrue(cands.every((c) => c.recipeId !== 30), "buildDealCandidates: under-tröskel aldrig med");
  // Respekterar limit
  const many = {}; for (let i = 1; i <= 25; i++) many[i] = { total: 100 + i, matches: [] };
  assertEq(buildDealCandidates(many, [], (id) => ({ id, title: `R${id}` }), { limit: 5 }).length, 5,
    "buildDealCandidates: limit kapar listan");
}

// ─── Veckans fynd: storpack nedviktas i rankningen (Session 93) ──────
{
  // Recept 1 har högre rå besparing men allt är storpack (rank 20×0.5=10);
  // recept 2 lägre rå besparing men ingen storpack (rank 16) → 2 rankas först.
  const savingsById = {
    1: { total: 20, matches: [{ canon: "ris", savingPerUnit: 20, bulk: true }] },
    2: { total: 16, matches: [{ canon: "räkor", savingPerUnit: 16, bulk: false }] },
  };
  const lookup = (id) => ({ 1: { id: 1, title: "Risrätt" }, 2: { id: 2, title: "Räkpasta" } }[id]);
  const cands = buildDealCandidates(savingsById, [], lookup);
  assertEq(cands[0].recipeId, 2, "bulk-dämpning: icke-storpack rankas före storpack");
  assertEq(cands[0].saving, 16, "visad besparing = rå total (16)");
  assertEq(cands[1].recipeId, 1, "storpack-recept hamnar tvåa");
  assertEq(cands[1].saving, 20, "visad besparing oförändrad (20) trots dämpad rank");
}

// ─── Värdeviktning: prio mot proteiner & dyra varor (Session 94) ─────
{
  // Lika rå besparing (20 kr) men ena receptet sparar på billig vitlök,
  // det andra på dyr lax → laxen ska rankas först (dyrt + protein-boost).
  const savingsById = {
    1: { total: 20, matches: [{ canon: "vitlök", savingPerUnit: 20, regularPrice: 12 }] },
    2: { total: 20, matches: [{ canon: "lax",    savingPerUnit: 20, regularPrice: 89 }] },
  };
  const lookup = (id) => ({ 1: { id: 1, title: "Vitlökspasta" }, 2: { id: 2, title: "Laxgryta" } }[id]);
  const cands = buildDealCandidates(savingsById, [], lookup);
  assertEq(cands[0].recipeId, 2, "värdevikt: dyr proteinrea (lax) rankas före billig vitlök");
  assertEq(cands[0].saving, 20, "värdevikt: visad besparing oförändrad (20) för laxen");
  assertEq(cands[1].saving, 20, "värdevikt: visad besparing oförändrad (20) för vitlöken");

  // En besparing som BARA består av billig vitlök väger ner under tröskeln 10,
  // medan en lika stor proteinbesparing håller sig kvar (bucketBySaving-tröskel).
  assertTrue(weightedSaving([{ canon: "vitlök", savingPerUnit: 14, regularPrice: 10 }], 14) < 10,
    "värdevikt: ren vitlöksbesparing (14 kr) viktas under 10 → prioriteras ej in");
  assertTrue(weightedSaving([{ canon: "fläskkarré", savingPerUnit: 14, regularPrice: 70 }], 14) >= 10,
    "värdevikt: protein-/dyr besparing (14 kr) håller sig över tröskeln");

  // Saknar prisdata → faller tillbaka på rå total (bakåtkompatibelt).
  assertEq(weightedSaving([{ canon: "ris" }], 25), 25, "värdevikt: utan savingPerUnit faller till total");
  assertEq(weightedSaving([], 25), 25, "värdevikt: tom matchlista faller till total");
}

// ─── Veckans fynd: huvudprotein-sortering + variation (Session 96) ──
{
  const savingsById = {
    1: { total: 35, matches: [{ canon: "kyckling", savingPerUnit: 30, regularPrice: 60 }, { canon: "lök", savingPerUnit: 5, regularPrice: 8 }] },
    2: { total: 32, matches: [{ canon: "kycklingfilé", savingPerUnit: 28, regularPrice: 70 }] },
    3: { total: 31, matches: [{ canon: "kyckling", savingPerUnit: 27, regularPrice: 60 }] },
    4: { total: 25, matches: [{ canon: "lax", savingPerUnit: 25, regularPrice: 89 }] },
    5: { total: 12, matches: [{ canon: "vitlök", savingPerUnit: 12, regularPrice: 10 }] }, // kött, men kött ej på rea
  };
  const proteinOf = { 1: "kyckling", 2: "kyckling", 3: "kyckling", 4: "fisk", 5: "kött" };
  const lookup = (id) => ({ id, title: `R${id}`, protein: proteinOf[id], time: 30 });

  const cands = buildDealCandidates(savingsById, [], lookup);
  assertEq(cands[0].recipeId, 1, "protein-sort: bästa kycklingfyndet (30) toppar");
  assertEq(cands[1].recipeId, 4, "variation: lax (25) slinker till andraplats trots lägre besparing än fler kycklingar");
  assertEq(cands[1].protein, "fisk", "variation: andra kortet är en annan proteintyp");
  assertEq(cands[cands.length - 1].recipeId, 5, "recept utan protein-rea hamnar sist");
  assertEq(cands.find((c) => c.recipeId === 1).saving, 35, "visad besparing = rå total (35), oförändrad");

  // Huvudproteinets besparing styr — inte lök-träffen i samma recept.
  // Utan variationsvikt (decay = 1) blir det ren proteinsortering: 1,2,3,4.
  const noDiv = buildDealCandidates(savingsById, [], lookup, { diversityDecay: 1 });
  assertEq(noDiv.map((c) => c.recipeId).join(","), "1,2,3,4,5",
    "decay=1: ren proteinsortering (alla kycklingar före lax)");
}

// ─── Slutrapport ──────────────────────────────────────────────────
console.log(`\n${passed} passerade, ${failed} failade.`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla regressiontester godkända.");

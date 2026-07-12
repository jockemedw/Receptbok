// Regressiontester för shopping-builder.js — 5-stegspipelinen.
// Körs med `node tests/shopping.test.js` — inga externa deps.
//
// Bevakar:
//   1. Clean-steget (strip av prefix/suffix)
//   2. Parse (bråk, intervall, enheter, vitlöksklyftor, tumme)
//   3. Normalize (~150-varianter → kanoniska namn)
//   4. Merge (summering + småenheter-drop)
//   5. Categorize — historiska buggar (session 11-13):
//      - kycklingfilé i Mejeri ("rostad" innehåller "ost" substring)
//      - torkade/malda kryddor → Skafferi (inte Grönsaker)
//      - SKAFFERI_OVERRIDE-poster (tomatpuré, fiskbuljong, etc.)
//      - PANTRY_ALWAYS_SKIP
//      - "eller"-filtrering
//   6. Output-format: "namn (mängd)", A-Ö-sortering med å/ä/ö sist

import {
  parseIngredient,
  normalizeName,
  buildShoppingList,
} from "../api/_shared/shopping-builder.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL ${desc}\n     forväntad: ${JSON.stringify(expected)}\n     faktisk:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond, desc) {
  assertEq(!!cond, true, desc);
}

function assertFalse(cond, desc) {
  assertEq(!!cond, false, desc);
}

// ─── Hjälpare: bygg en minimal receptlista för buildShoppingList ──────────────
function makeRecipes(idIngMap) {
  return Object.entries(idIngMap).map(([id, ingredients]) => ({
    id: Number(id),
    title: `Recept ${id}`,
    ingredients,
  }));
}

// ─── Clean-steget via parseIngredient ─────────────────────────────────────────
{
  // "Skal och saft av" stripas
  const p = parseIngredient("Skal och saft av 2 citroner");
  assertEq(p.amount, 2, "clean: 'Skal och saft av 2 citroner' → amount 2");
  assertEq(normalizeName(p.name), "citron", "clean: 'Skal och saft av 2 citroner' → citron");
}
{
  // "saften av" stripas
  const p = parseIngredient("saften av 1 citron");
  assertEq(p.amount, 1, "clean: 'saften av 1 citron' → amount 1");
  assertEq(normalizeName(p.name), "citron", "clean: 'saften av 1 citron' → citron");
}
{
  // "till stekning" stripas (historisk bugg session 11)
  const p = parseIngredient("2 msk olja till stekning");
  assertEq(normalizeName(p.name), "rapsolja", "clean: 'till stekning'-suffix stripas");
}
{
  // "till redning" stripas
  const p = parseIngredient("1 msk maizena till redning");
  assertEq(normalizeName(p.name), "maizena", "clean: 'till redning'-suffix stripas");
}
{
  // "+"-suffix stripas (historisk bugg session 11)
  const p = parseIngredient("2 msk majsstärkelse + 2 msk vatten");
  assertEq(normalizeName(p.name), "maizena", "clean: '+'-suffix stripas");
}
{
  // "à ca X g"-suffix stripas (Session 35)
  const p = parseIngredient("2 burkar tonfisk i vatten à ca 170 g");
  assertEq(normalizeName(p.name), "tonfisk", "clean: 'à ca X g'-suffix stripas, tonfisk kvar");
}
{
  // "nykokt"/"rostade" prefix stripas
  const p = parseIngredient("2 dl nykokt ris");
  assertEq(normalizeName(p.name), "ris", "clean: 'nykokt'-prefix stripas");
}

// ─── Parse: bråk och intervall ────────────────────────────────────────────────
{
  const p = parseIngredient("½ dl soja");
  assertEq(p.amount, 0.5, "parse: ½ dl soja → amount 0.5");
  assertEq(p.unit, "dl", "parse: ½ dl soja → unit dl");
}
{
  const p = parseIngredient("¼ tsk salt");
  assertEq(p.amount, 0.25, "parse: ¼ tsk salt → amount 0.25");
}
{
  // Fas 8.1 — ⅓⅔⅛-fraktioner (tidigare P0-bugg: hela mängden tappades)
  const p = parseIngredient("⅔ dl olivolja");
  assertEq(p.amount, 0.67, "parse: ⅔ dl olivolja → amount 0.67");
  assertEq(p.unit, "dl", "parse: ⅔ dl olivolja → unit dl");
  assertEq(p.name, "olivolja", "parse: ⅔ dl olivolja → name olivolja");
}
{
  const p = parseIngredient("⅓ tsk muskot");
  assertEq(p.amount, 0.33, "parse: ⅓ tsk muskot → amount 0.33");
}
{
  const p = parseIngredient("1⅔ dl mjöl");
  assertEq(p.amount, 1.67, "parse: 1⅔ dl mjöl → amount 1.67");
}
// Fas 8.3 — doh-format: återvinn mängd ur parentes/senare klausul
{
  const p = parseIngredient("zucchini (ca 400 g)");
  assertEq(p.amount, 400, "doh: zucchini (ca 400 g) → 400 g");
  assertEq(p.unit, "g", "doh: ca-strip → unit g");
  assertEq(p.name, "zucchini", "doh: namn zucchini");
}
{
  const p = parseIngredient("lax (mittbit, skinnad, 560 g)");
  assertEq(p.amount, 560, "doh: mängd i senare klausul → 560");
  assertEq(p.name, "lax", "doh: namn lax");
}
{
  const p = parseIngredient("olivolja (2 msk + 4 tsk)");
  assertEq(p.amount, 2, "doh: A+B-summa → tar första ledet 2");
  assertEq(p.unit, "msk", "doh: unit msk");
}
{
  const p = parseIngredient("radicchio (1 litet huvud)");
  assertEq(p.amount, 1, "doh: storleksadjektiv strippas → 1");
  assertEq(p.unit, "huvud", "doh: unit huvud");
}
{
  const p = parseIngredient("limeskal (från 1 lime)");
  assertEq(p.amount, 1, "doh: från-strip → 1");
  assertEq(p.name, "limeskal", "doh: namn limeskal (normaliseras till lime senare)");
  assertEq(normalizeName(p.name), "lime", "doh: limeskal → lime via normalizeName");
}
{
  // Notering utan ledande mängd ska INTE röras
  const p = parseIngredient("örtsalt (t ex Vegeta allkrydda)");
  assertEq(p.amount, null, "doh: notering utan mängd → amount null");
  assertEq(p.name, "örtsalt", "doh: notering → namn örtsalt");
}
{
  const p = parseIngredient("2-3 dl grädde");
  assertEq(p.amount, 3, "parse: intervall 2-3 dl → tar max-värdet 3");
  assertEq(p.unit, "dl", "parse: intervall 2-3 dl → unit dl");
}
{
  // "stor vitlöksklyfta" → vitlöksklyftor (historisk bugg session 11)
  const p = parseIngredient("1 stor vitlöksklyfta");
  assertEq(normalizeName(p.name), "vitlöksklyftor", "parse: 'stor vitlöksklyfta' → vitlöksklyftor");
}
{
  // "liten vitlöksklyfta" → vitlöksklyftor
  const p = parseIngredient("2 liten vitlöksklyfta");
  assertEq(normalizeName(p.name), "vitlöksklyftor", "parse: 'liten vitlöksklyfta' → vitlöksklyftor");
}
{
  // "1 tumme ingefära" (Session 11 — tumme tillagd som enhet)
  const p = parseIngredient("1 tumme ingefära");
  assertEq(p.amount, 1, "parse: '1 tumme ingefära' → amount 1");
  assertEq(p.unit, "tumme", "parse: '1 tumme ingefära' → unit tumme");
  assertEq(normalizeName(p.name), "ingefära", "parse: tumme ingefära → ingefära");
}

// ─── Normalize: kända varianter ───────────────────────────────────────────────
assertEq(normalizeName("kycklingfiléer"), "kycklingfilé", "normalize: kycklingfiléer → kycklingfilé (Session 13)");
assertEq(normalizeName("hackade cashewnötter"), "cashewnötter", "normalize: hackade cashewnötter → cashewnötter (Session 13)");
assertEq(normalizeName("rostade nötter"), "nötter", "normalize: 'rostade nötter' strippas till nötter via adjektiv-prefix (Session 13)");
assertEq(normalizeName("rostade nötter/frön"), "nötter", "normalize: 'rostade nötter/frön' → nötter");
assertEq(normalizeName("vispgrädde"), "grädde", "normalize: vispgrädde → grädde");
assertEq(normalizeName("laxfiléer"), "lax", "normalize: laxfiléer → lax");
assertEq(normalizeName("tonfisk i vatten"), "tonfisk", "normalize: 'tonfisk i vatten' → tonfisk via n-gram");
// F307 (audit v7): krossade tomater (konserv) är INTE samma vara som färsk tomat
// — self-canon förhindrar felaktig merge med färska tomater på inköpslistan.
assertEq(normalizeName("krossade tomater"), "krossade tomater", "normalize: krossade tomater → egen canon (F307, inte 'tomat')");
assertEq(normalizeName("passerade tomater"), "passerade tomater", "normalize: passerade tomater → egen canon (F307)");
assertEq(normalizeName("morötter"), "morot", "normalize: morötter → morot");
assertEq(normalizeName("citroner"), "citron", "normalize: citroner → citron (plural)");

// ─── Categorize: historiska buggar ────────────────────────────────────────────

// kycklingfilé ska INTE hamna i Mejeri (Session 13: "rostad" innehåller "ost" som substring)
{
  const recipes = makeRecipes({ 1: ["400 g kycklingfilé"] });
  const result = buildShoppingList([1], recipes);
  assertFalse(result.Mejeri.some((s) => s.startsWith("kycklingfilé")), "BUGG-FIX: kycklingfilé hamnar INTE i Mejeri");
  assertTrue(result["Fisk & kött"].some((s) => s.startsWith("kycklingfilé")), "BUGG-FIX: kycklingfilé hamnar i Fisk & kött");
}

// torkade kryddor → Skafferi (INTE Grönsaker) (Session 13)
{
  const recipes = makeRecipes({ 2: ["1 tsk torkad oregano", "1 tsk torkad basilika", "1 tsk torkad timjan"] });
  const result = buildShoppingList([2], recipes);
  assertFalse(result.Grönsaker.some((s) => s.includes("oregano")), "BUGG-FIX: torkad oregano hamnar INTE i Grönsaker");
  assertFalse(result.Grönsaker.some((s) => s.includes("basilika")), "BUGG-FIX: torkad basilika hamnar INTE i Grönsaker");
  assertFalse(result.Grönsaker.some((s) => s.includes("timjan")), "BUGG-FIX: torkad timjan hamnar INTE i Grönsaker");
  assertTrue(result.Skafferi.some((s) => s.includes("oregano")), "BUGG-FIX: torkad oregano → Skafferi");
}

// malen/mald kryddor → Skafferi
{
  const recipes = makeRecipes({ 3: ["1 tsk malen koriander", "1 tsk malen spiskummin"] });
  const result = buildShoppingList([3], recipes);
  assertFalse(result.Grönsaker.some((s) => s.includes("koriander")), "BUGG-FIX: malen koriander hamnar INTE i Grönsaker");
  assertTrue(result.Skafferi.some((s) => s.includes("koriander")), "BUGG-FIX: malen koriander → Skafferi");
}

// SKAFFERI_OVERRIDE: tomatpuré, chiliflakes, paprikapulver (Session 13)
{
  const recipes = makeRecipes({ 4: ["2 msk tomatpuré", "1 tsk chiliflakes", "1 tsk paprikapulver"] });
  const result = buildShoppingList([4], recipes);
  // Dessa är SMALL_UNITS (msk/tsk) → drop till noAmount → kategoriseras som Skafferi
  assertFalse(result.Grönsaker.some((s) => s.includes("tomatpuré")), "SKAFFERI_OVERRIDE: tomatpuré hamnar INTE i Grönsaker");
  assertTrue(result.Skafferi.some((s) => s.includes("tomatpuré")), "SKAFFERI_OVERRIDE: tomatpuré → Skafferi");
}

// SKAFFERI_OVERRIDE: fiskbuljong, fisksås, ostronsås (Session 11)
{
  const recipes = makeRecipes({ 5: ["2 msk fisksås", "1 msk ostronsås", "5 dl fiskbuljong"] });
  const result = buildShoppingList([5], recipes);
  assertFalse(result.Grönsaker.some((s) => s.includes("fiskbuljong")), "SKAFFERI_OVERRIDE: fiskbuljong INTE i Grönsaker");
  assertTrue(result.Skafferi.some((s) => s.includes("fiskbuljong")), "SKAFFERI_OVERRIDE: fiskbuljong → Skafferi");
  assertFalse(result.Grönsaker.some((s) => s.includes("fisksås")), "SKAFFERI_OVERRIDE: fisksås INTE i Grönsaker");
  assertTrue(result.Skafferi.some((s) => s.includes("fisksås")), "SKAFFERI_OVERRIDE: fisksås → Skafferi");
}

// ingefära ska INTE hamna i Grönsaker (Session 13 — borttagen ur Grönsaker-nyckelord)
{
  const recipes = makeRecipes({ 6: ["2 cm ingefära"] });
  const result = buildShoppingList([6], recipes);
  assertFalse(result.Grönsaker.some((s) => s.includes("ingefära")), "BUGG-FIX: ingefära hamnar INTE i Grönsaker");
  assertTrue(result.Skafferi.some((s) => s.includes("ingefära")), "ingefära → Skafferi (rot/krydda)");
}

// ─── PANTRY_ALWAYS_SKIP ───────────────────────────────────────────────────────
{
  const recipes = makeRecipes({ 7: ["1 tsk salt", "1 krm svartpeppar", "2 dl vatten", "salt och peppar", "lite vatten", "valfria grönsaker"] });
  const result = buildShoppingList([7], recipes);
  const all = Object.values(result).flat();
  assertFalse(all.some((s) => s.includes("salt") && !s.includes("soja")), "PANTRY_SKIP: salt filtreras bort");
  assertFalse(all.some((s) => s.includes("svartpeppar")), "PANTRY_SKIP: svartpeppar filtreras bort");
  assertFalse(all.some((s) => s === "vatten" || s.startsWith("vatten (")), "PANTRY_SKIP: vatten filtreras bort");
  assertFalse(all.some((s) => s.includes("valfria grönsaker")), "PANTRY_SKIP: 'valfria grönsaker' filtreras bort");
}

// ─── "eller"-hantering (mängdlös post med " eller " → FÖRSTA alternativet) ─────
{
  const recipes = makeRecipes({ 8: ["oregano eller basilika", "timjan eller rosmarin"] });
  const result = buildShoppingList([8], recipes);
  const all = Object.values(result).flat();
  assertFalse(all.some((s) => s.includes(" eller ")), "eller-hantering: 'X eller Y' kollapsas i noAmount");
  // Ska välja FÖRSTA alternativet (konsekvent med mängd-vägen), inte sista canon.
  assertTrue(all.some((s) => s === "oregano"), "eller-hantering: väljer första alternativet (oregano, ej basilika)");
  assertTrue(all.some((s) => s === "timjan"), "eller-hantering: väljer första alternativet (timjan, ej rosmarin)");
  assertFalse(all.some((s) => s === "basilika" || s === "rosmarin"), "eller-hantering: sista alternativet läggs inte till");
}
{
  // No-amount protein-alternativ: "kyckling eller tofu" → kyckling (inte tofu).
  const recipes = makeRecipes({ 8: ["kyckling eller tofu"] });
  const all = Object.values(buildShoppingList([8], recipes)).flat();
  assertTrue(all.some((s) => s === "kyckling"), "eller-hantering: 'kyckling eller tofu' → kyckling");
  assertFalse(all.some((s) => s === "tofu"), "eller-hantering: 'kyckling eller tofu' lägger inte till tofu");
}

// ─── Merge: summering av samma ingrediens+enhet ───────────────────────────────
{
  const recipes = makeRecipes({
    9:  ["2 dl grädde", "200 g pasta"],
    10: ["1 dl grädde", "100 g pasta"],
  });
  const result = buildShoppingList([9, 10], recipes);
  const mejeri = result.Mejeri;
  // grädde ska summeras till 3 dl
  assertTrue(mejeri.some((s) => s.includes("grädde") && s.includes("3")), "merge: grädde summeras till 3 dl");
  const skafferi = result.Skafferi;
  // pasta ska summeras till 300 g
  assertTrue(skafferi.some((s) => s.includes("pasta") && s.includes("300")), "merge: pasta summeras till 300 g");
}

// ─── Merge: småenheter (tsk/msk) droppar om stor enhet finns ─────────────────
{
  const recipes = makeRecipes({
    11: ["1 msk olivolja", "2 dl olivolja"],
  });
  const result = buildShoppingList([11], recipes);
  const skafferi = result.Skafferi;
  // Ska bara finnas en rad för olivolja med stor enhet
  const oljeRader = skafferi.filter((s) => s.includes("olivolja"));
  assertEq(oljeRader.length, 1, "merge: msk-post droppas när dl-post finns för samma ingrediens");
  assertTrue(oljeRader[0].includes("2"), "merge: kvar är bara dl-posten (2 dl)");
}

// ─── Output-format: "namn (mängd)" ───────────────────────────────────────────
{
  const recipes = makeRecipes({ 12: ["400 g lax"] });
  const result = buildShoppingList([12], recipes);
  assertTrue(result["Fisk & kött"].some((s) => s === "lax (400 g)"), "format: 'lax (400 g)' — namn före mängd i parentes");
}
{
  const recipes = makeRecipes({ 13: ["½ dl soja"] });
  const result = buildShoppingList([13], recipes);
  const all = Object.values(result).flat();
  // ½ dl soja är tsk/msk? nej, dl är stor enhet → ska finnas med mängd
  assertTrue(all.some((s) => s.includes("soja") && s.includes("½")), "format: bråk ½ visas korrekt i output");
}

// ─── Sortering: A-Ö med å/ä/ö sist ──────────────────────────────────────────
{
  const recipes = makeRecipes({
    14: ["1 st aubergine", "1 st zucchini", "2 st ägg", "1 st lök"],
  });
  const result = buildShoppingList([14], recipes);
  // aubergine och lök i Grönsaker, ägg i Mejeri
  const gron = result.Grönsaker;
  const aubergineIdx = gron.findIndex((s) => s.startsWith("aubergine"));
  const lökIdx = gron.findIndex((s) => s.startsWith("lök"));
  const zucchiniIdx = gron.findIndex((s) => s.startsWith("zucchini"));
  // aubergine (a) < lök (l) < zucchini (z)
  assertTrue(aubergineIdx >= 0, "sortering: aubergine finns i Grönsaker");
  assertTrue(lökIdx >= 0, "sortering: lök finns i Grönsaker");
  assertTrue(zucchiniIdx >= 0, "sortering: zucchini finns i Grönsaker");
  assertTrue(aubergineIdx < lökIdx, "sortering: aubergine (a) kommer före lök (l)");
  assertTrue(lökIdx < zucchiniIdx, "sortering: lök (l) kommer före zucchini (z)");
  // ägg (ä) ska sorteras efter z
  const mejeri = result.Mejeri;
  const äggIdx = mejeri.findIndex((s) => s.startsWith("ägg"));
  assertTrue(äggIdx >= 0, "sortering: ägg finns i Mejeri");
  const vanligaFöreÄ = mejeri.filter((s) => !s.match(/^[åäö]/i));
  if (vanligaFöreÄ.length > 0) {
    const sistaVanligaIdx = mejeri.lastIndexOf(vanligaFöreÄ[vanligaFöreÄ.length - 1]);
    assertTrue(äggIdx > sistaVanligaIdx, "sortering: ä (ägg) sorteras efter vanliga bokstäver");
  }
}

// ─── Portionsskalning (backlog #12) ──────────────────────────────────────────
{
  // Utan opts → exakt samma som idag (ingen skalning, ingen extra avrundning)
  const recipes = makeRecipes({ 20: ["2 dl grädde", "½ citron"] });
  const utan = buildShoppingList([20], recipes);
  assertTrue(utan.Mejeri.includes("grädde (2 dl)"), "skalning: utan targetServings → 2 dl grädde orörd");
  assertTrue(utan.Frukt.includes("citron (½)"), "skalning: utan targetServings → ½ citron orörd");

  // target = recipe.servings → faktor 1 → orört
  const rec4 = [{ id: 21, title: "R", servings: 4, ingredients: ["2 dl grädde", "½ citron"] }];
  const lika = buildShoppingList([21], rec4, { targetServings: 4 });
  assertTrue(lika.Mejeri.includes("grädde (2 dl)"), "skalning: target 4 av 4 → 2 dl grädde orörd");
  assertTrue(lika.Frukt.includes("citron (½)"), "skalning: target 4 av 4 → ½ citron orörd");

  // Dubbla portioner: 4-portionsrecept → 8: volymer dubblas, styck dubblas
  const dubbel = buildShoppingList([21], rec4, { targetServings: 8 });
  assertTrue(dubbel.Mejeri.includes("grädde (4 dl)"), "skalning: 4→8 portioner dubblar 2 dl → 4 dl");
  assertTrue(dubbel.Frukt.includes("citron (1)"), "skalning: 4→8 portioner: ½ citron → 1 (heltal)");

  // Nedskalning 4 → 2,5: g avrundas till heltal, styckevara ceilas, dl kvarts-avrundas
  const rec = [{ id: 22, title: "R", servings: 4, ingredients: ["600 g torsk", "3 st morötter", "2 dl grädde"] }];
  const halv = buildShoppingList([22], rec, { targetServings: 2.5 });
  assertTrue(halv["Fisk & kött"].includes("torsk (375 g)"), "skalning: 600 g × 2,5/4 = 375 g");
  assertTrue(halv.Grönsaker.includes("morot (2 st)"), "skalning: 3 st × 0,625 = 1,875 → ceil 2 st");
  assertTrue(halv.Mejeri.includes("grädde (1,25 dl)"), "skalning: 2 dl × 0,625 = 1,25 dl (kvarts-precision)");

  // Recept utan servings-fält antas vara 4 (DEFAULT_SERVINGS)
  const recNoServ = makeRecipes({ 23: ["2 dl grädde"] });
  const noServ = buildShoppingList([23], recNoServ, { targetServings: 8 });
  assertTrue(noServ.Mejeri.includes("grädde (4 dl)"), "skalning: servings saknas → antas 4 → dubblas till 8");

  // Rader utan definierbar mängd skalas inte (kanoniska namnet kvar oskalat)
  const recNoAmt = [{ id: 24, title: "R", servings: 4, ingredients: ["färsk basilika"] }];
  const noAmt = buildShoppingList([24], recNoAmt, { targetServings: 8 });
  assertTrue(noAmt.Grönsaker.includes("basilika"), "skalning: mängdlös rad lämnas orörd");

  // Merge över recept med olika servings: 2 dl (4-port ×2) + 1 dl (2-port ×4) = 8 dl
  const mix = [
    { id: 25, title: "A", servings: 4, ingredients: ["2 dl grädde"] },
    { id: 26, title: "B", servings: 2, ingredients: ["1 dl grädde"] },
  ];
  const mixRes = buildShoppingList([25, 26], mix, { targetServings: 8 });
  assertTrue(mixRes.Mejeri.includes("grädde (8 dl)"), "skalning: merge med olika servings-bas skalar per recept");
}

// ─── Slutrapport ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\nPASS ${passed}/${total}${failed ? ` — ${failed} FAIL` : ""}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("Alla shopping-regressiontester godkanda.");

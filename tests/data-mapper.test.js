// Regressiontester för js/data-mapper.js.
// Körs med `node tests/data-mapper.test.js` — inga externa deps.
//
// Bevakar:
//   1. recipeFromRow konverterar snake_case → camelCase korrekt
//   2. recipeToRow konverterar camelCase → snake_case korrekt
//   3. Round-trip (JSON → row → JSON) bevarar data exakt
//   4. Null/undefined hanteras säkert
//
// Hook: tillagd i .claude/settings.json — körs av PostToolUse vid Edit av data-mapper.js.

import { recipeFromRow, recipeToRow } from "../js/data-mapper.js";

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

function assertNull(actual, desc) {
  if (actual === null) passed++;
  else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: null\n     faktisk:   ${JSON.stringify(actual)}`);
  }
}

const HOUSEHOLD_ID = "71e41d47-0c8e-47c6-83ec-696d256496bf";

// ─── Fixture 1: minimum-recept (inga valfria fält) ────────────────
// Speglar formatet ett enkelt recept kan ha — alla nullable-fält tomma/null.
const fixtureMinJson = {
  id: 100,
  title: "Minimum-recept",
  tested: false,
  servings: 4,
  time: 30,
  timeNote: null,
  tags: [],
  protein: null,
  ingredients: [],
  instructions: [],
  notes: null,
  seasons: [],
};

const fixtureMinRow = {
  id: 100,
  household_id: HOUSEHOLD_ID,
  title: "Minimum-recept",
  tested: false,
  servings: 4,
  time: 30,
  time_note: null,
  tags: [],
  protein: null,
  ingredients: [],
  instructions: [],
  notes: null,
  seasons: [],
};

// ─── Fixture 2: recept med timeNote + seasons (Gräddig fiskgratäng id=1) ───
// Verkligt recept ur recipes.json — bevakar att den kompletta fältuppsättningen funkar.
const fixtureFullJson = {
  id: 1,
  title: "Gräddig fiskgratäng med purjo",
  tested: false,
  servings: 4,
  time: 40,
  timeNote: "ugn 150°",
  tags: ["helg60", "fisk", "ugn"],
  protein: "fisk",
  ingredients: [
    "600 g fryst torsk, sej eller alaska pollock (tinad)",
    "½ tsk salt",
    "2 krm vit- eller svartpeppar",
    "1 liten purjolök",
    "2 msk smör (till stekning)",
    "2 dl grädde",
    "Tillbehör: 3 dl matvete",
    "Tillbehör: 4 dl frysta ärter",
  ],
  instructions: [
    "Sätt ugnen på 150°. Koka matvetet enligt anvisning på förpackningen. Lägg fisken i en ugnsform och krydda med salt och peppar.",
    "Skär purjolöken i tunna skivor. Stek purjon i smör på låg värme tills den är mjuk utan att ha fått färg. Fördela över fisken och häll på grädden. Tillaga mitt i ugnen ca 30 min.",
    "Värm ärterna enligt anvisning på förpackningen och servera till fiskgratängen.",
  ],
  notes: "Tips: Servera med matvete, som här, eller pressad kokt potatis. Toppa gärna med lite färsk strimlad purjolök vid servering. Källa: Mer Smak nr 1 2019.",
  seasons: ["vår", "höst", "vinter"],
};

const fixtureFullRow = {
  id: 1,
  household_id: HOUSEHOLD_ID,
  title: fixtureFullJson.title,
  tested: false,
  servings: 4,
  time: 40,
  time_note: "ugn 150°",
  tags: fixtureFullJson.tags,
  protein: "fisk",
  ingredients: fixtureFullJson.ingredients,
  instructions: fixtureFullJson.instructions,
  notes: fixtureFullJson.notes,
  seasons: fixtureFullJson.seasons,
};

// ─── Fixture 3: tested=true + extra-fält som Supabase returnerar (created_at, updated_at) ───
// Verifierar att mappern ignorerar fält som inte hör hemma i app-modellen.
const fixtureExtraRow = {
  id: 200,
  household_id: HOUSEHOLD_ID,
  title: "Tested recept",
  tested: true,
  servings: 2,
  time: 15,
  time_note: null,
  tags: ["vardag30"],
  protein: "kyckling",
  ingredients: ["1 kycklingfilé"],
  instructions: ["Stek."],
  notes: null,
  seasons: ["sommar"],
  created_at: "2026-05-16T12:00:00Z",
  updated_at: "2026-05-16T12:00:00Z",
};

const fixtureExtraJson = {
  id: 200,
  title: "Tested recept",
  tested: true,
  servings: 2,
  time: 15,
  timeNote: null,
  tags: ["vardag30"],
  protein: "kyckling",
  ingredients: ["1 kycklingfilé"],
  instructions: ["Stek."],
  notes: null,
  seasons: ["sommar"],
};

// ─── recipeFromRow ────────────────────────────────────────────────
assertEq(recipeFromRow(fixtureMinRow), fixtureMinJson, "fromRow: minimum-recept");
assertEq(recipeFromRow(fixtureFullRow), fixtureFullJson, "fromRow: fullt recept med timeNote + seasons");
assertEq(recipeFromRow(fixtureExtraRow), fixtureExtraJson, "fromRow: ignorerar extra-fält (created_at/updated_at)");

// ─── recipeToRow ──────────────────────────────────────────────────
assertEq(recipeToRow(fixtureMinJson, HOUSEHOLD_ID), fixtureMinRow, "toRow: minimum-recept");
assertEq(recipeToRow(fixtureFullJson, HOUSEHOLD_ID), fixtureFullRow, "toRow: fullt recept med timeNote + seasons");

// ─── Round-trip: JSON → row → JSON ────────────────────────────────
assertEq(
  recipeFromRow(recipeToRow(fixtureMinJson, HOUSEHOLD_ID)),
  fixtureMinJson,
  "round-trip: minimum-recept oförändrat"
);
assertEq(
  recipeFromRow(recipeToRow(fixtureFullJson, HOUSEHOLD_ID)),
  fixtureFullJson,
  "round-trip: fullt recept oförändrat"
);

// ─── Round-trip: row → JSON → row (utan extra-fält) ───────────────
assertEq(
  recipeToRow(recipeFromRow(fixtureMinRow), HOUSEHOLD_ID),
  fixtureMinRow,
  "round-trip row→json→row: minimum"
);
assertEq(
  recipeToRow(recipeFromRow(fixtureFullRow), HOUSEHOLD_ID),
  fixtureFullRow,
  "round-trip row→json→row: fullt"
);

// ─── Null/undefined-säkerhet ──────────────────────────────────────
assertNull(recipeFromRow(null), "fromRow(null) returnerar null");
assertNull(recipeFromRow(undefined), "fromRow(undefined) returnerar null");
assertNull(recipeFromRow("inte ett objekt"), "fromRow('string') returnerar null");
assertNull(recipeToRow(null, HOUSEHOLD_ID), "toRow(null) returnerar null");
assertNull(recipeToRow(undefined, HOUSEHOLD_ID), "toRow(undefined) returnerar null");

// ─── Defensiva defaults (saknade arrays/booleans) ────────────────
{
  // Row utan tags/ingredients/instructions/seasons (icke-array, t.ex. undefined)
  const sparseRow = {
    id: 300,
    household_id: HOUSEHOLD_ID,
    title: "Sparse",
    tested: null,
    servings: null,
    time: null,
    time_note: null,
    tags: null,
    protein: null,
    ingredients: undefined,
    instructions: undefined,
    notes: null,
    seasons: null,
  };
  const result = recipeFromRow(sparseRow);
  assertEq(result.tags, [], "fromRow: null-tags → []");
  assertEq(result.ingredients, [], "fromRow: undefined-ingredients → []");
  assertEq(result.instructions, [], "fromRow: undefined-instructions → []");
  assertEq(result.seasons, [], "fromRow: null-seasons → []");
  assertEq(result.tested, false, "fromRow: null-tested → false");
}

{
  // JSON utan arrays
  const sparseJson = { id: 301, title: "Sparse JSON" };
  const result = recipeToRow(sparseJson, HOUSEHOLD_ID);
  assertEq(result.tags, [], "toRow: saknade tags → []");
  assertEq(result.ingredients, [], "toRow: saknade ingredients → []");
  assertEq(result.tested, false, "toRow: saknat tested → false");
  assertEq(result.time_note, null, "toRow: saknat timeNote → null");
  assertEq(result.household_id, HOUSEHOLD_ID, "toRow: household_id propageras");
}

// ─── tested-fältet är strikt boolean ──────────────────────────────
assertEq(recipeFromRow({ ...fixtureMinRow, tested: "true" }).tested, false, "fromRow: tested='true' (string) → false (strikt jämförelse)");
assertEq(recipeFromRow({ ...fixtureMinRow, tested: 1 }).tested, false, "fromRow: tested=1 → false");
assertEq(recipeToRow({ ...fixtureMinJson, tested: "true" }, HOUSEHOLD_ID).tested, false, "toRow: tested='true' (string) → false");

// ─── Slutrapport ──────────────────────────────────────────────────
console.log(`\n${passed} passerade, ${failed} failade.`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla data-mapper-tester godkända.");

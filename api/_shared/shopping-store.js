// Delad motor för inköpslistan (inköpsrundor, Session 130).
//
// Ersätter den tidigare tredubblerade bygg+spara-koden i confirm.js,
// replace-recipe.js och generate.js med EN uniform regel:
//
//   Listan byggs alltid om från en explicit mängd täckta, ej inhandlade dagar.
//
// Dagnivå-spårningen bor i meal_days (db/migrations/009_shopping_rounds.sql):
//   shopped_at       = spärren — dagens ingredienser är inhandlade och
//                      inkluderas aldrig igen automatiskt i en ombyggnad.
//   shopping_list_id = täckning — dagens ingredienser ligger på denna lista.
//                      Pekare mot inaktiva listor är ointressanta (självläkande).
//
// Säkerhetsordningen från den gamla koden bevaras: skapa listan INAKTIV,
// skriv varorna, aktivera SIST — en misslyckad varu-insert lämnar aldrig
// familjen med en aktiv men tom lista.

import { buildShoppingList } from "./shopping-builder.js";
import { db, fetchTargetServings } from "./supabase.js";

// Varunamn → skafferi-nyckel: stryk mängdparentesen ("(2 dl)") och normalisera.
// Speglar pantryKey i js/shopping/shopping-list.js — samma nyckel som raderna i
// pantry_items är lagrade under.
export function pantryKey(name) {
  return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

export async function getActiveList(householdId, database = db) {
  const { data, error } = await database
    .from("shopping_lists")
    .select("id, start_date, end_date, recipe_items_moved_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (error) throw new Error("Kunde inte läsa inköpslistan — prova igen.");
  return data?.[0] || null;
}

// Dagarna en lista täcker (datumordning), inkl. inhandlat-status.
export async function fetchCoverage(householdId, listId, database = db) {
  if (!listId) return [];
  const { data, error } = await database
    .from("meal_days")
    .select("date, shopped_at, recipe_id, recipe_title_snapshot")
    .eq("household_id", householdId)
    .eq("shopping_list_id", listId)
    .order("date");
  if (error) throw new Error("Kunde inte läsa vilka dagar listan täcker — prova igen.");
  return data || [];
}

export function unshoppedDates(coverage) {
  return (coverage || []).filter((r) => !r.shopped_at).map((r) => r.date);
}

// Bygger om hushållets aktiva inköpslista så den täcker exakt coverDates.
//
//  - coverDates: ISO-datum vars recept ska ligga på listan. Dagar utan recept
//    eller med fri dag (blocked) filtreras bort tyst. Samma recept två dagar ⇒
//    dubbla mängder (avsiktligt).
//  - span: {startDate, endDate} eller null → min/max av byggdagarna.
//  - stampMovedAt: true (confirm/add_day) stämplar recipe_items_moved_at = idag
//    så receptvarorna syns direkt på Inköp-fliken; false ärver gamla listans värde.
//  - recipes: recept-array om anroparen redan hämtat dem (annars hämtas de här).
//  - database: injicerbar för tester (samma mönster som generate.js).
//
// Bevaras över ombyggnaden: manuella varor + deras bockar (som tidigare) och —
// NYTT — receptvarors bockar vid exakt namnmatch. En mängdändrad vara
// ("grädde (2 dl)" → "grädde (4 dl)") blir obockad, vilket är rätt: mer ska köpas.
export async function rebuildActiveList({
  householdId,
  coverDates,
  span = null,
  stampMovedAt = false,
  recipes = null,
  database = db,
}) {
  const wanted = [...new Set(coverDates || [])].sort();

  // 1) Dagarna som ska täckas. blocked kan vara null på custom-dagar → "is not true".
  let dayRows = [];
  if (wanted.length) {
    const { data, error } = await database
      .from("meal_days")
      .select("date, recipe_id")
      .eq("household_id", householdId)
      .in("date", wanted)
      .not("recipe_id", "is", null)
      .not("blocked", "is", true);
    if (error) throw new Error("Kunde inte läsa matsedelns dagar — prova igen.");
    dayRows = (data || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  const buildDates = dayRows.map((r) => r.date);
  const recipeIds = dayRows.map((r) => r.recipe_id);

  // 2) Recept + portionsmål. Kasta vid läsfel — en svald läsmiss skulle ersätta
  //    familjens lista med en TOM (samma princip som gamla confirm.js).
  let allRecipes = recipes;
  if (!allRecipes) {
    const { data: recData, error: recErr } = await database
      .from("recipes")
      .select("id, title, ingredients, tags, protein, tested, servings")
      .eq("household_id", householdId);
    if (recErr) throw new Error("Kunde inte läsa recepten — prova igen.");
    allRecipes = recData || [];
  }
  const targetServings = await fetchTargetServings(householdId);

  const shoppingCategories = buildShoppingList(recipeIds, allRecipes, { targetServings });

  // 3) Befintlig aktiv lista: manuella varor + bockar, och receptvarors bockar.
  const oldList = await getActiveList(householdId, database);
  const manualRows = [];
  const oldRecipeChecked = {};
  if (oldList) {
    const { data: existingItems, error: eiErr } = await database
      .from("shopping_items")
      .select("name, checked, source, position")
      .eq("list_id", oldList.id);
    if (eiErr) throw new Error("Kunde inte läsa nuvarande inköpslista — prova igen.");
    for (const item of existingItems || []) {
      if (item.source === "manual") manualRows.push(item);
      else if (item.source === "recipe" && item.checked === true) oldRecipeChecked[item.name] = true;
    }
    manualRows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  const today = new Date().toISOString().slice(0, 10);
  const startDate = span?.startDate ?? buildDates[0] ?? oldList?.start_date ?? today;
  const endDate = span?.endDate ?? buildDates[buildDates.length - 1] ?? oldList?.end_date ?? today;
  const movedAt = stampMovedAt ? today : (oldList?.recipe_items_moved_at ?? null);

  // 4) Skapa listan INAKTIV, skriv varorna, aktivera SIST.
  const { data: newList, error: listErr } = await database
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      start_date: startDate,
      end_date: endDate,
      generated_at: today,
      recipe_items_moved_at: movedAt,
      is_active: false,
    })
    .select()
    .single();
  if (listErr) throw listErr;

  const itemRows = [];
  const checkedItems = {};
  for (const [category, items] of Object.entries(shoppingCategories || {})) {
    (items || []).forEach((name, pos) => {
      const checked = oldRecipeChecked[name] === true;
      itemRows.push({ list_id: newList.id, category, name, source: "recipe", checked, position: pos });
      if (checked) checkedItems[`recipe::${category}::${pos}`] = true;
    });
  }
  const manualItems = manualRows.map((r) => r.name);
  manualRows.forEach((row, idx) => {
    const checked = row.checked === true;
    itemRows.push({
      list_id: newList.id,
      category: "Övrigt",
      name: row.name,
      source: "manual",
      checked,
      position: idx,
    });
    if (checked) checkedItems[`manual::${row.name}`] = true;
  });

  if (itemRows.length > 0) {
    const { error: itemsErr } = await database.from("shopping_items").insert(itemRows);
    if (itemsErr) throw itemsErr;
  }

  await database.from("shopping_lists").update({ is_active: false })
    .eq("household_id", householdId).eq("is_active", true);
  const { error: actErr } = await database.from("shopping_lists")
    .update({ is_active: true }).eq("id", newList.id);
  if (actErr) throw actErr;

  // 5) Täckningspekare: byggdagarna pekar på nya listan.
  if (buildDates.length) {
    const { error: covErr } = await database
      .from("meal_days")
      .update({ shopping_list_id: newList.id })
      .eq("household_id", householdId)
      .in("date", buildDates);
    if (covErr) throw new Error("Listan byggdes, men dagkopplingen kunde inte sparas — ladda om och prova igen.");
  }
  // O-inhandlade dagar som föll ur täckningen (pekar kvar på gamla listan) nollas.
  // Byggdagarna pekar redan på nya listan, så inget datumfilter behövs.
  // Inhandlade dagar behåller sin gamla pekare (historik, stör inget — täckning
  // läses alltid via aktiva listans id). Kosmetisk städning → fel loggas bara.
  if (oldList && oldList.id !== newList.id) {
    const { error: clrErr } = await database
      .from("meal_days")
      .update({ shopping_list_id: null })
      .eq("household_id", householdId)
      .eq("shopping_list_id", oldList.id)
      .is("shopped_at", null);
    if (clrErr) console.error("rebuildActiveList: kunde inte nolla gamla täckningspekare", clrErr);
  }

  return {
    listId: newList.id,
    shoppingList: {
      listId: newList.id,
      generated: today,
      startDate,
      endDate,
      recipeItems: shoppingCategories,
      recipeItemsMovedAt: movedAt,
      manualItems,
      checkedItems,
      coveredDates: buildDates,
    },
  };
}

// Manuellt dagurval (Session 134) — familjen väljer själv vilka dagar
// inköpslistan ska täcka. Listan byggs om så den täcker EXAKT `dates`:
//
//   - Valda dagar får spärren nollad (shopped_at = null) FÖRE ombygget, så en
//     dag som redan handlats kan skickas till listan igen ("oavsett om det är
//     gjort tidigare"). Utan nollningen skulle dagen stå som både inhandlad
//     och på listan — samma ordning som add_day använder.
//   - Dagar som INTE är med i urvalet faller ur täckningen. Deras shopped_at
//     rörs inte: historiken om att de en gång handlats står kvar.
//   - Dagar utan recept och fria dagar filtreras bort tyst men rapporteras i
//     `skipped` så UI:t kan berätta vad som hoppades över.
//   - ARKIVERADE DAGAR återskapas (se restoreArchivedDays). Genererar man två
//     matsedlar efter varandra arkiveras den första och dess meal_days-rader
//     raderas — utan återskapning gick dess dagar inte att handla för.
//
// Tomt urval är tillåtet: receptvarorna töms och bara Egna tillägg blir kvar.
export async function setCoveredDays({ householdId, dates, database = db }) {
  const wanted = [...new Set(dates || [])].sort();

  let usable = [];
  let restored = [];
  if (wanted.length) {
    const read = async () => {
      const { data, error } = await database
        .from("meal_days")
        .select("date, recipe_id, blocked")
        .eq("household_id", householdId)
        .in("date", wanted);
      if (error) throw new Error("Kunde inte läsa matsedelns dagar — prova igen.");
      return data || [];
    };

    let rows = await read();
    const have = new Set(rows.map((r) => r.date));
    const missing = wanted.filter((d) => !have.has(d));
    if (missing.length) {
      restored = await restoreArchivedDays({ householdId, dates: missing, database });
      if (restored.length) rows = await read();
    }

    usable = rows
      .filter((r) => r.recipe_id && r.blocked !== true)
      .map((r) => r.date)
      .sort();
  }
  const usableSet = new Set(usable);
  const skipped = wanted.filter((d) => !usableSet.has(d));

  if (usable.length) {
    const { error: clrErr } = await database
      .from("meal_days")
      .update({ shopped_at: null })
      .eq("household_id", householdId)
      .in("date", usable);
    if (clrErr) throw new Error("Kunde inte lägga dagarna på inköpslistan — prova igen.");
  }

  const { shoppingList } = await rebuildActiveList({
    householdId,
    coverDates: usable,
    stampMovedAt: true,
    database,
  });

  return { shoppingList, coveredDates: usable, skipped, restoredDates: restored };
}

// Återskapar meal_days-rader för dagar som bara finns kvar i plan_archives.
//
// LEGACY sedan Session 137: en generering arkiverar inte längre bort den gamla
// planens dagar (detachOldPlanDays i api/generate.js behåller dem som egna
// dagar), så nya arkivrader skrivs aldrig. Funktionen står kvar för de arkiv
// som redan fanns när ändringen gjordes — tidigare RADERADES dagarnas
// meal_days-rader vid arkiveringen, så genererade man två matsedlar efter
// varandra försvann den förstas dagar ur den tabell som hela inköpsmotorn
// bygger på och gick inte att handla för. Är arkivet tomt är detta en no-op.
//
// Raden återskapas som en EGEN dag (`plan_id = null`) — exakt samma form som en
// familjeplanerad dag, som per invariant #1 alltid bevaras och aldrig skrivs
// över av en generering. Att välja en gammal dag i väljaren är alltså detsamma
// som att adoptera tillbaka den i matsedeln, vilket är precis vad användaren
// menar med "handla för den dagen".
//
// Rör ALDRIG dagar som redan har en rad (då finns dagen i en plan och ägs av
// den). Arkivraden lämnas orörd — historiken står kvar.
async function restoreArchivedDays({ householdId, dates, database = db }) {
  const wanted = new Set(dates);
  if (!wanted.size) return [];

  const { data: archives, error } = await database
    .from("plan_archives")
    .select("archived_at, days")
    .eq("household_id", householdId);
  // Arkivet är en bekvämlighet, inte en sanningskälla — ett läsfel ska inte
  // stoppa resten av urvalet. Dagarna rapporteras då som skipped i stället.
  if (error) return [];

  // Nyaste arkivet vinner om samma datum finns i flera (t.ex. omplanerad vecka).
  const byDate = new Map();
  const sorted = (archives || []).slice().sort((a, b) =>
    String(a.archived_at || "").localeCompare(String(b.archived_at || "")));
  for (const arch of sorted) {
    for (const d of arch.days || []) {
      if (!d?.date || !d?.recipeId || !wanted.has(d.date)) continue;
      byDate.set(d.date, { recipeId: d.recipeId, title: d.recipe || null });
    }
  }
  if (!byDate.size) return [];

  const rows = [...byDate.entries()].map(([date, v]) => ({
    household_id: householdId,
    date,
    plan_id: null,
    recipe_id: v.recipeId,
    recipe_title_snapshot: v.title,
  }));

  const { error: insErr } = await database.from("meal_days").insert(rows);
  if (insErr) throw new Error("Kunde inte hämta tillbaka dagarna från den tidigare matsedeln — prova igen.");

  return rows.map((r) => r.date).sort();
}

// "Vi har handlat" — stämplar alla o-inhandlade täckta dagar på aktiva listan
// och konverterar obockade, icke-skafferi receptvaror till Egna tillägg
// (source='manual') så de överlever nästa ombyggnad. Varorna byggs INTE om —
// spärren slår vid nästa ombyggnad, listan står orörd tills dess.
export async function markRoundShopped(householdId, database = db) {
  const list = await getActiveList(householdId, database);
  if (!list) return { shoppedDates: [], converted: 0 };

  const coverage = await fetchCoverage(householdId, list.id, database);
  const dates = unshoppedDates(coverage);
  if (!dates.length) return { shoppedDates: [], converted: 0 };

  const { error: stampErr } = await database
    .from("meal_days")
    .update({ shopped_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("shopping_list_id", list.id)
    .is("shopped_at", null);
  if (stampErr) throw new Error("Kunde inte markera dagarna som inhandlade — prova igen.");

  // Obockade receptvaror → Egna tillägg (Joakims beslut: inget tappas).
  // Skafferivaror ("har hemma") hoppas över — de ska inte återuppstå som egna
  // tillägg. Misslyckas pantry-läsningen behandlas skafferiet som tomt (hellre
  // en överlevande vara för mycket än en tyst borttappad).
  const { data: items, error: itemsErr } = await database
    .from("shopping_items")
    .select("id, name")
    .eq("list_id", list.id)
    .eq("source", "recipe")
    .eq("checked", false);
  if (itemsErr) throw new Error("Dagarna markerades, men varorna kunde inte flyttas till Egna tillägg — ladda om och prova igen.");

  let pantry = new Set();
  const { data: pantryRows, error: pantryErr } = await database
    .from("pantry_items")
    .select("name")
    .eq("household_id", householdId);
  if (!pantryErr) pantry = new Set((pantryRows || []).map((r) => r.name));

  const toConvert = (items || []).filter((i) => !pantry.has(pantryKey(i.name)));
  if (toConvert.length) {
    const { error: convErr } = await database
      .from("shopping_items")
      .update({ source: "manual" })
      .in("id", toConvert.map((i) => i.id));
    if (convErr) throw new Error("Dagarna markerades, men varorna kunde inte flyttas till Egna tillägg — ladda om och prova igen.");
  }

  return { shoppedDates: dates, converted: toConvert.length };
}

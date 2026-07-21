// Rena hjälpfunktioner för dagflytt-operationer (flytta dag / fri dag) — ingen
// DB, inga sidoeffekter. All rotationsmatematik bor här så att den kan
// enhetstestas (tests/day-ops.test.js) och delas mellan endpoints.
//
// Hård invariant (projektregel: befintlig plan får aldrig förstöras): en flytt
// får ALDRIG ändra innehållsmängden. Varje komposit verifierar att recept,
// noteringar och plan-tillhörighet bevaras och returnerar { error: "invariant" }
// istället för ett resultat om något skulle ha tappats — endpointen avbryter
// då UTAN att skriva.

export function contentOf(r) {
  return {
    recipe_id:             r.recipe_id ?? null,
    recipe_title_snapshot: r.recipe_title_snapshot ?? null,
    saving:                r.saving ?? null,
    saving_matches:        r.saving_matches ?? null,
    // Inköpsrundor (migration 009): inhandlat-status och listtäckning följer
    // RECEPTINNEHÅLLET, inte datumet — flyttas måndagens inhandlade lasagne
    // till torsdag är den fortfarande inhandlad.
    shopped_at:            r.shopped_at ?? null,
    shopping_list_id:      r.shopping_list_id ?? null,
  };
}

// Hela radens innehåll = allt UTOM datumet. Inkluderar plan_id och custom_note
// så att plandagar, egna dagar och anteckningar kan rotera/byta plats fullt ut.
// Delas av swap-days (byt plats) och move-day (kläm in).
export function fullContent(r) {
  return {
    plan_id:               r?.plan_id ?? null,
    recipe_id:             r?.recipe_id ?? null,
    recipe_title_snapshot: r?.recipe_title_snapshot ?? null,
    saving:                r?.saving ?? null,
    saving_matches:        r?.saving_matches ?? null,
    custom_note:           r?.custom_note ?? null,
    locked:                r?.locked === true,
    blocked:               r?.blocked === true,
    shopped_at:            r?.shopped_at ?? null,
    shopping_list_id:      r?.shopping_list_id ?? null,
  };
}

// "Helt tom dag" — en rad med detta innehåll kan raderas i stället för att
// lämnas kvar som skräprad (hålet som vandrar vid kläm in).
export function isEmptyContent(c) {
  return !c || (
    c.plan_id == null && c.recipe_id == null && c.custom_note == null &&
    c.saving == null && c.shopped_at == null && c.shopping_list_id == null &&
    c.locked !== true && c.blocked !== true
  );
}

export function recipeMultiset(rows) {
  return rows.map((r) => r.recipe_id).filter((id) => id != null).sort((a, b) => a - b).join(",");
}

export function sameRecipes(a, b) {
  return recipeMultiset(a) === recipeMultiset(b);
}

// Lyft ur elementet på srcIdx och kläm in det före tgtIdx (tgtIdx = längden →
// sist). Returnerar ny lista, eller null om flytten är en no-op.
export function rotateMove(items, srcIdx, tgtIdx) {
  const out = items.slice();
  const [moved] = out.splice(srcIdx, 1);
  const insertIdx = tgtIdx - (srcIdx < tgtIdx ? 1 : 0);
  if (insertIdx === srcIdx) return null;
  out.splice(insertIdx, 0, moved);
  return out;
}

// ── Generaliserad "kläm in" (Session 131) — alla dagtyper ────────────────────
// entries = KONTINUERLIGT datumspann [{ date, blocked, content|null }] där
// content är fullContent-format (null = tom dag, ett hål som vandrar med i
// rotationen). Fria dagar (blocked) är PINNADE vid sina datum — rotationen sker
// bara över icke-fria slots. beforeDate = null → efter sista innehållsdagen.
// Returnerar { next } (samma form), { noop: true } eller
// { error: "src" | "target" | "invariant" }.
export function spanAfterInsert(entries, srcDate, beforeDate) {
  const slots = entries.filter((e) => e.blocked !== true);
  const srcIdx = slots.findIndex((e) => e.date === srcDate);
  if (srcIdx === -1 || isEmptyContent(slots[srcIdx].content)) return { error: "src" };

  let tgtIdx;
  if (beforeDate) {
    tgtIdx = slots.findIndex((e) => e.date === beforeDate);
    if (tgtIdx === -1) return { error: "target" };
  } else {
    // "Sist": efter sista slotten med innehåll
    let lastIdx = -1;
    slots.forEach((e, i) => { if (!isEmptyContent(e.content)) lastIdx = i; });
    if (lastIdx === srcIdx) return { noop: true };
    tgtIdx = lastIdx + 1;
  }

  const rotated = rotateMove(slots.map((e) => e.content), srcIdx, tgtIdx);
  if (!rotated) return { noop: true };

  const bySlotDate = new Map(slots.map((e, i) => [e.date, rotated[i]]));
  const next = entries.map((e) =>
    e.blocked === true ? { ...e } : { date: e.date, blocked: false, content: bySlotDate.get(e.date) }
  );

  // Invariant: recept, noteringar OCH plan-tillhörighet bevaras exakt.
  const sig = (list) => {
    const recs = [], notes = [], plans = [];
    for (const e of list) {
      const c = e.content;
      if (!c) continue;
      if (c.recipe_id != null) recs.push(c.recipe_id);
      if (c.custom_note != null) notes.push(c.custom_note);
      if (c.plan_id != null) plans.push(c.plan_id);
    }
    return JSON.stringify([recs.sort(), notes.sort(), plans.sort()]);
  };
  if (sig(entries) !== sig(next)) return { error: "invariant" };
  return { next };
}

// Diff efter spanAfterInsert: vilka datum ska skrivas (fullt innehåll) och
// vilka rader ska raderas (datumet blev helt tomt). Jämför normaliserat
// innehåll per datum — bara faktiska ändringar rapporteras.
export function changedFullRows(oldEntries, nextEntries) {
  const norm = (c) => (isEmptyContent(c) ? null : JSON.stringify(fullContent(c)));
  const upserts = [];
  const deletions = [];
  for (let i = 0; i < nextEntries.length; i++) {
    const oldE = oldEntries[i], nextE = nextEntries[i];
    if (nextE.blocked === true) continue;                  // pinnade rörs aldrig
    const before = norm(oldE.content);
    const after = norm(nextE.content);
    if (before === after) continue;
    if (after === null) {
      if (oldE.content) deletions.push(nextE.date);        // rad fanns → tomt = radera
    } else {
      upserts.push({ date: nextE.date, content: fullContent(nextE.content) });
    }
  }
  return { upserts, deletions };
}

// "Fri dag": skjut in en blockerad lucka på dagens position — innehållet från
// och med dagen skjuts ett steg framåt och planen förlängs med newDate i
// slutet. (Här skiftas ALLT, även andra fria dagar — det är "skjut planen →".)
// Returnerar { next } (längd + 1) eller { error: ... }.
export function planAfterFree(rows, date, newDate) {
  const idx = rows.findIndex((r) => r.date === date);
  if (idx === -1) return { error: "not_found" };
  if (rows[idx].blocked === true) return { error: "already_free" };

  const shifted = rows.map((r) => ({ ...contentOf(r), blocked: r.blocked === true }));
  shifted.splice(idx, 0, {
    recipe_id: null, recipe_title_snapshot: null,
    saving: null, saving_matches: null, blocked: true,
  });
  const dates = [...rows.map((r) => r.date), newDate];
  const next = dates.map((dt, i) => ({ date: dt, ...shifted[i] }));
  if (!sameRecipes(rows, next)) return { error: "invariant" };
  return { next };
}

// Inversen: ta bort den fria luckan, dra allt bakåt och kapa sista dagen.
// Returnerar { next, removedDate } eller { error: ... }.
export function planAfterUnfree(rows, date) {
  const idx = rows.findIndex((r) => r.date === date);
  if (idx === -1) return { error: "not_found" };
  if (rows[idx].blocked !== true) return { error: "not_free" };
  if (rows.length <= 1) return { error: "would_empty" };

  const shifted = rows.map((r) => ({ ...contentOf(r), blocked: r.blocked === true }));
  shifted.splice(idx, 1);
  const removedDate = rows[rows.length - 1].date;
  const dates = rows.slice(0, -1).map((r) => r.date);
  const next = dates.map((dt, i) => ({ date: dt, ...shifted[i] }));
  if (!sameRecipes(rows, next)) return { error: "invariant" };
  return { next, removedDate };
}

// Raderna vars innehåll/blocked faktiskt ändrats mellan old och next —
// jämförda per datum. Bara dessa behöver skrivas (en bulk-upsert).
export function changedRows(oldRows, nextRows) {
  const oldByDate = new Map(oldRows.map((r) => [r.date, r]));
  return nextRows.filter((n) => {
    const o = oldByDate.get(n.date);
    if (!o) return true; // ny rad (t.ex. fri dag-svansen)
    return o.recipe_id !== n.recipe_id
      || o.recipe_title_snapshot !== n.recipe_title_snapshot
      || (o.saving ?? null) !== (n.saving ?? null)
      || JSON.stringify(o.saving_matches ?? null) !== JSON.stringify(n.saving_matches ?? null)
      || (o.blocked === true) !== (n.blocked === true)
      || (o.shopped_at ?? null) !== (n.shopped_at ?? null)
      || (o.shopping_list_id ?? null) !== (n.shopping_list_id ?? null);
  });
}

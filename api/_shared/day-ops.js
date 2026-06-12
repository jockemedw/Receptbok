// Rena hjälpfunktioner för dagflytt-operationer (flytta dag / fri dag) — ingen
// DB, inga sidoeffekter. All rotationsmatematik bor här så att den kan
// enhetstestas (tests/day-ops.test.js) och delas mellan endpoints.
//
// Hård invariant (projektregel: befintlig plan får aldrig förstöras): en flytt
// får ALDRIG ändra receptmängden. Varje komposit verifierar sameRecipes() och
// returnerar { error: "invariant" } istället för ett resultat om något skulle
// ha tappats — endpointen avbryter då UTAN att skriva.

export function contentOf(r) {
  return {
    recipe_id:             r.recipe_id ?? null,
    recipe_title_snapshot: r.recipe_title_snapshot ?? null,
    saving:                r.saving ?? null,
    saving_matches:        r.saving_matches ?? null,
  };
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

// "Flytta dag": datumen ligger fast, innehållet roteras. Fria dagar (blocked)
// är PINNADE vid sina datum — rotationen sker bara över icke-fria rader.
// rows = planens rader i datumordning. Returnerar:
//   { next }      — hela radlistan efter flytten (blocked-rader orörda kopior)
//   { noop: true }
//   { error: "src" | "target" | "invariant" }
export function planAfterMove(rows, srcDate, beforeDate) {
  const movable = rows.filter((r) => r.blocked !== true);
  const srcIdx = movable.findIndex((r) => r.date === srcDate);
  if (srcIdx === -1) return { error: "src" };
  let tgtIdx = movable.length; // beforeDate = null → kläm in sist
  if (beforeDate) {
    tgtIdx = movable.findIndex((r) => r.date === beforeDate);
    if (tgtIdx === -1) return { error: "target" };
  }
  const rotated = rotateMove(movable.map(contentOf), srcIdx, tgtIdx);
  if (!rotated) return { noop: true };

  const byDate = new Map(movable.map((r, i) => [r.date, rotated[i]]));
  const next = rows.map((r) =>
    r.blocked === true ? { ...r } : { ...r, ...byDate.get(r.date) }
  );
  if (!sameRecipes(rows, next)) return { error: "invariant" };
  return { next };
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
      || (o.blocked === true) !== (n.blocked === true);
  });
}

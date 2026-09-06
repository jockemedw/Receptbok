// Rena hjälpfunktioner för dagoperationer i matsedeln — ingen DB, inga
// sidoeffekter. All rotationsmatematik bor här så den kan enhetstestas
// (tests/day-ops.test.js) och delas av api/day.js.
//
// EN modell (Session 142): en dag är en slot med innehåll. Innehållet kan vara
// en plandag, en egen receptdag, en notering, en fri dag eller ingenting alls
// (ett hål). Alla dagtyper deltar likadant i rotationerna — inga pinnade fria
// dagar, inga särregler per typ. Datumen ligger alltid fast; det är INNEHÅLLET
// som byter datum.
//
// Tre operationer på samma primitiv (rotateMove):
//   insert  — lyft ur en dag och kläm in den före en annan; dagarna emellan
//             roterar ett steg (listordning, som iOS-hemskärmen).
//   push    — gör plats på ett datum: närmaste hål efter datumet dras hit och
//             allt emellan skjuts en dag framåt ("ikväll blir det inget").
//   pull    — inversen: hålet/markören på datumet tas bort och allt efter dras
//             en dag bakåt fram till nästa hål ("dra ihop matsedeln").
//
// Hård invariant (projektregel: befintlig plan får aldrig förstöras): en
// operation får ALDRIG ändra innehållsmängden. Varje komposit verifierar att
// recept, noteringar och plan-tillhörighet bevaras och returnerar
// { error: "invariant" } i stället för ett resultat om något skulle ha tappats
// — endpointen avbryter då UTAN att skriva. (pull tar medvetet bort EN markör —
// noteringen/fri dag-flaggan på det valda datumet — och verifierar resten.)

// Hela radens innehåll = allt UTOM datumet. Inkluderar plan_id och custom_note
// så att plandagar, egna dagar och anteckningar kan rotera/byta plats fullt ut.
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
    // Inköpsrundor (migration 009): inhandlat-status och listtäckning följer
    // RECEPTINNEHÅLLET, inte datumet — flyttas måndagens inhandlade lasagne
    // till torsdag är den fortfarande inhandlad.
    shopped_at:            r?.shopped_at ?? null,
    shopping_list_id:      r?.shopping_list_id ?? null,
  };
}

// "Helt tom dag" — en rad med detta innehåll kan raderas i stället för att
// lämnas kvar som skräprad (hålet som vandrar vid rotation).
export function isEmptyContent(c) {
  return !c || (
    c.plan_id == null && c.recipe_id == null && c.custom_note == null &&
    c.saving == null && c.shopped_at == null && c.shopping_list_id == null &&
    c.locked !== true && c.blocked !== true
  );
}

// Markör = innehåll utan recept (fri dag, ren notering). Får dras ihop (pull).
export function isMarkerContent(c) {
  return !isEmptyContent(c) && c.recipe_id == null;
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

// Innehålls-signatur: recept, noteringar, plan-tillhörighet OCH antal fria
// dagar — oberoende av datum. Två spann med samma signatur har samma innehåll.
export function spanSignature(entries) {
  const recs = [], notes = [], plans = [];
  let free = 0;
  for (const e of entries) {
    const c = e.content;
    if (!c) continue;
    if (c.recipe_id != null) recs.push(c.recipe_id);
    if (c.custom_note != null) notes.push(c.custom_note);
    if (c.plan_id != null) plans.push(c.plan_id);
    if (c.blocked === true) free++;
  }
  return JSON.stringify([recs.sort(), notes.sort(), plans.sort(), free]);
}

function withContents(entries, contents) {
  return entries.map((e, i) => ({ date: e.date, content: contents[i] ?? null }));
}

// ── insert: "kläm in" ────────────────────────────────────────────────────────
// entries = KONTINUERLIGT datumspann [{ date, content|null }] (fullContent-
// format; null = tom dag, ett hål som vandrar med i rotationen).
// beforeDate = null → efter sista innehållsdagen.
// Returnerar { next }, { noop: true } eller { error: "src"|"target"|"invariant" }.
export function spanAfterInsert(entries, srcDate, beforeDate) {
  const srcIdx = entries.findIndex((e) => e.date === srcDate);
  if (srcIdx === -1 || isEmptyContent(entries[srcIdx].content)) return { error: "src" };

  let tgtIdx;
  if (beforeDate) {
    tgtIdx = entries.findIndex((e) => e.date === beforeDate);
    if (tgtIdx === -1) return { error: "target" };
  } else {
    let lastIdx = -1;
    entries.forEach((e, i) => { if (!isEmptyContent(e.content)) lastIdx = i; });
    if (lastIdx === srcIdx) return { noop: true };
    tgtIdx = lastIdx + 1;
  }

  const rotated = rotateMove(entries.map((e) => e.content), srcIdx, tgtIdx);
  if (!rotated) return { noop: true };

  const next = withContents(entries, rotated);
  if (spanSignature(entries) !== spanSignature(next)) return { error: "invariant" };
  return { next };
}

// ── push: "gör plats" ────────────────────────────────────────────────────────
// entries = kontinuerligt spann från datumet t.o.m. närmaste HÅL efter det
// (sista entryn måste vara tom). Hålet dras till första positionen; allt
// emellan skjuts en dag framåt. Anroparen bestämmer sedan vad som ska stå på
// det nu tomma datumet (t.ex. en notering "Vi äter ute").
// Returnerar { next }, { noop: true } eller { error: "src"|"hole"|"invariant" }.
export function spanAfterPush(entries) {
  if (!entries.length || isEmptyContent(entries[0].content)) return { error: "src" };
  const last = entries.length - 1;
  if (!isEmptyContent(entries[last].content)) return { error: "hole" };
  if (entries.length < 2) return { noop: true };

  const rotated = rotateMove(entries.map((e) => e.content), last, 0);
  if (!rotated) return { noop: true };

  const next = withContents(entries, rotated);
  if (spanSignature(entries) !== spanSignature(next)) return { error: "invariant" };
  return { next };
}

// ── pull: "dra ihop" ─────────────────────────────────────────────────────────
// entries = kontinuerligt spann från datumet (tomt eller en markör utan recept)
// t.o.m. närmaste hål efter det. Markören tas bort och allt emellan dras en
// dag bakåt. Inversen av push.
// Returnerar { next }, { noop: true } eller { error: "src"|"hole"|"invariant" }.
export function spanAfterPull(entries) {
  if (!entries.length) return { error: "src" };
  const first = entries[0].content;
  if (!isEmptyContent(first) && !isMarkerContent(first)) return { error: "src" };
  const last = entries.length - 1;
  if (last > 0 && !isEmptyContent(entries[last].content)) return { error: "hole" };
  if (entries.length === 1 && isEmptyContent(first)) return { noop: true };

  // Markören roteras sist och släcks; resten glider ett steg bakåt.
  const contents = entries.map((e) => e.content);
  const rotated = entries.length > 1 ? rotateMove(contents, 0, entries.length) : contents.slice();
  rotated[rotated.length - 1] = null;

  const next = withContents(entries, rotated);
  if (spanSignature(entries.slice(1)) !== spanSignature(next)) return { error: "invariant" };
  return { next };
}

// Diff efter en rotation: vilka datum ska skrivas (fullt innehåll) och vilka
// rader ska raderas (datumet blev helt tomt). Jämför normaliserat innehåll per
// datum — bara faktiska ändringar rapporteras.
export function changedFullRows(oldEntries, nextEntries) {
  const norm = (c) => (isEmptyContent(c) ? null : JSON.stringify(fullContent(c)));
  const upserts = [];
  const deletions = [];
  for (let i = 0; i < nextEntries.length; i++) {
    const oldE = oldEntries[i], nextE = nextEntries[i];
    const before = norm(oldE?.content);
    const after = norm(nextE.content);
    if (before === after) continue;
    if (after === null) {
      if (oldE?.content) deletions.push(nextE.date);   // rad fanns → tomt = radera
    } else {
      upserts.push({ date: nextE.date, content: fullContent(nextE.content) });
    }
  }
  return { upserts, deletions };
}

// ── Datumhjälpare (UTC-säkra, delas av endpoint och tester) ──────────────────
export function addDaysIso(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Första datumet EFTER `date` som saknar innehåll (rad saknas eller är tom),
// högst maxDays fram. null om matsedeln är full hela vägen.
export function firstHoleAfter(byDate, date, maxDays) {
  for (let i = 1; i <= maxDays; i++) {
    const iso = addDaysIso(date, i);
    const r = byDate.get(iso);
    if (!r || isEmptyContent(fullContent(r))) return iso;
  }
  return null;
}

// Kontinuerligt spann [from..to] som entries (tomma datum = null-innehåll).
export function spanEntries(byDate, from, to) {
  const out = [];
  for (let cur = from; cur <= to; cur = addDaysIso(cur, 1)) {
    const r = byDate.get(cur);
    const c = r ? fullContent(r) : null;
    out.push({ date: cur, content: isEmptyContent(c) ? null : c });
  }
  return out;
}

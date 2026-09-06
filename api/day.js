import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import {
  fullContent, isEmptyContent, isMarkerContent,
  spanAfterInsert, spanAfterPush, spanAfterPull, changedFullRows,
  firstHoleAfter, spanEntries,
} from "./_shared/day-ops.js";
import { RETRO_WINDOW_DAYS } from "./_shared/constants.js";
import { getActiveList, fetchCoverage, unshoppedDates, rebuildActiveList } from "./_shared/shopping-store.js";

// ALLA dagoperationer i matsedeln — en endpoint, en modell (Session 142).
// Ersätter move-day, swap-days och skip-day. En dag är en rad i meal_days;
// plandagar, egna dagar, noteringar och fria dagar behandlas LIKADANT.
// Datumen ligger fast — innehållet byter datum.
//
// Body: { action, date, to?, before?, note? }
//   swap    { date, to }        — dagarna byter innehåll. Är `to` tom flyttas
//                                 raden dit (datumbyte i EN update, atomärt).
//   insert  { date, before? }   — "kläm in": dagen lyfts ur och kläms in före
//                                 `before` (null = sist); dagarna emellan roterar.
//   push    { date, note? }     — "gör plats": närmaste hål efter dagen dras hit,
//                                 allt emellan skjuts en dag framåt — även över
//                                 plangränsen. Med `note` skrivs en egen
//                                 notering ("Vi äter ute") på det tömda datumet.
//   pull    { date }            — inversen: markören/hålet på dagen tas bort och
//                                 allt efter dras en dag bakåt till nästa hål.
//   delete  { date }            — dagen försvinner helt; o-inhandlade varor
//                                 plockas bort från aktiva inköpslistan.
//
// Rotationerna bor i _shared/day-ops.js (enhetstestade, verifierar att
// innehållsmängden är oförändrad FÖRE skrivning — invariant #1). Skrivordning:
// upsert först, sedan delete av tömda datum — ett partiellt fel kan ge en
// synlig dubblett, aldrig förlorat innehåll. Flyttar rör aldrig inköpslistan:
// inhandlat-status och listtäckning följer receptet (fullContent).
//
// Svar (alla actions): { ok, noop?, weeklyPlan, customDays, shoppingList?, listStale? }

const ROW_FIELDS = "date, plan_id, recipe_id, recipe_title_snapshot, saving, saving_matches, blocked, locked, custom_note, shopped_at, shopping_list_id";
const PUSH_MAX_DAYS = 60;   // hur långt fram ett hål söks vid push/pull
const ACTIONS = ["swap", "insert", "push", "pull", "delete"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

async function readRows(householdId) {
  const { data, error } = await db
    .from("meal_days")
    .select(ROW_FIELDS)
    .eq("household_id", householdId)
    .order("date");
  if (error) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  return data || [];
}

async function readActivePlan(householdId) {
  const { data, error } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (error) throw new Error("Kunde inte läsa matsedeln — prova igen.");
  return data?.[0] || null;
}

// Upsert först, delete sist (se filhuvudet).
async function writeDiff(householdId, entries, next, label) {
  const { upserts, deletions } = changedFullRows(entries, next);
  if (upserts.length) {
    const payload = upserts.map((u) => ({ household_id: householdId, date: u.date, ...u.content }));
    const { error } = await db.from("meal_days").upsert(payload, { onConflict: "household_id,date" });
    if (error) {
      console.error(`day ${label}: upsert misslyckades`, error);
      throw new Error("Kunde inte spara ändringen — prova igen.");
    }
  }
  if (deletions.length) {
    const { error } = await db.from("meal_days").delete()
      .eq("household_id", householdId).in("date", deletions);
    if (error) {
      console.error(`day ${label}: städning av tömda dagar misslyckades`, error);
      throw new Error("Ändringen sparades, men en tömd dag kunde inte städas — ladda om sidan.");
    }
  }
}

function rotationError(res, result, label, ctx) {
  if (result.error === "src")    return bad(res, "Dagen har inget att flytta.");
  if (result.error === "target") return bad(res, "Måldagen finns inte i matsedeln.");
  if (result.error === "hole")   return bad(res, "Matsedeln är full flera veckor framåt — ta bort en dag först.", 409);
  console.error(`day ${label}: invariant bruten — avbryter utan att skriva`, ctx);
  return res.status(500).json({ error: "Ändringen avbröts som säkerhetsåtgärd — ingenting har ändrats. Prova igen." });
}

// ── Svar: planen + egna dagar läses om EN gång efter skrivningen ─────────────
// Planens datumspann räknas om från dess rader (en flytt kan ha dragit ett
// recept utanför det gamla spannet); en helt tömd plan deaktiveras.
async function buildResponse(householdId, plan, extra = {}) {
  const rows = await readRows(householdId);
  let weeklyPlan = null;

  if (plan) {
    const planRows = rows.filter((r) => r.plan_id === plan.id);
    if (!planRows.length) {
      const { error } = await db.from("weekly_plans").update({ is_active: false }).eq("id", plan.id);
      if (error) console.error("day: kunde inte deaktivera tömd plan", error);
    } else {
      const newStart = planRows[0].date;
      const newEnd = planRows[planRows.length - 1].date;
      if (newStart !== plan.start_date || newEnd !== plan.end_date) {
        const { error } = await db.from("weekly_plans")
          .update({ start_date: newStart, end_date: newEnd }).eq("id", plan.id);
        // Kasta i stället för att svara med ett spann som aldrig sparades —
        // annars divergerar klient och DB tills nästa omladdning.
        if (error) throw new Error("Ändringen sparades, men veckans datumspann kunde inte uppdateras — ladda om sidan.");
      }
      weeklyPlan = {
        startDate:   newStart,
        endDate:     newEnd,
        confirmedAt: plan.confirmed_at || null,
        days: planRows.map((d) => ({
          date:          d.date,
          recipe:        d.recipe_title_snapshot || null,
          recipeId:      d.recipe_id ?? null,
          saving:        d.saving ?? null,
          savingMatches: d.saving_matches ?? null,
          locked:        d.locked === true,
          blocked:       d.blocked === true,
          shoppedAt:     d.shopped_at ?? null,
          listId:        d.shopping_list_id ?? null,
        })),
      };
    }
  }

  // Samma form som loadCustomDays i plan-viewer.js (inkl. rundstatus).
  const customDays = { entries: {} };
  for (const r of rows) {
    if (r.plan_id != null) continue;
    if (r.custom_note == null && r.recipe_id == null && !r.recipe_title_snapshot && r.blocked !== true) continue;
    customDays.entries[r.date] = {
      note:        r.custom_note || "",
      recipeId:    r.recipe_id ?? null,
      recipeTitle: r.recipe_title_snapshot || "",
      blocked:     r.blocked === true,
      shoppedAt:   r.shopped_at ?? null,
      listId:      r.shopping_list_id ?? null,
    };
  }

  return { ok: true, weeklyPlan, customDays, ...extra };
}

export default createSupabaseHandler(async (req, res) => {
  const { action, date, to = null, before = null, note = null } = req.body || {};
  if (!ACTIONS.includes(action)) return bad(res, "Okänd åtgärd — ladda om sidan och prova igen.");
  if (!date || !ISO_RE.test(date)) return bad(res, "date saknas");
  for (const v of [to, before]) {
    if (v != null && !ISO_RE.test(v)) return bad(res, "Något av datumen såg konstigt ut — ladda om sidan och prova igen.");
  }

  // Retro-planering: passerade dagar får ändras inom hela tidslinjens horisont
  // bakåt (RETRO_WINDOW_DAYS). Äldre är historik. Servern står på egna ben
  // oavsett klientvalideringen.
  const minIso = new Date(Date.now() - RETRO_WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
  if ([date, to, before].some((v) => v && v < minIso)) {
    return bad(res, "Dagen ligger längre bak än matsedeln sträcker sig och kan inte ändras.");
  }

  const householdId = await getHouseholdId();
  const plan = await readActivePlan(householdId);
  const rows = await readRows(householdId);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const srcRow = byDate.get(date) || null;
  const srcContent = srcRow ? fullContent(srcRow) : null;
  const hasContent = (iso) => { const r = byDate.get(iso); return !!r && !isEmptyContent(fullContent(r)); };

  // ── swap ───────────────────────────────────────────────────────────────────
  if (action === "swap") {
    if (!to) return bad(res, "to saknas");
    if (to === date) return bad(res, "Välj två olika dagar.");
    if (!hasContent(date)) return bad(res, "Dagen har inget att flytta.", 404);
    const dst = byDate.get(to);
    if (dst && !isEmptyContent(fullContent(dst))) {
      // Båda finns → byt fullt innehåll i EN bulk-upsert (en SQL-sats, atomär)
      const { error } = await db.from("meal_days").upsert([
        { household_id: householdId, date, ...fullContent(dst) },
        { household_id: householdId, date: to, ...srcContent },
      ], { onConflict: "household_id,date" });
      if (error) { console.error("day swap: upsert misslyckades", error); throw new Error("Kunde inte byta dagarna — prova igen."); }
    } else {
      // Målet tomt → flytta raden dit genom att byta dess datum (en UPDATE,
      // atomärt; raden behåller plan-tillhörighet, lås och notering).
      if (dst) {
        const { error: delErr } = await db.from("meal_days").delete().eq("household_id", householdId).eq("date", to);
        if (delErr) throw new Error("Kunde inte flytta dagen — prova igen.");
      }
      const { error } = await db.from("meal_days").update({ date: to }).eq("household_id", householdId).eq("date", date);
      if (error) { console.error("day swap: datumbyte misslyckades", error); throw new Error("Kunde inte flytta dagen — prova igen."); }
    }
    return res.status(200).json(await buildResponse(householdId, plan));
  }

  // ── insert ─────────────────────────────────────────────────────────────────
  if (action === "insert") {
    if (before === date) return bad(res, "Dagen kan inte flyttas till sin egen plats.");
    if (!hasContent(date)) return bad(res, "Dagen har inget att flytta.", 404);
    let spanStart, spanEnd;
    if (before) {
      spanStart = date < before ? date : before;
      spanEnd   = date < before ? before : date;
    } else {
      const contentDates = rows.filter((r) => !isEmptyContent(fullContent(r))).map((r) => r.date);
      const last = contentDates[contentDates.length - 1] || date;
      spanStart = date;
      spanEnd = last > date ? last : date;
    }
    const entries = spanEntries(byDate, spanStart, spanEnd);
    const result = spanAfterInsert(entries, date, before);
    if (result.error) return rotationError(res, result, "insert", { date, before });
    if (!result.noop) await writeDiff(householdId, entries, result.next, "insert");
    return res.status(200).json(await buildResponse(householdId, plan, { noop: result.noop === true }));
  }

  // ── push ───────────────────────────────────────────────────────────────────
  if (action === "push") {
    if (!hasContent(date)) return bad(res, "Dagen har inget att flytta.", 404);
    const hole = firstHoleAfter(byDate, date, PUSH_MAX_DAYS);
    if (!hole) return bad(res, "Matsedeln är full flera veckor framåt — ta bort en dag först.", 409);
    const entries = spanEntries(byDate, date, hole);
    const result = spanAfterPush(entries);
    if (result.error) return rotationError(res, result, "push", { date });
    const next = result.next;
    const text = typeof note === "string" ? note.trim().slice(0, 140) : "";
    if (text) next[0] = { date, content: fullContent({ custom_note: text }) };
    await writeDiff(householdId, entries, next, "push");
    return res.status(200).json(await buildResponse(householdId, plan, { movedTo: next[1]?.date ?? null }));
  }

  // ── pull ───────────────────────────────────────────────────────────────────
  if (action === "pull") {
    if (srcContent && !isEmptyContent(srcContent) && !isMarkerContent(srcContent)) {
      return bad(res, "Dagen har ett recept — flytta eller ta bort det först.");
    }
    const hole = firstHoleAfter(byDate, date, PUSH_MAX_DAYS);
    if (!hole) return bad(res, "Matsedeln är full flera veckor framåt — ta bort en dag först.", 409);
    const entries = spanEntries(byDate, date, hole);
    const result = spanAfterPull(entries);
    if (result.error) return rotationError(res, result, "pull", { date });
    if (!result.noop) await writeDiff(householdId, entries, result.next, "pull");
    return res.status(200).json(await buildResponse(householdId, plan, { noop: result.noop === true }));
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  // Uttrycklig användaråtgärd bakom en danger-bekräftelse i UI:t (invariant #1:
  // aldrig som sidoeffekt). Fungerar för plan-, fria och egna dagar.
  if (!srcRow) return bad(res, "Dagen finns inte i matsedeln.", 404);
  const { error: delErr } = await db.from("meal_days").delete().eq("household_id", householdId).eq("date", date);
  if (delErr) throw new Error("Kunde inte ta bort dagen — prova igen.");

  // Låg dagens varor på aktiva listan (o-inhandlade)? Bygg om listan utan dem.
  // Misslyckas ombygget är dagen ändå borttagen — flagga så klienten kan säga
  // det ärligt.
  let shoppingList = null;
  let listStale = false;
  if (!srcRow.shopped_at && srcRow.shopping_list_id) {
    try {
      const activeList = await getActiveList(householdId);
      if (activeList && srcRow.shopping_list_id === activeList.id) {
        const covered = unshoppedDates(await fetchCoverage(householdId, activeList.id));
        const rebuilt = await rebuildActiveList({
          householdId,
          coverDates: covered.filter((d) => d !== date),
          span: { startDate: activeList.start_date, endDate: activeList.end_date },
        });
        shoppingList = rebuilt.shoppingList;
      }
    } catch (e) {
      console.error("day delete: kunde inte bygga om listan", e);
      listStale = true;
    }
  }
  return res.status(200).json(await buildResponse(householdId, plan, { shoppingList, listStale }));
});

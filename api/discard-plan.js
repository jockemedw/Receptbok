import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { getActiveList, fetchCoverage, unshoppedDates, rebuildActiveList } from "./_shared/shopping-store.js";

const FAIL = "Kunde inte kassera matsedeln — prova igen.";

// Kasserar en opåbörjad (icke-bekräftad) matsedel, i den här ordningen:
// - Tar bort dess meal_days och lägger tillbaka de dagar förslaget skrev över
//   (replaced_days, sparad av generate — migration 012) som egna dagar
// - Deaktiverar weekly_plan (sista steget som kan fallera)
// - Raderar recipe_history-poster för planens recept så de kan väljas igen
//   (best effort — fel loggas bara)
// - Låg förslagsdagar (o-inhandlade) på aktiva inköpslistan byggs listan om
//   utan dem — samma ombygge som day.js delete (S155). Best effort SIST:
//   planen är redan kasserad, så ett fel här ger listStale i stället för fel
//   (ett nytt försök skulle bara ge 404). Inhandlade dagar och egna dagar rörs inte.
//
// Ordningen gör ett nytt försök säkert: misslyckas ett steg står planen kvar
// som aktiv och nästa Kassera gör om resten (radering och återläggning är
// idempotenta — återläggningen skriver aldrig över en dag som har innehåll).
// rebuild: injicerbar för tester.
export async function discardActivePlan(householdId, database = db, { rebuild = rebuildActiveList } = {}) {
  // select * → replaced_days (migration 012) följer med.
  const { data: plans, error: plansErr } = await database
    .from("weekly_plans")
    .select("*")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (plansErr) throw new Error(FAIL);

  const plan = plans?.[0];
  if (!plan) return { status: 404, error: "Ingen matsedel att kassera." };
  if (plan.confirmed_at) return { status: 400, error: "Bekräftad matsedel kan inte kasseras." };

  // Hämta planens recept-id:n och listkopplingar innan vi raderar
  const { data: mealDays, error: daysErr } = await database
    .from("meal_days")
    .select("recipe_id, shopping_list_id, shopped_at")
    .eq("plan_id", plan.id);
  if (daysErr) throw new Error(FAIL);

  const { error: delErr } = await database.from("meal_days").delete().eq("plan_id", plan.id);
  if (delErr) throw new Error(FAIL);

  // Lägg tillbaka de dagar förslaget skrev över. ignoreDuplicates: har ett
  // datum fått innehåll sedan dess (t.ex. en flyttad egen dag) vinner det.
  const replaced = Array.isArray(plan.replaced_days) ? plan.replaced_days : [];
  if (replaced.length) {
    const rows = replaced.map((d) => ({ ...d, household_id: householdId, plan_id: null }));
    const restore = (r) => database.from("meal_days")
      .upsert(r, { onConflict: "household_id,date", ignoreDuplicates: true });
    let { error: restoreErr } = await restore(rows);
    // 23503 = främmande nyckel: listan dagen hörde till har raderats sedan
    // genereringen. Lägg då tillbaka dagarna utan listkoppling hellre än att
    // fastna i ett läge där varje nytt försök fallerar.
    if (restoreErr?.code === "23503") {
      ({ error: restoreErr } = await restore(rows.map((r) => ({ ...r, shopping_list_id: null }))));
    }
    if (restoreErr) throw new Error(FAIL);
  }

  const { error: deactErr } = await database.from("weekly_plans").update({ is_active: false }).eq("id", plan.id);
  if (deactErr) throw new Error(FAIL);

  // Rensa recipe_history för planens recept så de kan väljas direkt igen —
  // utom recept som just lagts tillbaka (de ska ätas på sina dagar).
  const restoredIds = new Set(replaced.map((d) => d.recipe_id).filter((id) => id != null));
  const planRecipeIds = (mealDays || []).map((d) => d.recipe_id)
    .filter((id) => id != null && !restoredIds.has(id));
  if (planRecipeIds.length > 0) {
    const { error: histErr } = await database.from("recipe_history")
      .delete()
      .eq("household_id", householdId)
      .in("recipe_id", planRecipeIds);
    if (histErr) console.warn("discard-plan: kunde inte rensa recipe_history", histErr.message);
  }

  // Bygg om listan om någon o-inhandlad förslagsdag låg på den. Täckningen
  // läses efter raderingen + återläggningen → återlagda dagar som pekar på
  // listan följer med, förslagets dagar är borta.
  let shoppingList = null;
  let listStale = false;
  const listIds = new Set((mealDays || []).filter((d) => d.shopping_list_id && !d.shopped_at).map((d) => d.shopping_list_id));
  if (listIds.size) {
    try {
      const activeList = await getActiveList(householdId, database);
      if (activeList && listIds.has(activeList.id)) {
        const rebuilt = await rebuild({
          householdId,
          coverDates: unshoppedDates(await fetchCoverage(householdId, activeList.id, database)),
          span: { startDate: activeList.start_date, endDate: activeList.end_date },
          database,
        });
        shoppingList = rebuilt.shoppingList;
      }
    } catch (e) {
      console.error("discard-plan: kunde inte bygga om listan", e);
      listStale = true;
    }
  }

  return { status: 200, restored: replaced.length, shoppingList, listStale };
}

export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();
  const result = await discardActivePlan(householdId);
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });
  const emptyPlan = { generated: null, startDate: null, endDate: null, days: [] };
  return res.status(200).json({
    ok: true, weeklyPlan: emptyPlan, restored: result.restored,
    shoppingList: result.shoppingList, listStale: result.listStale,
  });
});

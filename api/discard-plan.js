import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";

const FAIL = "Kunde inte kassera matsedeln — prova igen.";

// Kasserar en opåbörjad (icke-bekräftad) matsedel:
// - Tar bort dess meal_days och lägger tillbaka de dagar förslaget skrev över
//   (replaced_days, sparad av generate — migration 012) som egna dagar
// - Deaktiverar weekly_plan sist
// - Raderar recipe_history-poster för planens recept så de kan väljas igen
// - Rör inte shopping_lists (speglar senast bekräftade plan)
//
// Ordningen gör ett nytt försök säkert: misslyckas ett steg står planen kvar
// som aktiv och nästa Kassera gör om resten (radering och återläggning är
// idempotenta — återläggningen skriver aldrig över en dag som har innehåll).
export async function discardActivePlan(householdId, database = db) {
  // select * → replaced_days följer med när kolumnen finns, utan att
  // läsningen fallerar innan migration 012 är körd.
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

  // Hämta planens recept-id:n innan vi raderar
  const { data: mealDays, error: daysErr } = await database
    .from("meal_days")
    .select("recipe_id")
    .eq("plan_id", plan.id)
    .not("recipe_id", "is", null);
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
  const planRecipeIds = (mealDays || []).map((d) => d.recipe_id).filter((id) => !restoredIds.has(id));
  if (planRecipeIds.length > 0) {
    const { error: histErr } = await database.from("recipe_history")
      .delete()
      .eq("household_id", householdId)
      .in("recipe_id", planRecipeIds);
    if (histErr) console.warn("discard-plan: kunde inte rensa recipe_history", histErr.message);
  }

  return { status: 200, restored: replaced.length };
}

export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();
  const result = await discardActivePlan(householdId);
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });
  const emptyPlan = { generated: null, startDate: null, endDate: null, days: [] };
  return res.status(200).json({ ok: true, weeklyPlan: emptyPlan, restored: result.restored });
});

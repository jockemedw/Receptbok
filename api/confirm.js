import { createSupabaseHandler } from "./_shared/handler.js";
import { db, getHouseholdId } from "./_shared/supabase.js";
import { getActiveList, fetchCoverage, unshoppedDates, rebuildActiveList } from "./_shared/shopping-store.js";

// "Bekräfta och bygg inköpslista" — bygger listan från planens receptdagar PLUS
// (Session 130, inköpsrundor): egna receptdagar (plan_id null) inom planens
// spann och redan täckta o-inhandlade dagar utanför spannet. Dagar med
// shopped_at (inhandlade) inkluderas ALDRIG — det är spärren som gör att
// mitt-i-veckan-handlade recept inte kommer tillbaka på listan.

export default createSupabaseHandler(async (req, res) => {
  const householdId = await getHouseholdId();

  // Hämta aktiv plan + dess dagar
  const { data: plans, error: plansErr } = await db
    .from("weekly_plans")
    .select("id, start_date, end_date, confirmed_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .limit(1);
  if (plansErr) throw plansErr;

  const plan = plans?.[0];
  if (!plan) return res.status(400).json({ error: "Ingen veckoplan att bekräfta." });
  if (plan.confirmed_at) return res.status(400).json({ error: "Planen är redan bekräftad." });

  const { data: mealDays, error: daysErr } = await db
    .from("meal_days")
    .select("date, recipe_id, shopped_at")
    .eq("plan_id", plan.id)
    .not("recipe_id", "is", null);
  if (daysErr) throw daysErr;
  if (!mealDays?.length) return res.status(400).json({ error: "Planen har inga recept." });

  // Egna receptdagar inom planens spann följer med automatiskt (Joakims beslut).
  const { data: customDays, error: custErr } = await db
    .from("meal_days")
    .select("date")
    .eq("household_id", householdId)
    .is("plan_id", null)
    .not("recipe_id", "is", null)
    .not("blocked", "is", true)
    .is("shopped_at", null)
    .gte("date", plan.start_date)
    .lte("date", plan.end_date);
  if (custErr) throw custErr;

  // Redan täckta o-inhandlade dagar (t.ex. en egen dag utanför spannet som lagts
  // på listan via dag-vyn) får inte tappas när listan byggs om.
  const activeList = await getActiveList(householdId);
  const covered = activeList ? unshoppedDates(await fetchCoverage(householdId, activeList.id)) : [];

  const coverDates = [...new Set([
    ...mealDays.filter((d) => !d.shopped_at).map((d) => d.date),
    ...(customDays || []).map((d) => d.date),
    ...covered,
  ])];

  const { shoppingList } = await rebuildActiveList({
    householdId,
    coverDates,
    span: { startDate: plan.start_date, endDate: plan.end_date },
    stampMovedAt: true,
  });

  // Sätt confirmed_at på planen. Misslyckas skrivningen är listan redan bytt —
  // säg det, annars tror klienten att planen är bekräftad medan DB säger nej.
  const { error: confErr } = await db
    .from("weekly_plans")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", plan.id);
  if (confErr) throw new Error("Inköpslistan skapades, men planen kunde inte märkas som bekräftad — prova att bekräfta igen.");

  const confirmedPlan = {
    startDate: plan.start_date,
    endDate: plan.end_date,
    confirmedAt: new Date().toISOString(),
    days: (mealDays || []).map((d) => ({ recipeId: d.recipe_id })),
  };

  return res.status(200).json({ ok: true, weeklyPlan: confirmedPlan, shoppingList });
});

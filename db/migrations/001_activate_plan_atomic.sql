-- 001_activate_plan_atomic.sql
--
-- Bakgrund (CLAUDE.md hård regel: "Befintlig veckoplan får aldrig förstöras",
-- app-analys-backlog.md #3):
--
-- api/generate.js gjorde tidigare plan-bytet i flera separata, icke-transaktionella
-- steg (archiveOldPlan: arkivera dagar → ta bort gamla meal_days → is_active=false;
-- sedan activatePlan: is_active=false på ALLA aktiva planer → is_active=true på den
-- nya). Om processen dör mellan dessa steg (kall lambda, Supabase free-tier-paus,
-- nätfel) hamnar hushållet med NOLL aktiva planer och de gamla meal_days redan
-- borttagna = en tyst "försvunnen matsedel".
--
-- Atomär gräns: den nya planen (med alla sina meal_days) är redan skriven och
-- AVSTÄNGD innan den här funktionen anropas (savePlanToSupabase är en egen,
-- självstädande operation — misslyckas dag-skrivningen städas den halvfärdiga
-- plan-raden bort av JS-koden, och den gamla planen är då fortfarande orörd).
-- Det här är alltså INTE fönstret som orsakar noll-aktiva-planer.
--
-- Fönstret som orsakar noll-aktiva-planer är: gammal plan deaktiveras → ny plan
-- aktiveras. Den här funktionen slår ihop HELA den sekvensen — arkivering av
-- gamla dagar, borttagning av gamla meal_days, deaktivering av gamla planen och
-- aktivering av den nya — i EN transaktion (Postgres-funktioner körs implicit i
-- en transaktion; om något steg kastar rullas allt tillbaka). Antingen lyckas
-- hela bytet, eller så förblir den gamla planen aktiv med sina dagar intakta.
--
-- Anropas via PostgREST RPC: db.rpc('activate_plan_atomic', { ... }).
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Säker att köra
-- om (CREATE OR REPLACE FUNCTION) om den behöver uppdateras senare.

create or replace function activate_plan_atomic(
  p_household_id uuid,
  p_new_plan_id uuid,
  p_new_start_date date
)
returns void
language plpgsql
as $$
declare
  v_old_plan record;
  v_archive_start date;
  v_archive_end date;
  v_archive_days jsonb;
  v_cutoff date;
begin
  -- 1) Hitta nuvarande aktiva plan för hushållet (om någon). Plan-aktivering är
  --    idempotent: finns ingen gammal aktiv plan görs bara steg 5 (aktivera ny).
  select id, start_date, end_date
    into v_old_plan
    from weekly_plans
   where household_id = p_household_id
     and is_active = true
   limit 1;

  if found then
    -- 2) Arkivera gamla dagar som ligger FÖRE den nya planens startdatum
    --    (samma urval som tidigare archiveOldPlan i JS).
    select min(date), max(date),
           jsonb_agg(
             jsonb_build_object(
               'date', date,
               'recipe', recipe_title_snapshot,
               'recipeId', recipe_id
             ) || case when saving is not null
                       then jsonb_build_object('saving', saving)
                       else '{}'::jsonb end
             order by date
           )
      into v_archive_start, v_archive_end, v_archive_days
      from meal_days
     where plan_id = v_old_plan.id
       and date < p_new_start_date
       and recipe_id is not null;

    if v_archive_days is not null then
      insert into plan_archives (household_id, start_date, end_date, archived_at, days)
      values (p_household_id, v_archive_start, v_archive_end, now(), v_archive_days);

      -- Trimma plan_archives — behåll bara arkiv med end_date inom 30 dagar bakåt
      -- (samma trimningsregel som tidigare archiveOldPlan i JS).
      v_cutoff := (now() - interval '30 days')::date;
      delete from plan_archives
       where household_id = p_household_id
         and end_date < v_cutoff;
    end if;

    -- 3) Ta bort gamla planens meal_days (arkiverade ovan, eller överskrivna av
    --    den nya planen — samma som tidigare archiveOldPlan i JS).
    delete from meal_days where plan_id = v_old_plan.id;

    -- 4) Deaktivera gamla planen.
    update weekly_plans set is_active = false where id = v_old_plan.id;
  end if;

  -- 5) Aktivera den nya planen (redan fullt skriven med sina meal_days innan
  --    denna funktion anropas — se savePlanToSupabase i api/generate.js).
  update weekly_plans
     set is_active = true
   where id = p_new_plan_id
     and household_id = p_household_id;

  if not found then
    raise exception 'activate_plan_atomic: hittade ingen plan % för hushåll %', p_new_plan_id, p_household_id;
  end if;
end;
$$;

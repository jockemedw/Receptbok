-- 011_preserve_plan_days.sql
--
-- Bakgrund (Session 137, Joakims rapport):
--   "Jag skapade två matsedlar efter varandra och den första har inte börjat
--    ännu. Eftersom det finns en nyare än dagens tolkas dock den aktuella som
--    'historisk' och jag kan inte redigera den. Jag ser inget behov av
--    historiska kontra aktuella matsedlar som benämning."
--
-- Orsak: vid plan-byte flyttades ALLA kvarvarande dagar på den gamla planen till
-- plan_archives och deras meal_days-rader RADERADES. Urvalet brydde sig inte om
-- datum, och arkivet är rent läsläge i hela UI:t — en matsedel som låg helt i
-- framtiden låstes alltså bara för att det fanns en nyare.
--
-- Den här migrationen tar bort begreppet "historisk matsedel" ur datamodellen:
-- dagar som en ny plan inte täcker BEVARAS som egna dagar (plan_id = null) i
-- stället för att arkiveras bort. Egna dagar är per invariant #1 aldrig något en
-- generering får skriva över, och de är fullt redigerbara på alla ytor.
--
-- TVÅ DELAR:
--   A) Ersätter activate_plan_atomic (från 001) så plan-bytet bevarar i stället
--      för att arkivera + radera. Ren CREATE OR REPLACE — säker att köra om.
--   B) ENGÅNGSRÄDDNING: materialiserar de arkivrader som redan finns till riktiga
--      meal_days-rader, så matsedlar som låstes fast av den gamla logiken går att
--      redigera igen. Idempotent (hoppar över datum som redan har en rad) och
--      körs i en transaktion: dagarna kopieras FÖRE arkivraderna tas bort.
--
-- Notera: api/generate.js lösgör redan dagarna (detachOldPlanDays) INNAN RPC:n
-- anropas, så del A behövs inte för att fixen ska gälla — den flyttar in steget
-- i transaktionen och stänger glappet där processen kan dö mellan lösgörandet
-- och aktiveringen.
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Del A är
-- CREATE OR REPLACE och del B hoppar över datum som redan har en rad — hela
-- filen är säker att köra om.
--
-- Kolumnlistan i del B (household_id, date, plan_id, recipe_id,
-- recipe_title_snapshot) är exakt den som restoreArchivedDays i
-- api/_shared/shopping-store.js redan skriver i produktion; övriga kolumner får
-- sina DEFAULT-värden.

-- ── A) Plan-bytet bevarar i stället för att arkivera ─────────────────────────

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
begin
  -- 1) Hitta nuvarande aktiva plan för hushållet (om någon). Plan-aktivering är
  --    idempotent: finns ingen gammal aktiv plan görs bara steg 4 (aktivera ny).
  select id
    into v_old_plan
    from weekly_plans
   where household_id = p_household_id
     and is_active = true
   limit 1;

  if found then
    -- 2) Bevara den gamla planens kvarvarande dagar som EGNA dagar i stället för
    --    att arkivera och radera dem. Rader som den nya planen täcker har redan
    --    fått nytt plan_id av savePlanToSupabase:s UPSERT på (household_id,
    --    date), så det som ligger kvar med gamla plan_id är per definition dagar
    --    utanför den nya planens spann — före ELLER efter. Efter det här steget
    --    är de vanliga egna dagar: redigerbara, handlingsbara och skyddade mot
    --    framtida genereringar (invariant #1).
    --
    --    p_new_start_date används inte längre (datum styr ingenting), men
    --    parametern är kvar så anropande kod inte behöver ändras.
    update meal_days
       set plan_id = null
     where household_id = p_household_id
       and plan_id = v_old_plan.id;

    -- 3) Deaktivera gamla planen. Inga meal_days raderas — ingenting arkiveras.
    update weekly_plans set is_active = false where id = v_old_plan.id;
  end if;

  -- 4) Aktivera den nya planen (redan fullt skriven med sina meal_days innan
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

-- ── B) Engångsräddning av redan arkiverade dagar ─────────────────────────────

do $$
declare
  v_restored int;
  v_archives int;
begin
  -- Varje arkiverad dag som inte redan har en meal_days-rad blir en egen dag.
  -- distinct on (date): samma datum kan finnas i flera arkiv (omplanerad vecka)
  -- — nyaste arkivet vinner, samma regel som restoreArchivedDays i
  -- api/_shared/shopping-store.js.
  with archived as (
    select distinct on (a.household_id, (d.value ->> 'date')::date)
           a.household_id,
           (d.value ->> 'date')::date            as date,
           (d.value ->> 'recipeId')::int         as recipe_id,
            d.value ->> 'recipe'                 as recipe_title_snapshot,
            a.archived_at
      from plan_archives a
      cross join lateral jsonb_array_elements(a.days) as d(value)
     where d.value ->> 'date' is not null
       and d.value ->> 'recipeId' is not null
     order by a.household_id, (d.value ->> 'date')::date, a.archived_at desc nulls last
  )
  insert into meal_days (household_id, date, plan_id, recipe_id, recipe_title_snapshot)
  select ar.household_id, ar.date, null, ar.recipe_id, ar.recipe_title_snapshot
    from archived ar
   where not exists (
     select 1 from meal_days m
      where m.household_id = ar.household_id
        and m.date = ar.date
   );
  get diagnostics v_restored = row_count;

  -- Arkivraderna är nu fullt representerade i meal_days. De tas bort så det
  -- finns EN sanningskälla för en dag — annars skulle vyn kunna visa ett låst
  -- arkivkort ovanpå den återställda dagen.
  --
  -- Datum som REDAN hade en meal_days-rad hoppades över ovan, och deras
  -- arkivvärde försvinner här. Det är inte en förlust: en dag som redan har en
  -- rad ägs av den raden, och arkivvärdet för samma datum var redan osynligt i
  -- vyn (aktiv plan och egna dagar vinner över arkivet i buildTimeline). Att
  -- rätten en gång varit använd står kvar i recipe_history.
  --
  -- Kopieringen ovan och den här raderingen ligger i SAMMA do-block = samma
  -- transaktion. Går insert:en fel raderas ingenting.
  delete from plan_archives;
  get diagnostics v_archives = row_count;

  raise notice 'Migration 011: % dagar återställda som egna dagar, % arkivrader borttagna', v_restored, v_archives;
end;
$$;

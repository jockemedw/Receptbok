-- 013_recipe_suggestions.sql
--
-- Förslagsminne (Session 154). recipe_history minns bara vad familjen faktiskt
-- planerat/lagat — ett kasserat utkast eller en bortbytt rätt släpps ur
-- historiken (spökrad-städningen) och kom därför tillbaka i nästa förslag.
-- Den här tabellen minns FÖRSLAGEN, en rad per recept och hushåll:
--   suggested_on = dagen receptet senast lades i en genererad matsedel
--   rejected_on  = dagen receptet senast byttes bort (Slumpa / Välj själv)
-- Generatorn och Slumpa viktar ner sådana recept i 28 dagar (aldrig spärr) —
-- se suggestionPenalties i api/_shared/history.js. Lagas receptet på eller
-- efter förslagsdagen räknas förslaget som accepterat och vikten är full.
--
-- Rollout-säkerhet: koden läser/skriver tabellen best effort. Innan filen körts
-- svarar PostgREST "tabellen finns inte" → läsningen ignoreras och skrivningen
-- loggas bara (exakt beteendet före Session 154 för förslagen). Så fort filen
-- körts börjar minnet fyllas — ingen kodändring behövs.
--
-- ATT KÖRA: Supabase SQL Editor eller Management-API:t. Säker att köra om
-- (IF NOT EXISTS / DROP POLICY IF EXISTS genomgående).

create table if not exists recipe_suggestions (
  household_id uuid not null references households(id) on delete cascade,
  recipe_id bigint not null references recipes(id) on delete cascade,
  suggested_on date,
  rejected_on date,
  primary key (household_id, recipe_id)
);

alter table recipe_suggestions enable row level security;

-- Samma RLS-princip som övriga tabeller (mall: 002_pantry_items.sql): data i en
-- household är synlig och skrivbar för alla medlemmar. Servern skriver med
-- service role; policyerna skyddar mot direkt klientåtkomst över hushåll.
drop policy if exists "household members read" on recipe_suggestions;
create policy "household members read"
  on recipe_suggestions for select
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members insert" on recipe_suggestions;
create policy "household members insert"
  on recipe_suggestions for insert with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "household members update" on recipe_suggestions;
create policy "household members update"
  on recipe_suggestions for update
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ))
  with check (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members delete" on recipe_suggestions;
create policy "household members delete"
  on recipe_suggestions for delete
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

-- 002_pantry_items.sql
--
-- Skafferi/"har hemma"-läget (app-analys-backlog.md #13): familjen kan markera
-- varor på inköpslistan som "finns hemma" — varan visas dämpad (inte borttagen),
-- räknas inte i "X av Y klara" och följer inte med i kopierad text.
--
-- Minnet är per household och per NORMALISERAT varunamn (namnet utan mängd-
-- parentesen, gemener — t.ex. "grädde (2 dl)" → "grädde"), så markeringen
-- överlever veckans nya inköpslista: har familjen alltid soja hemma behöver
-- ingen avmarkera den varje vecka. Delad data enligt CLAUDE.md-principen —
-- ingen localStorage.
--
-- Rollout-säkerhet (samma mönster som 001): frontend-koden provar tabellen vid
-- laddning av inköpslistan; svarar PostgREST "tabellen finns inte" göms hela
-- funktionen (exakt dagens beteende, ingen regression). Så fort den här filen
-- körts dyker "har hemma"-knappen upp — ingen kodändring behövs.
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Säker att köra
-- om (IF NOT EXISTS / OR REPLACE genomgående).

create table if not exists pantry_items (
  household_id uuid not null references households(id) on delete cascade,
  name text not null,                       -- normaliserat varunamn (utan mängd, gemener)
  created_at timestamptz not null default now(),
  primary key (household_id, name)
);

alter table pantry_items enable row level security;

-- Samma RLS-princip som övriga tabeller: data i en household är synlig och
-- skrivbar för alla medlemmar (sektion 3 i 2026-05-16-supabase-migration-design.md).
drop policy if exists "household members read" on pantry_items;
create policy "household members read"
  on pantry_items for select
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members insert" on pantry_items;
create policy "household members insert"
  on pantry_items for insert with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "household members delete" on pantry_items;
create policy "household members delete"
  on pantry_items for delete
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

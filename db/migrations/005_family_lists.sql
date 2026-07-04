-- 005_family_lists.sql
--
-- P1 Familjehubben (plattformsplanen, docs/plattform-familjehub-2026-07.md):
-- gemensamma fria listor (M1, Cozi-ersättaren) — packlistor, ärenden, kom-ihåg.
-- Listorna är ofta ÅTERKOMMANDE (packlistor): appen har en "Nollställ bockarna"-
-- knapp som gör listan redo igen utan att raderna skrivs om.
--
-- Tabellen är förberedd för M2 anteckningar via kind-kolumnen ('list' | 'note')
-- och body-fältet (fritext) — M2 byggs INTE nu, men schemat slipper en migration till.
-- pinned är också förberedelse (pinnade anteckningar/listor på Idag-fliken, P2).
--
-- household_id dubbleras medvetet på family_list_items: det ger enkel RLS
-- (samma policy-mall som 002) och gör att Realtime-prenumerationen kan
-- filtrera på household_id direkt utan join.
--
-- Rollout-säkerhet (samma mönster som 001/002): frontend-koden provar tabellen
-- när Listor-fliken öppnas; svarar PostgREST "tabellen finns inte" visas ett
-- vänligt "aktiveras snart"-läge. Så fort den här filen körts funkar fliken —
-- ingen kodändring behövs.
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Säker att köra
-- om (IF NOT EXISTS / OR REPLACE / drop-if-exists genomgående).

create table if not exists family_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title        text not null,
  kind         text not null default 'list' check (kind in ('list', 'note')),
  body         text,                            -- fritext för anteckningar (M2)
  pinned       boolean not null default false,  -- pinnad → syns på Idag (P2)
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists family_list_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references family_lists(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  text         text not null,
  checked      boolean not null default false,
  sort_order   int,
  created_at   timestamptz not null default now()
);

create index if not exists family_lists_household_idx      on family_lists (household_id);
create index if not exists family_list_items_list_idx      on family_list_items (list_id);
create index if not exists family_list_items_household_idx on family_list_items (household_id);

-- ---------------------------------------------------------------------------
-- RLS: samma princip som övriga tabeller (mall från 002_pantry_items.sql) —
-- data i en household är synlig och skrivbar för alla medlemmar.
-- ---------------------------------------------------------------------------

alter table family_lists enable row level security;
alter table family_list_items enable row level security;

drop policy if exists "household members read" on family_lists;
create policy "household members read"
  on family_lists for select
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members insert" on family_lists;
create policy "household members insert"
  on family_lists for insert with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "household members update" on family_lists;
create policy "household members update"
  on family_lists for update
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ))
  with check (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members delete" on family_lists;
create policy "household members delete"
  on family_lists for delete
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members read" on family_list_items;
create policy "household members read"
  on family_list_items for select
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members insert" on family_list_items;
create policy "household members insert"
  on family_list_items for insert with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "household members update" on family_list_items;
create policy "household members update"
  on family_list_items for update
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ))
  with check (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members delete" on family_list_items;
create policy "household members delete"
  on family_list_items for delete
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- updated_at hålls färsk av databasen (inte klienten): dels vid direkta
-- ändringar på listan, dels när listans rader ändras (så "senast använd"-
-- sortering och Idag-flikens "Aktiva listor" (P2) blir gratis).
-- ---------------------------------------------------------------------------

create or replace function touch_family_list_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists family_lists_touch on family_lists;
create trigger family_lists_touch
  before update on family_lists
  for each row execute function touch_family_list_updated_at();

create or replace function touch_parent_family_list()
returns trigger language plpgsql as $$
begin
  update family_lists
     set updated_at = now()
   where id = coalesce(new.list_id, old.list_id);
  return coalesce(new, old);
end $$;

drop trigger if exists family_list_items_touch_parent on family_list_items;
create trigger family_list_items_touch_parent
  after insert or update or delete on family_list_items
  for each row execute function touch_parent_family_list();

-- ---------------------------------------------------------------------------
-- Realtime: nya tabeller måste läggas till i publikationen för att
-- postgres_changes-prenumerationerna (live-synk mellan telefonerna) ska fungera.
-- Idempotent via exception-fångst (ALTER PUBLICATION saknar IF NOT EXISTS).
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table family_lists;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table family_list_items;
exception when duplicate_object then null;
end $$;

-- 004_pricing_status.sql
--
-- Tyst Willys-degradering, in-app-banner-variant (app-analys-backlog.md #2,
-- reaktiv variant vald 2026-07-03 i stället för webhook-larm): appen hämtar
-- Willys reapriser genom en oofficiell sidscrape. Om Willys ändrar sin sajt
-- ser en trasig hämtning ut precis som "inga extrapriser denna vecka" —
-- ingen märker felet förrän någon undrar. Den här tabellen sparar UTFALLET
-- av varje riktig prisoptimerings-körning (generate() med
-- optimize_prices=true) så appen kan visa en banner NÄSTA gång någon öppnar
-- appen, oavsett om de genererar en ny matsedel just då.
--
-- Rollout-säkerhet (samma mönster som 001/002/003): backend skriver via
-- service-role (kringgår RLS, ingen skriv-policy krävs) och saknas tabellen
-- svarar Supabase bara med ett fel i svaret — generate.js kraschar inte.
-- Frontend läser via anon-nyckel vid boot; saknas tabellen eller raden visas
-- ingen banner (dagens beteende). Så fort den här filen körts aktiveras
-- funktionen — ingen kodändring behövs.
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Säker att
-- köra om (IF NOT EXISTS / DROP POLICY IF EXISTS genomgående).

create table if not exists pricing_status (
  household_id uuid primary key references households(id) on delete cascade,
  last_checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  degraded boolean not null default false
);

alter table pricing_status enable row level security;

-- Bara läsning behövs från browsern — skrivningen sker uteslutande från
-- backend via service-role, som kringgår RLS helt.
drop policy if exists "household members read" on pricing_status;
create policy "household members read"
  on pricing_status for select
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

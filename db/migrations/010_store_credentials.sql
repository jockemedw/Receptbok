-- 010_store_credentials.sql
--
-- Butiksinloggningar som familjen anger SJÄLV i appen (Session 136).
--
-- Bakgrund: dispatchen (korgfyllningen) autentiserar idag med cookies som
-- skördas ur webbläsaren av en Chrome-extension. Det mönstret valdes för
-- Willys, där inloggningen går via BankID och server-side-login är omöjlig.
-- Hemköp har vanlig lösenordsinloggning — anger familjen sina uppgifter kan
-- dispatchen logga in själv, och då försvinner både extensionsberoendet och
-- den 3-månaders cookie-förnyelsen för Hemköps del.
--
-- SÄKERHETSMODELL (två lager, båda behövs):
--   1. RLS med household-policy (samma mall som 002_pantry_items.sql) → ett
--      läckt anon-nyckel-anrop når aldrig ett annat hushålls rad.
--   2. `password_enc` är AES-256-GCM-krypterat av api/_shared/crypto-box.js.
--      Nyckeln (STORE_CRED_KEY) bor i Vercels env, ALDRIG i databasen — en
--      databasdump ensam räcker därför inte för att läsa lösenorden. Även en
--      inloggad familjemedlem som läser tabellen direkt ser bara ciphertext.
--   Klartexten lämnar aldrig api/: den skrivs krypterad och dekrypteras bara
--   i minnet vid inloggning mot butiken.
--
-- `username` lagras i klartext med flit — appen måste kunna visa vilket konto
-- som är kopplat, och e-postadressen är inte hemligheten.
--
-- Rollout-säkerhet (samma mönster som 002): koden behandlar "tabellen finns
-- inte" som "inga sparade uppgifter" → dispatchen fortsätter använda cookien
-- exakt som idag tills den här filen körts. Ingen kodändring behövs efteråt.
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Säker att köra
-- om (IF NOT EXISTS / OR REPLACE genomgående).

create table if not exists store_credentials (
  household_id uuid not null references households(id) on delete cascade,
  store        text not null,                    -- 'hemkop' (willys kan inte — BankID)
  username     text not null,
  password_enc text not null,                    -- "v1.<iv>.<tag>.<ciphertext>", base64url
  updated_at   timestamptz not null default now(),
  primary key (household_id, store)
);

alter table store_credentials enable row level security;

-- Samma RLS-princip som övriga tabeller: data i en household är synlig och
-- skrivbar för alla medlemmar (sektion 3 i 2026-05-16-supabase-migration-design.md).
-- Att medlemmar får läsa raden är ofarligt — lösenordskolumnen är krypterad.
drop policy if exists "household members read" on store_credentials;
create policy "household members read"
  on store_credentials for select
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members insert" on store_credentials;
create policy "household members insert"
  on store_credentials for insert with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

drop policy if exists "household members update" on store_credentials;
create policy "household members update"
  on store_credentials for update
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members delete" on store_credentials;
create policy "household members delete"
  on store_credentials for delete
  using (household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

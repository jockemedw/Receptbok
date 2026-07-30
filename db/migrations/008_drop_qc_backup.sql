-- Migration 008 — F215 (P0, nattauditen 2026-07-12)
-- ✅ KÖRD mot live-Supabase 2026-07-30 (Session 133, Joakims uttryckliga OK via
-- Management-API:t). Utlöst av Supabase database-linterns rls_disabled_in_public.
-- Verifierat efteråt: tabellen borta, samtliga 14 kvarvarande public-tabeller har
-- RLS på + minst en policy, public.recipes intakt (263 recept), security advisor
-- rapporterar 0 rls_disabled_in_public-fynd. JSON-dump togs före körning och
-- visade sig innehållsidentisk med den redan committade docs/recipe-backup-20260607.json
-- (262/262 recept lika) — revert-vägen lever alltså kvar i repot.
-- Tabellen recipes_qc_backup_20260607 skapades som revert-snapshot inför
-- qc-natten (Session 83, 2026-06-07) men fick aldrig RLS: den låg läsbar och
-- raderbar med den publika anon-nyckeln, utanför household-policyskyddet.
-- Snapshoten är 5 veckor gammal och bedömd inaktuell (recepten lever och har
-- vidareutvecklats i public.recipes). FÖRE körning: ta en JSON-dump av tabellen
-- (select json_agg(t) from public.recipes_qc_backup_20260607 t) och spara utanför
-- repot, som säkerhetskopia av revert-snapshoten.
-- Idempotent: IF EXISTS gör att omkörning är ofarlig.

DROP TABLE IF EXISTS public.recipes_qc_backup_20260607;

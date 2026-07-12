-- Migration 008 — F215 (P0, nattauditen 2026-07-12)
-- Tabellen recipes_qc_backup_20260607 skapades som revert-snapshot inför
-- qc-natten (Session 83, 2026-06-07) men fick aldrig RLS: den låg läsbar och
-- raderbar med den publika anon-nyckeln, utanför household-policyskyddet.
-- Snapshoten är 5 veckor gammal och bedömd inaktuell (recepten lever och har
-- vidareutvecklats i public.recipes). En JSON-dump togs i sessionen innan DROP.
-- Idempotent: IF EXISTS gör att omkörning är ofarlig.

DROP TABLE IF EXISTS public.recipes_qc_backup_20260607;

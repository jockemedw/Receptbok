-- Migration 007 — F287 (nattauditen 2026-07-12)
-- Realtime-publikationen innehöll bara family_lists + family_list_items, så
-- klient-prenumerationerna på meal_days (plan-viewer.js) och shopping_items
-- (shopping-list.js) fick aldrig några event — synken mellan enheter var död.
-- Förkontroll 2026-07-12: replica identity (DEFAULT) och RLS-policies är redan
-- i paritet med de fungerande family_lists-tabellerna; ren publikations-ADD.
-- Idempotent: ADD:ar bara tabeller som saknas i publikationen.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meal_days'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_days;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shopping_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
  END IF;
END $$;

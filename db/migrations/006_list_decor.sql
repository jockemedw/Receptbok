-- 006_list_decor.sql
--
-- L3 Cozi-paritet (docs/listor-cozi-forslag-2026-07.md): ikon + färg per lista
-- så översikten blir scanbar (🛒 Inköp, 🏠 Huset, 🧳 Packning…). Rent kosmetiskt
-- — påverkar inget dataflöde, bara hur listkortet ritas.
--
-- Två nullbara kolumner på family_lists:
--   icon  — en emoji (frivillig)
--   color — en semantisk färgnyckel ('lichen'|'rust'|'ochre'|'fisk'|'kott'|'veg'),
--           mappas i frontend till en temavariabel så mörkt/ljust tema följer med.
--           Nyckel i stället för hex just för att färgen ska adaptera till temat.
--
-- Rollout-säkerhet (samma mönster som 003/005): frontend feature-detektar
-- kolumnen (`'color' in list`) och visar utseende-väljaren bara när den finns.
-- Innan filen körts: inga ikoner/färger, väljaren dold, allt beter sig som förr.
-- Så fort filen körts aktiveras funktionen — ingen kodändring behövs.
--
-- ATT KÖRA: klistra in i Supabase SQL Editor och kör (eller via Management-API:t).
-- Säker att köra om (ADD COLUMN IF NOT EXISTS).

alter table family_lists add column if not exists icon  text;
alter table family_lists add column if not exists color text;

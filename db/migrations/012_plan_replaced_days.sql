-- 012_plan_replaced_days.sql
--
-- Bakgrund (Session 153, nattpassets fynd): "Kassera förslag" lovade att
-- tidigare matsedlar inte påverkas — men en ny generering skriver över
-- överlappande datum med UPSERT (savePlanToSupabase i api/generate.js), och
-- discard-plan raderade sedan förslagets dagar. De gamla dagarna på de datumen
-- försvann alltså för gott när man kasserade.
--
-- Fix: generate sparar en ögonblicksbild av de plandagar UPSERT:en skriver över
-- i den nya planens rad (replaced_days). discard-plan lägger tillbaka dem som
-- egna dagar (plan_id = null) — samma form som den gamla planens övriga dagar
-- redan fått vid plan-bytet (detachOldPlanDays).
--
-- Additiv och nullbar: ingen befintlig rad påverkas, ingen kod kräver kolumnen
-- (generate ignorerar skrivfelet och discard-plan läser med select *), så
-- ordningen deploy/migration spelar ingen roll. Säker att köra om.

alter table weekly_plans add column if not exists replaced_days jsonb;

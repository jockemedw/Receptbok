-- 003_target_servings.sql
--
-- Portionsskalning (app-analys-backlog.md #12): recepten är skrivna för 4
-- portioner men familjen är ~2,5 → ca 60 % överköp per måltid. Hushållet får
-- ett portionsmål (target_servings) som inköpslistan skalas till: parsade
-- mängder multipliceras med target/recipe.servings FÖRE merge, med vänlig
-- avrundning (styckevaror uppåt till heltal, mått till rimlig precision).
-- Receptens råtext rörs aldrig — bara inköpslistans mängder.
--
-- Default 4 = exakt dagens beteende (faktor 1 mot 4-portionsrecept). Ingen
-- regression förrän familjen aktivt ändrar värdet i inställningarna.
--
-- Rollout-säkerhet (samma mönster som 001/002): backend läser kolumnen via
-- fetchTargetServings() som returnerar null om kolumnen saknas → ingen
-- skalning. Frontend visar "Vi är X portioner"-raden bara när värdet går att
-- läsa. Så fort den här filen körts aktiveras funktionen — ingen kodändring.
--
-- ATT KÖRA: klistra in hela filen i Supabase SQL Editor och kör. Säker att
-- köra om (IF NOT EXISTS / DROP POLICY IF EXISTS genomgående).

alter table households
  add column if not exists target_servings int not null default 4;

-- Rimlighetsgräns — skyddar mot feltryck (0 eller 400 portioner).
alter table households drop constraint if exists households_target_servings_range;
alter table households
  add constraint households_target_servings_range
  check (target_servings between 1 and 12);

-- RLS: hushållsmedlemmar behöver läsa och uppdatera sitt eget hushålls rad
-- från browsern (inställnings-UI:t). Samma medlemsprincip som övriga tabeller.
drop policy if exists "household members read" on households;
create policy "household members read"
  on households for select
  using (id in (
    select household_id from household_members where user_id = auth.uid()
  ));

drop policy if exists "household members update" on households;
create policy "household members update"
  on households for update
  using (id in (
    select household_id from household_members where user_id = auth.uid()
  ))
  with check (id in (
    select household_id from household_members where user_id = auth.uid()
  ));

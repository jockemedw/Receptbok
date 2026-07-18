-- 009_shopping_rounds.sql — Inköpsrundor: per-dag-spårning av "på listan" / "inhandlad".
--
-- shopped_at       = spärren: dagens ingredienser är inhandlade och inkluderas
--                    aldrig igen automatiskt i en ombyggnad av inköpslistan.
-- shopping_list_id = täckning: dagens ingredienser ligger på denna lista.
--                    Pekare mot inaktiva listor är ointressanta (självläkande).
--
-- Additiva nullable-kolumner → gammal kod påverkas inte; migrationen körs FÖRE
-- koddeployen. Säker att köra om (IF NOT EXISTS genomgående).
-- Ingen RLS-ändring behövs: befintliga meal_days-policies täcker nya kolumner.
-- Frontend LÄSER kolumnerna via RLS men skriver dem aldrig — alla skrivningar
-- går via API:t med service-role.

alter table meal_days add column if not exists shopped_at timestamptz;
alter table meal_days add column if not exists shopping_list_id uuid
  references shopping_lists(id) on delete set null;

create index if not exists meal_days_shopping_list_idx
  on meal_days (shopping_list_id) where shopping_list_id is not null;

-- Backfill: hushåll med en AKTIV BEKRÄFTAD plan + AKTIV lista får planens
-- receptdagar kopplade till listan — så första ombyggnaden efter deploy utgår
-- från korrekt täckning i stället för tom.
update meal_days md
set shopping_list_id = sl.id
from weekly_plans wp
join shopping_lists sl on sl.household_id = wp.household_id and sl.is_active
where md.plan_id = wp.id
  and wp.is_active and wp.confirmed_at is not null
  and md.recipe_id is not null and md.blocked = false
  and md.shopping_list_id is null;

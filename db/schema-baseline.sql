-- schema-baseline.sql — ÖGONBLICKSBILD av produktionsschemat (public)
--
-- Hämtad 2026-09-28 via Supabase Management-API:t (pg_catalog/pg_policies),
-- Session 148. Syfte: EN läsbar sanning om hur databasen faktiskt ser ut, så att
-- migrationerna i db/migrations/ kan jämföras mot verkligheten (Codex-fyndet
-- "schema-baseline", Etapp B i roadmap.html).
--
-- OBS:
--  * Referensdokument, inte en migration. Tabellerna står i alfabetisk ordning,
--    inte FK-beroendeordning — kör inte filen rakt av mot en tom databas.
--  * Läget vid hämtningen: migration 011 INTE körd (activate_plan_atomic nedan
--    är den gamla versionen som arkiverar + raderar); migration 010
--    (store_credentials) INTE körd. Tabellen dispatch_preferences finns men
--    läses inte av koden (preferenserna går via GitHub-JSON).
--  * Förnya: kör om frågorna i Session 148-loggen (docs/session-log-archive.md)
--    eller be Claude "uppdatera schema-baseline".

-- ═══ Tabeller (kolumner, defaults, constraints, RLS) ═══════════════════════════

create table if not exists public.dispatch_preferences (
  household_id uuid not null,
  blocked_brands text[] default '{}'::text[],
  prefer_organic jsonb default '{}'::jsonb,
  prefer_swedish jsonb default '{}'::jsonb,
  constraint dispatch_preferences_pkey PRIMARY KEY (household_id),
  constraint dispatch_preferences_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.dispatch_preferences enable row level security;

create table if not exists public.family_list_items (
  id uuid not null default gen_random_uuid(),
  list_id uuid not null,
  household_id uuid not null,
  text text not null,
  checked boolean not null default false,
  sort_order integer,
  created_at timestamp with time zone not null default now(),
  constraint family_list_items_pkey PRIMARY KEY (id),
  constraint family_list_items_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  constraint family_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES family_lists(id) ON DELETE CASCADE
);
alter table public.family_list_items enable row level security;

create table if not exists public.family_lists (
  id uuid not null default gen_random_uuid(),
  household_id uuid not null,
  title text not null,
  kind text not null default 'list'::text,
  body text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  icon text,
  color text,
  constraint family_lists_pkey PRIMARY KEY (id),
  constraint family_lists_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  constraint family_lists_kind_check CHECK ((kind = ANY (ARRAY['list'::text, 'note'::text])))
);
alter table public.family_lists enable row level security;

create table if not exists public.household_members (
  household_id uuid not null,
  user_id uuid not null,
  role text not null default 'member'::text,
  joined_at timestamp with time zone not null default now(),
  constraint household_members_pkey PRIMARY KEY (household_id, user_id),
  constraint household_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  constraint household_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint household_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])))
);
alter table public.household_members enable row level security;

create table if not exists public.households (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now(),
  target_servings integer not null default 4,
  constraint households_pkey PRIMARY KEY (id),
  constraint households_target_servings_range CHECK (((target_servings >= 1) AND (target_servings <= 12)))
);
alter table public.households enable row level security;

create table if not exists public.meal_days (
  household_id uuid not null,
  date date not null,
  plan_id uuid,
  recipe_id bigint,
  recipe_title_snapshot text,
  custom_note text,
  saving integer,
  saving_matches jsonb,
  locked boolean not null default false,
  blocked boolean not null default false,
  shopped_at timestamp with time zone,
  shopping_list_id uuid,
  constraint meal_days_pkey PRIMARY KEY (household_id, date),
  constraint meal_days_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  constraint meal_days_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES weekly_plans(id) ON DELETE SET NULL,
  constraint meal_days_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
  constraint meal_days_shopping_list_id_fkey FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists(id) ON DELETE SET NULL
);
alter table public.meal_days enable row level security;

create table if not exists public.pantry_items (
  household_id uuid not null,
  name text not null,
  created_at timestamp with time zone not null default now(),
  constraint pantry_items_pkey PRIMARY KEY (household_id, name),
  constraint pantry_items_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.pantry_items enable row level security;

create table if not exists public.plan_archives (
  id uuid not null default gen_random_uuid(),
  household_id uuid not null,
  start_date date not null,
  end_date date not null,
  archived_at timestamp with time zone not null default now(),
  days jsonb not null,
  constraint plan_archives_pkey PRIMARY KEY (id),
  constraint plan_archives_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.plan_archives enable row level security;

create table if not exists public.pricing_status (
  household_id uuid not null,
  last_checked_at timestamp with time zone not null default now(),
  last_success_at timestamp with time zone,
  degraded boolean not null default false,
  constraint pricing_status_pkey PRIMARY KEY (household_id),
  constraint pricing_status_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.pricing_status enable row level security;

create table if not exists public.recipe_history (
  household_id uuid not null,
  recipe_id bigint not null,
  used_on date not null,
  constraint recipe_history_pkey PRIMARY KEY (household_id, recipe_id),
  constraint recipe_history_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  constraint recipe_history_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
alter table public.recipe_history enable row level security;

create table if not exists public.recipes (
  id bigint not null,
  household_id uuid not null,
  title text not null,
  tested boolean not null default false,
  servings integer,
  "time" integer,
  time_note text,
  tags text[] default '{}'::text[],
  protein text,
  ingredients text[] default '{}'::text[],
  instructions text[] default '{}'::text[],
  notes text,
  seasons text[] default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint recipes_pkey PRIMARY KEY (id),
  constraint recipes_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.recipes enable row level security;

create table if not exists public.shopping_items (
  id uuid not null default gen_random_uuid(),
  list_id uuid not null,
  category text not null,
  name text not null,
  source text not null,
  checked boolean not null default false,
  "position" integer not null default 0,
  constraint shopping_items_pkey PRIMARY KEY (id),
  constraint shopping_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
  constraint shopping_items_source_check CHECK ((source = ANY (ARRAY['recipe'::text, 'manual'::text])))
);
alter table public.shopping_items enable row level security;

create table if not exists public.shopping_lists (
  id uuid not null default gen_random_uuid(),
  household_id uuid not null,
  start_date date not null,
  end_date date not null,
  generated_at timestamp with time zone not null default now(),
  recipe_items_moved_at date,
  is_active boolean not null default true,
  constraint shopping_lists_pkey PRIMARY KEY (id),
  constraint shopping_lists_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.shopping_lists enable row level security;

create table if not exists public.weekly_plans (
  id uuid not null default gen_random_uuid(),
  household_id uuid not null,
  start_date date not null,
  end_date date not null,
  generated_at timestamp with time zone not null default now(),
  confirmed_at timestamp with time zone,
  is_active boolean not null default true,
  constraint weekly_plans_pkey PRIMARY KEY (id),
  constraint weekly_plans_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
alter table public.weekly_plans enable row level security;


-- ═══ Index (utöver PK/unique-constraints) ═══════════════════════════════════

CREATE INDEX family_list_items_household_idx ON public.family_list_items USING btree (household_id);
CREATE INDEX family_list_items_list_idx ON public.family_list_items USING btree (list_id);
CREATE INDEX family_lists_household_idx ON public.family_lists USING btree (household_id);
CREATE INDEX idx_meal_days_plan ON public.meal_days USING btree (plan_id) WHERE (plan_id IS NOT NULL);
CREATE INDEX meal_days_shopping_list_idx ON public.meal_days USING btree (shopping_list_id) WHERE (shopping_list_id IS NOT NULL);
CREATE INDEX idx_plan_archives_household ON public.plan_archives USING btree (household_id);
CREATE INDEX idx_recipes_household ON public.recipes USING btree (household_id);
CREATE INDEX idx_shopping_items_list ON public.shopping_items USING btree (list_id);
CREATE INDEX idx_shopping_lists_household ON public.shopping_lists USING btree (household_id);
CREATE UNIQUE INDEX uniq_shopping_lists_active ON public.shopping_lists USING btree (household_id) WHERE is_active;
CREATE INDEX idx_weekly_plans_household ON public.weekly_plans USING btree (household_id);
CREATE UNIQUE INDEX uniq_weekly_plans_active ON public.weekly_plans USING btree (household_id) WHERE is_active;


-- ═══ RLS-policies ═════════════════════════════════════════════════════════

create policy "members delete dispatch_preferences" on public.dispatch_preferences as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members insert dispatch_preferences" on public.dispatch_preferences as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read dispatch_preferences" on public.dispatch_preferences as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members update dispatch_preferences" on public.dispatch_preferences as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "household members delete" on public.family_list_items as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members insert" on public.family_list_items as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members read" on public.family_list_items as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members update" on public.family_list_items as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))))
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members delete" on public.family_lists as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members insert" on public.family_lists as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members read" on public.family_lists as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members update" on public.family_lists as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))))
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "members can read own membership" on public.household_members as PERMISSIVE for SELECT to public
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "household members read" on public.households as PERMISSIVE for SELECT to public
  using ((id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members update" on public.households as PERMISSIVE for UPDATE to public
  using ((id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))))
  with check ((id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "members can read own household" on public.households as PERMISSIVE for SELECT to public
  using ((id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members delete meal_days" on public.meal_days as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members insert meal_days" on public.meal_days as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read meal_days" on public.meal_days as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members update meal_days" on public.meal_days as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "household members delete" on public.pantry_items as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members insert" on public.pantry_items as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "household members read" on public.pantry_items as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "members insert plan_archives" on public.plan_archives as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read plan_archives" on public.plan_archives as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "household members read" on public.pricing_status as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = auth.uid()))));

create policy "members delete recipe_history" on public.recipe_history as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members insert recipe_history" on public.recipe_history as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read recipe_history" on public.recipe_history as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members update recipe_history" on public.recipe_history as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members delete recipes" on public.recipes as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members insert recipes" on public.recipes as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read recipes" on public.recipes as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members update recipes" on public.recipes as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members delete shopping_items" on public.shopping_items as PERMISSIVE for DELETE to public
  using ((list_id IN ( SELECT shopping_lists.id
   FROM shopping_lists
  WHERE (shopping_lists.household_id IN ( SELECT household_members.household_id
           FROM household_members
          WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "members insert shopping_items" on public.shopping_items as PERMISSIVE for INSERT to public
  with check ((list_id IN ( SELECT shopping_lists.id
   FROM shopping_lists
  WHERE (shopping_lists.household_id IN ( SELECT household_members.household_id
           FROM household_members
          WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "members read shopping_items" on public.shopping_items as PERMISSIVE for SELECT to public
  using ((list_id IN ( SELECT shopping_lists.id
   FROM shopping_lists
  WHERE (shopping_lists.household_id IN ( SELECT household_members.household_id
           FROM household_members
          WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "members update shopping_items" on public.shopping_items as PERMISSIVE for UPDATE to public
  using ((list_id IN ( SELECT shopping_lists.id
   FROM shopping_lists
  WHERE (shopping_lists.household_id IN ( SELECT household_members.household_id
           FROM household_members
          WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "members delete shopping_lists" on public.shopping_lists as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members insert shopping_lists" on public.shopping_lists as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read shopping_lists" on public.shopping_lists as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members update shopping_lists" on public.shopping_lists as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members delete weekly_plans" on public.weekly_plans as PERMISSIVE for DELETE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members insert weekly_plans" on public.weekly_plans as PERMISSIVE for INSERT to public
  with check ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members read weekly_plans" on public.weekly_plans as PERMISSIVE for SELECT to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "members update weekly_plans" on public.weekly_plans as PERMISSIVE for UPDATE to public
  using ((household_id IN ( SELECT household_members.household_id
   FROM household_members
  WHERE (household_members.user_id = ( SELECT auth.uid() AS uid)))));


-- ═══ Funktioner ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.activate_plan_atomic(p_household_id uuid, p_new_plan_id uuid, p_new_start_date date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_old_plan record;
  v_archive_start date;
  v_archive_end date;
  v_archive_days jsonb;
  v_cutoff date;
begin
  -- 1) Hitta nuvarande aktiva plan för hushållet (om någon). Plan-aktivering är
  --    idempotent: finns ingen gammal aktiv plan görs bara steg 5 (aktivera ny).
  select id, start_date, end_date
    into v_old_plan
    from weekly_plans
   where household_id = p_household_id
     and is_active = true
   limit 1;

  if found then
    -- 2) Arkivera gamla dagar som ligger FÖRE den nya planens startdatum
    --    (samma urval som tidigare archiveOldPlan i JS).
    select min(date), max(date),
           jsonb_agg(
             jsonb_build_object(
               'date', date,
               'recipe', recipe_title_snapshot,
               'recipeId', recipe_id
             ) || case when saving is not null
                       then jsonb_build_object('saving', saving)
                       else '{}'::jsonb end
             order by date
           )
      into v_archive_start, v_archive_end, v_archive_days
      from meal_days
     where plan_id = v_old_plan.id
       and date < p_new_start_date
       and recipe_id is not null;

    if v_archive_days is not null then
      insert into plan_archives (household_id, start_date, end_date, archived_at, days)
      values (p_household_id, v_archive_start, v_archive_end, now(), v_archive_days);

      -- Trimma plan_archives — behåll bara arkiv med end_date inom 30 dagar bakåt
      -- (samma trimningsregel som tidigare archiveOldPlan i JS).
      v_cutoff := (now() - interval '30 days')::date;
      delete from plan_archives
       where household_id = p_household_id
         and end_date < v_cutoff;
    end if;

    -- 3) Ta bort gamla planens meal_days (arkiverade ovan, eller överskrivna av
    --    den nya planen — samma som tidigare archiveOldPlan i JS).
    delete from meal_days where plan_id = v_old_plan.id;

    -- 4) Deaktivera gamla planen.
    update weekly_plans set is_active = false where id = v_old_plan.id;
  end if;

  -- 5) Aktivera den nya planen (redan fullt skriven med sina meal_days innan
  --    denna funktion anropas — se savePlanToSupabase i api/generate.js).
  update weekly_plans
     set is_active = true
   where id = p_new_plan_id
     and household_id = p_household_id;

  if not found then
    raise exception 'activate_plan_atomic: hittade ingen plan % för hushåll %', p_new_plan_id, p_household_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_family_list_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.touch_parent_family_list()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update family_lists
     set updated_at = now()
   where id = coalesce(new.list_id, old.list_id);
  return coalesce(new, old);
end $function$
;


-- ═══ Triggrar ═════════════════════════════════════════════════════════════

CREATE TRIGGER family_list_items_touch_parent AFTER INSERT OR DELETE OR UPDATE ON public.family_list_items FOR EACH ROW EXECUTE FUNCTION touch_parent_family_list();
CREATE TRIGGER family_lists_touch BEFORE UPDATE ON public.family_lists FOR EACH ROW EXECUTE FUNCTION touch_family_list_updated_at();


-- ═══ Realtime-publicering (supabase_realtime) ═════════════════════════════

-- realtime: public.family_list_items
-- realtime: public.family_lists
-- realtime: public.meal_days
-- realtime: public.shopping_items


# Supabase-migration — designdokument

**Datum:** 2026-05-16
**Branch:** `claude/supabase-migration-ihIzv`
**Status:** Plan — ej påbörjad implementation
**Beslutsfattare:** Användaren (familjeägare)

## Syfte

Migrera Receptboken från GitHub-som-databas (JSON-filer i repot) till Supabase
Postgres som primär datalager. Motiv: realtidsuppdateringar mellan familjens
enheter, eliminerad SHA-konflikthantering, Vercel-Marketplace-integration som
centraliserar secrets-hantering, och en arkitektur som inte kräver omskrivning
om appen senare expanderar till fler familjer eller publik distribution.

## Beslutsgrund (svar från användaren 2026-05-16)

| Fråga | Beslut |
|---|---|
| Autentisering | **Magic link via e-post** (Supabase Auth) |
| Realtime | **Ja** — Supabase Realtime via `postgres_changes` |
| Cutover-strategi | **Big-bang med backup** |
| `recipes.json` | **Egen Supabase-tabell** |
| Lokal Supabase-utveckling | Skippas (ingen `supabase start`-loop) |
| Recept-ägandeskap | Alla 264 recept tillhör er household i v1 |
| `api/willys-offers.js` | Behåll i repo tills migrationen är stabil |
| Spec-dokumentation | Skriv plan först som backup (detta dokument) |

---

## 1. Arkitektur — före vs efter

```
FÖRE (idag):
Browser → Vercel /api/* → fetch GitHub Contents API → JSON-fil i repo
         (CDN-cache ~60s)   (3-retry SHA-handling i api/_shared/github.js)

EFTER:
Browser → Supabase JS-klient → Postgres (RLS) ⟵ Realtime → andra klienter
         (Vercel /api/* används bara för: Gemini-import, Willys-dispatch,
          deterministisk receptval-logik i api/generate.js)
```

Vercel-API:t krymper från 12 till 5 endpoints. Direkt CRUD (shopping-list,
custom-days, recipe-history, recept-CRUD) flyttar till Supabase-klienten i
browsern. Endast endpoints som behöver hemligheter (GEMINI_API_KEY,
Willys-cookies) eller komplex deterministisk logik (receptval) lever vidare
som serverless-funktioner.

## 2. Datamodell — Postgres-tabeller

### Domänmodell
```
households ──< household_members >── auth.users
    │
    ├──< recipes (264 + nya)
    ├──< weekly_plans ──< meal_days
    ├──< recipe_history
    ├──< plan_archives
    ├──< shopping_lists ──< shopping_items
    └──── dispatch_preferences (1:1)
```

### Tabellscheman

```sql
-- Multi-family-redo men v1 har bara EN household
households (
  id uuid PK,
  name text,
  created_at timestamptz
)

household_members (
  household_id uuid FK,
  user_id uuid FK auth.users,
  role text default 'member',          -- 'owner' | 'member'
  joined_at timestamptz,
  PK (household_id, user_id)
)

recipes (
  id bigint PK,                        -- behåll numeriska id:n från recipes.json
  household_id uuid FK,
  title text, tested bool, servings int,
  time int, time_note text,
  tags text[], protein text,
  ingredients text[], instructions text[],
  notes text, seasons text[],
  created_at timestamptz, updated_at timestamptz
)

weekly_plans (
  id uuid PK, household_id uuid FK,
  start_date date, end_date date,
  generated_at timestamptz,
  confirmed_at timestamptz nullable,   -- null = pending
  is_active bool                       -- max en aktiv per household
)

meal_days (
  household_id uuid FK,
  date date,
  plan_id uuid FK nullable,            -- null = custom-day utanför plan
  recipe_id bigint FK nullable,
  recipe_title_snapshot text,          -- bevarad även om recept raderas
  custom_note text,
  saving int, saving_matches jsonb,
  locked bool, blocked bool,
  PK (household_id, date)
)

recipe_history (
  household_id uuid FK,
  recipe_id bigint FK,
  used_on date,
  PK (household_id, recipe_id)         -- "senast använd"-modellen från JSON
)

plan_archives (
  id uuid PK, household_id uuid FK,
  start_date date, end_date date,
  archived_at timestamptz,
  days jsonb                           -- snapshot som JSON, write-once
)

shopping_lists (
  id uuid PK, household_id uuid FK,
  start_date date, end_date date,
  generated_at timestamptz,
  recipe_items_moved_at date nullable,
  is_active bool                       -- max en aktiv per household
)

shopping_items (
  id uuid PK,
  list_id uuid FK,
  category text,                       -- Mejeri/Grönsaker/Fisk & kött/Frukt/Skafferi/Övrigt
  name text,
  source text,                         -- 'recipe' | 'manual'
  checked bool default false,
  position int                         -- sorteringsordning
)

dispatch_preferences (
  household_id uuid PK,
  blocked_brands text[],
  prefer_organic jsonb,
  prefer_swedish jsonb
)
```

### Designval värda att flagga

- **`meal_days` slår ihop `weekly-plan.days[]` och `custom-days.entries{}`** —
  båda beskriver "vad äter vi datum X". Källan särskiljs via `plan_id`
  (null = custom).
- **`saving_matches` förblir jsonb** — ostrukturerad Willys-matching-data,
  ingen vinst med separat tabell.
- **`plan_archives.days` förblir jsonb** — write-once, läses sällan, ingen
  query mot inre fält.
- **`recipes.id = bigint`** (inte uuid) — befintliga numeriska id:n bevaras
  så recipe-history och meal_days kan peka på dem utan översättningsskikt.

## 3. RLS-policyer (Row-Level Security)

```sql
-- Princip: data i en household är synlig för alla medlemmar
CREATE POLICY "household members read"
  ON recipes FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "household members write"
  ON recipes FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );
-- (samma mönster för update/delete och för alla andra tabeller)
```

Resultat: även om `SUPABASE_ANON_KEY` läcker kan ingen läsa er data utan att
vara inloggad medlem av er household. Service-role-key används endast
server-side i Vercel-API och kringgår RLS för bulk-operationer (t.ex.
receptval-algoritmen i `api/generate.js`).

## 4. Endpoint-migrationskarta

| Endpoint idag | Efter migration | Motivering |
|---|---|---|
| `api/generate.js` | **Behålls** | Deterministisk receptval-algoritm + service-role-skrivning av plan + shoppinglist |
| `api/replace-recipe.js` | **Behålls** | Atomic uppdatering av meal_days + recipe_history |
| `api/swap-days.js` | **Tas bort** | Frontend gör Supabase update direkt |
| `api/skip-day.js` | **Tas bort** | Frontend update |
| `api/confirm.js` | **Tas bort** | Frontend sätter `confirmed_at` direkt |
| `api/discard-plan.js` | **Behålls** | Kräver atomic radering av meal_days + history-uppdatering (RPC) |
| `api/custom-days.js` | **Tas bort** | Frontend upsert mot meal_days |
| `api/shopping.js` | **Tas bort** | Frontend hanterar checked/manual direkt |
| `api/recipes.js` | **Tas bort** | Frontend CRUD direkt |
| `api/import-recipe.js` | **Behålls** | Använder GEMINI_API_KEY (server-side) |
| `api/dispatch-to-willys.js` | **Behålls** | Willys-cookies + CSRF (server-side) |
| `api/willys-offers.js` | **Behålls** | Cachelagring + reverse-proxy (oförändrat) |

Netto: 12 → 5 endpoints. Långt under Vercel Hobby-taket på 12 funktioner.

## 5. Migrationsfaser

### Fas A — Förberedelse (utan att röra prod)
1. Skapa Supabase-projekt via MCP (`create_project`, EU-region Frankfurt)
2. Koppla Vercel-Supabase-integration i Vercel-dashboarden → env vars
   injiceras automatiskt
3. Applicera schema via `apply_migration` (alla CREATE TABLE + RLS-policyer)
4. Konfigurera magic-link-auth i Supabase-dashboard (default SMTP-provider
   räcker för v1)
5. Seed: skapa household "Familjen", lägg till ägarens user-id som medlem

### Fas B — Engångsimport av befintlig data
1. Skript `scripts/migrate-to-supabase.mjs` läser alla 7 JSON-filer
2. Importerar i ordning: recipes → weekly_plans → meal_days → recipe_history
   → plan_archives → shopping_lists → shopping_items → dispatch_preferences
3. Verifierar radantal mot JSON-strukturen, loggar diff
4. **Hård regel från Session 23 respekteras:** befintlig veckoplan
   importeras intakt med `confirmed_at` + `saving_matches`

### Fas C — Frontend-omskrivning
1. Lägg till `@supabase/supabase-js` (CDN-import i `index.html`)
2. Ny modul `js/supabase-client.js` — initierar klient, exporterar `db` + `auth`
3. Ersätt fetch-anrop i frontend-moduler:
   - `js/weekly-plan/plan-viewer.js` → `db.from('meal_days').update()`
   - `js/shopping/shopping-list.js` → realtime-subscription + direct updates
   - `js/recipes/recipe-editor.js` → `db.from('recipes').upsert()`
   - `js/recipes/recipe-browser.js` → `db.from('recipes').select()`
4. Lägg till login-skärm (magic-link) — visas om `auth.getSession()` är null
5. Realtime-subscriptions för `meal_days` + `shopping_items` + `recipe_history`

### Fas D — Backend-omskrivning
1. `api/_shared/supabase.js` — service-role-klient
2. Skriv om `api/generate.js`, `api/replace-recipe.js`, `api/discard-plan.js`,
   `api/dispatch-to-willys.js` (sista bara för att den läser shopping_items)
3. Ta bort de 7 endpoints som migrerar till frontend-direct
4. `api/_shared/github.js` lever kvar bara för Willys-cookies-gist (oförändrat)

### Fas E — Cutover (se sektion 10 för exakt sekvens)

## 6. Risker och mitigationer (sammanfattning)

Full risk-katalog finns i sektion 7. Höjdpunkter:

| Risk | Mitigation |
|---|---|
| Befintlig veckoplan förstörs (hård regel) | Tag före import + skript validerar radantal + manuell ögoninspektion av meal_days innan cutover |
| Magic-link spam-filter | Test med både ägares + partners mailadress innan cutover |
| RLS-bug låser ut familjen | Verifiera policies med Supabase Studio innan cutover; service-role-key kan alltid kringgå om kris |
| Realtime-spam vid bulk-update | `supabase.removeChannel()` cleanup i alla view-render-funktioner |
| Vercel-Supabase env-konflikt | Integration använder OAuth, inte PAT — fristående från GITHUB_PAT-problemet |
| Gemini-import skriver till recipes-tabell | `api/import-recipe.js` använder service-role för att kringgå RLS vid auto-insert |

## 7. Skyddsplan — full risk-katalog

### Risk-katalog

| # | Riskscenario | Värsta utfall |
|---|---|---|
| R1 | Push till `main` triggar Vercel-prod-deploy innan migration är klar | App läser från tom Supabase → vit skärm för familjen |
| R2 | `recipes.json` raderas eller korrumperas | 264 recept förlorade |
| R3 | `weekly-plan.json` förstörs som sidoeffekt (hård regel från Session 23) | Aktuell veckoplan tappad |
| R4 | Migrationsskript skriver fel struktur till Supabase | Data importeras men frontend kraschar på fältnamn |
| R5 | Vercel-Supabase-integration skriver över befintliga env vars | GITHUB_PAT / GEMINI_API_KEY / WILLYS_COOKIE försvinner → Willys-dispatch + receptimport dör |
| R6 | Magic-link-auth-konfig låser ut familjen | Kan inte logga in på er egen app |
| R7 | RLS-bugg i policy gör data osynlig även för inloggad medlem | Tabellerna har data men appen visar tomt |
| R8 | `claude/supabase-migration-ihIzv` mergas till `main` av misstag | R1 utlöses |

### Branch-disciplin

```
main ─────────────────────────────────────● (frusen tills cutover)
                                          ⇧ merge endast efter alla acceptanskriterier
claude/supabase-migration-ihIzv ──●──●──●──●  (allt jobb här)

pre-supabase-migration (tag) ──●            (immutable, pekar på sista main-commit)
backup-data-pre-supabase (branch) ──●       (samma SHA, finns för att vara "obvious")
```

**Regel:** Inga commits till `main` förrän hela acceptanskriterie-listan
(sektion 9) är grönmarkerad.

### Tre oberoende backup-lager (defense in depth)

**Lager 1 — Git-tag**
```bash
git tag pre-supabase-migration <senaste-main-sha>
git push origin pre-supabase-migration
```
Immutable referenspunkt. Kan ALDRIG raderas av misstag genom normala
git-flöden.

**Lager 2 — Backup-branch**
```bash
git branch backup-data-pre-supabase main
git push -u origin backup-data-pre-supabase
```
Skyddar mot tag-radering. Synlig i GitHub-UI vid återställning.

**Lager 3 — Duplicat i `docs/legacy/`**
```
docs/legacy/recipes-backup-2026-05-16.json
docs/legacy/weekly-plan-backup-2026-05-16.json
docs/legacy/recipe-history-backup-2026-05-16.json
docs/legacy/custom-days-backup-2026-05-16.json
docs/legacy/plan-archive-backup-2026-05-16.json
docs/legacy/shopping-list-backup-2026-05-16.json
docs/legacy/dispatch-preferences-backup-2026-05-16.json
```
Kopior i samma repo men annan väg — ifall någon kod-call-site skriver över
ursprungsfilen är duplicaten orörd.

### JSON-filer raderas ALDRIG i samma commit som migration
Efter cutover **flyttas** filerna till `docs/legacy/` — inte raderas.
Motivering: en `git revert` av en flytt återställer dem omedelbart utan att
vi behöver gräva i historik. Radering sker först efter 30 dagars stabil
produktion.

### Recipe-data särskild hantering
- `recipes.json` läses ALDRIG-skrivs-aldrig av migrationsskriptet (read-only)
- Skriptet validerar efter import: `count == 264`, varje recept har
  `id + title + ingredients + instructions`
- Spot-check: 5 första, 5 sista, 10 slumpvis valda jämförs fält-för-fält
  mellan JSON och Supabase
- Om validering misslyckas: skriptet avbryter UTAN att markera importen klar
  → vi kan köra om

### Vercel preview-deployments är vår testmiljö
```
Produktion: https://receptbok-six.vercel.app/
            ← `main`-branch
Preview:    https://receptbok-six-git-claude-supabase-migration-ihizv-<user>.vercel.app/
            ← vår branch
```
Båda är live och anropbara. Preview-URL:n är vad ägaren + partner testar
mot innan merge till `main`.

### Env vars — Supabase-integrationens faktiska beteende
Vercel-Supabase-integrationen lägger till **nya namn** som inte kolliderar
med befintliga:

Nya: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`,
`SUPABASE_JWT_SECRET`

Befintliga (orörda): `GITHUB_PAT`, `GITHUB_GIST_PAT`, `GEMINI_API_KEY`,
`WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID`

**Verifiering före merge:** kolla Vercel-dashboarden under Settings →
Environment Variables att alla gamla variabler står kvar. Manuellt.

### Specifika skyddsåtgärder

**R5 (env-var-överskrivning):** Innan vi installerar Vercel-Supabase-
integrationen skriver vi ner alla nuvarande env vars (namn + första 4
tecken som signatur) i `docs/superpowers/specs/env-vars-pre-supabase.md`.
Efter installation jämför vi att alla finns kvar.

**R6 (utelåst):** Magic-link konfigureras MED ägarens mailadress först. Vi
verifierar inloggning fungerar och session sparas. Sedan läggs partnerns
mail till. RLS aktiveras EFTER login är testat — så vi kan alltid läsa via
service-role om något låser sig.

**R7 (RLS-bugg):** Varje RLS-policy testas via Supabase Studio
(impersonate-funktionen) innan vi pushar frontend-koden. En "tom skärm pga
osynlig data"-bugg upptäcks i Studio på 30 sekunder.

## 8. Vad Claude åtar sig att INTE göra

- Aldrig pusha till `main` förrän användaren säger GO på cutover-steget
- Aldrig radera `recipes.json` eller andra JSON-datafiler innan duplicat i
  `docs/legacy/` är pushat
- Aldrig köra migration-skriptet utan `--dry-run` först
- Aldrig använda `git reset --hard` eller `--force` push utan att fråga
- Aldrig röra Vercel-env-vars direkt — bara via dokumentation av vad
  användaren behöver klicka in
- Aldrig mergea till `main` utan att backup-tag och backup-branch existerar
  i origin

## 9. Acceptanskriterier (måste vara gröna före cutover-merge)

- [ ] Befintlig veckoplan (start 2026-05-09) syns intakt efter import till Supabase
- [ ] Recipe-history bevaras (alla 67 entries)
- [ ] Custom-days (15 entries) bevaras
- [ ] Plan-archive (1 plan) bevaras
- [ ] Magic-link-login fungerar på iPhone Safari + desktop
- [ ] Bock av en vara på telefon syns på desktop inom 2 sek (realtime)
- [ ] Generering av ny plan fungerar (`/api/generate` mot Supabase)
- [ ] 545 assertions passerar (44 match + 62 shopping + 432 select-recipes
      — testerna kan behöva uppdateras om de mockar JSON-läsning)
- [ ] Dispatch-to-Willys fungerar mot ny shopping_items-modell
- [ ] Alla 6 befintliga Vercel-env-vars finns kvar efter Supabase-integration
- [ ] Backup-tag + backup-branch + `docs/legacy/`-duplicat finns i origin

## 10. Cutover-sekvens (60-minuters-fönstret)

Ordningen är konstruerad så att varje steg är reversibelt utan dataförlust
**tills steg 9**.

1. **Pre-flight 1** (5 min): verifiera tag + backup-branch + duplicat i
   `docs/legacy/` finns och stämmer
2. **Pre-flight 2**: kör `node scripts/migrate-to-supabase.mjs --dry-run` →
   läser JSON, validerar mot schema, skriver INGENTING till Supabase.
   Output: "skulle infoga X rader i Y tabeller". Mänsklig ögoninspektion.
3. **Skapa Supabase-schema** via MCP `apply_migration` (tabeller tomma)
4. **Kör live-import**: `node scripts/migrate-to-supabase.mjs --commit` →
   skriver till Supabase. Loggar varje INSERT.
5. **Post-import verifiering** via Supabase Studio:
   - `SELECT COUNT(*) FROM recipes` → 264
   - `SELECT COUNT(*) FROM recipe_history` → 67
   - `SELECT * FROM weekly_plans WHERE is_active = true` → 1 rad,
     start_date = '2026-05-09'
   - `SELECT COUNT(*) FROM meal_days WHERE plan_id IS NOT NULL` → 15
   - `SELECT COUNT(*) FROM meal_days WHERE plan_id IS NULL` → 15 (custom-days)
6. **Öppna Vercel preview-URL på iPhone** → magic-link-login → kontrollera
   att veckoplanen för 2026-05-09 syns intakt, custom-notes finns,
   inköpslistan har checkade varor bevarade
7. **Partner testar** preview-URL → magic-link funkar för andra
   mailadressen, ser samma data
8. **STOP-POINT: GO/NO-GO-beslut** — om något känns fel, abort. Inget i
   produktion har ändrats än.
9. **Cutover-commit**: merge `claude/supabase-migration-ihIzv` → `main` +
   push → Vercel deployar inom 30 sek
10. **Produktion-smoke-test**: `https://receptbok-six.vercel.app/` på
    telefon → samma flöde som steg 6
11. **15-minuters-bevakning**: håll telefonen öppen, klick runt, generera
    test-plan (med `dry_run=true`), verifiera realtime mellan två enheter

## 11. Rollback-paths (fyra eskaleringsnivåer)

**Nivå 1 — Mjuk revert (0–5 min efter cutover)**
```bash
git revert <merge-commit-sha>
git push origin main
```
Vercel deployar gamla koden inom 30 sek. JSON-filerna finns kvar i repot
på den gamla commiten, allt fungerar igen. Supabase-data lever vidare men
oanvänd — kan rensas senare.

**Nivå 2 — Vercel-deployment-promotion (0–60 sek, snabbast)**
I Vercel-dashboard: Deployments → välj senaste fungerande prod-deploy →
"Promote to Production". Ingen git-ändring behövs. Snabbaste reverten över
huvud taget. Bra om push tar tid.

**Nivå 3 — Tag-reset (DESTRUCTIVE — kräver explicit godkännande)**
```bash
git reset --hard pre-supabase-migration
git push --force origin main
```
**Aldrig utan användarens ja.** Skriver om historiken. Bara om Nivå 1+2
fallerar och vi har konstaterat att Supabase-koden måste bort helt.

**Nivå 4 — Data-restore från backup-branch**
Om JSON-filer av någon anledning förstörts:
```bash
git checkout backup-data-pre-supabase -- recipes.json weekly-plan.json \
  recipe-history.json custom-days.json plan-archive.json \
  shopping-list.json dispatch-preferences.json
git commit -m "Restore data from backup-data-pre-supabase"
git push origin main
```

## 12. Ändringar i CLAUDE.md efter migration

- "GitHub repo (JSON-filer)" → "Supabase Postgres" i arkitekturdiagrammet
- "GITHUB_PAT (contents:write)" tas bort som primary, blir bara för
  Willys-cookies-gist
- "Vercel timeout 15s" oförändrat
- Ny sektion: "Datamodell — tabellöversikt"
- Ny sektion (om relevant): "Lokal utveckling — Supabase CLI"
- Roadmap: ny "Fas 7 — Supabase-migration" med checkboxar för Fas A–E

## 13. Tidsbudget (grov)

| Fas | Estimat |
|---|---|
| A — Förberedelse | 2–3 h |
| B — Importskript | 4–6 h |
| C — Frontend-omskrivning | 12–16 h (största arbetet, många moduler) |
| D — Backend-omskrivning | 4–6 h |
| E — Cutover + verifiering | 2–4 h |
| **Totalt** | **~25–35 h aktivt arbete** |

Att jämföra med "2–4 veckor" från `docs/research-teknisk-vag-app.md` — vi
är i samma härad.

## 14. Sammanfattning i en mening

Vi arbetar på en isolerad branch, har **tre oberoende backup-lager** av all
data, testar mot Vercel preview-URL med riktig Supabase, gör en
**GO/NO-GO-checkpoint innan merge**, och har **fyra rollback-vägar** där
den snabbaste är 60 sekunder via Vercel-dashboard.

# Nästa steg — Fas 7C steg 1: Seed Supabase

**Status:** väntar på lokal körning (kan inte göras från sandboxen — service-role-nyckeln ska inte ligga i en delad miljö).

**Vad steg 0 lämnade efter sig:** `js/data-mapper.js` + 27 tester (`tests/data-mapper.test.js`). Inga app-filer rör mappern än. Commit: `bf5b1e7`.

**Vad steg 1 gör:** Fyller Supabase-tabellerna med produktiondata från JSON-filerna så att steg 2 (dual-read) har något att jämföra mot.

---

## Förberedelse (engångs)

### 1. Hämta de två nycklarna

Gå till `https://supabase.com/dashboard/project/zqeznveicagqwblltvsa/settings/api`

- **Project URL** → `https://zqeznveicagqwblltvsa.supabase.co` (kan också tas från CLAUDE.md, är ingen hemlighet)
- **service_role secret** under "Project API Keys" → klicka "Reveal" → kopiera. Börjar med `eyJ...`, ~250 tecken lång.

> ⚠️ Detta är DB-rotnyckeln — behandla som ett lösenord. Förväxla inte med `anon public` eller `publishable` (de skyddas av RLS och kan inte importera data).

### 2. Klona repot lokalt (om du inte redan har det)

```bash
git clone https://github.com/jockemedw/Receptbok.git
cd Receptbok
git checkout claude/supabase-migration-ihIzv
git pull
npm install
```

Om du redan har repot: `git pull` på rätt branch räcker.

---

## Kör torrkörningen först (säker)

```bash
export SUPABASE_URL="https://zqeznveicagqwblltvsa.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ...din-service-role-key..."

node scripts/migrate-to-supabase.mjs --dry-run
```

Det skriver **inget** till databasen — bara läser JSON-filer, validerar mot schemat och listar vad som skulle importeras. Förväntad sista rad ungefär:

```
   recipes                 | 264
   weekly_plans            | 1
   meal_days               | 28
   recipe_history          | 68
   plan_archives           | 1
   shopping_lists          | 1
   shopping_items          | 82
   dispatch_preferences    | 1
```

**Acceptkriterium:** siffrorna matchar Session 55:s dry-run (se CLAUDE.md Session 55-entry). Om de avviker — stoppa och fråga Claude innan du går vidare.

---

## Kör live-importen

```bash
node scripts/migrate-to-supabase.mjs --commit
```

Säkerhetsnät i skriptet:
- Vägrar köra om `recipes`-tabellen redan har rader (skydd mot dubbel-import)
- Validerar radantal efter import
- Spot-checkar 5 första + 5 sista + 10 slumpvis valda recept fält-för-fält

**Förväntad sista rad:** `✓ Migration klar`.

---

## Verifiera utan att lita på skriptet

Öppna `https://supabase.com/dashboard/project/zqeznveicagqwblltvsa/editor`, klicka på `recipes`-tabellen. 264 rader, första titeln = "Gräddig fiskgratäng med purjo".

Eller via SQL Editor:

```sql
select count(*) from recipes;
select id, title from recipes order by id limit 5;
```

---

## När du är klar

Säg till Claude — t.ex. "klart" eller klistra in sista raden av outputen. Då går Claude vidare med **steg 2: dual-read i `app.js`** (Supabase + JSON läses parallellt, jämförs via mappern, diff:ar loggas i konsolen utan att röra app-beteendet).

---

## Felsökning

| Felmeddelande | Orsak | Fix |
|---|---|---|
| `SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste sättas` | Env vars inte exporterade i nuvarande shell | Kör `export`-raderna igen i samma terminalfönster |
| `recipes-tabellen har redan N rader` | Redan importerat (kanske tidigare försök) | `node scripts/migrate-to-supabase.mjs --reset` sen `--commit` igen |
| `recipe-history: recipe_id 26 finns inte i recipes.json — hoppar över` | Förväntat, inte ett fel — Session 55 dokumenterade detta | Ignorera |
| `Cannot find module '@supabase/supabase-js'` | `npm install` har inte körts | Kör `npm install` i repot |

---

## Hård regel kvar

Branchen är `claude/supabase-migration-ihIzv`. Ingen merge till `main` förrän Fas 7E:s acceptanskriterier är gröna (spec sektion 9). Om något skiter sig vid `--commit`, säg till Claude — `--reset` fixar det.

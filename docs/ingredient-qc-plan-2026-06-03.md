# Kvalitetskontroll av ingredienser — plan (2026-06-03)

> Mål: minska problem vid generering av ingrediens- och inköpslistor. En optimal
> ingrediens har en **definierbar mängd** i antingen **antal**, **vikt** eller **volym**.

## Beslut (bekräftade med användaren)
1. **Omfattning:** Allt — verktyg + parser-fixar + canon-utökning + datastädning + skyddsräcken.
2. **Datakälla:** Supabase `recipes`-tabellen är sanningskällan. Allt som ska påverka appen landar i Supabase.
3. **`recipes.json`:** Retireras helt. Filen tas bort, dev-skript pekas om till en Supabase-export.

## Nuläge (mätt 2026-06-03)

Parsern (`api/_shared/shopping-builder.js`, 5-stegspipeline) kördes över datan.

| Mått | recipes.json | Supabase `recipes` |
|---|---|---|
| Antal recept | 263 | **262** |
| Högsta id | 264 | **271** |
| Ingrediensrader | 3 810 | **3 791** |

Filen och databasen har **glidit isär** — recept skapade/ändrade i appen sedan
Session 58 finns bara i Supabase. Inget i runtime läser `recipes.json`
(`api/generate.js`, `api/confirm.js`, `api/replace-recipe.js`, `js/app.js`,
`js/recipes/*` läser alla `.from("recipes")`). Filen används bara av dev-skript.

### Problemmätningar (från recipes.json, representativt)
- **682 unika namn** efter normalisering; bara **113 (17 %)** i `CANON_SET`
  → 569 namn är inte pris-matchbara och slås ihop svagt.
- **467 rader (12,3 %)** parsar till ingen mängd. Delvis legitimt (salt/peppar/olja
  = skafferi-skip), delvis riktiga ingredienser utan mängd (`torrostade sesamfrön`,
  `skalade räkor`, `salladsblad`, `bröd`).
- **511 rader** har antal men ingen enhet (mestadels korrekt styckeantal).
- Fleringrediens-rader: **44** med " eller ", **35** med " och ", **8** med "/".
- **1** fraktionsbugg: `⅔ dl olivolja` → hela mängden tappas (regexen i
  `amountMatch` saknar ⅓⅔⅛-glyfer).
- Beskrivande brus kvar i namn: `krossade San Marzano-tomater på burk`,
  `kycklingbröst utan ben och skinn`, `marinerade kronärtskockshjärtan`.

### Vanligaste icke-canon-namn (frekvens)
`chilipulver` 50× · `vitlökspulver` 47× · `risvinäger` 31× · `dijonsenap` 29× ·
`rökt paprikapulver` 25× · `sesamolja` 22× · `quinoa` 21× · `sojasås` (varianter) ·
`avokado` · `äppelcidervinäger` 16× · `blomkål` 14× · `lönnsirap` 13× ·
`kokosmjölk` 8× · `svarta bönor` 8× · `brysselkål` 8×.
(Några av dessa finns i `CATEGORY_KEYWORDS` men inte i `NORMALIZATION_TABLE`/
`CANON_SET` → kategoriseras rätt men matchar inga erbjudanden.)

## Problemtaxonomi (6 klasser)
1. **Okänt namn** — ej i canon → ingen prismatch, svag merge. *(störst: 569)*
2. **Saknad mängd** på riktig ingrediens.
3. **Flera ingredienser per rad** (`och`/`eller`/`/`).
4. **Beskrivande brus** i namnet (prep-ord, varumärke, förpackning).
5. **Parser-edgecases** (⅓⅔-fraktioner, enhetsluckor).
6. **Format-inkonsekvens** (mängd-först vs namn-sen-parentes "doh-format").

## Plan — 5 faser

### Fas 0 — Audit-verktyg (grunden, read-only)
- Utöka `scripts/recipe-audit.mjs` så det **läser från Supabase** (export till
  lokal arbets-JSON via service-role-klienten i `api/_shared/supabase.js`), inte
  från `recipes.json`.
- Klassa varje rad i de 6 klasserna, gradera severity (P0 = mängd helt tappad /
  parsefel; P1 = okänt namn / fleringrediens; P2 = brus / kosmetiskt).
- Emit: `docs/ingredient-audit-<datum>.md` (sammanfattning + radlista per recept-id).
- **Mätbart baseline** som körs om efter varje batch i Fas 3.
- Definition of Done: rapporten genereras, siffror matchar manuell stickprovskoll.

### Fas 1 — Parser-buggfixar (låg risk)
- Fixa ⅓⅔⅛-fraktioner i `amountMatch`-regexen + `parseFraction` (lägg
  `⅓→0,33 ⅔→0,67 ⅛→0,125` m.fl.).
- Granska enhetsluckor (t.ex. `klyfta`/`klyftor` redan med; verifiera täckning).
- Nya assertions i `tests/` (kör befintlig svit: match 51 / shopping 62 m.fl.).
- DoD: `node --check`, alla tester gröna, ⅔-raden parsar nu rätt.

### Fas 2 — Utöka canon-täckning
- Lägg de högfrekventa icke-canon-namnen i `NORMALIZATION_TABLE` med self-canon +
  aliaser, och i `CATEGORY_KEYWORDS` där kategori saknas.
- Prioritet efter frekvens (chilipulver, vitlökspulver, risvinäger, dijonsenap,
  sojasås, sesamolja, quinoa, avokado, kokosmjölk, vinägrar, paprikapulver…).
- Verifiera mot `CANON_REJECT_PATTERNS` så inga felmatchningar uppstår.
- DoD: Fas 0-auditen visar markant fler namn i CANON_SET; matchningstest gröna.

### Fas 3 — Datastädning i Supabase (största jobbet)
- Adaptera `scripts/recipe-fix-ingredients.mjs` till en **dry-run-först**-pipeline
  som föreslår normaliserade strängar och (med `--apply`) skriver till Supabase
  via `execute_sql`/klient i **kontrollerade batchar**.
- Regler: säkerställ `mängd enhet namn`-ordning, strippa brus/förpackning/prep-ord,
  dela fleringrediens-rader till separata poster, behåll medvetet mängdlösa
  skafferivaror (salt/peppar/olja) orörda.
- **Schemat rörs inte** — bara `ingredients`-arrayens stränginnehåll.
- Verifiera efter varje batch genom att köra om Fas 0. Aldrig förstöra en aktiv
  veckoplan (hård regel) — receptdata, inte plandata, ändras.
- DoD: P0/P1-raderna nere mot noll; auditrapport before/after i docs.

### Fas 4 — Retire recipes.json + skyddsräcken
- Ta bort `recipes.json`. Peka om de 10 skripten:
  - **Konsumenter** (`recipe-audit`, `season-analysis`, `classify-cuisine`,
    `generate_weekly_plan.py`): läs Supabase-export.
  - **Producenter** (scrape/import-pipeline `dish-scrape/*`,
    `migrate-to-supabase`): skriv nya recept direkt till Supabase istället för
    filen. Detta är den mest delikata biten — import-flödet landar idag nya
    recept i filen.
- Lägg en gemensam `scripts/_lib/load-recipes.mjs` som hämtar från Supabase.
- Dokumentera **kanoniskt ingrediensformat** i CLAUDE.md (`mängd enhet namn`,
  en ingrediens per rad, skafferivaror får sakna mängd).
- Ev. lättviktig regressionscheck (audit körd i test) som flaggar nya P0/P1.
- DoD: inga referenser till `recipes.json` kvar (`grep`), import-flödet
  verifierat mot Supabase, CLAUDE.md uppdaterad.

## Risker & skydd
- **Aktiv veckoplan:** Fas 3 ändrar bara `recipes`, aldrig `meal_days`/
  `weekly_plans`/`shopping_items` → ingen plan förstörs.
- **Supabase-mutationer:** alltid dry-run + batch + om-audit innan nästa batch.
- **Import-pipeline-brott (Fas 4):** störst risk; verifieras separat med ett
  testrecept innan `recipes.json` raderas.
- **Inactive project:** `supabase-canary-curtain` är INACTIVE; rätt projekt är
  `receptbok` (`zqeznveicagqwblltvsa`, ACTIVE_HEALTHY).

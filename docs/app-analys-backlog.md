# App-analys — backlog (2026-06-29)

Resultat av en djupanalys där två agenter (produkt/UX-strateg + teknisk arkitekt)
oberoende granskade hela kodbasen, följt av två rundor djupintervjuer. Det
starkaste fyndet är där de möts från varsitt håll: **appen är ovanligt välbyggd
för en hobbyapp, men den är byggd för EN person (Joakim) och vilar på fundament
som kan fela tyst.**

Varje punkt är formulerad så att den kan åtgärdas **fristående**. Prioritet:
P0 = störst riskreduktion per timme, sedan nedåt. Naturliga beroenden noteras i texten.

> Spegel av sessionens todo-lista (#1–#27). Uppdatera båda om något ändras.

**Status (uppdaterad Session 104):**
- ✅ **Klara:** #1, #3, #4, #8, #9, #26, #27 (Session 102–103). #2 kod klar — väntar bara på att Joakim sätter `ALERT_WEBHOOK`.
- 🟡 **Delvis:** #24 (död state borta, `?v=N`-linjeval kvar), #25 (escapers → utils klart; `fmtKr`/spegelkod medvetet kvar — se punkten).
- ⬜ **Öppna:** hela P1-tenancy-spåret (#5–#7, #10, #11), produktspåret (#12–#18) och resterande UX/städning (#19–#23).
- **Slutsats:** P0 är i praktiken avklarad. Nästa substantiella hävstång ligger i P1-tenancy (#5–#7) inför Fas 5, och produktspåret (#12 portionsskalning, #15 Ikväll-redigerare).

---

## 🔴 P0 — Risk / Must (de "tre kvällarna" + drift-säkerhet)

### #1 — Radera legacy `weekly-plan.yml` + lägg CI som kör testsviten
> ✅ **KLAR (Session 102, PR #100).** `weekly-plan.yml` borttagen; `.github/workflows/test.yml` kör hela sviten + `node --check` vid push/PR.
**Varför:** Enda workflow idag (`.github/workflows/weekly-plan.yml`) kör en *retirerad*
Python/Anthropic-generator mot frikopplade JSON-filer — en oavsiktlig `workflow_dispatch`
skriver skräp till repo-roten. Ingen CI kör Node-testsviten; allt skydd ligger i lokala
`.claude`-hooks som bara fångar editeringar i Claude-sessioner.
**Väg framåt:**
1. Ta bort `.github/workflows/weekly-plan.yml`.
2. Skapa `.github/workflows/test.yml`: trigga på push + pull_request, `npm ci`
   (krävs för dispatch/cookies-testerna), kör alla `node tests/*.test.js`.
3. Verifiera grön svit i CI.
**Insats:** Liten. **Högst ROI.**

### #2 — Larm vid tyst Willys-/prisdegradering
> 🟡 **KOD KLAR (Session 102), väntar på env.** `pricingDegraded`-flagga + `notifyAlert()` (`api/_shared/alert.js`, `alert.test.js` grön) finns. Kvar: Joakim sätter `ALERT_WEBHOOK` i Vercel + diskret svensk toast för `pricingDegraded`.
**Varför:** Prisoptimering + Veckans fynd vilar på oofficiella Willys-endpoints. Vid
API-ändring returnerar feeden tyst `[]` → ser ut som "inga reor", inte "trasigt".
`generate.js:~516` sväljer felet i tom catch (`savingsById=null`). Ingen larmar.
**Väg framåt:**
1. Byt den tysta catchen (generate.js ~487–518) + `fetchOffersFromWillys` mot en synlig signal.
2. Env `ALERT_WEBHOOK` (gratis ntfy.sh/Discord). Pling när `optimize_prices=true` men 0 erbjudanden/exception.
3. Samma pling i dispatchens `auth_expired`-gren.
4. Bonus: `pricingDegraded:true` i generate-svaret → diskret svensk toast.
**Insats:** Liten. *Kräver att Joakim levererar en webhook-URL.*

### #3 — Gör `activatePlan` atomär + test på plan-orkestreringen
> ✅ **KLAR (Session 103, PR #103).** `activate_plan_atomic`-RPC + `activatePlanAtomic()` med fallback + rollback-test. Kvar (Joakim): kör `db/migrations/001_activate_plan_atomic.sql` i Supabase → aktiverar atomiciteten (main säker även utan).
**Varför:** Hårda regeln "befintlig veckoplan får aldrig förstöras" är OTESTAD, och
`activatePlan` (generate.js:~356–361) är TVÅ separata UPDATE utan transaktion. Dör
processen mellan dem (kall lambda, free-tier-paus, nätfel) → hushållet får NOLL aktiva
planer (gammal avstängd, ny ej påslagen, gamla `meal_days` redan arkiverade) = tyst
"försvunnen matsedel".
**Väg framåt:**
1. Flytta deactivate+activate (helst inkl. `archiveOldPlan`) till EN Postgres-RPC → atomärt.
2. Integrationstest mot mockad `db`: alltid exakt en aktiv plan med dagar, även vid simulerat fel mitt i.
**Insats:** Medel.

### #4 — Exportera `selectRecipes`/`bucketBySaving` till testet (ta bort drift-kopia)
> ✅ **KLAR (Session 102, PR #100).** Utbrutet till `api/_shared/select-recipes.js`; `select-recipes.test.js` importerar från källan (ingen inline-kopia kvar).
**Varför:** `select-recipes.test.js` (432 assertions) testar en INLINE-KOPIA, inte den
faktiska koden i `generate.js`. Filen varnar själv. Reell drift-risk.
**Väg framåt:**
1. Exportera `selectRecipes`/`bucketBySaving` från `api/generate.js`.
2. Ersätt inline-kopian med en import.
3. Kör sviten.
**Insats:** Liten.

---

## 🟠 P1 — Säkerhet & robusthet

### #5 — Flytta Willys-cookies från secret gist → Supabase-tabell med RLS
> ⬜ **ÖPPEN.** Cookies + CSRF ligger fortfarande i secret gist; `GITHUB_GIST_PAT` kvar. Grund för #7.
**Varför:** Sessionscookies + CSRF i KLARTEXT i en GitHub "secret" gist
(security-by-obscurity — läckt URL = kontokapning). `GITHUB_GIST_PAT` är överbred classic-token.
**Väg framåt:** Supabase-tabell `willys_secrets` per `household_id` + RLS → skriv om
`secrets-store.js` → uppdatera extension-payload + `runRefresh` → avveckla GIST_PAT.
**Insats:** Medel. (Grund för #7.)

### #6 — JWT-baserad household-härledning i skrivande endpoints (Fas 5-blockerare)
> ⬜ **ÖPPEN.** `getHouseholdId()` plockar fortfarande "första hushållet" (`.limit(1).single()`) i `api/_shared/supabase.js`. Största tenancy-blockeraren inför Fas 5.
**Varför:** Service-role-nyckeln kringgår RLS; `getHouseholdId()` plockar "första hushållet"
(`.limit(1).single()`). Med fler hushåll skriver vem som helst mot fel hushåll.
**Väg framåt:** Läs `Authorization`-JWT → `auth.getUser` → härled household från
`household_members` → ersätt "första hushållet"-plocket i `api/_shared/supabase.js`.
**Insats:** Medel–stor. Största tenancy-blockeraren inför Fas 5.

### #7 — Multi-user dispatch: ta bort hårdkodad `userId`/butik + dedupe URL
> ⬜ **ÖPPEN.** `userId="joakim"` + butik `2160` hårdkodat på flera ställen; dubblett-offers-URL kvar i `generate.js`. Bygger på #5.
**Varför:** `userId="joakim"` + butik `2160` hårdkodat på flera ställen. `generate.js:8`
har en DUPLICERAD offers-URL-literal med inbakat 2160 → prisoptimeringen frågar alltid Ekholmen.
**Väg framåt:** Parametrisera butik (importera `WILLYS_BASE` i stället för re-stringify; ta
bort dubblett-URL) → nyckla secrets/butik per household (bygger på #5) → feature-flagga Willys.
**Insats:** Medel. Kan delas i steg.

### #8 — Sätt `maxDuration` på `import-recipe.js`
> ✅ **KLAR (Session 102, PR #100).** `vercel.json` sätter `maxDuration: 30` för `api/import-recipe.js`.
**Varför:** Gemini (upp till 2×25s) utan förhöjd `maxDuration` → slår i Hobby-default (10s),
timeoutar tyst vid fotoimport.
**Väg framåt:** Lägg `functions`-entry i `vercel.json` (~30s). Verifiera mot live.
**Insats:** Trivial.

### #9 — SSRF-test (`isPrivateIp`) + konstant-tids-jämförelse på `X-Refresh-Secret`
> ✅ **KLAR (Session 102, PR #100).** `isPrivateIp` exporterad + testad (`import-recipe.test.js`); `secretsMatch()` använder `crypto.timingSafeEqual` med längd-guard i `dispatch-to-willys.js`.
**Varför:** `isPrivateIp` (SSRF-skydd) OTESTAT; `X-Refresh-Secret`-koll använder vanlig `!==`.
**Väg framåt:** Enhetstest för `isPrivateIp` → byt mot `crypto.timingSafeEqual` (med längd-guard).
**Insats:** Liten.

### #10 — Custom-days race: bakom API eller delad `_opBusy`-spärr
> ⬜ **ÖPPEN.** `_opBusy` finns bara i `plan-viewer-deluxe.js`, delas inte med custom-days-vägen i `plan-viewer.js`.
**Varför:** Custom-days skrivs DIREKT från browsern (read-then-write) medan resten av planen
är atomär via API. Race mot realtime-eko/annan enhet. (Klobbrar dock ej plan-rader — `plan_id==null`-guard.)
**Väg framåt:** Route via API likt övriga plan-mutationer, ELLER minst dela `_opBusy`-spärren
mellan `plan-viewer.js` och `plan-viewer-deluxe.js`.
**Insats:** Medel / Liten.

### #11 — Supabase free-tier-paus: dokumentera + keep-alive
> ⬜ **ÖPPEN.** Ingen dokumentation/keep-alive/graceful degradation vid pausad DB.
**Varför:** Free-tier PAUSAR efter ~1 v inaktivitet → hela appen nere utan graceful degradation.
**Väg framåt:** Dokumentera i CLAUDE.md → gratis liveness-ping (extern cron GET:ar hälsosida;
bryter EJ "ingen automatisk generering") → begripligt svenskt fel om DB pausad.
**Insats:** Liten.

---

## 🟢 P2 — Produktfunktioner (familjevärde)

### #12 — Portionsskalning (hushållsmål) i parsad pipe  ⭐ agenternas #1 "bygg näst"
> ⬜ **ÖPPEN.** Produktspår — kräver datamodell (`target_servings` på household) + pipe-ändring + UI. Diskutera scope med Joakim.
**Varför:** Recept = 4 port, familjen = 2,5 → ~60 % överköp. Träffar matsvinn + budget varje
måltid och gör dispatchen meningsfull.
**Väg framåt (datamodell/pipe, INTE bara UI):**
1. Nytt fält `target_servings` på household (default 4 = ingen regression).
2. Skala i PARSADE tal FÖRE merge: `amount *= target/recipe.servings`. Råtext rörs aldrig.
3. Vänlig avrundning i `formatIngredient` (styckevaror uppåt till heltal; mått till rimlig precision).
4. Bonus: enhetskanonisering före merge (dl↔l, g↔kg, msk/tsk→ml) → färre rader faller till bara namn.
5. UI: "Vi är X portioner".
**Insats:** Medel. `shopping.test.js` täcker pipen → regression fångas.

### #13 — Skafferi/"har hemma"-läge
> ⬜ **ÖPPEN.** Produktspår.
**Varför:** Allt handlas som om skafferiet är tomt. Krymper lista + svinn.
**Väg framåt:** Kryss per vara "finns hemma → skippa", minne per kanon-namn (bygg på befintlig
avbocknings-/kanon-infra). Skippat visas dämpat, inte borttaget.
**Insats:** Liten.

### #14 — "Rester/Använd upp"-dagtyp
> ⬜ **ÖPPEN.** Produktspår.
**Varför:** Datan bevisar behovet (`custom-days.json`: 7 dagar "Kylskåpstömning", "Rester").
**Väg framåt:** Ny dagtyp som generering hoppar över, ren rendering, egen markör, ingen inköpspåverkan.
**Insats:** Liten.

### #15 — Ikväll-kortet som friktionsfri snabb-redigerare (gör Maggan jämbördig)  ⭐
> ⬜ **ÖPPEN.** Produktspår — största hävstången mot "app hela familjen använder". Diskutera UX med Joakim.
**Varför:** 2 av 3 användare är passiva läsare. Partnern kan inte forma planen utan power-user-UI.
**Väg framåt:** Utöka Ikväll-kortet: "byt middag / vi äter ute / rester ikväll / lägg till på listan"
— ett tryck vardera, inga grindar. Återanvänd custom-day/skip-day/manuell vara — inramningen saknas, inte logiken.
**Insats:** Liten–medel. Största hävstången mot "app hela familjen använder".

### #16 — Favoriter/betyg (Fas 2 familjelärande)
> ⬜ **ÖPPEN.** Produktspår — förutsättning för Fas 2B/2C.
**Varför:** Enda signalen idag är binär `tested`. Förutsättning för Fas 2B/2C.
**Väg framåt:** Rating/favorit-fält → UI (stjärna/hjärta) → senare väg in i selectRecipes + "Favoriter"-vy.
**Insats:** Medel.

### #17 — Receptbilder + spara käll-URL vid import
> ⬜ **ÖPPEN.** Produktspår.
**Varför:** Fotoimport slänger bilden efter OCR; käll-URL sparas inte. Lucka för en matlagningsapp.
**Väg framåt:** `image_url` + `source_url` i datamodellen → spara vid import → visa i detalj/kort + källänk.
**Insats:** Medel.

### #18 — Take-away/restaurang + gäster som riktiga dagtyper
> ⬜ **ÖPPEN.** Produktspår — gäst-portionslogik hakar i #12.
**Varför:** "Äter ute" löses med fritext idag; gäster saknar portionslogik.
**Väg framåt:** "Äter ute"-dagtyp (hoppas över) + "Gäster"-läge med per-dag portions-override (hakar i #12).
**Insats:** Liten / Medel.

---

## 🔵 P3 — UX-förbättringar

### #19 — Förenkla/förklara de tre grindarna (Generera→Bekräfta→Flytta)
> ⬜ **ÖPPEN.** UX-förbättring.
**Väg framåt:** Mikro-copy/stegindikator (1 Förslag → 2 Bekräftad → 3 Handla); överväg slå ihop
Bekräfta+Flytta där säkert. Behåll `day-ops sameRecipes`-invarianten. **Insats:** Liten–medel.

### #20 — Dispatch-preferenser (eko/svenskt) ska styra faktisk dispatch
> ⬜ **ÖPPEN.** Preferenserna påverkar idag bara AI-prompten, inte automatdispatchen.
**Varför:** Preferenserna påverkar idag bara AI-prompten, inte automatdispatchen (tyst ignorerad).
**Väg framåt:** Låt `dispatch-matcher.js` väga in eko/svenskt vid produktval; visa om det inte kan uppfyllas.
**Insats:** Medel.

### #21 — Onboarding-guide + självbetjäning för auth
> ⬜ **ÖPPEN.** UX — ingen förstagångsguide; auth saknar lösenordsåterställning.
**Varför:** Ingen förstagångsguide; auth saknar lösenordsåterställning (glömt lösenord = Supabase-dashboard).
**Väg framåt:** Lättviktig guide (tooltips/kort) + `resetPasswordForEmail` i `auth-gate.js`
(registrering förblir avstängd enligt princip). **Insats:** Medel.

### #22 — Tillgänglighet: tillåt zoom + tangentbordsväg för gester
> ⬜ **ÖPPEN.** `user-scalable=no` blockerar fortfarande zoom; gester saknar tangentbordsväg.
**Varför:** `maximum-scale=1.0, user-scalable=no` blockerar zoom; pull-to-reveal saknar tangentbordsväg.
**Väg framåt:** Ta bort `user-scalable=no` → synlig knapp som alternativ till gesten → textkomplement till proteinfärg.
**Insats:** Liten.

---

## ⚪ P4 — Städning (låg risk)

### #23 — Ta bort död JS + CSS efter Session 101
> ⬜ **ÖPPEN.** 8 döda `#weekRecipeDetail`/`.week-day-card`-referenser kvar i `plan-viewer.js` (vaktade, ofarliga men vilseledande) + död klassisk-CSS. Städas per-selektor i granskat steg (behåll `.holiday-dot`).
**Varför:** Teardownen ej klar på JS-sidan. Vakter räddar från krasch men koden är vilseledande död.
**Väg framåt:** Ta bort 6 `#weekRecipeDetail`-referenser (plan-viewer.js ~397/597/644/850/877) +
`.week-day-card`-koden (:29/:281). Städa död klassisk-CSS per-selektor (behåll `.holiday-dot`).
**Insats:** Liten–medel (CSS i granskat steg).

### #24 — Synka/ta bort `?v=N` på JS-importer + död state/stubbar
> 🟡 **DELVIS (Session 102).** Död state `_freshShopContent` + `initFilters`/`applyFilters`-stubbarna borttagna. Kvar: linjeval för `?v=N`-cache-busting på JS-importerna.
**Väg framåt:** Välj en linje (synka alla modulversioner ELLER ta bort `?v` på JS, förlita nät-först-SW) →
ta bort död state `_freshShopContent` → ta bort stubbar `initFilters`/`applyFilters` (Grep först). **Insats:** Liten.

### #25 — Slå ihop spegelkod + lokala `escapeHtml` → utils
> 🟡 **DELVIS (Session 104).** De 4 duplicerade HTML-escaparna (`esc`×2, `escapeHtml`×2 i dispatch) använder nu `utils.escapeHtml` (en enda implementation). **Medvetet kvar:** (a) `fmtKr` har olika avrundning per vy (plan-viewer/deals visar en decimal `12,5 kr`, deluxe heltal `13 kr`) — att ena ändrar **synlig** kr i premiumvyn → kräver Joakims display-beslut; (b) `updateLastPlanDay`/`patchPlanDay` ligger i plan-mutations-vägen (hård regel "veckoplan får aldrig förstöras") → slås ihop i ett separat granskat steg, inte i en autonom runda.
**Väg framåt:** Slå ihop `updateLastPlanDay`/`patchPlanDay`; ersätt lokala `escapeHtml`/`esc`/`fmtKr`
med `utils.*`. **Insats:** Liten.

### #26 — Tysta catch → svenska felmeddelanden
> ✅ **KLAR (Session 102, PR #100).** Svenska toasts i `convertBlockedToCustom`, `clearCustomDay`, `copyShoppingList` (`.catch`) och `scheduleCheckedSave`.
**Varför:** Bryter mot CLAUDE.md-regeln. `convertBlockedToCustom`, `clearCustomDay`,
`copyShoppingList` (saknar .catch), `scheduleCheckedSave` (bockningar tappas tyst).
**Väg framåt:** Svensk toast/feedback i de tysta blocken. **Insats:** Liten.

### #27 — Skriv riktig README
> ✅ **KLAR (Session 102, PR #100).** README beskriver appen, arkitektur, testkörning och nyckelkataloger.
**Varför:** README är 36 byte → bus-factor 1.
**Väg framåt:** Vad appen är, arkitektur-översikt, hur testsviten körs, nyckelkataloger, länk till CLAUDE.md. **Insats:** Liten.

---

## Rekommenderad betningsordning
Uppifrån: **P0 → produktspåret (#12 → #15 → #13/#14) → resten.** P0 ger störst
riskreduktion per timme; produktspåret flyttar appen från "en-personsapp" till "hela
familjens app".

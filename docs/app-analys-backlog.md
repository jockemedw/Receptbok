# App-analys — backlog (2026-06-29)

Resultat av en djupanalys där två agenter (produkt/UX-strateg + teknisk arkitekt)
oberoende granskade hela kodbasen, följt av två rundor djupintervjuer. Det
starkaste fyndet är där de möts från varsitt håll: **appen är ovanligt välbyggd
för en hobbyapp, men den är byggd för EN person (Joakim) och vilar på fundament
som kan fela tyst.**

Varje punkt är formulerad så att den kan åtgärdas **fristående**. Prioritet:
P0 = störst riskreduktion per timme, sedan nedåt. Naturliga beroenden noteras i texten.

> Spegel av sessionens todo-lista (#1–#27). Uppdatera båda om något ändras.

---

## 🔴 P0 — Risk / Must (de "tre kvällarna" + drift-säkerhet)

### #1 — Radera legacy `weekly-plan.yml` + lägg CI som kör testsviten
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
**Varför:** Sessionscookies + CSRF i KLARTEXT i en GitHub "secret" gist
(security-by-obscurity — läckt URL = kontokapning). `GITHUB_GIST_PAT` är överbred classic-token.
**Väg framåt:** Supabase-tabell `willys_secrets` per `household_id` + RLS → skriv om
`secrets-store.js` → uppdatera extension-payload + `runRefresh` → avveckla GIST_PAT.
**Insats:** Medel. (Grund för #7.)

### #6 — JWT-baserad household-härledning i skrivande endpoints (Fas 5-blockerare)
**Varför:** Service-role-nyckeln kringgår RLS; `getHouseholdId()` plockar "första hushållet"
(`.limit(1).single()`). Med fler hushåll skriver vem som helst mot fel hushåll.
**Väg framåt:** Läs `Authorization`-JWT → `auth.getUser` → härled household från
`household_members` → ersätt "första hushållet"-plocket i `api/_shared/supabase.js`.
**Insats:** Medel–stor. Största tenancy-blockeraren inför Fas 5.

### #7 — Multi-user dispatch: ta bort hårdkodad `userId`/butik + dedupe URL
**Varför:** `userId="joakim"` + butik `2160` hårdkodat på flera ställen. `generate.js:8`
har en DUPLICERAD offers-URL-literal med inbakat 2160 → prisoptimeringen frågar alltid Ekholmen.
**Väg framåt:** Parametrisera butik (importera `WILLYS_BASE` i stället för re-stringify; ta
bort dubblett-URL) → nyckla secrets/butik per household (bygger på #5) → feature-flagga Willys.
**Insats:** Medel. Kan delas i steg.

### #8 — Sätt `maxDuration` på `import-recipe.js`
**Varför:** Gemini (upp till 2×25s) utan förhöjd `maxDuration` → slår i Hobby-default (10s),
timeoutar tyst vid fotoimport.
**Väg framåt:** Lägg `functions`-entry i `vercel.json` (~30s). Verifiera mot live.
**Insats:** Trivial.

### #9 — SSRF-test (`isPrivateIp`) + konstant-tids-jämförelse på `X-Refresh-Secret`
**Varför:** `isPrivateIp` (SSRF-skydd) OTESTAT; `X-Refresh-Secret`-koll använder vanlig `!==`.
**Väg framåt:** Enhetstest för `isPrivateIp` → byt mot `crypto.timingSafeEqual` (med längd-guard).
**Insats:** Liten.

### #10 — Custom-days race: bakom API eller delad `_opBusy`-spärr
**Varför:** Custom-days skrivs DIREKT från browsern (read-then-write) medan resten av planen
är atomär via API. Race mot realtime-eko/annan enhet. (Klobbrar dock ej plan-rader — `plan_id==null`-guard.)
**Väg framåt:** Route via API likt övriga plan-mutationer, ELLER minst dela `_opBusy`-spärren
mellan `plan-viewer.js` och `plan-viewer-deluxe.js`.
**Insats:** Medel / Liten.

### #11 — Supabase free-tier-paus: dokumentera + keep-alive
**Varför:** Free-tier PAUSAR efter ~1 v inaktivitet → hela appen nere utan graceful degradation.
**Väg framåt:** Dokumentera i CLAUDE.md → gratis liveness-ping (extern cron GET:ar hälsosida;
bryter EJ "ingen automatisk generering") → begripligt svenskt fel om DB pausad.
**Insats:** Liten.

---

## 🟢 P2 — Produktfunktioner (familjevärde)

### #12 — Portionsskalning (hushållsmål) i parsad pipe  ⭐ agenternas #1 "bygg näst"
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
**Varför:** Allt handlas som om skafferiet är tomt. Krymper lista + svinn.
**Väg framåt:** Kryss per vara "finns hemma → skippa", minne per kanon-namn (bygg på befintlig
avbocknings-/kanon-infra). Skippat visas dämpat, inte borttaget.
**Insats:** Liten.

### #14 — "Rester/Använd upp"-dagtyp
**Varför:** Datan bevisar behovet (`custom-days.json`: 7 dagar "Kylskåpstömning", "Rester").
**Väg framåt:** Ny dagtyp som generering hoppar över, ren rendering, egen markör, ingen inköpspåverkan.
**Insats:** Liten.

### #15 — Ikväll-kortet som friktionsfri snabb-redigerare (gör Maggan jämbördig)  ⭐
**Varför:** 2 av 3 användare är passiva läsare. Partnern kan inte forma planen utan power-user-UI.
**Väg framåt:** Utöka Ikväll-kortet: "byt middag / vi äter ute / rester ikväll / lägg till på listan"
— ett tryck vardera, inga grindar. Återanvänd custom-day/skip-day/manuell vara — inramningen saknas, inte logiken.
**Insats:** Liten–medel. Största hävstången mot "app hela familjen använder".

### #16 — Favoriter/betyg (Fas 2 familjelärande)
**Varför:** Enda signalen idag är binär `tested`. Förutsättning för Fas 2B/2C.
**Väg framåt:** Rating/favorit-fält → UI (stjärna/hjärta) → senare väg in i selectRecipes + "Favoriter"-vy.
**Insats:** Medel.

### #17 — Receptbilder + spara käll-URL vid import
**Varför:** Fotoimport slänger bilden efter OCR; käll-URL sparas inte. Lucka för en matlagningsapp.
**Väg framåt:** `image_url` + `source_url` i datamodellen → spara vid import → visa i detalj/kort + källänk.
**Insats:** Medel.

### #18 — Take-away/restaurang + gäster som riktiga dagtyper
**Varför:** "Äter ute" löses med fritext idag; gäster saknar portionslogik.
**Väg framåt:** "Äter ute"-dagtyp (hoppas över) + "Gäster"-läge med per-dag portions-override (hakar i #12).
**Insats:** Liten / Medel.

---

## 🔵 P3 — UX-förbättringar

### #19 — Förenkla/förklara de tre grindarna (Generera→Bekräfta→Flytta)
**Väg framåt:** Mikro-copy/stegindikator (1 Förslag → 2 Bekräftad → 3 Handla); överväg slå ihop
Bekräfta+Flytta där säkert. Behåll `day-ops sameRecipes`-invarianten. **Insats:** Liten–medel.

### #20 — Dispatch-preferenser (eko/svenskt) ska styra faktisk dispatch
**Varför:** Preferenserna påverkar idag bara AI-prompten, inte automatdispatchen (tyst ignorerad).
**Väg framåt:** Låt `dispatch-matcher.js` väga in eko/svenskt vid produktval; visa om det inte kan uppfyllas.
**Insats:** Medel.

### #21 — Onboarding-guide + självbetjäning för auth
**Varför:** Ingen förstagångsguide; auth saknar lösenordsåterställning (glömt lösenord = Supabase-dashboard).
**Väg framåt:** Lättviktig guide (tooltips/kort) + `resetPasswordForEmail` i `auth-gate.js`
(registrering förblir avstängd enligt princip). **Insats:** Medel.

### #22 — Tillgänglighet: tillåt zoom + tangentbordsväg för gester
**Varför:** `maximum-scale=1.0, user-scalable=no` blockerar zoom; pull-to-reveal saknar tangentbordsväg.
**Väg framåt:** Ta bort `user-scalable=no` → synlig knapp som alternativ till gesten → textkomplement till proteinfärg.
**Insats:** Liten.

---

## ⚪ P4 — Städning (låg risk)

### #23 — Ta bort död JS + CSS efter Session 101
**Varför:** Teardownen ej klar på JS-sidan. Vakter räddar från krasch men koden är vilseledande död.
**Väg framåt:** Ta bort 6 `#weekRecipeDetail`-referenser (plan-viewer.js ~397/597/644/850/877) +
`.week-day-card`-koden (:29/:281). Städa död klassisk-CSS per-selektor (behåll `.holiday-dot`).
**Insats:** Liten–medel (CSS i granskat steg).

### #24 — Synka/ta bort `?v=N` på JS-importer + död state/stubbar
**Väg framåt:** Välj en linje (synka alla modulversioner ELLER ta bort `?v` på JS, förlita nät-först-SW) →
ta bort död state `_freshShopContent` → ta bort stubbar `initFilters`/`applyFilters` (Grep först). **Insats:** Liten.

### #25 — Slå ihop spegelkod + lokala `escapeHtml` → utils
**Väg framåt:** Slå ihop `updateLastPlanDay`/`patchPlanDay`; ersätt lokala `escapeHtml`/`esc`/`fmtKr`
med `utils.*`. **Insats:** Liten.

### #26 — Tysta catch → svenska felmeddelanden
**Varför:** Bryter mot CLAUDE.md-regeln. `convertBlockedToCustom`, `clearCustomDay`,
`copyShoppingList` (saknar .catch), `scheduleCheckedSave` (bockningar tappas tyst).
**Väg framåt:** Svensk toast/feedback i de tysta blocken. **Insats:** Liten.

### #27 — Skriv riktig README
**Varför:** README är 36 byte → bus-factor 1.
**Väg framåt:** Vad appen är, arkitektur-översikt, hur testsviten körs, nyckelkataloger, länk till CLAUDE.md. **Insats:** Liten.

---

## Rekommenderad betningsordning
Uppifrån: **P0 → produktspåret (#12 → #15 → #13/#14) → resten.** P0 ger störst
riskreduktion per timme; produktspåret flyttar appen från "en-personsapp" till "hela
familjens app".

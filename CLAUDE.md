# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter.

## Arkitektur
```
Browser → Vercel /api/generate → Deterministisk receptväljare (JS) → GitHub repo (JSON-filer) → Browser läser
```
- **Frontend:** `index.html` på GitHub Pages (backup) + Vercel (primär)
- **Backend:** Vercel serverless `/api/generate` — tar emot inställningar, filtrerar recept, väljer deterministiskt, sparar JSON till GitHub
- **Data:** `recipes.json` (källa), `weekly-plan.json`, `shopping-list.json`, `recipe-history.json`, `plan-archive.json`, `custom-days.json` — alla i repot
- **Secrets:** `GITHUB_PAT` (contents:write) i Vercel env vars
- **Autentisering:** Lösenordsbaserad via Supabase Auth. Ny registrering avstängd — nya familjemedlemmar läggs till manuellt i `household_members` + Supabase-dashboarden
- **AI-kostnad vid import** — receptimport via foto och URL-fallback använder Google Gemini API (gratistier). Receptval är fortfarande kostnadsfritt och deterministiskt.

## Designprinciper (följ alltid)
- **Gratis** — betallösningar kräver stark motivering
- **Ingen automatisk generering** — matsedeln triggas alltid manuellt. Familjen har litet barn och kan inte styra inköp till en fast veckodag. Föreslå aldrig cron-schema.
- **Delad data** — localStorage och device-specifika lösningar är aldrig acceptabla
- **Ingen AI i runtime** — receptval sker deterministiskt (filter + slump + proteinbalans). AI (Claude Code) används bara vid utveckling
- **Vercel är backend** — GitHub Actions används ej längre

## Kommunikation med användaren
- **Förklaringsnivå 3.5** — använd analogi + teknisk term i parentes vid behov. Nivå 1–2 för rutinändringar, 3.5 vid beslut eller felsökning.
- **Felmeddelanden** — alltid på begriplig svenska utan tekniska termer, med en handlingsorienterad uppmaning. Inte: `409 — SHA conflict`. Utan: `Kunde inte spara matsedeln — prova att generera igen.`
- Claude pushar direkt till `main` efter varje ändring — användaren behöver inte använda GitHub Desktop.

## Deployment
- Commit + push till `main` → Vercel och GitHub Pages deployas automatiskt (~30 sek). Ingen manuell åtgärd behövs.
- `api/generate.js` → Vercel. `index.html` → GitHub Pages + Vercel. JSON-filer → syns direkt (CDN-cache ~60 sek).
- **Verifiering:** Användaren har ingen lokal testmiljö — verifierar UI-ändringar på mobil mot live Vercel-deploy. Push till main, vänta ~30 sek, öppna `https://receptbok-six.vercel.app/` på telefonen.

## Operativa regler (följ utan att fråga)
- Frontend-JS ligger i `js/`-moduler — redigera rätt modulfil, inte `index.html` (som bara är HTML-markup, ~290 rader)
- Rör aldrig recept-strukturen (Supabase `recipes`, fält i `js/data-mapper.js`) utan explicit instruktion. `recipes.json` är retirerad (Fas 8.4)
- Appen ska fungera på alla enheter. Mobilanvändning prioriteras vid designbeslut (touch-first, inga hover-states som primär interaktion)
- **Mergea till main** — efter varje push, mergea feature-branchen till `main` och pusha. Skippa bara om användaren explicit ber om det.
- **Stanna och bekräfta** — om ett meddelande är feedback eller återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar innan du gör ändringar.
- **Befintlig veckoplan får aldrig förstöras** som sidoeffekt av kod-ändringar (hård regel från Session 23)

## Dashboard (visas vid sessionstart)
Vid varje ny session: visa denna dashboard för användaren EXAKT som den ser ut nedan.
Ändra ingenting — slå inte ihop rader, kollapsera inte checkboxar, lägg inte till egna rubriker.
Kopiera sektionerna rakt av (markdown-format). Enda tillagda info är git-status från SessionStart-hooken,
som visas som tre rader i klartext (branch, status, senaste commit) överst.

### Roadmap
**Klart** (detaljer i `docs/session-log-archive.md`): Fas 1 (extrapriser → receptförslag), Fas 3 (internationell receptimport), Fas 4 (automatisk varukorgsfyllning), Fas 6 (säsongsoptimering), Fas 7 (Supabase-migration), Fas 8 (ingrediens-kvalitetskontroll).

**Öppet:**
- **Fas 2 — Familjelärande algoritm:** 2A analysera data · 2B viktningsmodell · 2C "Favoriter"-vy
- **Fas 5 — App Store & monetisering:** 5B auth & datamodell · 5C kostnads-/intäktskalkyl (5A klar: Capacitor, `docs/research-teknisk-vag-app.md`)

### Kända buggar
Inga bekräftade just nu.

### Väntar på live-verifiering (kod klar, ej körd skarpt)
- **Nedmontering av klassiska veckovyn** (Session 101): premium är nu enda vyn — växeln, klassiska tidslinjen och den delade `#weekRecipeDetail`-bottenpanelen är borta. Fri dag + "Redigera egen planering" (custom med recept) fälls nu ut **inline** i premiumkortet i stället för bottenpanelen. Testsvit grön men ej mobil-verifierad. Bekräfta på mobil mot produktion: (1) ingen Premium/Klassisk-växel syns längre, vyn renderar normalt; (2) **fri dag** — tryck på ett fri-dag-kort (även "Ikväll"-kortet om idag är fri dag): editorn fälls ut inline med "Ångra fri dag" + noteringsfält, och båda fungerar; (3) **egen planering med recept** — "Redigera" byter kortet till editorn inline (välj recept / notering / starta matsedel / ta bort), och "Byt dag" finns kvar; (4) generera/bekräfta/kassera matsedel, slumpa, byt dag, flytta dag, fri dag, "Veckans fynd"/Byt in fungerar fortfarande; (5) **hård regel:** befintlig veckoplan tas aldrig sönder. Fel vid fri dag visas nu som toast i stället för i panelen.
- **Byt dag för egna anteckningar** (Session 100): premiumvyn + `/api/swap-days` tillåter nu att en egen anteckning (egen planering, `plan_id null`) byter plats med en receptdag, en annan anteckning eller en tom dag. Bekräfta på mobil: (1) "Byt dag"-knappen syns i en utfälld anteckning (både ren not och not-med-recept), (2) byte not↔recept flyttar anteckningen till receptets datum och receptet till anteckningens datum, (3) inköpslistan är oförändrad efter bytet (samma recept, bara annat datum), (4) befintlig veckoplan tas inte sönder vid avbrutet/upprepat byte.
- **Lösvikts-enum vid Willys-export** (PR #65): `pickUnitForCode()` skickar `"kilograms"` för `_KG`-koder (lös färskvara, t.ex. potatis). Enum-värdet är *inferred* — bara `"pieces"` är PoC-bekräftat. Bekräfta att lös potatis landar i korgen i skarp körning.
- **Helhetsomtaget Session 86 (PR #73):** snabbkoll mot produktion: (1) PWA "Lägg till på hemskärmen" ger egen ikon + öppnar offline (skalet), (2) matlagningslägets Wake Lock på riktig mobil, (3) Ångra på borttagen inköpsvara + progress-synk från annan enhet.
- **Premiumvy för matsedeln** (Session 84–85, PR #69/#70): testsvit grön men ej verifierad på mobil mot produktion. Bekräfta att vyn renderar, att alla åtgärder fungerar (slumpa/välj/byt dag/fri dag/besparing/egen planering) och att växeln Premium↔Klassisk håller båda i synk. Kolla även: helgkort lika höga som vardagskort (helg = prick på färgryggen), och "Vecka N"-avdelare på planer som spänner två veckor.
- **Willys Plus-erbjudanden** (Session 88): `normalizeOffers()` märker nu LOYALTY-erbjudanden med "Willys Plus"-badge i besparings-popoveren + släpper in `SubtotalOrderPromotion`-klubbpriser (kött/frukt som föll bort förut). Bekräfta mot produktion att badgen syns och att de nya fynden räknas in. Detaljer: `docs/research-willys-plus-2026-06-16.md`.
- **"Veckans fynd"-popup** (Session 89, brusrensad Session 90): efter prisoptimerad generering öppnas en popup med (1) fynden planen redan fångar och (2) rea-recept att byta in (rankade efter besparing, "Byt in" → välj dag). Hero-besparingen i premiumvyn öppnar den igen. Bekräfta på mobil: popupen renderar, "Byt in" landar receptet rätt + behåller besparingen, inköpslistan följer med. Session 90 tog bort matcher-bruset (skafferi/fett räknas ej, rökt lax/marinerad vitlök/barnmat avvisas) — bekräfta att besparingarna nu är rimliga och fria från skräpprodukter. Session 91 (P2): recept-korten är nu kollapsbara (rubrik + besparing, tryck för att fälla ut varorna) + antal i sektionsrubrikerna, så "Fler fynd" inte begravs — bekräfta att layouten känns scanbar på mobil. Session 92: fler korpus-fixar (grillspett→grönsak, småbarnsmat "Från X År", smaksatt bärvatten avvisas). Session 93: storpack (≥1 kg/1 l) flaggas med "storpack"-tag och nedviktas 50 % i "Fler fynd"-rankningen (visad besparing oförändrad) — bekräfta att taggen syns och att rankningen känns vettig.
- **Kontroll #2 — dispatch väljer rätt rea-vara:** när ett Willys-erbjudande utnyttjats (besparing räknats på en specifik produkt) måste varukorgs-exporten (`/api/dispatch-to-willys`, `dispatch-matcher.js`) lägga *just den produkten* i korgen — inte en godtycklig sökträff på samma canon. Verifiera i skarp körning att rea-varan matchas mot erbjudandets produktkod, inte bara namnet.
- **Värdeviktad prisprio** (Session 94, PR): `weightedSaving()` viktar varje sparad krona efter erbjudandets ordinarie pris (golv 0.2 / tak 2.2 runt pivot 40 kr) + 1.5× protein-boost (substring `färs|kyckling|fläsk|kött|…|lax|torsk|fisk|räk|…`). Används som tröskel i `bucketBySaving()` (matsedeln) och sortering i `buildDealCandidates()` (Veckans fynd). Visad kr-besparing oförändrad. Bekräfta mot produktion: prisoptimerad generering ger färre vitlöks-/lök-drivna förslag och lyfter dyra protein-/färskvarureor i både menyn och fynd-popupen.
- **Atomär plan-skrivning** (Session 95, PR): `savePlanToSupabase()` skapar nu plan-raden **inaktiv**, skriver dagarna, och `activatePlan()` slår på den allra sist (handlern: skriv → `archiveOldPlan` → aktivera). Misslyckas dag-skrivningen städas plan-raden bort och den gamla planen är orörd. Förebygger "tom aktiv plan utan åtgärdsknappar" (Joakim, premiumvyn: 0 planerade + inga byt/växla-knappar). Bekräfta mot produktion att generering fungerar normalt och att en avbruten körning inte längre lämnar tom matsedel.
- **Protein-sortering + variation i Veckans fynd** (Session 96, PR): `buildDealCandidates()` rankar nu topplistan på huvudproteinets besparing och väger in variation (decay 0.55) så ingen proteintyp dominerar. Bekräfta mot produktion: efter prisoptimerad generering toppar "Fler fynd" med recept där det dyra proteinet är på rea, och listan är blandad (inte 25 kyckling i rad). Tunbart: `diversityDecay` (lägre = hårdare variation) och `mainProteinSaving`-kategorierna i `canonProteinCategory()`.

### Öppna utredningar
**Klassiska veckovyn — restpost: död CSS (Session 101):** själva nedmonteringen är **klar** (JS, markup, toggel, delad panel borta; premium enda vyn — se Senaste session). Kvar är bara ofarlig död klassisk-CSS i `css/styles.css` (`.week-day-card`, `.timeline-*`, `.plan-group`, swap-/nav-chip-regler). Den ligger **inflätad** med delade `.custom-*`/`.detail-inner`-regler som premiumvyns inline-editorer använder, så säkrast att städa i ett separat, granskat steg (per-selektor-koll mot receptbläddraren). `.holiday-dot` används av `plan-generator.js` → behåll. Detalj-minne: [[project_remove_classic_view]].

**Receptkvalitet — uppföljning från nattjobbet (Session 83, `docs/qc-night/report-2026-06-07.md`):**
- **Canon-kandidater (kod, EJ tillämpat):** säkra tillägg till `NORMALIZATION_TABLE` (plural-buljongtärningar, self-canons `matvete`/`torsk`/`pizzadeg`/`nori`/`citrongräs`, `portobellosvamp`→champinjoner). Vänta på Joakims OK.
- **Manuell uppdelning behövs:** #27 `oliver och hackade soltorkade tomater` (oliver tappas), #235 `rödkål (…morötter, salladslök, vinäger…)` (slaw-varor saknas). Kräver mängdbeslut.
- **Revert hela jobbet:** in-DB snapshot `recipes_qc_backup_20260607` finns → säg *"revert nattjobbet"*.

**Matchnings-täckning — långsvansen:** full audit av sällan-matchade ingredienser kräver Supabase-nätåtkomst. Öppet bedömningsfall (`docs/match-hardening-natt-2026-06-05.md`): ska generisk "grädde" tillåtas falla till vispgrädde i sök-fallbacken?

*(Willys+ medlemserbjudanden — löst Session 88: generiska klubbpriser, ingen inloggning behövs, ligger redan i `PERSONAL_GENERAL`-feeden. Se `docs/research-willys-plus-2026-06-16.md`.)*

**Hemköp parallell dispatch (PoC klar 2026-06-23 — väntar på beslut att bygga):** Hemköp ligger på samma Axfood-plattform som Willys; korgfyllning är bekräftad genomförbar — `scripts/hemkop-cart-poc.mjs` gav skarpt 200 på auth/sök/addProducts/verify, kod landade i korgen, format `<id>_ST`. Spec: `docs/superpowers/specs/2026-06-22-hemkop-poc-design.md`. Att bygga featuren ("Skicka till Hemköp" parallellt med Willys, två knappar i inköpslistan): (1) parametrisera bas-URL i `willys-cart-client`/`-search`/`-offers` → delade `axfood-*`-klienter; (2) separat Hemköp-cookie-uppsättning — gist-schema per butik + extensionen utökas att fånga `hemkop.se`-cookies; (3) butiksval-UI. **Öppen detalj:** Hemköp-butiks-ID behövs för erbjudande-/rea-matchning (campaigns-endpoint) — fanns ej i PoC-cURL:en, fråga användaren vid bygge. PoC-verktyget körs med rå "Copy as cURL" i `scripts/.hemkop-curl.local`.

### Claudes idéer
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata
- Portionsskalning i matlagningsläget — ×0.5/×2 räknar om mängderna i ingredienslistan

### Senaste session
**Session 101 — Full nedmontering av klassiska veckovyn:** Joakim: "Fortsätt att nedmontera klassiska vyn — gör det genomtänkt och felsäkert." Genomfört i fyra oberoende, var för sig körbara commits på branch `claude/remove-classic-view`, mergad till `main`. Netto −842/+91 rader. Nyckelinsikt: nedmonteringen är **rent presentationell** — plan-datan flödar genom `window._lastPlan`/`window._timelineByDate` orört, så befintlig veckoplan kan aldrig skadas; risken var trasigt UI, inte dataförlust. **(1) Premium alltid på:** tog bort `dlx-switch`-injektionen + `setMode`/`applyMode`/`currentMode`/`STORAGE_KEY`; `body.week-deluxe` sätts ovillkorligt. **(2) Slutade rendera klassiska tidslinjen:** `renderWeeklyPlanData` bygger fortfarande timeline + sätter `window._timelineByDate` (premium läser den) men renderar inte grid/nav-chips/scroll/bulk-banner; markup borttagen i `index.html`; premiumvyns scaffold ankrar nu på `#confirmPlanWrap`; `centerTodayCard`-anropet borttaget ur `navigation.js`. **(3) Migrerade delade editorer inline (riskfyllt):** den delade `#weekRecipeDetail`-bottenpanelen borttagen. Fri dag: `openBlockedDay` → ren `blockedDayEditorHtml` som premium fäller ut inline (både list- och Ikväll-kort). Egen planering med recept: "Redigera" → `dlxEditCustom` (`window._dlxEditCustom`) byter kortets innehåll till `customDayEditorHtml` inline. Alla fortfarande nåbara delade funktioner gjordes panel-säkra (`discardPlan`, `confirmPlan`, `modifyDay` → toast vid fel, `startPlanFromDate`, `saveCustomDay`, `clearCustomDay`, `selectRecipeForCustomDay`, `convertBlockedToCustom`). **(4) Städade död kod:** ~493 rader borttagna ur `plan-viewer.js` (`openWeekRecipe`, swap-funktionerna, `shuffleDay`/`replaceRecipe`, `centerOnDate`/`centerTodayCard`, `wrapPlanGroup`, `renderCustomBulkBanner`, `openCustomDay`/`openCustomBulk`/`saveCustomDaysBulk`, `toggleArchive`, fade-lyssnare + window-exports + oanvända konstanter); CSS-växeln + `body.week-deluxe`-gating borttagen, `#weekDeluxe` alltid synlig. `updateLastPlanDay` behållen (`selectRecipeForDay`). Bumpat `app.js?v=112`, SW-cache v23. Testsvit grön (select 432, shopping 81, match 136, korpus 41, data-mapper 27, day-ops 34); `node --check` ren. **Kvar:** (a) live-verifiering på mobil (se Väntar-sektionen), (b) ofarlig död klassisk-CSS som ligger inflätad med delade `.custom-*`-regler — separat granskat städsteg (se Öppna utredningar). **Sidonotering:** `git add -A` plockade av misstag upp `.env.local`; committen backades (ej pushad, inget läckte) och `.gitignore` kompletterad med `.env*`/`.vercel`/`.superpowers`/`STATUS.md`/`node`.

**Hotfix efter deploy (bekräftad löst av Joakim):** matsedeln visade "Ingen matsedel ännu" på mobilen efter deployen. Orsak: SW:n serverade undermoduler **stale-while-revalidate med bar sökväg som nyckel** — ny `index.html` (utan `#weekGrid`) möttes av gammal cachad `plan-viewer.js` som körde `getElementById('weekGrid').innerHTML` → null-krasch → `loadWeeklyPlan`-catch visade no-data. Planen var aldrig borta (inga delete-anrop). Fix: (1) versionerade de tre ändrade modul-importerna i `app.js` (`?v=112`) + `app.js?v=112` → färska URL:er tvingar omladdning; (2) SW:n serverar nu **JS nätet-först** (de saknar `?v=N` och måste matcha aktuell markup), CSS/ikoner kvar SWR, cache v23. Lärdom: [[project_pwa_cache_strategy]].

**Mjukare hero-snap (Joakim):** `snapToHero` gjorde ett hårt `window.scrollTo({top})` varje gång Matsedeln öppnades → kändes aggressivt + ingen animering. Nu mjuk glidning via `smoothScrollTo` (460 ms, eased) + hoppar över om vyn redan ligger ≈rätt (<24 px) så det inte rycker till. Global `scroll-behavior: smooth` undveks medvetet (skulle krocka med `smoothScrollTo`-loopen + scroll-återställning i `app.js`/`cook-mode.js`). Bumpat `app.js?v=113`, `plan-viewer-deluxe.js?v=113`.

**Rationaliserade dagkorten (Joakim, bild på "salig blandning"):** egen-planering-dagar renderades i två stilar (valt recept = serif 1.08; fritext-not = sans 0.9) + en upprepad versal "EGEN PLANERING"-etikett. Fix: (1) etiketten borttagen → liten dämpad markör-ikon (`I.own`, `.dlx-own`) inline före rätten; (2) noteringar använder nu samma serif-titelstil (`.dlx-day-recipe`) som recept → en konsekvent rad oavsett typ; (3) tomma dagar visar en lugn plus-ikon (`I.plus`, `.dlx-add`) i stället för "+ Planera dagen"; (4) Ikväll-kortet använder samma markör i stället för "Egen planering"-undertexten. Gäller både list- och Ikväll-kort. Bumpat `app.js?v=114`, `plan-viewer-deluxe.js?v=114`, `styles.css?v=115`, SW-cache v24.

Session 8–100 i `docs/session-log-archive.md`. Full git-historik: `git log --oneline`.

## Kommandon (tester & skript)
Inga npm-scripts — allt körs direkt med `node` (inga externa deps utom de tester som kräver `node_modules`).

```bash
# Hela testsviten (assertion-tal från Session 82)
node tests/match.test.js            # 103 — Willys-matcher + ingrediens-normalizer
node tests/match-corpus.test.js     # 35  — accept/reject-korpus
node tests/shopping.test.js         # 81  — inköpslista (clean→parse→merge→categorize)
node tests/select-recipes.test.js   # 432 — deterministiskt receptval
node tests/data-mapper.test.js      # 27  — recipeFromRow/recipeToRow
node tests/dispatch-to-willys.test.js  # 93 — kräver node_modules
node tests/cookies-endpoint.test.js    # 29 — kräver node_modules

node --check js/app.js              # syntaxkoll (PostToolUse-hooken gör detta auto vid Edit av js/)

# Dev-skript (läser live Supabase via REST, beroendefria)
node scripts/export-recipes.mjs     # synka gitignorerad cache scripts/.cache/recipes.json
node scripts/audit-ingredients.mjs  # gradera ingrediensavvikelser (P0/P1/P2)
```
Hooks i `.claude/settings.json` kör relevanta tester automatiskt vid Edit och blockerar vid fail — men kör hela sviten manuellt efter ändringar som rör flera moduler.

## Definition of Done (följ alltid)
Innan "klart" deklareras ska Claude alltid:
1. Läsa tillbaka den editerade filen och verifiera att ändringen landade rätt (Edit-hooken fångar syntaxfel automatiskt)
2. Kontrollera att relaterade funktioner inte brutits — Grep efter berörda funktionsnamn om tveksamt
3. Committa och pusha till `main`
4. Uppdatera Dashboard-sektionen i CLAUDE.md (senaste session, buggar, roadmap-checkboxar)
5. **Arkivera föregående session:** innan ny "Senaste session"-ruta skrivs, flytta den nuvarande till toppen av `docs/session-log-archive.md`. CLAUDE.md håller bara *en* sessionsruta. Lyft oavslutade "kvar att fixa"-punkter till *Kända buggar* / *Väntar på live-verifiering* / *Öppna utredningar* innan arkivering — öppet arbete ska synas i de strukturerade sektionerna, inte begravas i prosa.

## Modulstruktur (VSA)
Varje feature-slice är en fristående fil — en agent som jobbar med en feature behöver bara läsa 1–2 filer. Se katalogerna live via `ls js/` och `ls api/` (strukturen är självdokumenterande).

- **Frontend** (`js/`): `app.js` (entry), `state.js` (delade `window.*`-vars), `utils.js` (delade hjälpare), `ui/` (scroll, navigation), `shopping/`, `weekly-plan/` (generator, viewer, ingredient-preview), `recipes/` (browser, editor, import).
- **Backend** (`api/`): Endpoints som egna filer. Delad infrastruktur i `api/_shared/` (`constants.js`, `github.js` med 3-retry SHA-hantering, `handler.js` med CORS+auth+error-wrapping, `history.js`, `shopping-builder.js`, `willys-matcher.js`).
- **Cross-modul-anrop:** Funktioner exponeras via `window.*`. Moduler anropar varandra via `window.funktionsNamn()` — inga cirkulära ES6-imports. Domänlogik stannar i varje slice; bara teknisk infrastruktur delas.

## Tekniska beslut
- **Färgtema:** Linen-canvas `#f5f1e8`, lichen-grön header `#7a9482`, rust-accent `#b56a4c` (CTA + today). Forest `#3d5544` text, ochre `#c89a3e` wordmark-suffix, lichen-deep `#5e7a68` success/savings. Scandi/nature-paletten — designad i Claude Design, migrerad i Session 43.
- **Receptval:** Deterministisk JS-algoritm i `selectRecipes()` — historikfiltrering (14 dagar) → proteinfördelning (max 2 per typ) → vardag30/helg60-matchning → slump. Ingen AI.
- **Inköpslista:** Byggs deterministiskt i JS från receptdata — ingen AI. Pipeline: Clean → Parse → Normalize → Merge → Categorize. Sortering A–Ö per kategori, format `"ingrediensnamn (mängd)"`.
- **Recepthistorik:** `recipe-history.json` format `{ usedOn: { "5": "2026-03-26" } }` — ett datum per recept, läses via GitHub API (ej CDN-cache). 14-dagarsfönster. Fallback sorterad på "längst sedan".
- **Inställningar:** Oprövade (direkt siffra), vegetariska dagar (direkt siffra), proteintoggle med receptantal. Ingen skalning, inga tidsväljare, inget fritextfält.
- **Prisoptimering (opt-in toggle):** `optimize_prices`-flag → hämtar Willys-erbjudanden → `bucketBySaving()` sorterar rea-recept först i poolen. Tröskeln (≥10) mäts på **värdeviktad** besparing (`weightedSaving()`), inte rå kr: varje sparad krona viktas efter erbjudandets ordinarie pris (dyrt väger tungt, billig vitlök/lök väger lätt) + protein-boost — så menyn styrs av dyra protein-/färskvarureor, inte vanliga billiga stapelvaror. Visad kr-besparing ändras INTE, bara prioriteringen. Filter (historik/veg/protein/låsta/blockerade) respekteras fullt.
- **"Veckans fynd"-rankning (`buildDealCandidates`):** topplistan sorteras på **huvudproteinets** besparing (`mainProteinSaving()` — receptets `protein`-kategori mot träffarnas canon via `canonProteinCategory()`), inte totalen, så lök/vitlök aldrig lyfter ett recept. Ovanpå det **variationsvikt** (`diversifyByProtein()`, decay 0.55): samma proteintyp dämpas för varje återkomst så listan inte blir 25 kycklingrätter när kyckling är extrapris. Recept där huvudproteinet inte är på rea (eller vegetariska) hamnar under, sorterade på värdeviktad besparing. Visad kr-besparing oförändrad.
- **Vercel timeout:** 15s (ingen AI-väntan).

## Recept — struktur (Supabase `recipes`, sanningskälla)
`recipes.json` är **retirerad** (Fas 8.4). Recepten bor i Supabase-tabellen
`recipes`. Dev-skript läser en gitignorerad cache (`scripts/.cache/recipes.json`)
via `node scripts/export-recipes.mjs`; producenter (import) skriver direkt till
Supabase. Fält ↔ rad-mappning: `js/data-mapper.js` (`recipeFromRow`/`recipeToRow`).

Recept-objekt (appens format, snake_case-kolumner i DB):
```json
{
  "id": 1, "title": "Receptnamn", "tested": false, "servings": 4,
  "time": 40, "timeNote": "ugn 150°",
  "tags": ["helg60", "fisk", "ugn"], "protein": "fisk",
  "ingredients": ["600 g torsk", "..."],
  "instructions": ["Steg 1...", "Steg 2..."],
  "notes": "Tips: ...", "seasons": ["höst", "vinter"]
}
```
**Protein:** `fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`
**Taggar:** `vardag30` (≤30 min vardag), `helg60` (≤60 min helg), `soppa/pasta/wok/ugn/sallad/gryta/ramen` (typ), `veg` (vegetariskt)

### Kanoniskt ingrediensformat (Fas 8)
En optimal ingrediensrad har en **definierbar mängd** (antal/vikt/volym):
- **Föredra** `"<mängd> <enhet> <namn>"` (`"2 dl grädde"`, `"600 g torsk"`) eller
  doh-format `"<namn> (<mängd> <enhet>)"` (`"zucchini (400 g)"`) — parsern hanterar båda.
- **En ingrediens per rad** (dela `"X och Y"`/`"X eller Y"` om båda ska handlas).
- **Skafferivaror** (salt, peppar, olja till stekning) får sakna mängd — de skippas medvetet.
- Verktyg: `node scripts/audit-ingredients.mjs` graderar avvikelser (P0/P1/P2).

## Dataformat — genererade filer
```json
// weekly-plan.json
{ "generated": "2026-03-14", "startDate": "...", "endDate": "...",
  "days": [{ "date": "2026-03-14", "day": "Fredag", "recipe": "Titel", "recipeId": 23,
             "saving": 12, "savingMatches": [{ "canon": "...", "name": "...", ... }] }] }

// shopping-list.json
{ "generated": "2026-03-14", "categories": {
    "Mejeri": ["grädde (2 dl)"], "Grönsaker": ["purjolök (1)"],
    "Fisk & kött": ["torsk (600 g)"], "Frukt": [], "Skafferi": [], "Övrigt": [] }}

// recipe-history.json
{ "usedOn": { "5": "2026-03-26", "23": "2026-03-14" } }
```

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp), inte bara den enskilda frågan
- Tänk på hela familjen som användare — inte bara den tekniska personen
- **Uppdatera CLAUDE.md efter varje större ändring** (Dashboard + ny Senaste session)

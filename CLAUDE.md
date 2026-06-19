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
- **Lösvikts-enum vid Willys-export** (PR #65): `pickUnitForCode()` skickar `"kilograms"` för `_KG`-koder (lös färskvara, t.ex. potatis). Enum-värdet är *inferred* — bara `"pieces"` är PoC-bekräftat. Bekräfta att lös potatis landar i korgen i skarp körning.
- **Helhetsomtaget Session 86 (PR #73):** snabbkoll mot produktion: (1) PWA "Lägg till på hemskärmen" ger egen ikon + öppnar offline (skalet), (2) matlagningslägets Wake Lock på riktig mobil, (3) Ångra på borttagen inköpsvara + progress-synk från annan enhet.
- **Premiumvy för matsedeln** (Session 84–85, PR #69/#70): testsvit grön men ej verifierad på mobil mot produktion. Bekräfta att vyn renderar, att alla åtgärder fungerar (slumpa/välj/byt dag/fri dag/besparing/egen planering) och att växeln Premium↔Klassisk håller båda i synk. Kolla även: helgkort lika höga som vardagskort (helg = prick på färgryggen), och "Vecka N"-avdelare på planer som spänner två veckor.
- **Willys Plus-erbjudanden** (Session 88): `normalizeOffers()` märker nu LOYALTY-erbjudanden med "Willys Plus"-badge i besparings-popoveren + släpper in `SubtotalOrderPromotion`-klubbpriser (kött/frukt som föll bort förut). Bekräfta mot produktion att badgen syns och att de nya fynden räknas in. Detaljer: `docs/research-willys-plus-2026-06-16.md`.
- **"Veckans fynd"-popup** (Session 89, brusrensad Session 90): efter prisoptimerad generering öppnas en popup med (1) fynden planen redan fångar och (2) rea-recept att byta in (rankade efter besparing, "Byt in" → välj dag). Hero-besparingen i premiumvyn öppnar den igen. Bekräfta på mobil: popupen renderar, "Byt in" landar receptet rätt + behåller besparingen, inköpslistan följer med. Session 90 tog bort matcher-bruset (skafferi/fett räknas ej, rökt lax/marinerad vitlök/barnmat avvisas) — bekräfta att besparingarna nu är rimliga och fria från skräpprodukter. Session 91 (P2): recept-korten är nu kollapsbara (rubrik + besparing, tryck för att fälla ut varorna) + antal i sektionsrubrikerna, så "Fler fynd" inte begravs — bekräfta att layouten känns scanbar på mobil. Session 92: fler korpus-fixar (grillspett→grönsak, småbarnsmat "Från X År", smaksatt bärvatten avvisas). Session 93: storpack (≥1 kg/1 l) flaggas med "storpack"-tag och nedviktas 50 % i "Fler fynd"-rankningen (visad besparing oförändrad) — bekräfta att taggen syns och att rankningen känns vettig.
- **Kontroll #2 — dispatch väljer rätt rea-vara:** när ett Willys-erbjudande utnyttjats (besparing räknats på en specifik produkt) måste varukorgs-exporten (`/api/dispatch-to-willys`, `dispatch-matcher.js`) lägga *just den produkten* i korgen — inte en godtycklig sökträff på samma canon. Verifiera i skarp körning att rea-varan matchas mot erbjudandets produktkod, inte bara namnet.
- **Värdeviktad prisprio** (Session 94, PR): `weightedSaving()` viktar varje sparad krona efter erbjudandets ordinarie pris (golv 0.2 / tak 2.2 runt pivot 40 kr) + 1.5× protein-boost (substring `färs|kyckling|fläsk|kött|…|lax|torsk|fisk|räk|…`). Används som tröskel i `bucketBySaving()` (matsedeln) och sortering i `buildDealCandidates()` (Veckans fynd). Visad kr-besparing oförändrad. Bekräfta mot produktion: prisoptimerad generering ger färre vitlöks-/lök-drivna förslag och lyfter dyra protein-/färskvarureor i både menyn och fynd-popupen.
- **Atomär plan-skrivning** (Session 95, PR): `savePlanToSupabase()` skapar nu plan-raden **inaktiv**, skriver dagarna, och `activatePlan()` slår på den allra sist (handlern: skriv → `archiveOldPlan` → aktivera). Misslyckas dag-skrivningen städas plan-raden bort och den gamla planen är orörd. Förebygger "tom aktiv plan utan åtgärdsknappar" (Joakim, premiumvyn: 0 planerade + inga byt/växla-knappar). Bekräfta mot produktion att generering fungerar normalt och att en avbruten körning inte längre lämnar tom matsedel.
- **Protein-sortering + variation i Veckans fynd** (Session 96, PR): `buildDealCandidates()` rankar nu topplistan på huvudproteinets besparing och väger in variation (decay 0.55) så ingen proteintyp dominerar. Bekräfta mot produktion: efter prisoptimerad generering toppar "Fler fynd" med recept där det dyra proteinet är på rea, och listan är blandad (inte 25 kyckling i rad). Tunbart: `diversityDecay` (lägre = hårdare variation) och `mainProteinSaving`-kategorierna i `canonProteinCategory()`.
- **App-genomgång Session 100 (PR #98):** (1) **Manuell vara — bock-synk:** bocka av en egen vara, ladda om → bocken ska sitta kvar, och en annan enhet ska se den (delad data). Tidigare tappades den helt. (2) **Premiumvyn:** en egen-planering-dag (bara notering) som råkar vara *idag* visas som "Ikväll"-kort — tryck ska fälla ut noterings-editorn inline (inte göra inget). (3) **Escape** stänger besparings-popover, Veckans fynd, redigera-recept, import-sheet och Willys-dialog (mest desktop). (4) Egna varor/recepttitlar med `<`, `&`, `'` ska visas korrekt (escaping) och varumärken med apostrof ska gå att ta bort. (5) **Premiumvyns flyt:** matsedeln ska fade:a in mjukt EN gång när man öppnar fliken, och därefter ska utfällning/byt dag/slumpa kännas direkt — ingen omfade av hela listan vid varje tryck.

### Öppna utredningar
**Receptkvalitet — uppföljning från nattjobbet (Session 83, `docs/qc-night/report-2026-06-07.md`):**
- **Canon-kandidater (kod, EJ tillämpat):** säkra tillägg till `NORMALIZATION_TABLE` (plural-buljongtärningar, self-canons `matvete`/`torsk`/`pizzadeg`/`nori`/`citrongräs`, `portobellosvamp`→champinjoner). Vänta på Joakims OK.
- **Manuell uppdelning behövs:** #27 `oliver och hackade soltorkade tomater` (oliver tappas), #235 `rödkål (…morötter, salladslök, vinäger…)` (slaw-varor saknas). Kräver mängdbeslut.
- **Revert hela jobbet:** in-DB snapshot `recipes_qc_backup_20260607` finns → säg *"revert nattjobbet"*.

**Matchnings-täckning — långsvansen:** full audit av sällan-matchade ingredienser kräver Supabase-nätåtkomst. Öppet bedömningsfall (`docs/match-hardening-natt-2026-06-05.md`): ska generisk "grädde" tillåtas falla till vispgrädde i sök-fallbacken?

*(Willys+ medlemserbjudanden — löst Session 88: generiska klubbpriser, ingen inloggning behövs, ligger redan i `PERSONAL_GENERAL`-feeden. Se `docs/research-willys-plus-2026-06-16.md`.)*

### Claudes idéer
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata
- Portionsskalning i matlagningsläget — ×0.5/×2 räknar om mängderna i ingredienslistan

### Senaste session
**Session 100 — App-genomgång: klickbara funktioner, buggfixar, kvalitet (PR #98):** Genomgång av hela appens klickbara funktioner + utseende med fokus på matsedeln. Säkra fixar som kunde åtgärdas direkt: (1) **Inköpslistan — manuella varors bock tappades & synkade ej (bugg):** egna varor nycklades på *index* (`manual::0`) i `buildShopState`/`itemIds` men på *namn* (`manual::<namn>`) i rendering/räknare/copy **och servern**. Följd: bocken försvann vid omladdning OCH sparades aldrig till DB (`scheduleCheckedSave` läser via `itemIds`-nycklarna) → bröt delad-data-principen. Standardiserat på namn-nycklar överallt. (2) **Premiumvyn — död interaktion:** "Ikväll"-kort för egen planering med bara notering togglade expand utan att visa något → fäller nu ut samma inline-editor som dagslistans kort. (3) **Escape-stängning** lagd på besparings-popovern, Veckans fynd-popupen, redigera-recept-modalen, import-sheeten och Willys-dialogen (bekräftelsedialogen äger Escape överst). (4) **Konsekvent HTML-escaping:** ingrediensförhandsvisningen + klassiska tidslinjens receptrubriker escapas nu (premiumvyn gjorde redan det). (5) **Blockerat varumärke** tas bort via data-attribut → varumärken med apostrof (t.ex. "O'boy") bröt förut onclick-koden. (6) **Premiumvyns flyt — re-fade-flimmer borta:** `.dlx-day` hade entré-faden (`dlxFadeIn`) på bas-regeln → hela dagslistan fade:ade om vid *varje* utfällning/byte (setSec byter ut 'days'-innerHTML). Flyttat till `#weekDeluxe.dlx-enter .dlx-day` + en engångsklass på värdelementet som sätts första gången matsedeln visas (`_dlxEntered`, tas bort efter 700 ms) → mjuk entré en gång, inget flimmer vid interaktion. (7) **`prefers-reduced-motion`-guard** tillagd (neutraliserar animationer/övergångar för OS-inställningen; JS-scroll opåverkad). Bumpat `styles.css?v=115`, `app.js?v=110`, SW-cache v22. Tester gröna (match 136, corpus 41, shopping 81, select 432, data-mapper 27). Live-verifiering kvar — se Väntar-sektionen.

**Session 98 — Premiumvyn: helg-utfällning + hero-snap:** Joakim: (1) helgkort har avvikande färg som inte harmoniserar när de fälls ut, (2) hero-snappen rycker tillbaka skärmen så ett utfällt kort inte kan centreras. Fixar (CSS + en JS-rad): (1) `.dlx-day.is-weekend.expanded` lägger tillbaka utfällningens lichen-accent (annars vann `is-weekend`:s birch-ram pga källordning) — helg-tonen **behålls** även utfällt (Joakims val: behåll färgen, harmonisera bara accenten). (2) `renderDeluxe` togglar `host.has-expanded` när ett kort är utfällt, och `#weekDeluxe.has-expanded.has-history .dlx-hero { scroll-snap-align: none }` tar bort enda snap-ankaret så proximity-snappen inte drar tillbaka skärmen. Bumpat `styles.css?v=111`, `app.js?v=108`, SW-cache v17. Live-verifiering kvar.

**Session 97 — Egen-planering fälls ut inline i premiumvyn:** Joakim: i matsedel-vyn fällde "Planera dagen" på ett tomt kort ut det *nedersta* synliga kortet i stället för det man tryckte på. Rotorsak: premiumvyns gap-kort (och tom egen-planering-kort) anropade klassiska `openCustomDay`, som fyller den **delade** `#weekRecipeDetail`-panelen — den ligger i DOM:en efter `#weekDeluxe`, så editorn dök upp längst ner. Fix: bröt ut `customDayEditorHtml(date, dayName)` ur `openCustomDay` (`plan-viewer.js`, klassisk vy oförändrad) och exponerade den på `window`; premiumvyns gap-/egen-planering-kort är nu utfällbara inline (`_dlxExpanded` + `dlxToggleDay`) och renderar samma editor i det klickade kortet. `dlxGapClick`/`dlxCustomClick` togglar inline i stället för bottenpanelen. Bumpat `service-worker.js` (v15) + `app.js?v=107` så PWA-cachen hämtar nya moduler. Kvar (mindre): "Redigera egen planering"-knappen i ett utfällt eget-recept-kort (rad 350) använder fortfarande bottenpanelen — be Joakim säga till om den stör. Live-verifiering kvar.

**Session 96 — Protein-sortering + variation i Veckans fynd:** Joakim: prioriteringen räckte inte — för många kycklingförslag när kyckling var extrapris. Vill att topplistan sorteras på huvudproteinets besparing och att variation vägs in. Fix i `buildDealCandidates()` (`willys-matcher.js`): ny `mainProteinSaving()` läser receptets `protein`-kategori och tar bästa savingPerUnit bland träffar vars canon tillhör den kategorin (`canonProteinCategory()` — fläsk före kött för "fläskfärs"); `diversifyByProtein()` (decay 0.55) gör en girig variationsdämpad sortering så samma proteintyp inte staplas. Recept utan protein-rea / vegetariska hamnar under, på värdeviktad besparing. Visad kr-besparing oförändrad. Tester: +6 assertions i `match.test.js` (136). Hela sviten grön (match 136, corpus 41, shopping 81, select 432, data-mapper 27, dispatch 93, cookies 29). Kvar: live-verifiering. Tunbart: `diversityDecay` + kategori-mönstren.

**Session 94 — Värdeviktad prisprio (prio mot proteiner & dyra varor):** Joakim fick "för mycket förslag med vitlök" vid prisoptimering. Orsak: rea-besparingen viktade alla träffar lika, och vitlök/lök finns i väldigt många recept → de översvämmade både matsedeln (`bucketBySaving`) och Veckans fynd (`buildDealCandidates`). Fix: ny `weightedSaving()` i `willys-matcher.js` viktar varje sparad krona efter erbjudandets ordinarie pris (datadrivet — dyrt väger tungt, billigt lätt) + 1.5× protein-boost; storpacks-dämpningen från Session 93 bevarad. `bucketBySaving` (i `generate.js`) gatar nu på värdeviktad poäng i stället för rå kr. **Visad kr-besparing oförändrad — bara prioritering/sortering ändras.** Tester: +6 assertions i `match.test.js` (130), inline-kopia i `select-recipes.test.js` synkad (432). Hela sviten grön (match 130, corpus 41, shopping 81, select 432, data-mapper 27, dispatch 93, cookies 29). Kvar: live-verifiering mot produktion (se Väntar-sektionen).

**Session 95 — Atomär plan-skrivning (tom matsedel-bugg):** Joakim rapporterade att byt/växla-knapparna fallit bort i premiumvyn; heron visade "0 måltider planerade" trots recept i listan (recepten kom från arkivet). Rotorsak: `generate.js` arkiverade/raderade den gamla planen **innan** den nya säkrats — `savePlanToSupabase` skapade den nya planen `is_active=true` och skrev dagarna sist, så ett glapp i dag-skrivningen lämnade en *aktiv plan utan dagar* (skrivskyddat arkiv visas, inga knappar). Fix: plan-raden skapas inaktiv → dagar skrivs → `activatePlan()` aktiverar allra sist; misslyckad dag-skrivning städar plan-raden och lämnar gamla planen orörd. Ej min Session 94-ändring (backend-rankning kan inte tömma en plan). Återhämtning för drabbad plan: generera om. Tester gröna (oförändrade — handlern täcks ej av enhetstester). Kvar: live-verifiering.

Session 8–93 i `docs/session-log-archive.md`. Full git-historik: `git log --oneline`.

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

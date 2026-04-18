# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter.

## Arkitektur
```
Browser → Vercel /api/generate → Deterministisk receptväljare (JS) → GitHub repo (JSON-filer) → Browser läser
```
- **Frontend:** `index.html` på GitHub Pages (backup) + Vercel (primär)
- **Backend:** Vercel serverless `/api/generate` — tar emot inställningar, filtrerar recept, väljer deterministiskt, sparar JSON till GitHub
- **Data:** `recipes.json` (källa), `weekly-plan.json`, `shopping-list.json`, `recipe-history.json` — alla i repot
- **Secrets:** `GITHUB_PAT` (contents:write) i Vercel env vars
- **Autentisering:** Ingen — familjeapp med okänd URL
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
- **Lokal testmiljö:** Antigravity har inbyggd live preview för `index.html` — öppna filen där för att testa UI utan att pusha. Genereringsknappen kräver Vercel-backend och kan ej testas lokalt.

## Operativa regler (följ utan att fråga)
- `index.html` är nu 290 rader (bara HTML-markup). `Edit` eller `Write` fungerar båda, men `Edit` föredras.
- Frontend-JS ligger i `js/`-moduler — redigera rätt modulfil, inte index.html
- Rör aldrig `recipes.json`-strukturen utan explicit instruktion
- Appen ska fungera på alla enheter. Mobilanvändning prioriteras vid designbeslut (touch-first, inga hover-states som primär interaktion)
- **Mergea till main** — efter varje push, mergea feature-branchen till `main` och pusha. Skippa bara om användaren explicit ber om det.
- **Stanna och bekräfta** — om ett meddelande är feedback eller återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar innan du gör ändringar.

## Dashboard (visas vid sessionstart)
Vid varje ny session: visa denna dashboard för användaren EXAKT som den ser ut nedan.
Ändra ingenting — slå inte ihop rader, kollapsera inte checkboxar, lägg inte till egna rubriker.
Kopiera sektionerna rakt av (markdown-format). Enda tillagda info är git-status från SessionStart-hooken,
som visas som tre rader i klartext (branch, status, senaste commit) överst.

### Roadmap
**Fas 1 — Extrapriser → receptförslag** (research klar → `docs/research-extrapriser.md`)
- [x] 1A — Tjek/eTilbudsavis API — **utredd, otillräcklig** (endast 14% täckning)
- [ ] 1B — ICA inofficiellt API — **hoppas över** (Willys räcker för Ekholmen-fallet)
- [x] 1C — Willys API reverse engineering — **klart**: `GET /search/campaigns/online?q=<storeId>&type=PERSONAL_GENERAL&size=500` (ingen auth, ingen CSRF, ingen session). Store 2160 = Ekholmen → 199 erbjudanden
- [ ] 1C2 — Willys+ medlemserbjudanden — **utforskning pågår** (Fas A/B/C, se Öppna utredningar)
- [~] 1D — Matchningslogik: prototyp klar + lexikonresearch klar (`docs/research-lexikon-fas1d.md`, Session 28). 44/62 recept matchar idag, prognos 52–55/62 efter CANON-utökning. **Priority 1 implementerad** (Session 29): 8 direktmatchande termer (kycklingfärs, fläskfärs, vegofärs, pesto, ketchup, majonnäs, gnocchi, majs) + rimliga aliaser tillagda i `NORMALIZATION_TABLE`. **Priority 2** (stemming + substring-scan för compounds som `laxfiléer`, `rökt bacon`) kräver kodändring utöver tabelltillägg — avvakta separat pass.
- [x] 1E — UX-design — **beslutad** (se nedan)
- [~] 1F — Implementation pågår: Steg 1 (CANON Priority 1), Steg 2 (`willys-offers`-endpoint + `willys-matcher`), Steg 3 (integration: `optimize_prices`-toggle, backend bucketar poolen efter besparing, UI visar "💰 Sparat ca X kr" per dag) klara. Kvarstår: live-test i Vercel + ev. Priority 2-stemming.

**Fas 2 — Familjelärande algoritm**
- [ ] 2A — Analysera befintlig data
- [ ] 2B — Designa viktningsmodell
- [ ] 2C — Implementation + "Favoriter"-vy

**Fas 3 — Internationell receptimport**
- [x] 3A — Kartlägg format och sajter — **klart** (`docs/research-internationell-import.md`, Session 28). 7/18 sajter bot-blockerade (Cloudflare: allrecipes, seriouseats, bbcgoodfood, bonappetit, chefkoch, marmiton, foodnetwork). Budgetbytes verifierad med komplett JSON-LD. 5 sajter helt utan JSON-LD (jamieoliver, kochbar.de, essen-und-trinken, giallozafferano ×2) → Gemini-fallback behövs, och den finns redan.
- [ ] 3B — Konverteringsmodul (cups→dl, oz→g, översättning) — research innehåller färdig cheat-sheet + 3 konkreta kodändringar: (1) strip price-annoteringar `$0.17*` från budgetbytes, (2) lägg enhetskonvertering i `GEMINI_SCHEMA_PROMPT`, (3) `postProcessForeignRecipe()` efter `mapJsonLdToRecipe()` för icke-svenska recept
- [ ] 3C — Testa mot 10+ receptsidor

**Fas 4 — Automatisk varukorgsfyllning**
- [ ] 4A — Teknisk research
- [ ] 4B — Proof of concept
- [ ] 4C — UX-design + felhantering
- [ ] 4D — Implementation

**Fas 5 — App Store & monetisering** (marknadsanalys klar → `docs/marknadsanalys-2026-04.md`)
- [x] Marknadsanalys
- [x] 5A — Teknisk väg (PWA / Capacitor / React Native) — **klart** (`docs/research-teknisk-vag-app.md`, Session 28). **Rekommendation: Capacitor** (3–5 veckor). PWA blockas av Apple Guideline 4.2 ("repackaged website") och Safari-eviktion 7d förstör offline på iOS. RN kräver full omskrivning av alla ~11 frontend-moduler (8–16 veckor) — överdrivet för MVP. Capacitor: vanilla ES modules fungerar direkt, enkel build-step + Service Worker + Capacitor Preferences. Slutlig payment-väg (Stripe vs IAP) beror på Fas 5C.
- [ ] 5B — Autentisering & datamodell
- [ ] 5C — Kostnads- och intäktskalkyl

### Kända buggar
Inga just nu.

### Öppna utredningar
**Willys+ medlemserbjudanden — 3-fas utforskning (nästa session):**
- **Fas A — Rekon:** Vilka inloggningsmetoder erbjuder willys.se? BankID? E-post+lösenord? "Kom ihåg mig"-cookies? Mobilapp-OAuth? Claude läser login-sidan.
- **Fas B — Validering:** Hur ser `PERSONAL_SEGMENTED`-svaret faktiskt ut när man är inloggad? Är det 10 extra produkter eller 100 helt andra priser? Kräver att användaren loggar in manuellt på willys.se och hämtar `https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_SEGMENTED&page=0&size=500` i devtools och klistrar in svaret. Avgör om Fas C är värd tid.
- **Fas C — Automatiseringsväg** (välj baserat på A+B):
  - Väg 1: Manuell cookie-export → Vercel env var (lätt, skört, cookies går ut efter veckor)
  - Väg 2: Scripted email/password-login (medelsvårt, bara om Willys tillåter lösenord)
  - Väg 3: BankID — **dödsvägen**, ingen lovlig automatisering
  - Väg 4: Acceptera anonyma priser, märk UI:t tydligt ("dina faktiska priser kan vara lägre")

### Idéer (användarens)
_(Tom — lägg till idéer här under sessioner)_

### Claudes idéer
- Offline-stöd via service worker — appen fungerar utan nät (recepten cachas lokalt, synkar vid anslutning)
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata
- Säsongsfilter — automatiskt vikta recept efter säsong (soppa/gryta höst-vinter, sallad sommar)

### Senaste session — Session 32 (2026-04-18)
- **Scroll-/datum-översyn av tidslinjen** — sex ändringar i ett pass:
  - **Dynamisk horisont:** `TIMELINE_DAYS_BACK/FORWARD = 14` blev `..._MIN`. `buildTimeline` räknar nu ut verklig horisont = `max(MIN, avstånd till aktiv plans slutdatum / äldsta arkiv / utanförliggande custom-dag)` med cap på 45 dagar åt varje håll. Löser fallet där en ny plan börjar om 7 dagar och löper 14 dagar — hela planen syns.
  - **Egen planering (custom-days):** Ny backend-endpoint `api/custom-days.js` + `custom-days.json` i repot. `openCustomDay(date, day)` visar editor i detaljpanelen med notering (max 140 tecken). `openCustomBulk(dates)` gör samma för flera dagar samtidigt. Gap-dagar är nu klickbara → öppnar samma editor. Banner ovanför tidslinjen: "N tomma dagar innan matsedeln — markera alla som egen planering".
  - **Slim-kort:** Custom-dagar och gap-dagar får samma höjd (130px) men smalare bredd (72px) via `.timeline-day.slim`-klass — layouten blir konsekvent, scrollen kortare horisontellt. Texten centreras.
  - **Auto-scroll till planstart vid ny generering:** `renderWeeklyPlanData(..., freshlyGenerated=true)` centrerar på `plan.startDate` när planen är opåbörjad (`!confirmed`). Efter bekräftelse återgår beteendet till "centrera idag". `centerTodayCard` är nu wrapper runt nya `centerOnDate(dateIso, opts)`.
  - **`.plan-pending` + NY-badge:** Alla kort i en aktiv men oconfirmad plan får klassen `.plan-pending` — terrakotta border + pulserande ring (keyframes `planPendingPulse`, 2.4s) + liten "NY"-badge i top-right. Försvinner direkt när `planConfirmed` sätts.
  - **Nav-chips [Idag] [Matsedel →]:** Ny `.timeline-nav` ovanför tidslinjen. Chippen för matsedeln pulsar (keyframes `chipPulse`) när planen är pending.
- **Filer ändrade:** `js/weekly-plan/plan-viewer.js`, `js/weekly-plan/plan-generator.js`, `css/styles.css`, `index.html`. **Filer tillagda:** `api/custom-days.js`, `custom-days.json`.
- **Kassera förslag (tillägg):** Ny `api/discard-plan.js` — tömmer `weekly-plan.json` och plockar bort planens recipeIds ur `recipe-history.json` så de blir valbara direkt igen. Rör inte `shopping-list.json` eller `plan-archive.json`. Frontend: sekundär "Kassera förslag"-knapp under "✓ Bekräfta" i `confirmPlanWrap`, grå border → röd vid hover. Bekräftelsedialog innan anrop. Bara synlig medan planen är pending.
- **Återstår:** Live-test i Vercel av alla ändringar tillsammans.

### Session 31 (2026-04-18)
- **Polish-pass på ±14 tidslinjen** efter live-test i session 30:
  - **Enhetlig kortstorlek:** `.week-day-card` har nu `height: 130px` + `display: flex; flex-direction: column`. `.week-day-recipe` fick `-webkit-line-clamp: 3` + `flex: 1`, så långa titlar klipps snyggt istället för att pusha kortet högre. `.week-day-name` och `.week-day-saving` fick `flex-shrink: 0`.
  - **Trimmad topmarginal:** `#weekView` padding-top 1.5rem → 0.5rem. `.section-title` margin-bottom 0.6rem → 0.15rem. `.week-meta` margin-bottom 0.75rem → 0.4rem. "Aktiv matsedel:" landar nu tätare mot toppen.
  - **Centrera idag vid tab-switch:** Ny `centerTodayCard({ smooth })` i `plan-viewer.js` räknar ut `scrollLeft` explicit på `.timeline-wrap` (scrollIntoView misskör när fliken är `display: none`). Anropas från `switchTab('vecka')` via `requestAnimationFrame` + efter varje render. Exponeras som `window.centerTodayCard`.
  - **Veckoavgränsning:** Ny `isoWeekNumber(dateIso)` i `utils.js` (ISO 8601, måndag som första dag). I `buildTimeline` får varje dag `weekNumber`. I render spåras `prevWeek` — vid vecko-byte får `.timeline-day` klassen `.week-start` (streckad vertikal separator till vänster, 0.9rem margin + padding) + `v. NN`-etikett i toppraden. Första dagen i timelinen undantas (`idx > 0`).
  - **Framhävda helger:** Weekend-kort bakgrund `#faf6f0` → `#f3e8d4` (ej pastell-överlagrade), border-color `#e5d3ae`. `.week-day-name` i weekend fick `font-weight: 700` + `opacity: 1` (var 0.9). Fungerar även över pastell — textstilen bär signalen.
- **Pushade commits:** `fc79b4c` (Session 30 grund), `323d2cd` (polish), `cfa95a2` (vecka + helg).
- **Återstår fortfarande:** Live-test att arkivering bygger upp `plan-archive.json` korrekt från nästa generering. Priority 2-stemming (Fas 1D) kvarstår.

### Session 30 (2026-04-17)
- **Veckans mat redesign — ±14 horisontell tidslinje** med tydlig plan-tillhörighet:
  - `js/weekly-plan/plan-viewer.js`: helt ombyggd renderingslogik. Ny `buildTimeline(plan, archive)` returnerar 29-dagars array (14 dagar bakåt + idag + 14 framåt) som sammanfogar aktiv plan + arkiv + tomma gap-dagar. Varje dagkort taggas `{ isPast, isToday, isWeekend, holiday, planColorIndex, isArchive, blocked }` och får månadsetikett + plan-etikett vid batchgränser.
  - **Plan-grupperad färgspråk:** 4 pastellfärger (ljusgrön/ljusblå/ljusgul/ljuslila) roteras över arkiverade planer så back-to-back-planer syns tydligt åtskilda. Aktiv plan = terrakotta-tint. Gap-dagar = streckad ram. Weekend = beige ton. Helgdagar = röd prick.
  - **Read-only historik:** Arkiverade/passerade dagkort får `data-readonly="1"` — `openWeekRecipe()` visar då recept utan byt-plats/byt-recept/hoppa-över/blockera-knappar, bara noteringen "📜 Historisk plan — bara för referens."
  - `api/generate.js`: ny `archiveOldPlan(newStartDate, pat)` körs innan ny plan skrivs. Klipper alla dagar i gamla `weekly-plan.json` som är tidigare än nya startdatumet, skjuter in dem i `plan-archive.json` som `{ startDate, endDate, days, archivedAt }`. Rullande 30-dagars fönster. Failar graciöst (try/catch kring anropet blockerar aldrig en ny plan).
  - `js/utils.js`: Gauss påskalgoritm + `getSwedishHolidays(year)` + `getHolidayName(dateIso)`. Täcker Nyårsdagen, Trettondedag, Långfredag, Påsk­dagen, Annandag påsk, Första maj, Kristi himmelsfärds dag, Pingstdagen, Nationaldagen, Midsommarafton/-dagen, Alla helgons dag, Julafton/-dagen/Annandag jul, Nyårsafton. Cachas per år.
  - `js/weekly-plan/plan-generator.js`: dagväljaren för ny matsedel visar nu weekend-klass + `.holiday-dot` med tooltip. Efter lyckad generering hämtas `plan-archive.json` innan rendering så timeline bygger på uppdaterat arkiv.
  - `css/styles.css`: `.timeline-day-top` (månad/plan-etiketter), `.plan-color-0..3` (pastellerna), `.plan-active`, `.archive`, `.gap`, `.weekend`, `.holiday-dot`, `.readonly-note`. Alla överlagringsklasser skyddade med `:not(.today):not(.selected)` för att inte krocka med dagens markering.
- **Beslutad modell tillsammans med användaren:** användaren insåg att back-to-back-planer måste visa tillhörighet tydligt för att inte blanda ihop vilka ingredienser som tillhör vilken inköpslista. Pastell-rotation + plan-etiketter + gap-markörer löser det visuellt — inköpslistan stannar **per aktuell plan**, ingen historisk inköpslista.
- **Återstår:** live-test efter Vercel-deploy. Första generering efter uppdatering kommer inte hitta något arkiv (tom `plan-archive.json`), arkivet byggs upp från nästa generering.

### Session 29 (2026-04-17)
- **Fas 1D Priority 1 implementerad.** 8 direktmatchande Willys-termer + rimliga aliaser tillagda i `NORMALIZATION_TABLE` (`api/_shared/shopping-builder.js`): kycklingfärs, fläskfärs, vegofärs, pesto, ketchup, majonnäs, gnocchi, majs.
- **Fas 1F Steg 2 — Willys-endpoint + matcher klart.**
  - `api/willys-offers.js`: proxy mot `/search/campaigns/online` med 1h CDN-cache + non-food-blocklist (58/199 erbjudanden filtreras bort — kattmat, allrent, tandkräm, etc — förhindrar `lax kattmat` → lax-matchning).
  - `api/_shared/willys-matcher.js`: n-gram-scanner (max 3-gram, längre fras vinner). Returnerar **en** kanonisk term per erbjudande så "Fylld Gnocchi Tomat Mozzarella" matchar bara `gnocchi`, inte `tomat`/`mozzarella`. 51/62 recept matchar live (inom prognos 52–55).
- **Fas 1F Steg 3 — integration klart.**
  - `api/generate.js`: accepterar `optimize_prices`-flag, hämtar Willys-erbjudanden med 5s-timeout, räknar `matchRecipe().totalSaving` per kandidat, skickar `savingsById` till `selectRecipes`. Ny `bucketBySaving()` sorterar recept med ≥10 kr besparing först i varje slumpad pool — proteinbalans/veg-slot/historik/oprövade-logik rörs inte. Fallar graciöst vid nätfel. Varje dag i output får `saving: <kr>` där sådan finns.
  - `js/weekly-plan/plan-generator.js`: skickar `optimize_prices` i POST-body från checkbox-state.
  - `js/weekly-plan/plan-viewer.js`: `💰 X kr` per dagkort när `saving >= 10`.
  - `index.html` + `css/styles.css`: ny "Prisoptimera matsedeln"-toggle i inställningspanelen med hovrande i-ikon som förklarar begränsningar. Togglen default AV.
- **Mental-modellsgranskning med användaren:** användaren frågade först om constraint-baserad optimering (garantera ett protein-recept per extrapris) men accepterade scoring-baserad modell efter förklaring. "Stanna och bekräfta"-regeln användes korrekt.
- **Återstår:** Live-test i Vercel när deployen är klar. Priority 2-stemming (laxfiléer/rökt bacon) kan vänta — Priority 1 + n-gram-matchern ger redan prognos-matchningen.

### Session 28 (2026-04-16)
- **Tre parallella Sonnet-research dispatchade** för att nyttja Claude MAX-kapacitet. Opus koordinerade, Sonnet grävde, Opus granskade.
- **Fas 1D — Lexikonresearch klar** (`docs/research-lexikon-fas1d.md`, ~28 KB). 62 recept + 202 Willys-erbjudanden analyserade live. **34 nya CANON-entries + ~90 synonymrader** föreslås, prognos 44/62 → 52–55/62 matchningar (+8–11 recept). Riskanalys fångar kritiska fällor: `gochugaru ≠ gochujang` (olika produkter), `gräddfil ≠ crème fraiche` (fetthalt), `havredryck ≠ mjölk` (funktionellt inkompatibelt). Opus-granskning: Priority 1 (8 direktmatchande rader) säkert nog för nästa implementation-pass; Priority 2 (stemming för laxfiléer/rökt bacon) kräver kod utöver tabelltillägg.
- **Fas 3 — Internationell receptimport-research klar** (`docs/research-internationell-import.md`, ~17 KB). 18 sajter testade live. **Viktigaste fynd:** bot-blockering är största hindret — 7/18 sajter Cloudflare-blockerade inkl. allrecipes, seriouseats, bbcgoodfood. Existerande pipeline (JSON-LD + Gemini-fallback) hanterar redan båda fallen. Tre konkreta kodändringar identifierade för Fas 3B. 5 högrisksilenta fel dokumenterade (t.ex. `baking soda → bakpulver` FEL — ska vara `bikarbonat`).
- **Fas 5A — Teknisk väg-research klar** (`docs/research-teknisk-vag-app.md`, ~21 KB). **Capacitor rekommenderat.** PWA dör mot Apple (Guideline 4.2). RN kräver full omskrivning (8–16 v). Capacitor bevarar hela vanilla-JS-koden + GitHub-as-DB utan backend-byte — 3–5 veckor arbete. Payment-strategi kopplad till Fas 5C (post-Epic v Apple + EU DMA).
- **Roadmap-effekt:** 3A, 5A bockade. 1D fortsatt `[~]` (research klar, kod kvarstår). 3B har nu färdig kodplan.
- **Inga kodändringar** denna session — research-only per användarinstruktion.

### Session 27 (2026-04-13)
- **Willys API reverse engineering klart.** Endpointen är plain GET utan auth/CSRF/session: `GET https://www.willys.se/search/campaigns/online?q=<storeId>&type=PERSONAL_GENERAL&page=0&size=500`. `q`-parametern är **storeId** (inte sökfråga — felläsning av bundlen kostade en timme). Store 2160 = Willys Linköping Ekholmen → **199 erbjudanden** anonymt, 485 KB JSON.
- **Probe-batteri genomförd** — endpointen är stabil: olika storeId ger olika sortiment (nationella priser), pagination via size=500 fungerar, inga rate-limits vid 5 rapid calls (CDN-cachat), graceful 400 på ogiltiga stores, 500 bara om `q` saknas helt. `type=WHATEVER` ignoreras och default:ar till GENERAL.
- **Datastruktur dokumenterad:** 190 MixMatchPricePromotion + 9 SubtotalOrderPromotion (filtreras bort, inte matchningsbara) + 2 MixMatchPercentagePromotion. 50 av 190 är "realMixAndMatch" (köp X för Y kr). `validUntil` spänner 2026-04-19 → 2026-06-28 med bara 6 unika slutdatum (batch-rotationer). Normalpris = `priceValue + savingsAmount`.
- **Matchningsprototyp körd** (`match-offers-v2.py` lokalt): 44/62 recept matchar, 22/62 får ≥10 kr realistisk besparing. Median 3,9 kr, snitt 14 kr per matchat recept. Strukturen är viable men lexikonet (66 termer idag) är primära flaskhalsen — varje ny term låser upp 1–3 erbjudanden och 2–5 recept. Receptsidan har en bugg med sammansatta tokens ("kycklingfärs", "laxfiléer", "körsbärstomater") som inte exakt-matchar CANON — fixbart med stemming eller substring-scan.
- **UX beslutat tillsammans med användaren (fyra punkter):**
  1. **Opt-in toggle** "Prisoptimera min matsedel" i inställningspanelen, default AV. Hovrande i-ikon förklarar vad det gör, begränsningar (Willys+ saknas, tunna veckor, att filter alltid respekteras).
  2. **Hård optimering inom befintliga filter:** låsta recept, historik (14 dagar), veg-dagar, proteinbalans, oprövade, datumintervall, blockerade dagar — alla respekteras fullt. Optimeringen byter bara **vilket konkret recept som hamnar i varje slot**, inte strukturen.
  3. **Kör alltid** även när veckans erbjudanden är tunna. Degraderar graciöst.
  4. **Besparings-indikation** i veckovyn: "💰 Sparat ca X kr" jämfört med **normalpris** (`priceValue + savingsAmount`) — det enda ärliga jämförelsevärdet. Tröskel ≥10 kr för att undvika brus.
- **Datakälla för implementation:** `api/willys-offers.js` (ny endpoint) med 1h cache, anropar Willys-endpointen, normaliserar bort SubtotalOrder, returnerar `{code, name, regularPrice, promoPrice, savingPerUnit, qualifyingCount, validUntil}` — ~30 KB istället för 485 KB.
- **Recon-artefakter gitignorade** (session-cookies, 1 MB JS-dumpar, probe-skript) — filerna ligger lokalt för nästa session men commitas inte.

### Session 26 (2026-04-12)
- **Code review backend + frontend genomförd** — 10 buggar identifierade och fixade:
  - `replace-recipe`: bygger om inköpslistan vid bekräftad plan + blockerar replace på blockerad dag
  - `generate/confirm/skip-day`: bevarar `checkedItems` och `recipeItemsMovedAt` vid ombyggnad
  - `import-recipe`: DNS-lookup + privat-IP-blockering (SSRF-skydd)
  - `recipes`: `meta.nextId` förhindrar ID-återanvändning efter delete
  - `shopping-builder`: död quantity-strip-regex borttagen
  - `plan-viewer`: `replaceRecipe`/`selectRecipeForDay` uppdaterar nu ingrediensvy + inköpslista efter receptbyte på bekräftad plan
  - `shopping-list`: bevarar in-memory bockar vid snabb bockning + manual-tillägg (race condition)
  - `recipe-import`: `URL.revokeObjectURL` frigörs efter bildladdning

### Session 25 (2026-04-11)
- Dashboard tillagd i CLAUDE.md
- SessionStart-hook konfigurerad
- Definition of Done uppdaterad

## Definition of Done (följ alltid)
Innan "klart" deklareras ska Claude alltid:
1. Läsa tillbaka den editerade filen och verifiera att ändringen landade rätt (Edit-hooken fångar syntaxfel automatiskt)
2. Kontrollera att relaterade funktioner inte brutits — Grep efter berörda funktionsnamn om tveksamt
3. Committa och pusha till `main`
4. Uppdatera Dashboard-sektionen i CLAUDE.md (senaste session, buggar, roadmap-checkboxar)

## Frontend-moduler (VSA)
Varje feature-slice är en fristående JS-fil. En agent som jobbar med en feature behöver bara läsa 1–2 filer.
- `js/app.js` — entry point, importerar alla moduler, kör `init()` + `loadWeeklyPlan()`
- `js/state.js` — alla globala `window.*`-variabler som delas mellan moduler
- `js/utils.js` — delade hjälpfunktioner (`proteinLabel`, `timeStr`, `renderIngredient`, `fmtIso`, `fmtShort`, `daysBetween`, `renderDetailInner`)
- `js/ui/scroll.js` — scroll-logik, header show/hide, smoothScrollTo
- `js/ui/navigation.js` — `switchTab()`
- `js/shopping/shopping-list.js` — hela inköpsliste-slicen
- `js/weekly-plan/ingredient-preview.js` — ingrediens-förhandsgranskning i veckovyn
- `js/weekly-plan/plan-generator.js` — datumväljare, inställningar, generering
- `js/weekly-plan/plan-viewer.js` — veckoplan, swap, replace, confirm
- `js/recipes/recipe-browser.js` — receptlistning, filtrering, sökning
- `js/recipes/recipe-editor.js` — redigera/spara/ta bort recept
- `js/recipes/recipe-import.js` — import via URL och foto

### Cross-modul-anrop
Funktioner exponeras via `window.*` i varje modul. Moduler anropar varandra via `window.funktionsNamn()` — inga cirkulära ES6-imports.

### Backend-moduler (VSA)
Delad infrastruktur i `api/_shared/`:
- `constants.js` — REPO_OWNER, REPO_NAME, BRANCH
- `github.js` — `readFile()`, `readFileRaw()`, `writeFile()` (3-retry SHA-hantering)
- `handler.js` — `createHandler()` (CORS, auth, error-wrapping)

Domänlogik stannar i respektive endpoint-fil (`api/generate.js`, `api/shopping.js`, etc.).

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp), inte bara den enskilda frågan
- Tänk på hela familjen som användare — inte bara den tekniska personen
- **Uppdatera CLAUDE.md efter varje större ändring**

## Repo-struktur
```
Receptbok/
├── index.html              # HTML-markup (290 rader) — laddar js/app.js som ES-modul
├── css/
│   └── styles.css          # All CSS (1620 rader, extraherad från index.html)
├── js/
│   ├── app.js              # Entry point — importerar alla moduler
│   ├── state.js            # Globala variabler (delas mellan moduler)
│   ├── utils.js            # Delade hjälpfunktioner
│   ├── ui/
│   │   ├── scroll.js       # Scroll, header, smoothScrollTo
│   │   └── navigation.js   # switchTab()
│   ├── shopping/
│   │   └── shopping-list.js # Inköpsliste-slice
│   ├── weekly-plan/
│   │   ├── plan-generator.js  # Generering + inställningar
│   │   ├── plan-viewer.js     # Veckoplan + swap/replace/confirm
│   │   └── ingredient-preview.js
│   └── recipes/
│       ├── recipe-browser.js  # Listning, filter, sökning
│       ├── recipe-editor.js   # Redigera/spara/ta bort
│       └── recipe-import.js   # Import via URL/foto
├── api/
│   ├── _shared/
│   │   ├── constants.js    # REPO_OWNER, REPO_NAME, BRANCH
│   │   ├── github.js       # readFile, readFileRaw, writeFile
│   │   └── handler.js      # createHandler (CORS, auth, errors)
│   ├── generate.js         # Receptval + matsedel + inköpslista
│   ├── replace-recipe.js   # Byt enskilt recept
│   ├── skip-day.js         # Blockera dag / hoppa över (skjut framåt)
│   ├── swap-days.js        # Byt plats på två dagar
│   ├── confirm.js          # Bekräfta matsedel
│   ├── recipes.js          # CRUD recept
│   ├── shopping.js         # Inköpsliste-API
│   └── import-recipe.js    # Receptimport (Gemini)
├── recipes.json            # Receptdatabasen (62 recept, rör ej strukturen)
├── weekly-plan.json        # Genereras av /api/generate
├── shopping-list.json      # Genereras av /api/generate
├── recipe-history.json     # Recepthistorik — undviker upprepning
├── vercel.json             # 15s timeout
├── package.json            # Inga runtime-beroenden
└── CLAUDE.md
```

## Tekniska beslut
- **Färgtema:** Krämvitt `#faf7f2`, brun header `#5c3d1e`, terrakotta `#c2522b`
- **Receptval:** Deterministisk JS-algoritm i `selectRecipes()` — historikfiltrering (14 dagar) → proteinfördelning (max 2 per typ) → vardag30/helg60-matchning → slump. Ingen AI.
- **Inköpslista:** Byggs deterministiskt i JS från receptdata — ingen AI
- **Recepthistorik:** `recipe-history.json` — recept använda senaste 14 dagar filtreras bort, äldsta fylls på vid behov
- **Inställningar:** Oprövade (direkt siffra), vegetariska dagar (direkt siffra), proteintoggle med receptantal. Ingen skalning, inga tidsväljare, inget fritextfält.
- **Willys-integration:** Avaktiverad — EU-scraping-blockering (400-fel), ingen plan

## recipes.json — struktur (rör ej)
```json
{
  "meta": { "version": "1.0", "lastUpdated": "2026-03-08", "totalRecipes": 62 },
  "recipes": [{
    "id": 1, "title": "Receptnamn", "tested": false, "servings": 4,
    "time": 40, "timeNote": "ugn 150°",
    "tags": ["helg60", "fisk", "ugn"],
    "protein": "fisk",
    "ingredients": ["600 g torsk", "..."],
    "instructions": ["Steg 1...", "Steg 2..."],
    "notes": "Tips: ..."
  }]
}
```
**Protein:** `fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`
**Taggar:** `vardag30` (≤30 min vardag), `helg60` (≤60 min helg), `soppa/pasta/wok/ugn/sallad/gryta/ramen` (typ), `veg` (vegetariskt)

## Dataformat — genererade filer
```json
// weekly-plan.json
{ "generated": "2026-03-14", "startDate": "...", "endDate": "...",
  "days": [{ "date": "2026-03-14", "day": "Fredag", "recipe": "Titel", "recipeId": 23 }] }

// shopping-list.json
{ "generated": "2026-03-14", "categories": {
    "Mejeri": ["2 dl grädde"], "Grönsaker": ["1 purjolök"],
    "Fisk & kött": ["600 g torsk"], "Frukt": [], "Skafferi": [], "Övrigt": [] }}

// recipe-history.json
{ "history": [{ "date": "2026-03-14", "recipeIds": [47, 62, 51] }] }
```

## Sessionshistorik

## Session 23 (2026-04-09)
- **Total projektöversyn genomförd** — samtliga prioriterade förbättringar implementerade:
  - **A1:** `var(--brown)` → `var(--warm-brown)` i CSS (7 ställen) — fixar svart fallback-färg
  - **A2:** `renderShoppingData` exponerad i `js/shopping/shopping-list.js` — dött anrop i `plan-viewer.js` fungerar nu
  - **A3:** Döda recept-ID (19) borttagna ur `recipe-history.json`
  - **A4:** `swap-days.js` kontrollerar nu om dagarna är blockerade och returnerar 400 om så är fallet
  - **A5:** `generate.js` validerar att startdatum < slutdatum och returnerar tydligt fel
  - **A6:** `replace-recipe.js` omskriven med 5-prioritets pool: respekterar vardag30/helg60, proteinbalans, historik
  - **B1:** `fetchHistory`, `recentlyUsedIds`, `shuffle` extraherade till `api/_shared/history.js`
  - **C1:** Receptredigeraren validerar tom titel och tomma ingredienser innan sparning
  - **C2:** Dynamiska tagggrupper i receptfilter — `initFilters(recipes)` i `recipe-browser.js`, grupperade: Tid, Protein, Provat, Typ, Kök, Övrigt. Hårdkodade knappar borttagna från `index.html`.
  - **C3:** `aria-label="Till toppen"` tillagd på `#scrolltop`-knappen
  - **D1:** `#4a7d4e`, `#5a8a5a`, `#b04030` → CSS-variabler (`--color-success-dark`, `--color-success`, `--color-danger`) i `:root`
  - **D2:** `@media (max-width: 400px) { .modal-box { width: 95vw; } }` tillagd
  - **E1:** `renderDetailInner(r)` extraherad till `js/utils.js` — återanvänds från `recipe-browser.js` och `recipe-editor.js`
  - **E2:** `daysBetween(startIso, endIso)` extraherad till `js/utils.js` — ersätter duplicerad beräkning i `plan-generator.js`
- **Hård regel inlagd:** Befintlig veckoplan får aldrig förstöras som sidoeffekt av kod-ändringar
- **Byt dag-knapp** återinförd i detaljpanelen (saknades i veckovyn)

## Senaste session — Session 22 (2026-04-09)
- **[FEATURE] Blockera dagar + Hoppa över ("skjut framåt")** — två nya funktioner:
  - **Pre-generering:** Dagväljare visas efter datumval. Tryck på en dag för att blockera den — blockerade dagar exkluderas från receptval och inköpslista.
  - **Post-generering — Blockera dag:** Tar bort receptet från en dag utan att påverka övriga dagar. Tillgänglig via detaljpanelen.
  - **Post-generering — Hoppa över (skjut framåt):** Markerar dagen som fri och skjuter alla efterföljande recept framåt ett steg. Sista receptet faller bort.
  - Om matsedeln är bekräftad byggs inköpslistan om automatiskt.
  - Nytt API-endpoint: `api/skip-day.js` (actions: `skip`, `block`).
  - `api/generate.js` accepterar nu `blocked_dates`-array.
  - Blockerade dagar visas med streckad ram, "Fri dag"-text, och lägre opacitet.

## Session 21 (2026-04-06 — KLAR)
- **VSA-refaktorering genomförd** i tre faser:
  - **Fas 1 — Backend:** Delad infrastruktur extraherad till `api/_shared/` (`constants.js`, `github.js`, `handler.js`). 7 endpoints refaktorerade, ~266 rader duplicerad kod borttagna.
  - **Fas 2 — CSS:** `css/styles.css` skapad (1620 rader). `<style>`-block i index.html ersatt med `<link>`.
  - **Fas 3 — Frontend JS:** 11 feature-moduler skapade under `js/`. Entry point `js/app.js` med ES-modulimport. `index.html` reducerad från 3305 → 290 rader.
- **Designbeslut:** Cross-modul-anrop via `window.*` (inga cirkulära ES6-imports). Domänlogik stannar i varje slice — delar bara teknisk infrastruktur. Optimerat för att agenter ska kunna jobba med en feature genom att läsa 1–2 filer.
- **Nästa session:** Testa VSA-ändringarna live.

## Session 19 (2026-04-02 — PÅGÅENDE)
- **Fotoimport-felsökning:** Gemini-modellnamnet har behövt justeras flera gånger — `gemini-2.0-flash` (quota 0 på free tier) → `gemini-1.5-flash` (not found, pensionerad) → `gemini-2.5-flash` via `v1beta` (nuvarande gratisflash-modell)
- **FAB-position:** Plusknappen flyttad till vänster sida så den inte lappar över scroll-to-top-pilen (höger)
- **Kodgranskning klar (session 20, 2026-04-06):** Branch mergad. `api/import-recipe.js` verifierad — rätt modell (`gemini-2.5-flash`), rätt endpoint (`v1beta`), korrekt request-format för både foto och URL-fallback.
- **Återstår:** Funktionstest i live-appen — kräver att `GOOGLE_API_KEY` finns i Vercel env vars. Prova importera ett recept via foto eller URL.

## Session 18 (2026-04-01 — KLAR)
- **Receptimport via URL:** Ny endpoint `api/import-recipe.js` — server-side fetch → JSON-LD-parsning (schema.org/Recipe) som primär strategi. Om JSON-LD saknas och GOOGLE_API_KEY finns → Gemini-fallback (rensar HTML, skickar till Gemini). Mappar ISO 8601-duration, gissar protein, bygger taggar.
- **Receptimport via foto:** Samma endpoint — base64-bild skickas till Gemini 2.0 Flash Vision med strikt JSON-prompt (returnerar exakt receptschemat). Bilden krympas i webbläsaren (max 1200px, JPEG quality 0.7) för att undvika Vercels 4.5 MB-gräns.
- **Ny `add`-action i `api/recipes.js`:** Genererar ID (max+1), sparar till `recipes.json` via befintlig SHA-retry.
- **UI:** "＋ Importera recept"-knapp i receptvyn → import-modal med URL/Foto-flikar. Foto-flödet visar progressiva meddelanden (Analyserar bild… → Identifierar ingredienser… → Formaterar recept…). Importerat recept öppnar redigera-modalen med titeln "Nytt recept" för granskning innan sparning.
- **Kräver av användaren:** `GOOGLE_API_KEY` i Vercel env vars (gratis från aistudio.google.com). URL-import med JSON-LD fungerar utan nyckeln.
- **Planprocess:** Plan granskad av GPT och Gemini — Gemini-fallback för URL och JPEG-komprimering lades till baserat på feedback.

## Session 8 (2026-03-14)
- Stängde av Antigravity som todo-punkt — användaren pushar och refreshar, inget lokalt behov
- Lade till "Stanna och bekräfta"-regel i Operativa regler — agera ej på feedback utan att fråga först
- To-do-listan fastställd, inga kodfixar gjorda

## Session 9 (2026-03-16)
- **Punkt 3 klar:** Standardvärden satta — untestedCount 0→1, vegetarianDays 0→4. Skalning sker proportionellt vid generering (Math.round(dagar/7 × värde)), displayvärdena ändras aldrig.
- **Punkt 10 påbörjad men pausad:** Djupanalys av hela repot genomförd. Tre konkreta problem identifierade i receptvalet (se nedan). Avvaktar svar från användaren om vad som upplevs som fel i praktiken — innan någon implementation påbörjas.

### Punkt 10 — öppen fråga till nästa session
Tre problem hittade i `callClaude()` / receptvalet:
1. **Ingen validering av returdata** — Claude kan hallucinera recept-ID:n, returdata kollas knappt
2. **Motstridiga regler** — "helg60 MÅSTE användas" vs "samma protein max 2 ggr" krockar vid smal databas (t.ex. bara fisk + flera helgdagar)
3. **Databas-bias är dold** — 66% vegetariska recept, Claude vet inte om det sneda urvalet

**Fråga att ställa användaren:** Vad har gått snett i praktiken — finns det matsedlar som blivit dåliga, och i så fall varför?

**Nästa session börjar med:** Få svar på ovanstående fråga, sedan besluta om punkt 10 ska vara bugfix, agentic refactor, eller något annat.

## Session 10 (2026-03-23)
- **Punkt 1 klar:** Hårdkodade Vercel-URL:er (`https://receptbok-six.vercel.app/api/...`) bytta mot relativa sökvägar (`/api/...`) i index.html. CORS var redan `*` i båda endpoints.
- **Punkt 2 klar:** Inköpslistebyggaren omskriven med 5-stegspipeline
- **Punkt 4 klar:** Matlagningsläge — instruktionssteg är klickbara/tappbara (grön bock + genomstrykning). Header auto-hides vid nedscroll, visas vid uppscroll (position fixed + transform translateY + ResizeObserver för padding-top). Card-snap med smoothScrollTo (ease-in-out, 420ms), isSnapping-flagga förhindrar jojo-effekt. Flikar högerorienterade på PC (≥600px). Receptboken är nu startsida. Ingredienslista i veckovyn är kollapsbar (default minimerad, expanderas vid generering). i `api/generate.js`. Ersätter exakt textsträngsmatching med: Clean → Parse (regex, bråk, intervall) → Normalize (~150 varianter → kanoniska namn, byggd från 500+ svenska ingredienssträngar) → Merge (summerar mängder per ingrediens+enhet) → Categorize (utökade nyckelord inkl. ägg, bönor, linser, rödbetor, örter). Täckning ~90-95%.

## Session 11 (2026-03-24 — pågående)
- **Inköpsliste-fix:** Nytt steg 4.5 i pipeline (api/generate.js) — filtrera + konvertera innan kategorisering:
  - **Basvaror bort helt:** salt, svartpeppar, vitpeppar, vatten, "salt & peppar" tas bort från listan
  - **Småenheter → bara namn:** tsk/msk/krm/nypa/tumme-poster visas utan mängd (t.ex. "1 msk sambal oelek" → "sambal oelek"). Om samma ingrediens finns med stor enhet (dl/g/kg) behålls bara den stora.
  - **"tumme" tillagd som enhet:** "1 tumme ingefära" parsas nu korrekt
  - **Tillagningsbeskrivningar stripas:** "nykokt ris" → "ris", "rostade nötter" → "nötter"
  - **Normalisering utökad:** "hackade nötter", "rostade nötter/frön" → "nötter"
  - **Designprincip:** Visa allt utom det absolut självklara — användaren lägger 1 minut på att radera det hen redan har hemma
- **Ytterligare parsningsfixar (session 11, senare):**
  - `stor`/`liten vitlöksklyfta` → slås nu ihop korrekt
  - `kycklingfiléer` normaliseras → rätt kategori
  - `fiskbuljong`/`fisksås`/`ostronsås` → SKAFFERI_OVERRIDE
  - `till X`-suffix stripas (till stekning, till redning)
  - Smart eller-hantering: adjektiv/bindestreck hanteras
  - `kokt/kokta` stripas från namn efter enhet
  - UNIT_REGEX: `\b` → lookahead för svenska tecken (fixar `lök` → `½ l ök`)
  - `"fil"` borttaget från Mejeri-nyckelord (fixar `kycklingfilé` i Mejeri)
  - `+`-suffix stripas (majsstärkelse + 2 msk vatten)
- **Nästa session börjar med:** Punkt 12 — ny kvalitetskontroll efter att användaren genererat en ny matsedel

## Session 12 (2026-03-25 — KLAR)
- **Punkt 7 klar:** Alla 62 recept nu 4 portioner. 17 tvåportionsrecept dubblerade, 1 sexportionsrecept (ID 6) skalat till ⅔. Engångsskript (Node.js) + manuella korrigeringar för avrundningar, pluralformer och parentetiska vikter. Verifierat via Playwright: 62 receptkort renderas, inga "2 portioner"/"6 portioner" kvar i UI.
- **Punkt 10 klar:** Receptvalet förbättrat i `api/generate.js` — fyra ändringar: (1) nyligen använda recept filtreras *hårt* ur poolen (löser identiska matsedlar), (2) proteinfördelning skickas med i prompten, (3) valideringslogik kontrollerar returnerade ID:n och korrigerar automatiskt, (4) retry upp till 3 ggr med felåterkoppling.
- **Buggfix:** "Flytta till inköpslista"-knappen låg inuti kollapsad sektion — nu alltid synlig.
- **Buggfix:** Confirm-dialog vid "Flytta till inköpslista" borttagen — ett tryck räcker nu.
- **Ny funktion:** "Rensa lista"-knapp längst ned i inköpslistan — tömmer receptvaror, manuella varor och bockningar. Ny `clear`-action i `api/shopping.js`.
- **Backlog:** Punkt 13 tillagd — sortering inom inköpslistans kategorier.
- **Nästa session börjar med:** Punkt 12 — kvalitetskontroll av inköpslistan (generera ny matsedel och granska).

## Session 13 (2026-03-26 — KLAR)
- **Punkt 12 klar:** Kvalitetsgranskning mot 15 recept. Rotorsaker identifierade och åtgärdade i `api/generate.js`: (1) kycklingfilé i Mejeri — "rostad" innehåller "ost" som substring, fixat i `categorize()`. (2) Cashewnötter duplicerades — "hackade cashewnötter" normaliseras nu till "cashewnötter". (3) Citroner delades upp — "Skal och saft av" strippas i `cleanIngredient()`. (4) Kryddor i Grönsaker — torkad/malen-prefix → alltid Skafferi; tomatpuré/chiliflakes/paprikapulver till SKAFFERI_OVERRIDE; ingefära borttagen ur Grönsaker-nyckelord. (5) Basvaror kvar — "salt och peppar", "lite vatten", "valfria grönsaker" till PANTRY_ALWAYS_SKIP. (6) "oregano eller basilika" filtreras via " eller "-check i noAmount.
- **Punkt 13 klar:** Alfabetisk sortering (A–Ö) inom varje kategori. å/ä/ö sorteras sist via explicit teckenmappning (localeCompare med sv-locale är opålitligt i Vercels serverless-miljö).
- **Format:** Inköpslistan visar nu "ingrediensnamn (mängd)" istället för "mängd ingrediensnamn" — bättre läsbarhet och naturligare med alfabetisk sortering.
- **Nästa session börjar med:** Punkt 8, 9 eller 11 — flerval i filter, prövat/oprövat-filter, eller expanderbara receptkort.

## Session 14 (2026-03-26 — KLAR)
- **Historikspårning ombyggd:** Rotorsaker till receptupprepning (rödbetsrisotto 12×): (1) fetchHistory läste från CDN-cachad raw-URL — täta genereringar skrev ovanpå gammal data och tappade mellanliggande körningar. (2) Generationsbaserat format tappade individuell receptspårning. (3) 28-dagarsfönster blockerade ~45 av 62 recept → för snäv pool.
- **Ny design:** `fetchHistory(pat)` läser nu via GitHub API (ingen CDN-cache). Nytt format: `{ usedOn: { "5": "2026-03-26" } }` — ett datum per recept, max lika många poster som receptdatabasen har. 14-dagarsfönster. `recipe-history.json` migrerad.
- **Fallback:** När färska recept inte räcker fylls poolen med de recept som gick *längst sedan* (sorterat på datum), aldrig slumpmässigt.
- **Punkt 14 tillagd:** Handplocka recept — fritekstfältet är mjuk önskan som tyst misslyckas om receptet är historikblockat.
- **Nästa session börjar med:** Punkt 8, 9, 11 eller 14 — flerval i filter, prövat/oprövat, expanderbara receptkort, eller handplockning.

## Session 15 (2026-03-28)
- **AI borttagen från receptval:** `callClaude()` ersatt med deterministisk `selectRecipes()` i `api/generate.js`. Ingen Anthropic API-kostnad längre. Algoritm: historikfiltrering (14 dagar) → pool-uppdelning vardag/helg → veg-dagar slumpas → proteinbalans (max 2 per typ) → oprövade-kvot → slump inom varje slot. Fallback om pool är för liten.
- **Anthropic SDK borttagen:** `@anthropic-ai/sdk` borttagen ur `package.json`. `ANTHROPIC_API_KEY` behövs ej längre i Vercel env vars.
- **Inställningar förenklat:** Fritekstfält ("Önskemål") borttaget — styrde AI-prompten, irrelevant utan AI. Tidsväljare (max tid vardag/helg) borttagna — filtrering sker på taggar (vardag30/helg60), inte minuter. Oprövade och vegetariska dagar: direkt siffra istället för per-vecka-skalning.
- **Realtids-feedback:** "X recept matchar dina filter" visas i inställningspanelen. Proteinknappar visar receptantal per typ. Veg-dagar-max anpassas automatiskt till datumintervallet.
- **Vercel timeout:** Sänkt från 60s till 15s (ingen AI-väntan).
- **Claude Code hooks:** Tre hooks tillagda i `.claude/settings.json`: (1) recipes.json-skydd (PreToolUse-block), (2) Windows-notifikation vid väntan (Notification), (3) commit-påminnelse vid osparade ändringar (Stop-prompt).
- **Nästa session börjar med:** Punkt 8, 9, 11 eller 14.

## Session 16 (avbruten)
- **Punkt 8 klar:** Flerval i receptfilter — `activeFilters` är en Set, knappar togglars individuellt.
- **Punkt 9 klar:** Prövat/Oprövat som valbara filter.
- **Punkt 11 klar:** Expanderbara receptkort i veckovyn — `.week-recipe-detail` med `open`-klass och max-height-transition.

## Session 17 (2026-03-30)
- **Förbättrat arbetsflöde:** Claude pushar direkt till `main`. PostToolUse-hook kör `node --check` vid JS-edits. Definition of Done inbakad i CLAUDE.md.
- **Punkt 14 klar:** Handplocka recept — "Lås in"-knapp på varje receptkort. Låsta recept visas som chips i inställningspanelen. `selectRecipes()` placerar dem i lämpliga slots (helg60 → helgdag) och kringgår historikblockering. Veg-dag-logiken tillämpas bara på kvarvarande slots.
- **Backlog tömd** — alla planerade punkter klara.

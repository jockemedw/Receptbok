# Sessionshistorik — arkiv

Sessioner 8–30. Aktuella sessioner (31 och framåt) ligger i `CLAUDE.md`. Full git-historik: `git log --oneline`.

---

## Session 30 (2026-04-17)
- **Veckans mat redesign — ±14 horisontell tidslinje** med tydlig plan-tillhörighet:
  - `js/weekly-plan/plan-viewer.js`: helt ombyggd renderingslogik. Ny `buildTimeline(plan, archive)` returnerar 29-dagars array (14 dagar bakåt + idag + 14 framåt) som sammanfogar aktiv plan + arkiv + tomma gap-dagar. Varje dagkort taggas `{ isPast, isToday, isWeekend, holiday, planColorIndex, isArchive, blocked }` och får månadsetikett + plan-etikett vid batchgränser.
  - **Plan-grupperad färgspråk:** 4 pastellfärger (ljusgrön/ljusblå/ljusgul/ljuslila) roteras över arkiverade planer så back-to-back-planer syns tydligt åtskilda. Aktiv plan = terrakotta-tint. Gap-dagar = streckad ram. Weekend = beige ton. Helgdagar = röd prick.
  - **Read-only historik:** Arkiverade/passerade dagkort får `data-readonly="1"` — `openWeekRecipe()` visar då recept utan byt-plats/byt-recept/hoppa-över/blockera-knappar, bara noteringen "📜 Historisk plan — bara för referens."
  - `api/generate.js`: ny `archiveOldPlan(newStartDate, pat)` körs innan ny plan skrivs. Klipper alla dagar i gamla `weekly-plan.json` som är tidigare än nya startdatumet, skjuter in dem i `plan-archive.json` som `{ startDate, endDate, days, archivedAt }`. Rullande 30-dagars fönster. Failar graciöst (try/catch kring anropet blockerar aldrig en ny plan).
  - `js/utils.js`: Gauss påskalgoritm + `getSwedishHolidays(year)` + `getHolidayName(dateIso)`. Täcker Nyårsdagen, Trettondedag, Långfredag, Påsk­dagen, Annandag påsk, Första maj, Kristi himmelsfärds dag, Pingstdagen, Nationaldagen, Midsommarafton/-dagen, Alla helgons dag, Julafton/-dagen/Annandag jul, Nyårsafton. Cachas per år.
  - `js/weekly-plan/plan-generator.js`: dagväljaren för ny matsedel visar nu weekend-klass + `.holiday-dot` med tooltip. Efter lyckad generering hämtas `plan-archive.json` innan rendering så timeline bygger på uppdaterat arkiv.
  - `css/styles.css`: `.timeline-day-top` (månad/plan-etiketter), `.plan-color-0..3` (pastellerna), `.plan-active`, `.archive`, `.gap`, `.weekend`, `.holiday-dot`, `.readonly-note`. Alla överlagringsklasser skyddade med `:not(.today):not(.selected)` för att inte krocka med dagens markering.
- **Beslutad modell tillsammans med användaren:** användaren insåg att back-to-back-planer måste visa tillhörighet tydligt för att inte blanda ihop vilka ingredienser som tillhör vilken inköpslista. Pastell-rotation + plan-etiketter + gap-markörer löser det visuellt — inköpslistan stannar **per aktuell plan**, ingen historisk inköpslista.

## Session 29 (2026-04-17)
- **Fas 1D Priority 1 implementerad.** 8 direktmatchande Willys-termer + rimliga aliaser tillagda i `NORMALIZATION_TABLE` (`api/_shared/shopping-builder.js`): kycklingfärs, fläskfärs, vegofärs, pesto, ketchup, majonnäs, gnocchi, majs.
- **Fas 1F Steg 2 — Willys-endpoint + matcher klart.**
  - `api/willys-offers.js`: proxy mot `/search/campaigns/online` med 1h CDN-cache + non-food-blocklist (58/199 erbjudanden filtreras bort — kattmat, allrent, tandkräm, etc — förhindrar `lax kattmat` → lax-matchning).
  - `api/_shared/willys-matcher.js`: n-gram-scanner (max 3-gram, längre fras vinner). Returnerar **en** kanonisk term per erbjudande så "Fylld Gnocchi Tomat Mozzarella" matchar bara `gnocchi`, inte `tomat`/`mozzarella`. 51/62 recept matchar live (inom prognos 52–55).
- **Fas 1F Steg 3 — integration klart.**
  - `api/generate.js`: accepterar `optimize_prices`-flag, hämtar Willys-erbjudanden med 5s-timeout, räknar `matchRecipe().totalSaving` per kandidat, skickar `savingsById` till `selectRecipes`. Ny `bucketBySaving()` sorterar recept med ≥10 kr besparing först i varje slumpad pool — proteinbalans/veg-slot/historik/oprövade-logik rörs inte. Fallar graciöst vid nätfel. Varje dag i output får `saving: <kr>` där sådan finns.
  - `js/weekly-plan/plan-generator.js`: skickar `optimize_prices` i POST-body från checkbox-state.
  - `js/weekly-plan/plan-viewer.js`: `💰 X kr` per dagkort när `saving >= 10`.
  - `index.html` + `css/styles.css`: ny "Prisoptimera matsedeln"-toggle i inställningspanelen med hovrande i-ikon som förklarar begränsningar. Togglen default AV.

## Session 28 (2026-04-16)
- **Tre parallella Sonnet-research dispatchade** för att nyttja Claude MAX-kapacitet. Opus koordinerade, Sonnet grävde, Opus granskade.
- **Fas 1D — Lexikonresearch klar** (`docs/research-lexikon-fas1d.md`, ~28 KB). 62 recept + 202 Willys-erbjudanden analyserade live. **34 nya CANON-entries + ~90 synonymrader** föreslås, prognos 44/62 → 52–55/62 matchningar (+8–11 recept). Riskanalys fångar kritiska fällor: `gochugaru ≠ gochujang` (olika produkter), `gräddfil ≠ crème fraiche` (fetthalt), `havredryck ≠ mjölk` (funktionellt inkompatibelt).
- **Fas 3 — Internationell receptimport-research klar** (`docs/research-internationell-import.md`, ~17 KB). 18 sajter testade live. Bot-blockering är största hindret — 7/18 sajter Cloudflare-blockerade. Existerande pipeline (JSON-LD + Gemini-fallback) hanterar redan båda fallen. 5 högrisksilenta fel dokumenterade (t.ex. `baking soda → bakpulver` FEL — ska vara `bikarbonat`).
- **Fas 5A — Teknisk väg-research klar** (`docs/research-teknisk-vag-app.md`, ~21 KB). **Capacitor rekommenderat.** PWA dör mot Apple (Guideline 4.2). RN kräver full omskrivning (8–16 v). Capacitor bevarar hela vanilla-JS-koden + GitHub-as-DB utan backend-byte — 3–5 veckor arbete.
- **Inga kodändringar** denna session — research-only per användarinstruktion.

## Session 27 (2026-04-13)
- **Willys API reverse engineering klart.** Endpointen är plain GET utan auth/CSRF/session: `GET https://www.willys.se/search/campaigns/online?q=<storeId>&type=PERSONAL_GENERAL&page=0&size=500`. Store 2160 = Willys Linköping Ekholmen → **199 erbjudanden** anonymt, 485 KB JSON.
- **Datastruktur dokumenterad:** 190 MixMatchPricePromotion + 9 SubtotalOrderPromotion (filtreras bort) + 2 MixMatchPercentagePromotion. 50/190 är "realMixAndMatch". Normalpris = `priceValue + savingsAmount`.
- **Matchningsprototyp körd**: 44/62 recept matchar, 22/62 får ≥10 kr realistisk besparing. Median 3,9 kr, snitt 14 kr per matchat recept.
- **UX beslutat:** Opt-in toggle default AV. Hård optimering inom befintliga filter (låsta/historik/veg/proteinbalans respekteras fullt). Kör alltid, degraderar graciöst. Besparing jämförs mot normalpris, tröskel ≥10 kr.
- **Datakälla:** `api/willys-offers.js` med 1h cache, normaliserar bort SubtotalOrder, returnerar kompakt shape.

## Session 26 (2026-04-12)
- **Code review backend + frontend genomförd** — 10 buggar identifierade och fixade:
  - `replace-recipe`: bygger om inköpslistan vid bekräftad plan + blockerar replace på blockerad dag
  - `generate/confirm/skip-day`: bevarar `checkedItems` och `recipeItemsMovedAt` vid ombyggnad
  - `import-recipe`: DNS-lookup + privat-IP-blockering (SSRF-skydd)
  - `recipes`: `meta.nextId` förhindrar ID-återanvändning efter delete
  - `shopping-builder`: död quantity-strip-regex borttagen
  - `plan-viewer`: `replaceRecipe`/`selectRecipeForDay` uppdaterar nu ingrediensvy + inköpslista efter receptbyte på bekräftad plan
  - `shopping-list`: bevarar in-memory bockar vid snabb bockning + manual-tillägg (race condition)
  - `recipe-import`: `URL.revokeObjectURL` frigörs efter bildladdning

## Session 25 (2026-04-11)
- Dashboard tillagd i CLAUDE.md
- SessionStart-hook konfigurerad
- Definition of Done uppdaterad

## Session 23 (2026-04-09)
- **Total projektöversyn genomförd** — samtliga prioriterade förbättringar implementerade:
  - CSS-variabel-buggar, död kod, valideringar, dynamiska filter, a11y, responsiv modal, delade utils.
  - Se commit-historik `git log` för specifik diff.
- **Hård regel inlagd:** Befintlig veckoplan får aldrig förstöras som sidoeffekt av kod-ändringar

## Session 22 (2026-04-09)
- **[FEATURE] Blockera dagar + Hoppa över ("skjut framåt")**:
  - **Pre-generering:** Dagväljare visas efter datumval. Blockerade dagar exkluderas från receptval/inköpslista.
  - **Post-generering — Blockera dag:** Tar bort receptet från en dag utan att påverka övriga.
  - **Post-generering — Hoppa över:** Skjuter alla efterföljande recept framåt ett steg; sista faller bort.
  - Nytt endpoint: `api/skip-day.js` (actions: `skip`, `block`). `api/generate.js` accepterar `blocked_dates`.

## Session 21 (2026-04-06)
- **VSA-refaktorering** i tre faser: backend-shared extraherat (`api/_shared/`), CSS externaliserad (`css/styles.css`), frontend JS delat i 11 moduler under `js/`. `index.html` 3305 → 290 rader.
- **Designbeslut:** Cross-modul-anrop via `window.*` (inga cirkulära ES6-imports). Domänlogik stannar i varje slice.

## Session 18–20 (2026-04-01 → 2026-04-06)
- **Receptimport via URL och foto**: `api/import-recipe.js` med JSON-LD-parsning som primär + Gemini-fallback. Foto-flöde via `gemini-2.5-flash` (v1beta). Bildkomprimering i webbläsaren (max 1200px, JPEG 0.7). Ny `add`-action i `api/recipes.js`.
- **Kräver:** `GOOGLE_API_KEY` i Vercel env vars (gratis). URL+JSON-LD fungerar utan nyckeln.

## Session 15 (2026-03-28) — AI borttagen från receptval
- `callClaude()` ersatt med deterministisk `selectRecipes()` i `api/generate.js`. Anthropic SDK borttagen. Algoritm: historikfiltrering (14 dagar) → pool vardag/helg → veg-slumpning → proteinbalans (max 2/typ) → oprövade-kvot → slump.
- **Inställningar förenklat:** fritext borttaget, tidsväljare borttagna, direkt-siffra för oprövade/veg.
- **Vercel timeout:** 60s → 15s.
- **Claude Code hooks:** recipes.json-skydd, Windows-notif, commit-påminnelse.

## Session 14 (2026-03-26) — Historikspårning ombyggd
- Rotorsak till receptupprepning: CDN-cachad raw-URL + generationsbaserat format + för snävt 28-dagarsfönster. Fix: `fetchHistory` via GitHub API (ingen cache), nytt format `{ usedOn: { "5": "2026-03-26" } }`, 14-dagarsfönster, fallback sorterad på "längst sedan".

## Session 13 (2026-03-26) — Inköpsliste-kvalitetsgranskning
- Fixade rotorsaker: `rostad` ≠ ost-substring, dedupe av hackade nötter, `skal och saft av`-strip, kryddor → Skafferi, `salt och peppar`-skip, " eller "-filter.
- **Sortering:** A–Ö inom kategori, å/ä/ö sist via explicit teckenmappning (localeCompare opålitligt i Vercel).
- **Format:** "ingrediensnamn (mängd)" istället för "mängd ingrediensnamn".

## Session 12 (2026-03-25) — 4-portions-normalisering + receptvals-fix
- Alla 62 recept nu 4 portioner (17 dubblerade, 1 skalat ⅔).
- Receptval: nyligen använda filtreras *hårt*, proteinfördelning skickas, validering + retry (3 ggr).
- "Rensa lista"-knapp + `clear`-action i `api/shopping.js`.

## Session 11 (2026-03-24) — Inköpslista pipeline-fix
- Basvaror bort (salt/peppar/vatten). Småenheter (tsk/msk/krm/nypa/tumme) → bara namn. Tillagningsbeskrivningar stripas. Normalisering utökad.
- Parsningsfixar: stor/liten vitlöksklyfta, kycklingfiléer, fiskbuljong/ostronsås → SKAFFERI_OVERRIDE, `till X`-strip, `kokt/kokta`-strip, `+`-suffix-strip. UNIT_REGEX `\b` → lookahead för svenska tecken.

## Session 10 (2026-03-23)
- Hårdkodade Vercel-URL:er → relativa sökvägar.
- Inköpslistebyggaren omskriven: Clean → Parse → Normalize → Merge → Categorize. ~150 varianter mappade till kanoniska namn.
- Matlagningsläge: klickbara instruktionssteg, auto-hide header, card-snap, mobile-first layout.

## Session 9 (2026-03-16)
- Standardvärden: untestedCount 0→1, vegetarianDays 0→4. Skalning proportionellt vid generering.
- Djupanalys: tre problem i dåvarande AI-receptval identifierade (validering saknas, motstridiga regler, dold databas-bias).

## Session 8 (2026-03-14)
- Lade till "Stanna och bekräfta"-regel i Operativa regler.
- To-do-listan fastställd, inga kodfixar.

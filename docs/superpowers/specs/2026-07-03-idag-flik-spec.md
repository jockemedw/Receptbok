# Byggspec: Idag-fliken (ny startsida enligt designprototypen)

**Beställd av:** Joakim 2026-07-03 ("Spara den i todo") · **Skriven av:** Fable (Session 108)
**Avsedd byggare:** Opus 4.8 · **Prototyp (facit för utseendet):** https://claude.ai/code/artifact/ddad7251-ca56-4be4-92e2-5148dddf253c — fliken "Idag"
**OBS typografi:** prototypen visar Fraunces — appen använder **Playfair Display** (Joakims beslut, runda 5). Följ appens tokens (`--font-display`), inte prototypens font.

## Mål
En fjärde flik **Idag** som ny startflik: svaret på "vad blir det ikväll?" direkt vid öppning.
Innehåll uppifrån och ned:
1. **Datumrad** (eyebrow): "Fredag 3 juli · vecka 27" — `fmtIso`/`isoWeekNumber` finns i `js/utils.js`
2. **Ikväll-hero**: stor rätt-titel (Playfair), meta (tid · protein · ev. besparing), primärknapp **Börja laga** (`openCookMode(recipeId)`) + sekundär **Mer** (öppnar dag-sheeten via `dlxDayClick`)
3. **I morgon-rad**: kompakt kort med morgondagens middag; tryck → `dlxDayClick`
4. **Kommande veckan**: färgstapelöversikt — en stapel per dag i proteinets färg (`PROTEIN_COLOR` ur utils = `var(--p-*)`), passerade dagar tonade (opacity ~.4), idag med ring; tryck → `switchTab('vecka')`
5. **Snabbt till listan**: textfält + "Lägg till" → samma mekanism som dag-sheetens *lista*-vy använder (`addManualItem` i `js/shopping/shopping-list.js` — läs hur `plan-viewer-deluxe.js` anropar den och gör likadant; den fungerar innan inköpsfliken öppnats)

Nav: **Idag · Matsedel · Lista · Recept** (bottom-nav + header-nav). Idag-ikon: hus-SVG i samma stil (stroke 1.75, viewBox 24).

## Arkitektur (VSA — följ mönstren exakt)
- **Ny slice:** `js/today/today-view.js`. Ingen egen mutationslogik — bara rendering + anrop av befintliga `window.*`-funktioner.
- **Data:** `window._timelineByDate` (fylls av `renderWeeklyPlanData` i `plan-viewer.js`), `window.RECIPES`, `window.planConfirmed`. Recept-lookup: `(window.RECIPES||[]).find(r => r.id === id)`.
- **Re-render-koppling:** wrappa `window.renderWeeklyPlanData` (samma mönster som överst i `plan-viewer-deluxe.js` — läs kommentaren där). Importordning i `app.js`: today-view **efter** plan-viewer-deluxe, så wrappningen lägger sig ytterst.
- **Dag-sheeten:** `window.dlxDayClick(dateIso, dayName)` — sheeten renderas i `document.body` (`ensureSheetHost`) och fungerar från alla flikar. Verifierat 2026-07-03.
- **Cook mode:** `window.openCookMode(recipeId)` — fungerar från alla flikar.

## Exakta filändringar
1. **`index.html`**
   - `<body data-active-tab="idag">`
   - Ny `<div id="todayView" class="visible">` (egen sektion, före `#receptView`); `#weekView` tillbaka till **utan** `visible`-klass; `#receptView` behåller `style="display:none"`
   - Bottom-nav: ny Idag-knapp FÖRST med `active`; ta bort `active` från Matsedel-knappen. Samma i header-nav (`header-tab`).
   - `fabImport` förblir `display:none` initialt (bara recept-fliken visar den — `switchTab` styr)
2. **`js/ui/navigation.js`** — `switchTab`: lägg till `todayView`-raden (`classList.toggle('visible', tab === 'idag')`). OBS: `plan-viewer-deluxe.js` wrappar `switchTab` (snapToHero) — kontrollera att wrappen tolererar `'idag'` (den ska bara agera på `'vecka'`).
3. **`js/today/today-view.js`** — ny. Exponera `window.renderTodayView`. Rendera in i `#todayView`. Tomlägen (se nedan).
4. **`js/weekly-plan/plan-viewer-deluxe.js`** — **återställ steg 3-omordningen:** ta bort `order`-blocket i slutet av `renderDeluxe()` (kommentaren "Idag först … appendChild") så sektionerna åter renderas history/hero/banner/today/days. Ikväll-kortet i Matsedeln BEHÅLLS (det är inte dubblering — Idag-fliken har sin egen presentation).
5. **`js/app.js`** — `import './today/today-view.js?v=100';` (efter deluxe-importen); bumpa deluxe-importen (ändrad fil).
6. **`css/styles.css`** — Idag-flikens stilar. Återanvänd tokens (`--linen-card`, `--hairline`, `--p-*`, `--font-display`, `--on-accent`, skuggmönstren från `.dlx-day`). Hero-kortet: vänsterband i proteinfärg som övriga kort. **Mörkt tema:** använd ENBART tokens — inga nya hex.
7. **`service-worker.js`** — bumpa `CACHE_VERSION`.
8. **Cache-bust-kedjan:** `index.html`: `app.js?v=+1`, `styles.css?v=+1`. (Nuvarande vid specskrivning: app v125, styles v129, SW v39 — utgå från faktiskt läge.)

## Tomlägen
- **Ingen matsedel alls** (`_timelineByDate` tom): hälsning + CTA-knapp "Skapa matsedel" → `window.openNewPlan()` (öppnar wizard-sheeten).
- **Idag saknar middag** (datum finns ej i timeline eller är fri dag): "Inget planerat ikväll" + knappar "Planera dagen" (`dlxDayClick` — routar tom framtida dag till editorn) och "Ny matsedel" (`openNewPlan`).
- **Ingen morgondag:** dölj I morgon-raden.
- **Ikväll = egen notering utan recept:** visa noteringen som titel, dölj "Börja laga" (ingen recipeId), behåll "Mer".

## Fällor (lärdomar från Session 108 — läs noga)
1. **Initialtillståndet är markup, inte JS.** Vy-synlighet, `active`-klasser i BÅDA nav-raderna och `data-active-tab` måste stämma i `index.html` — inget script sätter dem vid boot. (Steg 3 missade `receptView`-döljningen → dubbelrenderade vyer.)
2. **`_timelineByDate` finns först efter att `loadWeeklyPlan()` kört** (anropas i `app.js`-boot). Idag-vyn ska rendera "laddar"-läge tills wrappern kring `renderWeeklyPlanData` triggar första riktiga rendern.
3. **Muta aldrig timeline-datat** — läs bara. Hård regel: befintlig veckoplan får aldrig förstöras.
4. **`addManualItem`** har olika anropsformer (se `index.html`-användningarna + dag-sheetens). Kopiera dag-sheetens väg, hitta inte på en ny.
5. **Versionerade imports**: moduler som ändras ska få bumpad `?v=` i `app.js` — annars servar SW/cache gammal modul (PWA-strategin: JS nätet-först men disk-cache kan spöka; se minnesanteckning project_pwa_cache_strategy).
6. **`escapeHtml`** på ALL användardata (recepttitlar, noteringar) — importera från utils.

## Verifiering (obligatorisk innan "klart")
1. `node --check` på alla ändrade JS-filer (Edit-hooken gör det, men kör ändå).
2. Hela testsviten (7 filer — kommandon i CLAUDE.md).
3. **Playwright-stubbharness** (mönstret från Session 108): starta `python -m http.server` i repo-roten, navigera (byt host/port för färsk cache — webbläsarens heuristiska cache spökar annars), kör i `browser_evaluate`: ta bort `#authGate`, sätt `window.RECIPES`/`window._allRecipes` (appformat), anropa `window.renderWeeklyPlanData(plan, null, false, null, null)` med en 7-dagarsplan runt dagens datum. Screenshotta och GRANSKA (mobilviewport 390×844):
   - Idag-fliken default med hero/I morgon/översikt/snabbfält
   - "Mer" öppnar dag-sheeten; "Börja laga" öppnar matlagningsläget
   - Tomlägena (rendera med tom plan)
   - Matsedeln har heron ÖVERST igen + Ikväll-kortet kvar
   - Alla 4 flikar växlar rent åt båda håll
   - **Mörkt tema**: `document.documentElement.dataset.theme='dark'` → inga ljusa fläckar
4. Efter push: `curl` mot https://receptbok-six.vercel.app/ och kontrollera att nya versionsnumren servas.

## Definition of Done
CLAUDE.md:s DoD gäller fullt ut: läs tillbaka editerade filer, kör sviten, committa+pusha till main, uppdatera `docs/status.md` (ny sessionsruta + digest + verifieringskö-punkt för mobilkollen; arkivera föregående sessionsruta till `docs/session-log-archive.md`).

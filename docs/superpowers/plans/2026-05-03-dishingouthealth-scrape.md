# Plan: Engångs-scrape av dishingouthealth.com → Receptboken

> **Status (2026-05-03):** Planen är beslutad men **körningen flyttas till lokal miljö**. Sandbox-allowlisten i Claude Code-webben blockerar dishingouthealth.com ("Host not in allowlist"), så vi vet ännu inte ens om sajten faktiskt är Cloudflare-skyddad. Lokal körning på användarens Mac kringgår sandbox-restriktionen, ger neutralare IP-rykte mot Cloudflare, och slipper session-timeout-risk vid natt-jobb. **Motor: Sonnet via Anthropic SDK** (per användarens explicita val — inte Gemini).

## Context

Receptboken har idag 62 svenska recept som familjen roterar mellan. Användaren vill kraftigt utöka receptpoolen genom en engångs-import från **dishingouthealth.com** — en amerikansk hälsoinriktad receptblogg (~500 recept). Jobbet körs **utanför appen** som ett bakgrundsjobb i natten med Sonnet (via Anthropic SDK lokalt) som driver hela kedjan: hämta → filtrera → översätta → konvertera enheter → dedupe → skriva till staging.

Resultatet hamnar i en **staging-fil** med en automatisk **kvalitetsrapport** för manuell granskning. `recipes.json` rörs inte förrän användaren explicit godkänner promotionen. Detta är ett enkelt-skotts-jobb — ingen återkommande pipeline, ingen integration i frontend.

Beslutade förutsättningar (från frågesvar 2026-05-03):
- **Bot-block:** Försök först med `curl` + browser-UA. Eskalera till Playwright bara om curl 403:ar **från lokalmiljön** (sandbox-403 räknas inte).
- **Motor:** Sonnet via `@anthropic-ai/sdk` lokalt sköter alla steg i ett pass per recept (HTML-parsing, översättning, konvertering, taggning).
- **Skala:** Filtrera bort dessert/baking/drinks/frukost — endast middag/lunch-relevant. Estimerat utfall: 200–300 recept.
- **Output:** Staging-fil + Sonnet-genererad kvalitetsrapport. Promotion till `recipes.json` är ett separat manuellt steg.
- **Körningsplats:** Lokalt på användarens Mac (`node scripts/dish-scrape/scrape.mjs`). Kräver `ANTHROPIC_API_KEY` i miljön.

## Plan

### Fas 0 — Bot-block sanity-check (5 min, blockerande gate) — KÖRS LOKALT

Innan något annat: verifiera att vi kan hämta sajten alls från användarens lokalmiljö.

**Kommando:**
```bash
curl -s -o /tmp/dish-test.html -w "%{http_code}\n" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9" \
  -H "Accept-Language: en-US,en;q=0.9" \
  https://dishingouthealth.com/
```

- **HTTP 200 + HTML i `/tmp/dish-test.html`** → fortsätt till Fas 1
- **HTTP 403 / Cloudflare challenge-page** → STOPP. Eskalera till Playwright (`npm i -D playwright && npx playwright install chromium`) eller manuell URL-lista.

Verifiera även att HTML innehåller `<script type="application/ld+json">` med `"@type":"Recipe"` på en sample-receptsida (t.ex. valfri post från startsidans senaste recept).

### Fas 1 — Sitemap-skörd och URL-lista (~10 min)

1. Hämta `https://dishingouthealth.com/sitemap.xml` (eller `sitemap_index.xml` om WordPress YOAST-mönster).
2. Följ sub-sitemaps om indexerat (typiskt `post-sitemap.xml` och/eller `recipe-sitemap.xml`).
3. Bygg en `recipe-urls.txt` med alla recept-URLer.
4. Rapportera total count.

**Output:** `scripts/dish-scrape/recipe-urls.txt` (rå lista)

### Fas 2 — Kategorifiltrering (~10 min Sonnet-tid)

Sonnet sveper igenom URL-listan och plockar bort recept som hamnar i icke-relevanta kategorier baserat på URL-slug + titel-keywords:

**Skippa:**
- `cookie`, `brownie`, `cake`, `frosting`, `cupcake`, `muffin`, `bread`, `bar`, `donut` (baking/dessert)
- `smoothie`, `latte`, `cocktail`, `mocktail`, `drink` (drinkar)
- `granola`, `oatmeal`, `pancake`, `waffle`, `parfait` (frukost)
- `dip`, `sauce`, `dressing`, `condiment` (komponent, inte måltid) — *såvida inte titeln är "X with Y sauce"*

**Behåll:**
- `dinner`, `lunch`, `bowl`, `salad` (om proteininnehåll), `soup`, `stew`, `curry`, `pasta`, `stir-fry`, `sheet-pan`, `chicken`/`salmon`/`beef`/`pork`/`tofu`/`lentil`/`bean`-baserat

**Output:** `scripts/dish-scrape/recipe-urls-filtered.txt` + en kort sammanställning av räknarna ("hoppade över N desserter, M drinkar...").

### Fas 3 — Per-recept-loop (huvudarbete, ~1–3 sek/recept)

För varje URL i den filtrerade listan, sekventiellt (för att inte hammra sajten — 1 req/sek):

1. **Hämta HTML** med samma curl-headers som i Fas 0.
2. **Extrahera JSON-LD** via regex på `<script type="application/ld+json">`. Hitta noden där `@type === "Recipe"` (kan vara nästlad i `@graph`).
3. **Mappa till råstruktur:**
   - `title` ← `name`
   - `servings` ← `recipeYield` (parseInt på första token)
   - `time` ← `totalTime` ISO 8601 → minuter
   - `ingredients` ← `recipeIngredient[]` (rå engelska)
   - `instructions` ← `recipeInstructions[]` (string eller HowToStep.text)
   - `description` ← `description` (om finns, för Sonnet-context)
   - `category` ← `recipeCategory` (för dubbel-filter)
4. **Sonnet-anrop i samma pass utför** (en `messages.create` per recept, `claude-sonnet-4-6`):
   - Översätt `title` till svenska (idiomatiskt — "Garlic Lemon Chicken" → "Citron- och vitlökskyckling", inte ord-för-ord)
   - Översätt + konvertera ingredienser med cheat-sheetet i `docs/research-internationell-import.md` rad 78–345:
     - `1 cup flour` → `2,4 dl vetemjöl`
     - `1 lb ground beef` → `450 g köttfärs`
     - `350°F` → `175°C`
     - `heavy cream` → `vispgrädde` (36%), `baking soda` → `bikarbonat`, `cilantro` → `koriander`
     - Strip prisannotationer (`$0.17*`) om de förekommer
   - Översätt instruktioner — bibehåll numrering och kort steg-format
   - **Sätt `protein`** baserat på huvudingrediens: `fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`
   - **Sätt `tags`:**
     - `vardag30` om time ≤ 30
     - `helg60` om time 31–60
     - Skip helt om time > 60 (lägg i quality-report som "skipped: too long")
     - Lägg till typ-tag: `soppa`/`pasta`/`wok`/`ugn`/`sallad`/`gryta`/`ramen` om titel/instruktion antyder det
     - `veg` om `protein === "vegetarisk"`
   - Lägg till `notes` med `"Källa: <originaltitel>, dishingouthealth.com"`
5. **Dedupe-check:** Innan recept läggs till, normalisera den svenska titeln (lowercase, strip punctuation) och jämför mot existerande titlar i `recipes.json` + redan importerade i denna körning. Vid kollision: skip + logga.
6. **ID-tilldelning:** Använd löpande räknare som börjar på `meta.nextId` från `recipes.json` (idag 63).

**Robusthet:**
- Vid HTTP-fel på enskild URL: logga, hoppa över, fortsätt.
- Vid JSON-LD-parse-fel eller saknat `recipeIngredient`: logga som "skipped: no JSON-LD", hoppa över.
- Vid Sonnet-fel/timeout: spara progress, möjlighet att återuppta från senaste lyckade index.
- **Spara progress var 10:e recept** till `scripts/dish-scrape/progress.json` (lista av {url, status, recipeId}). Möjliggör resume efter Ctrl-C eller fel.

**Throttling:** Minst 1 sek mellan requests (`sleep 1` mellan curl-anrop).

### Fas 4 — Skriv staging + kvalitetsrapport

1. Skriv `recipes-import-pending.json` i exakt samma format som `recipes.json` (egen `meta` + `recipes`-array). Ligger i repo-roten men behandlas som artefakt — committas men flyttas inte automatiskt.

2. Skriv `recipes-import-quality-report.md`:
   - **Sammanfattning:** N hämtade, M filtrerade, K importerade, X dedupe-skippade, Y fel
   - **10 stickprov:** Slumpmässiga svenska recept renderade i komplett form (titel, ingredienser, instruktioner) för manuell läsning
   - **Varningsflaggor:**
     - Recept utan match för någon ingrediens i `NORMALIZATION_TABLE` (potentiellt missad ingrediens-mappning)
     - Recept med >15 ingredienser (kanske dålig parse)
     - Recept med <3 instruktion-steg (kanske trunkerad parse)
     - Recept med konstiga mängder (`0 g`, `NaN`, `undefined`)
     - Titlar som ser maskinöversatta ut (innehåller engelska ord, oavsedda anglicismer)
   - **Kategori-distribution:** Hur fördelar sig importen över protein-typer och tags

3. Lägg till en kort instruktion i rapporten om hur användaren godkänner: "kör `node scripts/dish-scrape/promote.mjs` när du har granskat och vill flytta till recipes.json".

### Fas 5 — Promotion-script (skrivs nu, körs av användaren senare)

`scripts/dish-scrape/promote.mjs`:
- Läser `recipes-import-pending.json` + `recipes.json`
- Appendar pending-recept till `recipes.json`
- Uppdaterar `meta.nextId` och `meta.totalRecipes` + `meta.lastUpdated`
- Tar bort `recipes-import-pending.json` och `recipes-import-quality-report.md`
- Skriver ut: "✓ Importerade N recept. Committa och pusha för att aktivera."

Användaren kör `git add recipes.json && git commit -m "Importera N recept från dishingouthealth.com" && git push` manuellt.

## Setup för lokal körning (ny session ska göra detta först)

1. **Verifiera Anthropic SDK + nyckel:**
   ```bash
   echo $ANTHROPIC_API_KEY | head -c 10  # ska visa "sk-ant-api"
   ```
   Om saknas: hämta från console.anthropic.com och `export` i `~/.zshrc`/`~/.bashrc`.

2. **Installera SDK i scripts-katalogen** (ingen npm-toolchain finns i repo-roten idag):
   ```bash
   cd scripts/dish-scrape && npm init -y && npm i @anthropic-ai/sdk
   ```
   Lägg till `scripts/dish-scrape/node_modules/` + `package-lock.json` i `.gitignore` om de inte redan ignoreras.

3. **Verifiera SDK fungerar:**
   ```bash
   node -e "import('@anthropic-ai/sdk').then(m => console.log('ok', !!m.default))"
   ```

4. **Kör Fas 0-gate** (curl-testet ovan) och bekräfta HTTP 200.

## Filer som skapas

| Fil | Syfte |
|---|---|
| `scripts/dish-scrape/scrape.mjs` | Huvudscript (Fas 0–4) |
| `scripts/dish-scrape/promote.mjs` | Promotion-script (Fas 5) |
| `scripts/dish-scrape/package.json` | För Anthropic SDK |
| `scripts/dish-scrape/recipe-urls.txt` | Sitemap-skörd |
| `scripts/dish-scrape/recipe-urls-filtered.txt` | Efter kategorifiltrering |
| `scripts/dish-scrape/progress.json` | Resume-state |
| `recipes-import-pending.json` | Staging |
| `recipes-import-quality-report.md` | Kvalitetsrapport |

`scripts/dish-scrape/`-katalogen `.gitignore`:as för intermediärer (`node_modules/`, `package-lock.json`, `progress.json`, `recipe-urls*.txt`). Scripts + staging + report committas så de finns kvar i historiken.

## Filer som **inte** rörs

- `recipes.json` — rörs först vid promotion-script
- `api/import-recipe.js`, `js/recipes/recipe-import.js` — befintlig URL-import är oberörd
- Alla frontend-moduler — appen vet inget om denna engångs-operation
- Vercel env vars — Sonnet kör allt lokalt, ingen ny secret behövs

## Återanvänd från befintlig kod (referens, kopiera relevant logik)

- `api/import-recipe.js:142–175` — `mapJsonLdToRecipe()` som mall för JSON-LD → råstruktur
- `api/import-recipe.js:10–20` — `GEMINI_SCHEMA_PROMPT` som referens för fältformat (även om vi inte anropar Gemini — strukturen passar Sonnet-prompten också)
- `docs/research-internationell-import.md:78–345` — komplett enhetskonverteringscheat-sheet
- `api/_shared/shopping-builder.js` — `NORMALIZATION_TABLE` för ingrediens-validering i quality-report

## Verifiering (end-to-end)

1. **Setup-gate:** `ANTHROPIC_API_KEY` finns, SDK installerad, `node`-test passerar.
2. **Fas 0-gate:** `curl`-anropet returnerar 200 och HTML innehåller JSON-LD. Annars STOPP.
3. **Pilot på 5 recept** innan full körning: Sonnet kör Fas 3-loopen för 5 manuellt utvalda URLer, dumpar resultatet till en mini-staging, kontrollerar att svenskan är idiomatisk och konverteringen rimlig. Sonnet bedömer själv ("ser ok ut" → fortsätt; "konverteringen är fel" → stoppa och rapportera).
4. **Full körning:** Loop över alla filtrerade URLer, throttling 1 req/sek, progress sparas var 10:e recept.
5. **Efter körning:** Validera att `recipes-import-pending.json` parsar som JSON och att varje recept har alla obligatoriska fält (`id`, `title`, `servings`, `time`, `ingredients`, `instructions`, `protein`, `tags`).
6. **Quality-report ska finnas** med minst 10 stickprov och alla varningssektioner.
7. **Manuell verifiering nästa morgon:** Användaren öppnar quality-rapporten, läser stickprov, beslutar promote/discard.
8. **Efter promotion:** Användaren öppnar appen, kontrollerar att recipes.json laddas (62 → ~262 recept), genererar en testveckoplan för att se att nya recept kan väljas.

## Risker och mitigeringar

| Risk | Mitigering |
|---|---|
| Cloudflare blockerar trots browser-UA (även lokalt) | Fas 0 fångar detta innan vi spenderar tokens; eskalera till Playwright |
| Sonnet-översättning hallucinerar mängder | Quality-report flaggar `0 g`/`NaN`/saknade matches; pilot på 5 fångar systemfel |
| Sajten har inkonsekventa JSON-LD-fält | Per-recept try/catch — enskilda fel pausar inte hela körningen |
| Dubletter mot befintliga 62 recept | Titel-normaliserad dedupe-check innan ID-tilldelning |
| Token-kostnad skenar | Per-recept-prompt hålls under ~3 KB input, ~2 KB output. 300 recept × 5 KB = ~1.5M tokens. Sonnet 4.6: ~$5 totalt. "Billigt natt-jobb" håller. |
| Sonnet timeout mitt i körning | Progress sparas var 10:e recept, resume från senaste index |
| Skadar befintlig recipes.json | Staging-flöde gör att recipes.json aldrig rörs förrän användaren godkänner |
| Lokala node_modules committas av misstag | Lägg till i `.gitignore` innan första körningen |

## Vad som händer i den nya lokala sessionen

1. Verifiera setup (ANTHROPIC_API_KEY + SDK)
2. Skriva `scripts/dish-scrape/scrape.mjs` och `promote.mjs`
3. Köra Fas 0-gate (curl-test) **från lokalmiljön**
4. **Vid grönt ljus:** Köra Fas 1–4 fullt ut, vilket kommer ta 30–90 min beroende på recept-antal
5. Committa staging-fil + quality-report till feature-branchen `claude/scrape-dishingouthealth-recipes-gwRU5`
6. Pusha
7. Lämna ett kort end-of-job-meddelande med länk till quality-report och instruktioner för promotion

`recipes.json` rörs **inte** av Sonnet. Användaren tar det sista steget manuellt.

## Bakgrund: varför lokal körning, varför Sonnet (inte Gemini)

**Lokal körning** valdes efter att sandbox-allowlisten i den webbaserade Claude Code-sessionen 403:ade `dishingouthealth.com` ("Host not in allowlist" — inte ett Cloudflare-block från sajten utan en sandbox-restriktion). Lokal Mac-miljö har inga sådana host-restriktioner, ger neutralare IP-rykte mot eventuella Cloudflare-checks, och slipper risk för session-disconnect under långkörning.

**Sonnet (inte Gemini)** valdes uttryckligen i frågesvaret 2026-05-03: bättre svensk översättning, framför allt på recept-titlar. Gemini Flash är gratis men klumpigare på idiomatisk svenska. Vid en 300-recept-import är skillnaden i översättningskvalitet betydligt viktigare än ~$5 i Sonnet-kostnad. (Tidigare svar från denna assistent som föreslog Gemini efter beslutet om lokal körning var ett misstag — körningsplats är ortogonal mot motorval, och användarens explicita Sonnet-val gäller fortfarande.)

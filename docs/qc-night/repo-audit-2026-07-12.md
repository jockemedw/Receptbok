# Nattaudit 2026-07-12 — fullständig bugg- & UX-granskning

**Uppdrag:** hitta *alla* buggar och användarupplevelse-fel i hela repot (rapport-only — inga kodfixar utan Joakims OK).
**Metod:** 7 vågor med ~230 agenter: statiskt kontraktssvep → 16 Sonnet-finders per kodslice → 6 UX-linser (touch, mörkt tema, feltillstånd, a11y, flöden, Playwright-smoke) → 4 Opus-säkerhetsagenter (auth/CORS/secrets, XSS-djup, live RLS-audit, felvägar) → Opus-skeptiker som adversariellt verifierade **varje** råfynd → 5 extra linsrundor (datum/tidszon, samtidighet, PWA, copy, prestanda, minnesläckor, offline, validering, state, auth-livscykel, markup, testluckor, dispatch, import, felkontrakt, arkiv/skafferi, numerik, DB-kontrakt, sortering, wizard-extremer) → completeness-critic + 4 ikapp-granskningar, inkl. **korpus-körning av inköpspipelinen mot alla 264 verkliga recept** och **live-SQL mot Supabase** (RLS, kolumnkontrakt).
**Kvalitetsgaranti:** inget fynd i rapporten utan Opus-verifierat fil:rad-bevis + konkret repro. 28 råfynd motbevisades/dedupades bort; severity omprövades hårt (12 påstådda P0 kokade ner till 2 äkta). Kända buggar ur `docs/status.md` är exkluderade.
**Baslinje:** hela testsviten GRÖN före granskningen.
**Fullständig fynddata:** `docs/qc-night/audit-verified.json` — alla 313 poster med evidence, repro, fixförslag, storlek (XS<15 rader, S<50, M<200, L större) och domslut. Rapporten refererar fynd via id (F001–F313).

## Slutsiffror

| Severity | Antal | Innebörd |
|---|---|---|
| **P0** | **2** | förstör data / blockerar kärnflöde / säkerhetshål |
| **P1** | **48** | fel som användaren märker |
| **P2** | **235** | polish & härdning |

**Det friska först:** inga trasiga `window.*`-kontrakt, inga döda selektorer, versionsbump-konventionen konsekvent, `api/` exakt 12 filer, RLS-policyerna följer household-mallen på alla riktiga tabeller, recept-kolumnkontraktet mot live-DB håller exakt (invariant #2 intakt, `data-mapper.js` = live-schemat), alla upsert-`onConflict` matchar verkliga constraints, och `activate_plan_atomic`-RPC:n finns och används. Fyndlistan domineras i stället av två systematiska **mönster**: (A) *tyst svalda Supabase-fel* i skrivande endpoints och (B) *full-state-skrivningar/cachade id:n som inte tål samtidighet eller list-byten*.

---

## P0 — åtgärdas först

### P0-1 · F089 · Custom-day-skyddet i genereringen slås ut av ett svalt läsfel
`api/generate.js:372` — guarden som skyddar egna dagar (`plan_id NULL`, **invariant #1**) läser befintliga custom-dagar utan att kontrollera `error`. Vid transient DB-fel (nätverkshicka, free-tier-väckning) blir listan tom, guarden tror att inga custom-dagar finns — och genereringen kan skriva över dem. **Fix (XS):** kasta vid `error` så genereringen avbryts oskadd.

### P0-2 · F215 · Backup-tabell utan RLS, läsbar/raderbar med publika anon-nyckeln
Live-DB har `public.recipes_qc_backup_20260607` (rest från qc-arbetet 7 juni, ingen migration styr den) med **RLS AV och fulla anon-grants**. Vem som helst som plockar anon-nyckeln ur frontend-koden kan läsa och radera tabellen — receptdata exponeras utanför RLS-skyddet. **Fix (XS, kräver ditt OK — skrivande DDL):** `DROP TABLE` (backupen är 5 veckor gammal och recepten lever i `recipes`), alternativt `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + revoke.

---

## P1 — fel användaren märker (48, grupperade per tema)

### Tema A — tyst svalda DB-fel i skrivande endpoints (8 fynd, alla XS–S)
Samma mönster som P0-1, i alla kärnendpoints: en Supabase-läsning/skrivning destruktureras utan `error`-koll, så transienta fel maskeras som "tomt" eller "lyckat".
- **F006** `api/confirm.js:30` — receptläsningen vid bekräftelse: fel → planen bekräftas med **tom inköpslista**.
- **F011** `api/confirm.js:42` — överföring av manuella varor + bockar vid bekräftelse: fel → familjens egna varor tappas tyst.
- **F012** `api/confirm.js:109` — `confirmed_at`-skrivningen är fire-and-forget: fel → klienten tror planen är bekräftad, DB säger inte.
- **F013/F221** (dubblett, samma rot) `api/generate.js:89` — `fetchExistingShoppingList` maskerar fel som "ingen lista" → manuella varor + bockar försvinner vid regenerering.
- **F005** `api/replace-recipe.js:112` — receptbytets skrivningar okontrollerade → 200 OK även när inget sparades.
- **F007** `api/replace-recipe.js:128` — listombyggnaden efter byte läser `meal_days` utan felkoll → transient fel kan ersätta aktiva listan med en tom.
- **F313** `api/swap-days.js:110` — plan-gränsernas persist-fel sväljs; svaret returnerar ett spann som aldrig sparades.

**Gemensam fix:** destrukturera `{ data, error }` och kasta — handler.js översätter redan till begripligt svenskt fel. Ett svep över alla ställena är en förmiddag.

### Tema B — plan-livscykelns integritet (6 fynd)
- **F219** (M) `api/generate.js:200` — regenerering flyttar aktiva planens dagar UT ur den atomära aktiveringen; ett fel i `activatePlanAtomic` kan lämna en **tom aktiv plan** (invariant #1-risk). Fix: skicka nya meal_days-raderna som RPC-parameter så allt sker i EN transaktion.
- **F232** (M) `api/generate.js:202` — två samtidiga genereringar (två enheter) kan lämna hushållet med aktiv plan **utan meal_days**; båda svarar 200. Fix: `pg_advisory_lock` per hushåll.
- **F312** (M) `api/swap-days.js:54` — "Byt dag" saknar helt `sameRecipes()`-vakten som move/skip har; samtidiga byten kan tappa+dubblera recept i planen. Fix: RPC-transaktion + multiset-assert.
- **F090** (S) `api/generate.js:162` — gamla planens dagar raderas ovillkorligt per plan_id men bara dagar före nya startdatumet arkiveras → en kortare/närmare regenerering kastar oarkiverade dagar.
- **F194** (S) `api/generate.js:116` — regenerering förstör nuvarande (även bekräftad, handlad) plan **utan förvarning i UI:t**. Fix: confirmDialog i wizarden när bekräftad plan finns.
- **F024** (S) `js/weekly-plan/plan-viewer-deluxe.js:460` — "Byt dag" tillåter byte mot gammal egen-planeringsdag i det förflutna → planens spann dras bakåt i historiken.

### Tema C — inköpslistans bockar & samtidighet (5 fynd)
- **F229/F244/F252** (S, ett rotfel i tre konsekvenser) `js/shopping/shopping-list.js:316–322` — `scheduleCheckedSave` skriver **hela listans absoluta bock-status** i stället för deltat: (1) skriver över partnerns samtidiga bockningar med `checked:false`, (2) O(N) radskrivningar + N realtime-events per tryck, (3) stale klient efter nättapp raderar partnerns bockar i DB. Fix: `_pendingChecks`-Map med bara togglade rader (mönstret finns redan i `lists-view.js`).
- **F230** (S) `shopping-list.js:63` — no-op-UPDATE:arna på manuella rader triggar full omladdning med `_preserveChecked=false` på ALLA enheter → pending bockar tappas.
- **F035** (S) `shopping-list.js:322` — manuella varors bockar sparas aldrig (nyckel-mismatch index vs namn).

### Tema D — stale list-id efter list-byte (3 fynd)
- **F036** (S) `shopping-list.js:747` — `ensureActiveShoppingList` litar på cachat (kan vara inaktivt) list-id efter receptbyte/ny matsedel → ny vara hamnar osynlig i avaktiverad lista.
- **F057** (S) `js/today/today-view.js:364` — Idag-flikens snabbtillägg, samma rotorsak.
- **F038** (M) `shopping-list.js:30` — realtime-prenumerationen är bunden till specifikt list-id och migreras aldrig vid list-byte. Fix (för alla tre): låt list-bytande endpoints returnera nya listId + re-subscribe, eller prenumerera hushållsskopat.

### Tema E — realtime-synk (4 fynd)
- **F287** (XS!) `js/weekly-plan/plan-viewer.js:26` — **`meal_days` och `shopping_items` ingår inte i `supabase_realtime`-publikationen i live-DB** — matsedelns och inköpslistans realtime-synk är död i produktion; koden prenumererar på events som aldrig kommer. Fix: idempotent migration `ALTER PUBLICATION supabase_realtime ADD TABLE ...` (kräver ditt OK). *Detta förklarar sannolikt varför "andra enheten uppdateras inte" — värt att fixa först av allt i temat.*
- **F231** (S) `plan-viewer.js:27` — realtime-events släpps permanent under interaktionslägen/4s-ekofönstret utan uppskjuten omhämtning → stale veckovy.
- **F259** (S) `plan-viewer.js:28` — övergivet "Byt middag"/"Välj recept"-läge vid flikbyte stänger av all plansynk och lämnar ett beväpnat Välj-läge.
- **F029** (XS) `js/lists/lists-view.js:205` — `flRenameInput` saknas i KEEP_FIELDS → realtime-refresh kapar pågående namnbyte.

### Tema F — inköpsparsningen mot verkliga recept (4 fynd, korpus-bevisade)
- **F306** (S) `api/_shared/shopping-builder.js:543` — "soltorkade tomater i olja" normaliseras till **rapsolja** (token-fallback träffar vätskan) och mergas med stekoljan — varan försvinner spårlöst. 6 recept i korpusen drabbas.
- **F307** (XS) `:522` — "krossade/passerade tomater" stemmas till **färsk tomat** och mergas fel; 14 verkliga rader i 14 recept.
- **F308** (XS) `:448` — "vispgrädde (36%)" tolkas som mängden 36 → listraden "grädde (36)"; 2 recept.
- **F270** (S) `:481` — decimalkomma i oparsead text tolkas som satskomma + "X till Y"-intervall stöds inte → skräpposten "till 7 (4,8)".

### Tema G — prisoptimering & Willys-siffror (3 fynd)
- **F290** (M) `api/willys-offers.js:137` — `savingPerUnit` blandar kr/st och kr/kg → besparingar för viktprissatta varor (kött/fisk) är fel i hela kedjan (deals-listan, plan-besparingen, dispatch-valet).
- **F292** (M) `api/_shared/willys-cart-client.js:45` — flerköps-erbjudanden ("2 för X") räknas som besparing men dispatchas med qty 1 → reapriset utlöses aldrig i korgen.
- **F195** (S) `js/weekly-plan/prisoptimera.js:266` — Prisoptimera/"Veckans fynd" byter recept på bekräftad plan utan varning och nollställer bockade varor.

### Tema H — generering & wizard (2 fynd)
- **F295** (S) `api/_shared/select-recipes.js:89` — proteintoggle "endast Vegetarisk" gör generering **omöjlig**: `vegOk` utesluter kategoriskt veg-recept på icke-veg-dagar, även i alla fallbacks. Fix: preflight med begripligt 400 eller behandla alla dagar som veg-dagar.
- **F051** (S) `js/weekly-plan/plan-generator.js` — Blockera-dag-togglen sparar aldrig: rebuild direkt efter varje klick tappar `blocked`-klassen.

### Tema I — dispatch-flödet (3 fynd)
- **F078** (XS) `js/shopping/dispatch-ui.js:29` — ingen spärr mot dubbel dispatch mellan modal-stängning/återöppning → varor kan läggas dubbelt i skarpa korgen.
- **F076** (S) `js/shopping/dispatch-preferences.js:49` — AI-inköpsprompten respekterar inte skafferiet ("har hemma") — ber agenten köpa varor familjen äger.
- **F077** (S) `dispatch-preferences.js:15` — misslyckad preferensladdning + valfri redigering **skriver över** tidigare sparade preferenser.

### Tema J — import (2 fynd)
- **F067** (XS) `js/recipes/recipe-import.js:137` — importförhandsvisningen är osynlig (modalen får aldrig `.open`-klassen). *Blockerar troligen hela import-förhandsflödet — testa live.*
- **F197** (S) `recipe-import.js:137` — stängd import-sheet avbryter inte requesten; receptredigeraren kan poppa upp över vad som helst senare.

### Tema K — custom-dagar (3 fynd)
- **F042** (XS) `js/weekly-plan/plan-viewer.js:326` — custom-day-val markeras optimistiskt som sparat även när skrivningen tyst hoppar över.
- **F043** (XS) `plan-viewer.js:824` — `postCustomDays` no-op:ar tyst vid kollision med plan-dag.
- **F255** (XS) `plan-viewer.js:851` — tomt "Spara notering"-tryck skapar innehållslös egen-dag som genereringen sedan bevarar.

### Tema L — app-skal & övrigt (6 fynd)
- **F162** (S) `js/app.js:33` — "appen har vilat"-beskedet visas bara i (dolda) Recept-fliken; Idag-fliken visar falskt "ingen matsedel".
- **F196** (M) `js/app.js:88` — ingen hantering av Android/browser-bakåtknappen — klassisk PWA-fälla: bakåt stänger inte sheets/modaler utan lämnar appen.
- **F083** (XS) `js/supabase-client.js:97` — auth-gaten återvisas aldrig om sessionen går ut mitt i användning.
- **F266** (XS) `css/styles.css:3700` — import-FAB:en (z-index 900) flyter ovanpå öppna bottom-sheets (200) och stjäl tryck.
- **F212** (S) `js/weekly-plan/plan-viewer-deluxe.js:1090` — handrullad attr-escaper missar backslash → lagrad XSS via recepttitel i day-sheetens onclick (utils.jsStringAttr finns redan — använd den; även today-view.js:20 och plan-viewer.js:769).
- **F182** (S) `js/weekly-plan/prisoptimera.js:98` — deal-grupperna är tangentbords-oåtkomliga divar och checkboxen 24px.

---

## Rekommenderad åtgärdsordning

1. **P0-1 + Tema A i ett svep** (error-koll-mönstret, ~9 ställen, alla XS–S) — störst dataintegritetsvinst per timme.
2. **P0-2 + F287** (två små DB-migrationer, kräver ditt OK för DDL) — stänger säkerhetshålet och väcker realtime-synken.
3. **Tema C+D** (bock-delta + list-id) — vardagsfriktionen för er två i butiken.
4. **Tema F** (parser-fixar, XS–S med korpus-bevis) — direkt synligt på varje inköpslista.
5. **Tema B** (plan-livscykel, M-storlekar) — viktigast före M1 när främmande hushåll genererar samtidigt.
6. Resten efter behov; P2-bilagan är sorterad per område.

## Kräver live-verifiering (kan inte avgöras statiskt)

- **Willys-formatberoenden:** `willys-search.js`/`willys-cart-client.js` antar privata JSON-fält (`outOfStock`, `productLine2`, `priceValue` …) — kör en riktig `/api/deals` + dispatch och bekräfta att formaten fortfarande parsas.
- **Extremgenerering mot riktiga korpusen:** maxdagar + alla-veg + proteintoggle (F295-scenariot) på live.
- **F067:** öppna import-förhandsvisningen på mobilen — syns den?
- **Skärmläsartest** av fel-toasts (P2-fynd: role=alert i polite-host).
- **F287:** efter publikationsmigrationen — verifiera att två enheter ser varandras bockar/plan-ändringar live.

## Metodnoter

- Loop-until-dry nådde inte formell torrhet (2 tomma rundor) på 5 rundor — linsrymden är i praktiken obegränsad; i stället stängdes täckningen med completeness-critic + riktade ikapp-granskningar (swap-days.js, feedback.js, korpus-körning, kolumnkontrakt — critic:ns samtliga körbara luckor exekverades).
- Playwright-smoke kördes headless mot UI:t utan inloggning (auth-gaten begränsar djupet); flödestesterna är statiskt verifierade.
- Testsvitens blinda fläckar (bl.a. `tests/plan-orchestration.test.js`/`day-ops.test.js` är INTE kopplade till Edit-hookarna i `.claude/settings.json` — en dag-ops-regression fångas inte vid Edit) ligger som egna P2-fynd.
- Fyndtäthet ≠ kodkvalitet: 313 poster efter ~230 agenter över hela kodbasen på en natt är normal skörd för en första heltäckande audit; de flesta är XS/S-härdningar.

---

# Bilaga: P2-fynd (235) per område

*(id → detaljer i `audit-verified.json`; "(troligt)" = PLAUSIBLE, dvs. runtime-beroende)*

### api/ (endpoints) (51 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F297 | `api/generate.js:342` | Generering bakåt i tiden är tillåten (datumväljaren saknar min, servern saknar dåtidsspärr) — skriver över redan ätna dagar utan arkivering och förfalskar recep | S |
| F296 | `api/generate.js:387` | Veg-dagar saknar tillgänglighetskontrollen som Ture-dagar har — fler veg-dagar än veg-recept ger vagt 500-fel i stället för skräddarsytt 400 | XS |
| F097 | `api/confirm.js:39` | Race mellan confirm.js och discard-plan.js på samma plan kan lämna en 'bekräftad men raderad' plan med en föräldralös aktiv inköpslista *(troligt)* | S |
| F100 | `api/confirm.js:102` | Avaktivering av gammal inköpslista är ofelsökt — kan lämna två aktiva listor samtidigt | XS |
| F101 | `api/confirm.js:125` | confirm.js svar-payload weeklyPlan.days saknar date/recipe/blocked — annat format än toWeeklyPlan() i move-day/swap-days/skip-day | XS |
| F220 | `api/deals.js:34` | Live-prisflödet (deals.js) har NOLL degraderingsdetektion — larmbanner + notifyAlert är kopplade enbart till ett dött kodavsnitt | S |
| F285 | `api/deals.js:35` | Willys-hämtningen i deals/willys-offers/dispatch saknar egen timeout — en hängande Willys-socket slutar som rå plattforms-504 i stället för endpointens svenska  *(troligt)* | XS |
| F016 | `api/deals.js:106` | Prisoptimera step-2 recipe fetch is unchecked — a DB failure is indistinguishable from 'no recipes use this rea item' | XS |
| F010 | `api/discard-plan.js:32` | discard-plan's meal_days delete and weekly_plans deactivate are unchecked and uncoordinated — a partial failure leaves an active plan with zero days, or a disca *(troligt)* | XS |
| F124 | `api/dispatch-to-willys.js:71` | Ingen idempotensspärr mot dubbel dispatch — timeout+retry dubblerar varorna i den riktiga Willys-korgen *(troligt)* | M |
| F168 | `api/dispatch-to-willys.js:86` | Willys-utskicksfelet exponerar tekniska termer ('cookies', 'Vercel') till familjemedlemmen som handlar | XS |
| F242 | `api/dispatch-to-willys.js:116` | Dispatch-felmeddelanden läcker utvecklarjargong ('dispatch', 'Vercel') rakt in i modalen | XS |
| F226 | `api/dispatch-to-willys.js:224` | Ingen dubbel-dispatch-spärr — två klick fyller Willys-korgen dubbelt; delmängdsfel rapporteras dock korrekt | M |
| F131 | `api/dispatch-to-willys.js:226` | Klientens "tom lista"-koll baseras på potentiellt inaktuell lokal state — ett annat familjemedlems tömning på en annan enhet ger en missvisande "ingen matchning *(troligt)* | S |
| F126 | `api/dispatch-to-willys.js:243` | Ingen deduplicering av matchade produktkoder innan de skickas till Willys — två olika canon-namn som matchar samma produkt ger dubbel vara i korgen *(troligt)* | XS |
| F127 | `api/dispatch-to-willys.js:335` | Cookie-utgång mitt i en dispatch (efter att några varor redan lagts till) klassas som vanliga "missing"-varor, inte som auth_expired — ingen larmnotis skickas,  *(troligt)* | S |
| F017 | `api/dispatch-to-willys.js:349` | fetchShoppingListFromSupabase's reads are unchecked — a DB read failure is reported to the family as 'no matching products' instead of a real error | XS |
| F130 | `api/dispatch-to-willys.js:349` | Ingen ORDER BY på "aktiv" inköpslista — om fler än en lista råkar vara markerad aktiv för hushållet blir valet av lista odeterministiskt *(troligt)* | XS |
| F275 | `api/dispatch-to-willys.js:366` | Willys-dispatchen skickar även avbockade varor — 'checked'-status i shopping_items ignoreras, till skillnad från ALLA andra inköpsutgångar (kopiera-lista, AI-pr | XS |
| F128 | `api/dispatch-to-willys.js:391` | Inköpspreferenser läses via CDN-cachad readFileRaw — en nyss sparad preferens (blockerat varumärke, eko/svenskt) kan ignoreras i upp till ~60 sekunder vid dispa *(troligt)* | XS |
| F014 | `api/generate.js:66` | fetchHistory ignores the Supabase error, silently degrading the 14-day repeat-avoidance filter | XS |
| F222 | `api/generate.js:66` | fetchHistory ignorerar frågefel → tomt recency-fönster → matsedeln upprepar nyligen använda recept utan synligt fel | XS |
| F092 | `api/generate.js:260` | JS fallback plan-activation swallows archiveOldPlan errors and still activates the new plan, and archiveOldPlan itself doesn't check the days-to-archive SELECT' | XS |
| F225 | `api/generate.js:260` | activatePlanAtomic-fallbacken sväljer archiveOldPlan-fel → icke-atomär väg kan lämna oarkiverade/överlevande gamla meal_days tyst (latent tills RPC saknas) | XS |
| F223 | `api/generate.js:265` | saveHistoryToSupabase kontrollerar aldrig upsert-felet → recepthistorik registreras tyst inte → framtida upprepningar | XS |
| F015 | `api/generate.js:271` | saveHistoryToSupabase's upsert result is completely discarded — recipe-history writes can fail with zero observability | XS |
| F094 | `api/generate.js:271` | recipe_history upsert result is never inspected — a failed write silently stops recipes from being excluded from repeats | XS |
| F209 | `api/generate.js:327` | Ingen rate limiting på generate — tung skriv-/utboundsspam | M |
| F095 | `api/generate.js:357` | vegetarian_days/ture_days/untested_count are clamped against total span length, not against the actual number of days the generator will fill | XS |
| F224 | `api/generate.js:507` | Inköpslistan skrivs EFTER planaktivering — kastar den, får klienten 500 fast planen redan bytts; klienten kan inte skilja 'lyckades' från 'trasigt' | S |
| F093 | `api/generate.js:508` | A shopping-list write failure after the plan is already activated reports a generic total failure, even though the matsedel itself already changed | S |
| F208 | `api/import-recipe.js:61` | Ingen rate limiting på Gemini-drivna endpoints (import-recipe) — kvotutmattning | M |
| F283 | `api/import-recipe.js:61` | Receptimporten är i onödan hårdkopplad till GITHUB_PAT via createHandler — PAT-utgång/rotation fäller import med förvirrande GitHub-fel | XS |
| F119 | `api/import-recipe.js:155` | isForeignUrl testas mot ursprungs-URL:en, inte den slutliga URL:en efter omdirigeringar | XS |
| F122 | `api/import-recipe.js:165` | Missvisande felmeddelande när GOOGLE_API_KEY saknas via URL-importvägen döljer den verkliga orsaken (jämfört med foto-vägen) | XS |
| F282 | `api/import-recipe.js:198` | extractJsonLd missar recept vars @type är en array — giltig JSON-LD faller i onödan ner till Gemini-fallbacken | XS |
| F116 | `api/import-recipe.js:211` | Ingen validering att importerat JSON-LD-recept faktiskt har ingredienser/instruktioner innan 200 OK returneras | XS |
| F115 | `api/import-recipe.js:243` | Protein för utländska (icke-.se) JSON-LD-recept beräknas på oöversatt text — nästan alla får fel protein='vegetarisk' | S |
| F120 | `api/import-recipe.js:273` | postProcessForeignRecipe sväljer alla fel tyst utan loggning — misslyckad översättning syns varken för användare eller i serverloggar | XS |
| F114 | `api/import-recipe.js:327` | Gemini-retryns totala timeout-budget (upp till 50s) överskrider Vercels maxDuration (30s) för denna endpoint | S |
| F211 | `api/import-recipe.js:341` | Gemini-upstreamens felmeddelande vidarebefordras ordagrant till klienten | XS |
| F117 | `api/import-recipe.js:342` | Rått engelskt Gemini/Google-felmeddelande kan visas ordagrant för användaren — bryter mot regeln om svenska, teknikfria felmeddelanden | XS |
| F123 | `api/import-recipe.js:349` | Den 'polerade' quota-överbelastningstexten är i praktiken oåtkomlig kod | XS |
| F118 | `api/import-recipe.js:373` | `recipe.tags \|\| buildTags(...)` fångar inte tom array — Gemini-recept med tags:[] mister tyst vardag30/helg60-klassning | XS |
| F104 | `api/move-day.js:39` | Ingen låsning/version-kontroll mellan läsning och skrivning i move-day/swap-days/skip-day — samtidiga anrop kan tysta bort varandras ändring | L |
| F102 | `api/replace-recipe.js:53` | 'Idag'/cutoff-datum beräknas i UTC (toISOString) — kan bli fel dag runt svensk midnatt | S |
| F099 | `api/replace-recipe.js:119` | recipe_history skrivs redan vid 'byt recept'-klick i en obekräftad plan — övergivna mellansteg städas aldrig bort | S |
| F112 | `api/shopping.js:9` | get_preferences sväljer ALLA fel från readFileRaw (även nätverks-/autentiseringsfel) utan loggning — visar tyst standardinställningar | XS |
| F210 | `api/shopping.js:15` | set_preferences skriver ovaliderad klient-JSON till git-repot via GITHUB_PAT | XS |
| F313 | `api/swap-days.js:110` | Plan-gränsernas persist-fel sväljs tyst — svaret returnerar ett spann som aldrig sparades, DB och klient divergerar | XS |
| F228 | `api/willys-offers.js:153` | new Date(promo.validUntil).toISOString() kastar RangeError på oparsebar validUntil — EN trasig kampanjrad fäller hela offers-pipelinen, inkl. hela Willys-dispat *(troligt)* | XS |

### api/_shared (delad backend-logik) (21 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F138 | `api/_shared/alert.js:18` | notifyAlert returnerar true även om webhooken svarar med HTTP-fel | XS |
| F129 | `api/_shared/github.js:45` | writeFile:s "3-försöks retry" täcker bara HTTP 409 — ett transient fel vid SHA-läsningen ger ett omedelbart, oåterhämtat fel redan på första försöket | XS |
| F139 | `api/_shared/handler.js:10` | userMessage maskerar avsiktliga svenska felmeddelanden från custom Error-subklasser | XS |
| F140 | `api/_shared/handler.js:54` | Miljövariabelnamn läcks till klienten vid konfigurationsfel, före auth-kollen | XS |
| F135 | `api/_shared/history.js:12` | fetchHistory/recentlyUsedIds är död kod som läser den avvecklade recipe-history.json — kolliderar till namnet med de faktiska (Supabase-baserade) funktionerna i | S |
| F113 | `api/_shared/shopping-builder.js:10` | Duplicerad nyckel "rödlökar" i NORMALIZATION_TABLE (rad 10 och rad 169) | XS |
| F271 | `api/_shared/shopping-builder.js:390` | Osynligt mjukt bindestreck (U+00AD) överlever cleanIngredient — 'bryssel­kål' normaliseras/kategoriseras inte och ger dubblettrad i fel kategori | XS |
| F310 | `api/_shared/shopping-builder.js:390` | Suffixet 'för N pers(oner)' strippas inte — skräprader som 'pasta för 4 personer' | XS |
| F106 | `api/_shared/shopping-builder.js:405` | cleanIngredient() "X eller Y"-ombyggnad tappar ordet efter "eller" helt när det inte finns någon text/mängd före adjektivet | XS |
| F105 | `api/_shared/shopping-builder.js:429` | Ovanliga ASCII-bråk (1/8, 1/5, 1/6, 3/8, 5/8, 2/5, 3/5, 4/5, 5/6 …) konverteras aldrig till unicode-glyfer → mängd och namn korrumperas | S |
| F108 | `api/_shared/shopping-builder.js:541` | normalizeName(): token-baklängesskanning (Fallback 2) körs före n-gram-fallbacken (Fallback 3) → fel/ofullständig canon för sammansatta ingrediensrader, kan tap | S |
| F309 | `api/_shared/shopping-builder.js:573` | Kategorisering missar sammansatta ord — fläskkotletter och ost hamnar i Skafferi | S |
| F269 | `api/_shared/shopping-builder.js:577` | categorize() ord-exakt matchning missar sammansatta proteinnamn — riktig fisk/kött hamnar i Skafferi, och testsviten pinnar bara det hårdkodade undantaget kyckl | S |
| F107 | `api/_shared/shopping-builder.js:607` | friendlyRound() saknar golv för dl/cl/l/kg/msk/tsk/cm — neddskalade portioner kan visas som "0 dl" | XS |
| F311 | `api/_shared/shopping-builder.js:617` | Datarad i recept #271 Tikka Masala ger skräpraden 'av något att fylla basen med (400 g)' | XS |
| F110 | `api/_shared/shopping-builder.js:664` | buildShoppingList(): samma ingrediens med IMPLICIT (enhetslös) och EXPLICIT "st"-mängd räknas som olika enheter → hela mängden tappas till en no-amount-rad | XS |
| F109 | `api/_shared/shopping-builder.js:686` | svKey() sorterar ord som börjar på å/ä/ö FÖRE "z"-ord — fel svensk bokstavsordning i inköpslistan | S |
| F141 | `api/_shared/supabase.js:22` | Proxy-wrappern kring db anropar SupabaseClient-metoder med fel 'this' (fungerar idag, men uppgraderingsskört) | XS |
| F133 | `api/_shared/willys-matcher.js:29` | BABY_FOOD_RE fångar bara mönstret 'från N mån/år' — andra vanliga åldersetiketter kan slinka igenom och falskmatcha som riktig ingrediens *(troligt)* | XS |
| F134 | `api/_shared/willys-matcher.js:108` | extractRecipeCanons kraschar (TypeError) om ett ingrediensled inte är en sträng — stänger av prisoptimering för hela hushållet *(troligt)* | XS |
| F132 | `api/_shared/willys-matcher.js:120` | matchRecipe/buildDealCandidates ignorerar blockedBrands och eko/svenskt-preferenser som dispatchen respekterar — visad besparing kan vara ouppnåelig | S |

### js/weekly-plan (matsedel) (29 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F298 | `js/weekly-plan/plan-generator.js:246` | Generera-knappen gör tyst ingenting vid ogiltigt datumintervall — `if (diff < 1 \|\| diff > 15) return;` utan felmeddelande | XS |
| F172 | `js/weekly-plan/deals-popup.js:66` | 'Byt in i matsedeln' i Veckans fynd kan öppna en tom dagväljare utan förklaring om alla dagar är fria/egna/blockerade | XS |
| F008 | `js/weekly-plan/ingredient-preview.js:43` | moveToShoppingList reports success to the user even when the underlying read (and therefore the write) never happened *(troligt)* | XS |
| F001 | `js/weekly-plan/plan-generator.js:` | toggleSettings() references #settingsArrow which no longer exists in the DOM (orphaned handler, latent null-deref) | XS |
| F054 | `js/weekly-plan/plan-generator.js:` | Nätverksfel vid generering visar rått engelskt/tekniskt felmeddelande istället för begriplig svenska | XS |
| F202 | `js/weekly-plan/plan-generator.js:234` | Closing the generation wizard mid-request doesn't cancel generation — it completes and force-navigates the user back anyway | S |
| F241 | `js/weekly-plan/plan-viewer-deluxe.js:15` | Två olika månadsförkortningsformat i samma vy: '3 aug' (egen tabell) vs '3 aug.' (fmtShort/sv-SE med punkt) | ? |
| F028 | `js/weekly-plan/plan-viewer-deluxe.js:51` | Stavfel i RESTER_RE ("kylskåpständning") gör att en rimlig anteckningstext missar rester-ikonen | XS |
| F025 | `js/weekly-plan/plan-viewer-deluxe.js:58` | attr() escapar inte bakstreck innan citattecken — kan trasa sönder onclick-strängen för receptets titel i dag-sheeten | XS |
| F251 | `js/weekly-plan/plan-viewer-deluxe.js:146` | animateWeekChange återställer aldrig _dlxAnimBusy om renderDeluxe kastar i timeout-callbacken — all veckonavigering (svep, hjul, steppknappar) dör permanent *(troligt)* | XS |
| F165 | `js/weekly-plan/plan-viewer-deluxe.js:948` | 'Flytta dag'/'Byt dagar' väljer felaktigt att visa RÅTT felmeddelande framför den svenska fallbacken | XS |
| F142 | `js/weekly-plan/plan-viewer-deluxe.js:1011` | Dagens åtgärder-sheet saknar scroll-lås/touch-action — bakgrunden kan svepas bakom | XS |
| F262 | `js/weekly-plan/plan-viewer-deluxe.js:1168` | Öppen dag-sheet re-renderas aldrig när plandata ändras under den — visar gårdagens sanning efter realtime-uppdatering från annan enhet | XS |
| F026 | `js/weekly-plan/plan-viewer-deluxe.js:1228` | "Lägg till på listan" i dag-sheeten saknar egen busy-spärr — snabb dubbel-Enter kan skapa dubblettvaror på den delade listan | XS |
| F027 | `js/weekly-plan/plan-viewer-deluxe.js:1347` | Renderingsfel i renderDeluxe() tystas till console.error — ingen svensk användarfeedback vid trasig premiumvy *(troligt)* | XS |
| F050 | `js/weekly-plan/plan-viewer.js:22` | unsubscribeMealDays is dead code — the realtime channel is never torn down, so a household switch without a full page reload keeps listening on the old househol | XS |
| F233 | `js/weekly-plan/plan-viewer.js:33` | Realtime-triggade omhämtningar saknar både debounce och senaste-vinner-sekvensering — event-burst ger parallella hämtningar där ett äldre svar kan rendera sist  *(troligt)* | S |
| F248 | `js/weekly-plan/plan-viewer.js:33` | meal_days-realtimehandlern kör odebouncad full loadWeeklyPlan() per rad-event — burst vid partnerns generering ger reload-storm och kan lämna kvar en render av  | S |
| F047 | `js/weekly-plan/plan-viewer.js:92` | buildTimeline's custom-day horizon expansion is overridden by the hard-coded cap, contradicting its own comment | XS |
| F243 | `js/weekly-plan/plan-viewer.js:168` | Custom-dagar (plan_id NULL) städas aldrig och hämtas obegränsat med select('*') vid varje planladdning — tyst trunkering vid PostgREST:s 1000-radersgräns *(troligt)* | S |
| F294 | `js/weekly-plan/plan-viewer.js:232` | Kategoriordningen i 'Veckans ingredienser' bygger på DB-radordning i stället för kanonisk ordning — Mejeri-först garanteras inte och ordningen kan skifta mellan | XS |
| F046 | `js/weekly-plan/plan-viewer.js:268` | selectRecipeForDay has no window._opBusy guard, allowing two concurrent /api/replace-recipe writes for the same day | XS |
| F045 | `js/weekly-plan/plan-viewer.js:442` | modifyDay (freeDay/unfreeDay) calls the module-local renderWeeklyPlanData, not window.renderWeeklyPlanData, so the deluxe view doesn't repaint immediately after | XS |
| F166 | `js/weekly-plan/plan-viewer.js:451` | 'Gör fri dag'/'Ångra fri dag' och 'Kassera förslag' visar rått felmeddelande vid annat än exakt 'Okänt fel' | XS |
| F044 | `js/weekly-plan/plan-viewer.js:632` | confirmPlan() never refreshes the (only) deluxe week view, leaving a stale 'Förslag' badge and no self-correction path | XS |
| F286 | `js/weekly-plan/plan-viewer.js:658` | confirmPlan och selectRecipeForDay kasserar serverns handlingsorienterade svenska felsträngar — permanenta feltillstånd visas som 'prova igen' | XS |
| F053 | `js/weekly-plan/prisoptimera.js:` | prisoptimera.js targetDays() saknar de skyddsfilter (!d.custom / !d.free) som deals-popup.js har i samma funktion — duplicerad logik har divergerat | XS |
| F227 | `js/weekly-plan/prisoptimera.js:175` | Prisoptimera/Veckans fynd erbjuder redan PASSERADE plandagar som mål för 'Lägg in på en dag' — och /api/replace-recipe har ingen dåtidsspärr på servern | XS |
| F260 | `js/weekly-plan/prisoptimera.js:289` | Prisoptimera/Veckans fynd: färsk inköpslista från API-svaret klobbas direkt av stale window._lastShop — 'Veckans ingredienser' visar gamla receptets varor | XS |

### js/shopping (inköp & dispatch) (25 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F277 | `js/shopping/dispatch-preferences.js:32` | savePrefs kollar aldrig res.ok — HTTP-fel (401/500/SHA-konflikt) vid preferenssparning ger noll feedback även med panelen öppen | XS |
| F082 | `js/shopping/dispatch-preferences.js:38` | Sparfel visas i ett element som kan vara osynligt (dolt preferenspanel) — tyst dataförlust utan synlig feedback | XS |
| F193 | `js/shopping/dispatch-preferences.js:117` | 'Inköpspreferenser' collapsible panel button has no aria-expanded | XS |
| F238 | `js/shopping/dispatch-preferences.js:123` | Grammatikfel i Inköpspreferenser: 'Blockade varumärken' ska vara 'Blockerade varumärken' | XS |
| F080 | `js/shopping/dispatch-preferences.js:201` | "Kopiera AI-inköpsprompt"-knappens aktiv/inaktiv-status och eko/svenskt-kategorilistan blir stale efter bockning — knapp kan klickas tyst utan effekt | S |
| F081 | `js/shopping/dispatch-ui.js:30` | Bekräfta-dialogens vara-räkning inkluderar "har hemma"-markerade varor, till skillnad från vad servern faktiskt skickar | XS |
| F237 | `js/shopping/dispatch-ui.js:42` | Pluralfel i räknade strängar: '1 ingredienser', '1 produkter', '1 dagar planerade', '1 rader', '1 grupper' | XS |
| F214 | `js/shopping/dispatch-ui.js:96` | Minor unescaped interpolations: dispatch prefMisses wanted-tags and custom-day day name | XS |
| F276 | `js/shopping/dispatch-ui.js:112` | POST-svaret { featureAvailable: false } (cookies/gist borta vid skickögonblicket) renderas som 'Något gick fel — prova igen om en stund' — ett råd som aldrig ka *(troligt)* | XS |
| F079 | `js/shopping/dispatch-ui.js:117` | Sen dispatch-respons tvingar upp modalen igen även om användaren redan stängt den eller bytt flik | XS |
| F289 | `js/shopping/shopping-list.js:130` | Skafferiet ('har hemma') har ingen synk mellan enheter alls — laddas en gång per flik-laddning, ingen realtime-prenumeration finns och tabellen är inte publicer | S |
| F293 | `js/shopping/shopping-list.js:162` | togglePantryItem upsert kraschar deterministiskt mot befintlig rad — pantry_items saknar UPDATE-policy så ON CONFLICT DO UPDATE nekas av RLS | XS |
| F253 | `js/shopping/shopping-list.js:318` | Debouncade bock-/anteckningsskrivningar flushas aldrig vid pagehide/visibilitychange — bockning som görs precis innan mobilen låses tappas tyst *(troligt)* | S |
| F183 | `js/shopping/shopping-list.js:399` | 'X av Y klara' shopping progress has no aria-live — screen-reader users get no spoken feedback when checking items | XS |
| F175 | `js/shopping/shopping-list.js:548` | Shopping-list item checkbox (the entire 'handla' flow) cannot be operated via keyboard | S |
| F213 | `js/shopping/shopping-list.js:549` | Shopping-list category interpolated unescaped into HTML text, a data-attribute and an inline onclick JS string | S |
| F199 | `js/shopping/shopping-list.js:561` | Manual shopping-list items are keyed by name, not id — duplicate item names cross-wire their checkboxes and the remove button | S |
| F169 | `js/shopping/shopping-list.js:737` | Inköpsfliken visar samma 'ingen lista ännu'-tomläge vid genuina hämtningsfel som vid faktiskt tom lista | XS |
| F009 | `js/shopping/shopping-list.js:750` | ensureActiveShoppingList's existing-list check is unchecked for errors — a transient failure can create a second, ambiguous active shopping list *(troligt)* | XS |
| F040 | `js/shopping/shopping-list.js:750` | ensureActiveShoppingList ignorerar fel från SELECT-frågan efter befintlig aktiv lista — kan skapa dublettlistor vid nätverksfel eller race | S |
| F041 | `js/shopping/shopping-list.js:781` | Position för ny egen vara beräknas klientsidan från array-längd — kan kollidera vid samtidig tillägg från två enheter | S |
| F039 | `js/shopping/shopping-list.js:796` | Dubbla egna varor med samma namn delar bock-nyckel och tas bort/bockas fel via indexOf | S |
| F249 | `js/shopping/shopping-list.js:816` | startManualDrag saknar spärr mot redan pågående drag — andra fingret kapar _manualDrag och lämnar första raden fastfrusen i 'dragging'-läge med läckta pointer-l | XS |
| F018 | `js/shopping/shopping-list.js:929` | clearShoppingList's is_active deactivation is unchecked, unlike the delete right above it — a partial failure can leave a permanently empty 'active' list *(troligt)* | XS |
| F246 | `js/shopping/shopping-list.js:929` | Inaktiverade shopping_lists och deras shopping_items ackumuleras för evigt — ingen städning motsvarande plan_archives 30-dagarstrim | S |

### js/recipes (recept & import) (18 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F245 | `js/recipes/recipe-browser.js:28` | mainIngredientOf() räknas om upp till 11 gånger per recept vid varje omritning (join av hela ingredienslistan + 10 regexar, ingen memoisering) — söktangenter bl | S |
| F174 | `js/recipes/recipe-browser.js:101` | Recipe detail (ingredients/instructions) is completely unreachable via keyboard | XS |
| F180 | `js/recipes/recipe-browser.js:108` | 'Provat / Ej provat' status pill is a non-focusable <span> — cannot be toggled via keyboard | XS |
| F239 | `js/recipes/recipe-browser.js:109` | Samma tested-status har fyra olika etiketter som blandar verben prova/pröva: 'Ej provat', 'Oprövat', 'Provat', 'Oprövade recept' | XS |
| F074 | `js/recipes/recipe-browser.js:281` | toggleTested saknar busy-spärr mot dubbel-tap | XS |
| F075 | `js/recipes/recipe-editor.js:10` | openEditModal ger ingen återkoppling om receptet redan är borttaget/saknas i lokal cache | XS |
| F198 | `js/recipes/recipe-editor.js:29` | Recipe editor has no unsaved-changes warning — a stray tap outside the modal silently discards all edits | S |
| F071 | `js/recipes/recipe-editor.js:70` | parseInt(...) \|\| fallback nollar tyst bort legitimt värdet 0 för tid/portioner | XS |
| F256 | `js/recipes/recipe-editor.js:72` | Taggfältet normaliserar inte skiftläge — 'Vardag30'/'Helg60' gör receptet tyst ovalbart för genereringen, trots att 'Ture' fungerar | XS |
| F073 | `js/recipes/recipe-editor.js:85` | Insert-svarets faktiska DB-rad kastas bort — lokalt state byggs av klientens egen (ovaliderade) kopia | XS |
| F072 | `js/recipes/recipe-editor.js:126` | Full-row overwrite vid spara kan tysta konkurrerande ändringar från annan familjemedlem (t.ex. 'Provat'-togglingen) | M |
| F261 | `js/recipes/recipe-editor.js:131` | Receptnamnbyte uppdaterar aldrig meal_days.recipe_title_snapshot — matsedeln/Idag/dag-sheetens meny visar gamla titeln permanent medan receptvyn visar den nya | S |
| F281 | `js/recipes/recipe-import.js:38` | Fotoimporten stödjer bara EN bild — kokboksrecept över två sidor/uppslag kan inte importeras komplett *(troligt)* | S |
| F280 | `js/recipes/recipe-import.js:50` | Ingen dubblettdetektering vid import — samma recept-URL kan importeras flera gånger och ger dubbletter som kringgår 14-dagarshistoriken *(troligt)* | M |
| F258 | `js/recipes/recipe-import.js:51` | URL-importen avvisar adresser utan http(s)://-prefix utan klientnormalisering — 'www.ica.se/recept/…' ger bara 'Ange en giltig webbadress.' | XS |
| F279 | `js/recipes/recipe-import.js:67` | Ovaliderad Gemini-svarsform kraschar openImportPreview EFTER att importmodalen stängts — importen försvinner spårlöst utan felmeddelande *(troligt)* | XS |
| F070 | `js/recipes/recipe-import.js:70` | Rått/tekniskt felmeddelande visas i stället för svensk text vid nätverksfel eller icke-JSON-svar | XS |
| F278 | `js/recipes/recipe-import.js:137` | Importens säsongsdata (seasons) kastas alltid bort mellan preview och spara — importerade recept får aldrig säsongsviktning | S |

### js/today (Idag-fliken) (8 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F061 | `js/today/today-view.js:41` | Ikväll/I morgon kan visa tom titel om snapshot-titeln saknas trots att receptobjektet finns *(troligt)* | XS |
| F062 | `js/today/today-view.js:164` | weekHtml räknar ut ett eget 'idag' istället för att återanvända renderTodayView:s todayIso | XS |
| F191 | `js/today/today-view.js:188` | 'Hela matsedeln' / 'Alla anteckningar' navigation links are non-focusable <span> elements | XS |
| F060 | `js/today/today-view.js:216` | Prislarm-bannern kollas exakt en gång per sidladdning och blir kvar/inaktuell resten av sessionen | S |
| F063 | `js/today/today-view.js:245` | Fästa lappar rensas till tom lista vid tillfälligt fel istället för att behålla senast kända data | XS |
| F058 | `js/today/today-view.js:310` | Ingen ombild av 'idag'/'imorgon' vid midnatt om Idag-fliken hålls öppen | S |
| F059 | `js/today/today-view.js:336` | 'X middagar kvar · Y veg' blandar 'kvar'- och 'hela veckan'-semantik | XS |
| F056 | `js/today/today-view.js:359` | todayAddItem saknar egen busy-spärr — dubbel Enter kan skapa dubblettvaror | XS |

### js/lists (familjelistor) (6 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F034 | `js/lists/lists-view.js:90` | _decorSupported förblir null (inte true) för ett nyskapat/tomt hushåll — färg/ikon-väljaren visas inte trots körd migration | XS |
| F030 | `js/lists/lists-view.js:161` | Realtime-ekodämpning för family_lists jämför inte color/icon — L3-utseendeändringar från andra enheter tappas tyst | XS |
| F192 | `js/lists/lists-view.js:396` | Family-list checklist items (Listor tab) are non-focusable <li> elements | XS |
| F032 | `js/lists/lists-view.js:753` | flDoImport saknar dubbelklicksspärr — kan skapa dubbla listor+rader vid snabb dubbeltryckning | XS |
| F031 | `js/lists/lists-view.js:827` | flResetChecks avbryter inte pågående debouncad bock-skrivning — en nyss satt bock kan 'återuppstå' efter Nollställ | XS |
| F033 | `js/lists/lists-view.js:860` | flCreateList/flCreateNote rensar inte inputfältet före await och saknar dubbelklicksspärr — dubblettlistor/anteckningar vid snabb dubbelsubmit | XS |

### js/ core & ui (24 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F179 | `js/app.js:88` | No focus management on any sheet/modal: focus never moves in, no focus trap, no return-focus on close | M |
| F086 | `js/app.js:106` | Race: snabb stäng+återöppna av samma bottom-sheet kan lämna den osynlig trots att den är 'öppen' | XS |
| F247 | `js/app.js:110` | closeSheet är inte idempotent — dubbel stängning inom 280 ms-fönstret underflöder openSheetCount och kör scroll-upplåsningen igen med scrollTo(0,0) | XS |
| F085 | `js/app.js:162` | buildTagFilterUI() körs bara en gång vid init — nya taggar dyker aldrig upp i Filter-sheeten förrän omladdning | XS |
| F264 | `js/auth-gate.js:150` | Utgången/förbrukad återställningslänk (#error=otp_expired i URL-hashen) sväljs tyst — användaren möts av ett omärkt inloggningsformulär | S |
| F265 | `js/auth-gate.js:155` | requireAuth() kastar bort getSession()-felet — 'appen har vilat'-beskedet når aldrig den utloggade väckningsvägen, gaten visar ett omotiverat inloggningskrav *(troligt)* | XS |
| F263 | `js/auth-gate.js:161` | Inloggningsgaten fastnar över en redan återställd session — requireAuth-lyssnaren matchar aldrig TOKEN_REFRESHED *(troligt)* | XS |
| F088 | `js/supabase-client.js:55` | household_id-cachen i localStorage revalideras aldrig mot servern | S |
| F163 | `js/supabase-client.js:86` | Ingen timeout på de inledande Supabase-anropen — spinnrarna på Idag/Matsedel/Recept kan hänga för evigt utan felmeddelande *(troligt)* | S |
| F284 | `js/supabase-client.js:86` | Alla /api/*-anrop är rot-relativa utan konfigurerbar API-bas — hela orkestreringslagret är dött på GitHub Pages-backupen *(troligt)* | S |
| F250 | `js/ui/cook-mode.js:13` | Wake lock-race: acquireWakeLock som fullbordas efter closeCookMode lämnar skärmlåset aktivt utan ägare — skärmen släcks aldrig fast matlagningsläget är stängt | XS |
| F291 | `js/ui/cook-mode.js:44` | Matlagningslägets portionsskalning hoppar tyst över alla bråkglyf-mängder (½, ¾, 1½ …) — blandade recept skalas halvvägs | S |
| F064 | `js/ui/cook-mode.js:100` | Portionsstepper hoppar över steg när startvärdet ligger över taket på 12 *(troligt)* | XS |
| F065 | `js/ui/cook-mode.js:105` | Progressetiketten antar sekventiell avbockning men steg kan bockas i valfri ordning | S |
| F190 | `js/ui/cook-mode.js:145` | Cook-mode ingredient/step checklist items are non-focusable <li> elements | S |
| F173 | `js/ui/cook-mode.js:187` | Matlagningsläget visar en tom stegsektion utan förklaring om receptet saknar instruktioner | XS |
| F303 | `js/ui/feedback.js:14` | Fel-toast med role=alert nästlas i aria-live=polite-host — annonsering kan bli fördröjd/utebli *(troligt)* | S |
| F301 | `js/ui/feedback.js:73` | aria-modal=true men bakgrunden görs aldrig inert — skärmläsare kan navigera ut, och body-scroll låses inte | S |
| F299 | `js/ui/feedback.js:88` | confirmDialog saknar focus trap — Tab lämnar dialogen till bakgrunden | S |
| F300 | `js/ui/feedback.js:89` | Fokus återställs aldrig till triggern när dialogen stängs | XS |
| F302 | `js/ui/feedback.js:102` | Två samtidigt öppna dialoger: Escape avbryter båda och overlays staplas *(troligt)* | S |
| F066 | `js/ui/scroll.js:34` | Scrolla-till-topp-knappen respekterar inte prefers-reduced-motion | XS |
| F240 | `js/utils.js:43` | timeStr visar recepttid med engelsk decimalpunkt ('1.5 h') medan resten av appen använder svenskt komma | ? |
| F084 | `js/utils.js:44` | timeStr() tappar timeNote om den inte börjar med '+' — döljer t.ex. ugnstemperatur | XS |

### CSS & markup (37 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F185 | `css/styles.css:86` | --text-muted (#7d8579 on #f5f1e8) is ≈3.4:1 — fails WCAG AA 4.5:1, used for small secondary text throughout the app | M |
| F145 | `css/styles.css:369` | Sök-fältets ×-knapp (search-clear) är ~27px, under 44px | XS |
| F268 | `css/styles.css:462` | .bottom-sheet { display:flex } gör hidden-attributet verkningslöst — 'stängda' sheets är alltid renderade: osynliga fokuserbara kontroller i tabbordningen och t | XS |
| F153 | `css/styles.css:819` | "Rensa sökning"-knappen i tomt sökresultat är ~35px hög | XS |
| F267 | `css/styles.css:1781` | .saving-list { display:flex } besegrar hidden-attributet — 'Veckans fynd'-kortens varulistor är permanent utfällda och ›-togglen gör ingenting | XS |
| F143 | `css/styles.css:2027` | Bekräfta/Kassera-knapparna efter genereringen är under 44px | XS |
| F148 | `css/styles.css:2299` | Dag-blockerings-chipsen i genererings-guidens steg 1 är ~36px höga | XS |
| F158 | `css/styles.css:2465` | Ibockad ruta i inköpslistan och familjelistorna: vit bock nästan osynlig mot ljusnad grön i mörkt läge | XS |
| F149 | `css/styles.css:2813` | Säsongsanpassning-togglen är 40×22px | XS |
| F171 | `css/styles.css:2816` | Säsongsanpassnings-toggeln (.toggle-switch) är bara 40×22px tap-yta | XS |
| F146 | `css/styles.css:2941` | "Avbryt" i byt-recept-bannern är bara ~22px hög | XS |
| F150 | `css/styles.css:3202` | "Lägg till"-knappen för egna varor i inköpslistan är ~36px hög | XS |
| F144 | `css/styles.css:3399` | `.modal-overlay` saknar overscroll-behavior:contain — scroll kedjas till bakgrunden vid listgränsen | XS |
| F147 | `css/styles.css:3426` | ✕-stängknappen i Redigera recept-modalen är under 44px | XS |
| F161 | `css/styles.css:3450` | Text i recepteditorns fält (titel, protein-val, taggar, noteringar) har svag kontrast mot inputfältets bakgrund — något sämre i mörkt läge | XS |
| F156 | `css/styles.css:3537` | ✕-knappen i "Lägg till recept"-sheeten är ~27px | XS |
| F188 | `css/styles.css:3871` | Brand-pill remove '×' button has no defined touch target and no accessible name | XS |
| F204 | `css/styles.css:4099` | "Glömt lösenord?"-knappen på inloggningsskärmen har för liten träffyta för touch | XS |
| F186 | `css/styles.css:4291` | 'Vecka N' week-rail label uses ochre-on-linen text at ≈2.3:1 contrast | XS |
| F184 | `css/styles.css:4533` | Passed-day cards on Matsedel drop to ~2.7:1 text contrast (fails WCAG AA 4.5:1) | S |
| F304 | `css/styles.css:4748` | Toast kan skymma interaktiva element strax ovanför bottennaven på mobil *(troligt)* | S |
| F159 | `css/styles.css:4767` | Toast-notiser (bekräftelser efter spara/generera/bocka av) blixtrar upp som en nästan vit bubbla i mörkt läge | XS |
| F154 | `css/styles.css:5241` | Steppar-knapparna (+/−) i inställningarna är 38.4px, strax under 44px | XS |
| F170 | `css/styles.css:5241` | Steppknapparna (+/−) i genereringsguidens inställningar är 38.4px — under 44px-regeln för touch-targets | XS |
| F187 | `css/styles.css:5241` | Stepper +/- buttons (Ny matsedel wizard) are 38.4px — below the 44px touch-target rule | XS |
| F151 | `css/styles.css:6279` | Stäng-knappen för snabbtillägg i familjelistor saknar vertikal padding (~20px hög) | XS |
| F155 | `css/styles.css:6377` | Färg-/ikonväljarens knappar för familjelistor är 28-32px | XS |
| F157 | `css/styles.css:6413` | Prisoptimera-knappen (Matsedel) får nästan olästbar text i mörkt läge — hårdkodad vit text på ljusnad rost-bakgrund | S |
| F201 | `css/styles.css:6467` | Prisoptimera's close/back buttons and rea-item checkbox are below the project's own 44px touch-target rule | XS |
| F189 | `index.html:60` | Several text inputs rely solely on a placeholder with no <label> or aria-label | XS |
| F206 | `index.html:68` | Kort flimmer av irrelevant "Idag"-laddningsskärm hinner synas innan inloggningsrutan täcker skärmen | XS |
| F181 | `index.html:130` | 'Veckans ingredienser' collapsible section header has no keyboard access or aria-expanded | S |
| F236 | `index.html:306` | Terminologi-drift i genereringsflödet: 'plan'/'veckoplan' blandas med 'matsedel' i användarsynlig text | XS |
| F257 | `index.html:363` | Inkonsekventa maxlängder på egna varor: Inköpsflikens två fält och redigera-fältet saknar maxlength medan alla systervägar cappar på 80 tecken | XS |
| F177 | `index.html:387` | Modal close '✕' buttons have no accessible name and a touch target far under 44px | XS |
| F178 | `index.html:469` | editModal / dispatchModal / importModal lack role="dialog", aria-modal and aria-labelledby (inconsistent with bottom-sheets) | XS |
| F203 | `index.html:619` | Ingen fallback om app.js (ES-modul) inte kan laddas — appen fastnar tyst på "Laddar…" | S |

### PWA (service worker & manifest) (7 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F003 | `service-worker.js:16` | PWA maskable-icon saknas från PRECACHE — offline-display risk *(troligt)* | XS |
| F160 | `manifest.webmanifest:9` | PWA-splashskärmen är alltid ljus (kräm/lichen) — ingen mörk variant trots att index.html annars täcker mörkt tema korrekt | XS |
| F235 | `service-worker.js:29` | skipWaiting+clients.claim finns men inget "ny version"-flöde — en långlivad öppen PWA-klient (iOS standalone i app-växlaren) kör gammal JS mot nya api/-kontrakt *(troligt)* | S |
| F136 | `service-worker.js:50` | Navigate-hanteraren cachar HTTP-felsvar som index.html (ingen res.ok-koll) | XS |
| F137 | `service-worker.js:55` | Bakgrunds-cache.put i fetch-hanteraren är fire-and-forget (saknar event.waitUntil) *(troligt)* | XS |
| F254 | `service-worker.js:55` | SW-navigeringsgrenen cachar felsidor som './index.html' (saknar res.ok-koll) — en enda 5xx förgiftar offline-fallbacken | XS |
| F234 | `service-worker.js:67` | "Nätet först" för JS-moduler och navigeringar går ändå via HTTP-cachen — Session 101-klassens stale-modul-krasch kan återkomma på GitHub Pages-backupen *(troligt)* | XS |

### tester (3 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F272 | `tests/plan-orchestration.test.js:219` | Hårda invarianten #1 (custom-dagar bevaras vid generering) har NOLL regressionstäckning — Session 121:s kritiska fix kan tyst regressa med grön svit | S |
| F273 | `tests/select-recipes.test.js:19` | Säsongsviktningen är helt otestad — inklusive Session 111-fixen 'säsong nollar pris' som kan regressa osynligt; testrubriken utlovar täckning som inte finns | S |
| F274 | `tests/select-recipes.test.js:122` | Test 3:s fallback-assertion är vakuös — 'längst sedan'-prioriteringen kan inverteras utan att sviten failar; 14-dagarsfönstret (recentlyUsedIds) är dessutom ote | S |

### databas & övrigt (6 fynd)

| Id | Fil:rad | Fynd | Storlek |
|---|---|---|---|
| F002 | `docs/status.md:12` | Frontend version-dokumentation inkomplett (app.js-versionen saknas) | XS |
| F305 | `db (live-schema, ingen runtime-referens):` | Orphan-tabell: dispatch_preferences finns live men refereras inte av någon runtime-kod | XS |
| F217 | `db/migrations/001_activate_plan_atomic.sql:31` | activate_plan_atomic är EXECUTE-beviljad till anon och är SECURITY INVOKER — anon bör inte kunna anropa RPC:n | XS |
| F218 | `db/migrations/002_pantry_items.sql:28` | Systemiskt: anon/authenticated har fulla DML+TRUNCATE-grants på ALLA public-tabeller — RLS är enda skyddet, vilket är sprött | S |
| F288 | `db/migrations/002_pantry_items.sql:47` | pantry_items saknar UPDATE-policy men klienten skriver med upsert — konflikt (varan redan markerad från annan enhet) ger RLS-fel, falsk fel-toast och rollback | XS |
| F216 | `db/migrations/003_target_servings.sql:39` | households UPDATE-policy tillåter medlem att skriva alla kolumner på sitt hushåll — riskabelt när tenancy/billing-kolumner tillkommer i M1 *(troligt)* | S |

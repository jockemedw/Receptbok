# Sessionshistorik — arkiv

Sessioner 8–111. Senaste sessionen ligger i `docs/status.md`. Full git-historik: `git log --oneline`.

---

## Session 111 — Bugghunt (`/ultraplan hitta alla buggar`) + två fixomgångar + typografibyte
**Fem parallella granskningsagenter** gick igenom hela kodbasen (~10 300 rader, 5 slices: backend-val/shopping, backend-endpoints/infra, Willys/import, frontend plan/today/shopping, frontend recipes/ui/core). Baslinje: hela beroendefria testsviten grön. **Omgång 1 (branch `claude/ultraplan-bug-hunt-f8xhub`):** SSRF via redirect vid receptimport (`api/import-recipe.js` — `redirect:"manual"` + IP-validering per hopp, tak 5); stored XSS + trasig "Välj"-knapp vid apostrof i titel (`jsStringAttr()` i `utils.js` — JS-escapa → HTML-escapa `&<>"` men inte `'`, round-trip-verifierad); oescapad `innerHTML` (`ingredient-preview.js`, `buildTagFilterUI`, `recipe-browser.js`); inköpslista skrevs i osäker ordning (`generate.js`/`confirm.js`/`replace-recipe.js` — skapa inaktiv → skriv varor → aktivera sist); "Idag"/"Ikväll" i UTC (`fmtIso` → lokala datumkomponenter); latenta null-guards (`matchesSearch`, `renderDetailInner`, `replace-recipe` int-cast). **Omgång 2 (Joakim: "kör #2/#6/#7"):** **#2 auth på skrivande API-endpoints** — `requireUser()` i `handler.js` validerar Supabase-JWT (`Authorization: Bearer`, 401 fail-closed) på alla mutations-endpoints; `supabase.js` importeras dynamiskt så testsviten förblir importerbar utan node_modules; frontend fick `apiFetch()`-wrapper i `supabase-client.js`, alla 14 anropsställen bytta; CORS `Allow-Headers` + `Authorization`. **#6 säsong-vs-pris** — `bucketBySaving` säsongsviktar inom varje besparings-bucket i stället för att omsortera hela poolen. **#7 "X eller Y" utan mängd** — ` eller `-splitten gäller även mängdlösa rader, väljer första alternativet (shopping 93→98). **Medvetet lämnade latenta fynd** dokumenterade under *Kända buggar*. **Verifiering:** `node --check` rent; hela beroendefria sviten grön (select-recipes 432, shopping 98, match 136, m.fl.). **PR #112 mergad till main** av Joakim efter mobil-bekräftelse att auth funkar normalt. **Fortsättning — typografi:** font-jämförelse-artifact (5 kandidater, woff2 som data-URI:er pga artifact-CSP) → Joakim valde **Newsreader** på alla rubriker; `--font-display` bytt globalt (PR #113, mergad), styles v133→134, SW v44→45. Väntar mobil-verifiering.

---

## Session 110 — Städjobb (#23/#24/#25) + larmbanner #2 (migration 004)
**Städjobb: körde P4-backlogens småfix (#23/#24/#25).** **#23 (delvis):** tog bort de 2 sista inerta `.week-day-card`-JS-referenserna i `plan-viewer.js` (no-op-guard rad 29 + död DOM-patch i `selectRecipeForDay` rad 282). Den döda `.week-day-card`-CSS:en (~1000 rader) lämnades — kräver eget granskat steg. **#24 (klar):** tog bort `?v=N` helt från alla 19 JS-imports i `app.js` (i linje med SW:ns nät-först-design; att bara versionera vissa hade skapat dubbla modul-instanser). `index.html`: `app.js?v=129→130`. **#25 (delvis):** `updateLastPlanDay`/`patchPlanDay` var identisk spegelkod — deluxe återanvänder nu `window.updateLastPlanDay`. `fmtKr`-avrundningen lämnad (kräver display-beslut). Oberoende `code-reviewer`-agent (Opus) mot `97c7a20`: alla ändringar säkra. **Larmbanner #2:** ny tabell `pricing_status` (`db/migrations/004_pricing_status.sql`, körd av Joakim 2026-07-04), `api/generate.js` upsertar status efter varje `optimize_prices`-körning, `today-view.js` renderar en ochre in-app-banner om reapriserna varit onåbara ≥1 dag. Testsvit grön, Playwright-verifierad banner (ljust+mörkt).

---

## Session 109 — Idag-fliken byggd (ny startflik, två rundor)
Byggde den fjärde fliken **Idag** som ny startvy enligt byggspecen `docs/superpowers/specs/2026-07-03-idag-flik-spec.md`. **Ny slice** `js/today/today-view.js` (VSA — bara rendering + anrop av befintliga `window.*`): datumrad, **Ikväll-hero** (Börja laga/Mer), **I morgon**-rad, **Kommande veckan** (färgstaplar), **Snabbt till listan**. **Runda 2** (Joakims feedback "det ser inte alls ut som prototyp-bilderna"): byggde om pixelnära mot artifact-prototypen (ddad7251) — rea-pill, protein som färgad prick, `.dlx-tonight`-vänsterband i proteinfärg, vävt trådband för veckan, nav omordnad Idag·Matsedel·Inköpslista·Recept, ny token `--shadow-card`. Cache-bust styles v131/app v127/today v101/SW v41. Verifierat mot prototypens egen render i Playwright (ljust + mörkt).

---

## Session 108 — Designförslag "Idag först" (hela appens design, prototyp publicerad)
Joakim satte målet *"föreslå en avsevärt förbättrad design för hela appen"* → en fristående **interaktiv hifi-prototyp** byggdes och publicerades som artifact: **https://claude.ai/code/artifact/ddad7251-ca56-4be4-92e2-5148dddf253c** (öppna på mobilen — alla flöden körbara med exempeldata). **Förslagets fem pelare:** (1) **Idag-flik som ny startvy** — Ikväll-hjälten svarar direkt på "vad blir det ikväll?", 4-fliksnav Idag/Matsedel/Lista/Recept; (2) **Veckans väv** som visuell signatur; (3) **generera-wizard i 3 steg**; (4) **handla-läge för en hand** + **matlagningsläge** med portionsskalning (= #28); (5) **identitetsfördjupning, inte byte** — linne/lav/rost behålls, Playfair→Fraunces, DM Sans kvar, fullt **mörkt tema**. **Runda 2 (efter Joakims feedback):** rutnätstexturen borttagen, randiga kortöverkanter → smalt helfärgat vänsterband, "Kommande veckan" som namn, förslagsnamn "Idag först". **HELT INFÖRT — alla 6 steg + mörkt tema pushade till main:** Steg 1 (`2e4f0d4`, Fraunces + tokens), Steg 2 (`4408f60`, proteinfärger som tokens, kött/fläsk särskiljs), Steg 3 (`808f101`, Matsedel startflik, Ikväll överst), Steg 4 (`663d0f9`, generera-wizard i tvåstegs-sheet), Steg 5 (`0e2c1a9`, progressring i handla-läget), Steg 6 (`4aee3cd`, portionsskalning i matlagningsläget #28) + **mörkt tema** (`3026401`, följer OS-inställningen, token-nivå). **Runda 5 (Joakims mobilfeedback):** Fraunces byttes TILLBAKA till Playfair Display (styles v129/SW v39) — i övrigt godkänt utseende; Idag-fliken enligt prototypen sparad som nästa bygge (byggspec `docs/superpowers/specs/2026-07-03-idag-flik-spec.md`). *Medveten avvikelse i steg 3:* ingen separat Idag-flik då (deluxe hade redan Ikväll+dag-sheeten) — den byggdes i stället som egen flik i Session 109. Cache-bust t.o.m. styles v129/app v125/SW v39. **Verifiering:** hela testsviten grön efter varje steg; Playwright-stubbharness med screenshotgranskning (ljust + mörkt). Uppskjutet: "I korgen"-sektionen (rör bockningsstate).

## Session 107 — #15 Dag-sheeten: byggd, sedan utökad till universellt interaktionsmönster
Joakim bad om nästa WOW-komponent → analysen pekade på backlog **#15** (⭐, blockerad bara på UX-beslut) → **interaktiv preview** publicerades som artifact (länk i backlog-filen) med varianterna A/B körbara → Joakim valde **B (bottensheet)** → första bygget gällde bara Ikväll-kortet. Joakim höjde sedan ambitionen: *"sheeten ska vara goto-funktionen för all interaktion med dagarna"* → **runda 2 (samma session): inline-utfällningen är helt borttagen ur premiumvyn** — alla dagkort öppnar sheeten via en universell router (`dlxDayClick`). **Vyer i sheeten:** *meny* (dagens åtgärder — Visa receptet / Byt middag / Byt dag / Flytta dag / Fri dag; Ikväll-kortet får dessutom Vi äter ute + Rester ikväll + Lägg till på listan), *recept* (full receptdetalj med Börja laga — ersätter gamla kortutfällningen; arkivdagar landar här direkt i läsläge), *byt* (byt plats med annan receptdag via `swap-days` — ok på bekräftad plan; + Slumpa/Välj själv via `replace-recipe` på obekräftad), *editor* (customDayEditorHtml/blockedDayEditorHtml renderas i sheeten; spara-flödena i `plan-viewer.js` stänger den via nya `dlxCloseSheet`-anrop i success-vägarna), *lista* (`addManualItem`). Samma regler som gamla utfällningen (canReplace/canMove/isPast) — **ingen ny mutationslogik**. Borttaget: `dlxToggleDay`/`dlxEditCustom`/`dlxGapClick`/`dlxCustomClick`/`dlxFreeClick`, `_dlxExpanded`/`_dlxEditCustom`-state, scroll-till-kort-logiken (själva "hoppa runt"-källan). Robusthet: `dlxFlashError` → `[data-date]` + toast-fallback; `dlxFreeDay` returnerar ok-status. Filer: `plan-viewer-deluxe.js` (stor omskrivning av interaktionslagret), `plan-viewer.js` (dlxCloseSheet i 8 flöden), `styles.css`; cache-bust app v120 / deluxe v120 / plan-viewer v114 / styles v122 / SW v31. **Verifiering:** hela testsviten grön (12 filer) + Playwright-harness (stubbat state, riktiga modulen+CSS): 11 logikkontroller täckte alla dagtyper (ikväll/framtida/passerad receptdag, fri dag, egen notering, egen m recept, tom dag, arkivdag) + swap-läge (kortklick väljer mål, sheeten öppnas inte), API-anrop verifierade (`swap-days`, `skip-day free`, `replace-recipe`), editor-spara stänger sheeten, skärmdumpar granskade (meny/recept/editor). **Kvar:** mobil-verifiering mot produktion (se kön — 10 punkter). *(Uppföljning samma dag: grundflödet mobilverifierat av Joakim, kön trimmad till datamuterande stickprov.)*

## Session 106 — Nattjobb: 8 backlogpunkter (#12, #13, #10, #22 + delar av #2, #7, #11, #21)
Joakim gick och la sig och bad mig lösa så många todo-punkter som möjligt utan att fråga. **Produktspåret (de två stora):** (1) **#12 portionsskalning** — `households.target_servings` (migration `003_target_servings.sql`, default 4 = ingen regression) skalar inköpslistans parsade mängder per recept (`target/servings`) FÖRE merge, vänlig avrundning (styck uppåt till heltal, g/ml heltal, dl/msk/kg kvartsprecision), råtext rörs aldrig, mängdlösa rader skalas inte; UI-stepper "Vi är X portioner" i inställningarna (dold tills migrationen körts); +12 testfall. (2) **#13 skafferi/"har hemma"** — hus-knapp per vara i inköpslistan; markerad vara visas dämpad, räknas inte i "X av Y", följer inte med i kopierad text eller Willys-dispatch (server-side-filter); minne per normaliserat varunamn i ny tabell `pantry_items` (migration `002_pantry_items.sql`, delad data — ingen localStorage); funktionen göms tyst tills migrationen körts. **Robusthet:** **#10** delad `_opBusy`-spärr (window/state.js) mellan premiumvyn och alla custom-days-mutationer; **#7 delvis** dubblett-offers-URL:en i generate.js ersatt med delade `fetchOffersFromWillys` + `WILLYS_STORE_ID`-env; **#11 delvis** pausad Supabase ger nu "Appen har vilat en stund…" + Prova igen-knapp (`isDbUnreachable`/`DB_RESTING_MESSAGE` i supabase-client.js) vid boot och login; **#2 sista kodbiten** svensk toast vid `pricingDegraded`. **UX/a11y:** **#21 delvis** "Glömt lösenord?" (`resetPasswordForEmail`) + recovery-formulär + svenska auth-fel; **#22 klar** synlig "Tidigare recept"-knapp (tangentbordsnåbar, alternativ till pull-gesten) + protein/tid i text på custom-dagar med recept och Ikväll-kortet. **Medvetet INTE rört** (kräver Joakims beslut eller märkt "EJ autonomt"): #15 (UX-beslut), #23-CSS/#25 (granskade steg), #5/#6 (tenancy), canon-kandidater, Hemköp (butiks-ID saknas), `ALERT_WEBHOOK`/keep-alive-cron (extern setup). **Verifiering:** hela testsviten grön (12 filer, inkl. 93/93 shopping med nya skalningstesterna), `node --check` på allt editerat, cache-bust bumpad (app v117, plan-viewer v113, deluxe v117, styles v119, SW v28). **Kvar:** mobil-verifieringen (se kön i status.md) + två nya migrationer att köra i Supabase SQL Editor (002 + 003) — appen är oförändrad tills de körs. OBS för #21: om återställningsmejlets länk inte landar rätt, kontrollera Site URL/Redirect URLs i Supabase Auth-inställningarna.

**Runda 2 (samma natt):** målet återaktiverades → två punkter till utan beslutsbehov. (9) **#20 klar** — eko/svenskt-preferenserna styr nu faktiska produktvalet i dispatchen: viktning i både rea- och sök-steget (`wantedForCanon` per kategori via `categorize`), preferensen blockerar aldrig en match, ouppfyllda önskemål returneras som `prefMisses` och visas i resultatmodalen. +10 testfall (dispatch-sviten 103/103). (10) **#14 delvis (lätta varianten)** — anteckningar som matchar rester-mönstret får ockra skål-markör i stället för pennan (`customNoteMark()`). Cache-bust: app v118, deluxe v118, styles v120, SW v29. Hela sviten grön igen.

**Morgonuppföljning (2026-07-03):** Joakim körde migration 001–003 i SQL Editor **och riggade permanent Supabase-access för Claude** (miljövariabler `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` + nätpolicy — dokumenterat i CLAUDE.md → Arkitektur). Claude verifierade via Management-API:t: `pantry_items` (RLS + 3 policies), `households.target_servings` (=4, RLS), `activate_plan_atomic`-RPC:n — allt på plats. #12/#13/atomär aktivering är därmed AKTIVA i produktion. Kvar för Joakim: rotera den access-token som klistrades i chatten + `ALERT_WEBHOOK`.

---

## Session 105 — Nattjobb: lågrisk-städning (#23 delvis, #22 delvis, #11 delvis)
Joakim bad om ett paketerat nattjobb som städar av lågrisk-punkter som inte kräver hans input eller mobil-verifiering. **Tre punkter, alla verifierade statiskt:** (1) **#23** — tog bort 5 döda `#weekRecipeDetail`-no-op-block i `plan-viewer.js` (397/597/644/850/877; elementet borta ur `index.html` sedan Session 101 → blocken var redan no-ops) + sanerade en vilseledande kommentar. (2) **#22** — tog bort `maximum-scale=1.0, user-scalable=no` ur viewporten i `index.html` → nyp-zoom tillåts nu (a11y). (3) **#11** — dokumenterade Supabase free-tier-pausen + de två luckorna (keep-alive, graceful degradation) i CLAUDE.md. **Metod-fynd (viktigt):** backloggen påstod att `.week-day-card` var död klassisk-kod att ta bort — jag verifierade och det stämmer att klassen renderas *ingenstans* (premium använder `.dlx-day`/`.dlx-tonight`), men de två JS-queries som pekar på den (`plan-viewer.js:29`/`:281`) sitter i den *levande* realtids- resp. swap-vägen → flyttade till samma granskade CSS-städsteg, inte autonomt. (Jag hann påstå fel först — att klassen var *levande* — men verifierade innan jag skrev något skarpt.) **Medvetet ute ur nattjobbet:** #24 (`?v`-cachelinje — syns bara på mobil), #25 `fmtKr` (display-beslut) + plan-mutations-spegelkod, #2 `ALERT_WEBHOOK`/#11 keep-alive-cron (env/extern setup), #5–7/#10 (tenancy/plan-risk). **Verifiering:** `node --check` på `plan-viewer.js` grön + core-testsviten (match/corpus/shopping/select/data-mapper) grön. Ändringarna är frontend/docs — inga api/-tester berörda. **Kvar (mobil):** snabbkoll att veckovyn/premiumvyn renderar normalt och att pinch-zoom nu funkar.

---

## Session 104 — Självgående runda: backlog-sanering + #25 escaper-konsolidering
Joakim bad om en självgående runda som paketerar så många backlog-punkter som möjligt. **Fynd:** de flesta P0/P1-punkter jag valt (#1, #4, #8, #9, #26, #27) var **redan gjorda** i Session 102-nattjobbet — men `docs/app-analys-backlog.md` uppdaterades aldrig efter det, så filen listade dem felaktigt som öppna (stale-doc-fälla för framtida sessioner). **Åtgärd 1 — kod (#25 delvis):** de 4 duplicerade HTML-escaparna (`esc`×2 i plan-viewer/-deluxe, `escapeHtml`×2 i dispatch-ui/-preferences) pekar nu på en enda `utils.escapeHtml` (import + `const esc = escapeHtml`). Medvetet **inte** rört: `fmtKr` (olika avrundning per vy → att ena ändrar synlig kr i premiumvyn, kräver Joakims display-beslut) och `updateLastPlanDay`/`patchPlanDay` (ligger i plan-mutations-vägen, hård regel — slås ihop i separat granskat steg). **Åtgärd 2 — dokument:** backlogfilen fick statusbanner + ✅/🟡-markörer per punkt (#1–#4, #8, #9, #24–#27) så ingen framtida session dubbelarbetar; status.md:s backlog-rad rättad. **Verifiering:** alla 12 testfiler gröna (körde `npm install` för de deps-beroende dispatch-/cookies-/plan-testerna) + `node --check` på de 4 editerade modulerna. Ingen synlig UI-ändring (escaparna är semantiskt identiska). **Kvar:** mobil-verifieringskön oförändrad; #25:s `fmtKr`/spegelkod väntar på beslut.

---

## Session 103 — Atomär plan-aktivering (#3), bygd & granskad via Sonnet 5
Joakim ville testa nyss släppta **Sonnet 5** effektivt och med högt värde. Valde backlog-#3 (atomär `activatePlan`) som testfall — bra reasoning-test (rollout-säkerhet utan lokal DB) + hög tillförlitlighetsvinst. **Flöde:** Opus delegerade implementationen till en Sonnet 5-subagent (`model: sonnet`), granskade sedan diffen adversariellt och körde hela testsviten på riktigt innan något landade. **Resultat (PR #103, mergat till main):** ny Postgres-RPC `activate_plan_atomic` (`db/migrations/001_activate_plan_atomic.sql`) slår ihop archive→radera gamla meal_days→deaktivera→aktivera i en transaktion; `activatePlanAtomic()` i `api/generate.js` anropar RPC:n med automatisk fallback till den gamla tvåstegsvägen om funktionen saknas (`isMissingRpcError`/PGRST202) → `main` säker både före och efter att SQL:en körts. Test 4–7 i `tests/plan-orchestration.test.js` (RPC-success, fallback, krasch→full rollback, enheter); 12 testfiler gröna. **Sonnet 5-utvärdering:** stark på arkitektonisk reasoning + scope-disciplin, men missade en konkret schema-detalj (deklarerade plan-id som `bigint` — schemat säger `uuid`) som hade brutit menygenereringen i produktion; **Opus-granskningen fångade och fixade det.** Lärdom: dela arbetet — Sonnet 5 bygger, Opus granskar + kör testerna på riktigt (lita inte på subagentens egen rapport). **Kvar:** (a) **kör SQL:en** i Supabase SQL Editor för att aktivera atomiciteten, (b) skarp verifiering att plan-byte + arkivering funkar live efter att SQL:en körts.

---

## Session 102 — Dubbel agentanalys + autonomt nattjobb
Joakim lät två agenter (produkt/UX-strateg + teknisk arkitekt) djupanalysera hela appen i två intervjurundor, sedan paketera ett autonomt nattjobb. Analysen → **27 prioriterade åtgärdspunkter** (`docs/app-analys-backlog.md`, P0–P4) + sessionens todo-lista. Centralt fynd där båda rollerna möts: appen är ovanligt välbyggd men byggd för EN person och vilar på två **tyst-felande** fundament (Willys-feeden + plan-aktiveringen). **Nattjobb (Block 1–3, 9 punkter — allt test-gated eller inert, mergat till `main` via PR #100, 12 testfiler gröna):** (1) raderade retirerade `weekly-plan.yml` + ny CI `.github/workflows/test.yml` (hela sviten + `node --check` på push/PR); (2) bröt ut `selectRecipes`/`bucketBySaving` → `api/_shared/select-recipes.js` så testet kör **samma kod som produktion** (drift-kopian hade redan divergerat); (3) integrationstest för plan-orkestreringen `save→archive→activate` mot mockad db — gjorde de tre funktionerna injicerbara (`database = db`-param, handlern oförändrad); (4) `maxDuration: 30` för `import-recipe.js`; (5) exporterade+testade `isPrivateIp` (SSRF, 25 assertions) + `crypto.timingSafeEqual` på X-Refresh-Secret via `secretsMatch()`; (6) `pricingDegraded`-flagga + inert `notifyAlert()` (`api/_shared/alert.js`) vid tyst Willys-degradering; (7) tog bort död state `_freshShopContent` + filter-stubbar; (8) svenska felmeddelanden i 4 tysta catch-block; (9) riktig README.

---

## Arkiverade verifieringspunkter (flyttade Session 103)
Dessa punkter har legat i live-verifieringskön i veckor och antas fungera. Flyttade hit
från den aktiva kön (`docs/status.md`) för att hålla den scanbar. Återaktivera om något visar sig fela.

- **Lösvikts-enum vid Willys-export** (PR #65): `pickUnitForCode()` skickar `"kilograms"` för `_KG`-koder (lös färskvara, t.ex. potatis). Enum-värdet är *inferred* — bara `"pieces"` är PoC-bekräftat. Bekräfta att lös potatis landar i korgen i skarp körning.
- **Helhetsomtaget Session 86 (PR #73):** snabbkoll mot produktion: (1) PWA "Lägg till på hemskärmen" ger egen ikon + öppnar offline (skalet), (2) matlagningslägets Wake Lock på riktig mobil, (3) Ångra på borttagen inköpsvara + progress-synk från annan enhet.
- **Premiumvy för matsedeln** (Session 84–85, PR #69/#70): testsvit grön men ej verifierad på mobil mot produktion. Bekräfta att vyn renderar, att alla åtgärder fungerar (slumpa/välj/byt dag/fri dag/besparing/egen planering) och att växeln Premium↔Klassisk håller båda i synk. Kolla även: helgkort lika höga som vardagskort (helg = prick på färgryggen), och "Vecka N"-avdelare på planer som spänner två veckor.
- **Willys Plus-erbjudanden** (Session 88): `normalizeOffers()` märker nu LOYALTY-erbjudanden med "Willys Plus"-badge i besparings-popoveren + släpper in `SubtotalOrderPromotion`-klubbpriser (kött/frukt som föll bort förut). Bekräfta mot produktion att badgen syns och att de nya fynden räknas in. Detaljer: `docs/research-willys-plus-2026-06-16.md`.
- **"Veckans fynd"-popup** (Session 89, brusrensad Session 90): efter prisoptimerad generering öppnas en popup med (1) fynden planen redan fångar och (2) rea-recept att byta in (rankade efter besparing, "Byt in" → välj dag). Hero-besparingen i premiumvyn öppnar den igen. Bekräfta på mobil: popupen renderar, "Byt in" landar receptet rätt + behåller besparingen, inköpslistan följer med. Session 90 tog bort matcher-bruset (skafferi/fett räknas ej, rökt lax/marinerad vitlök/barnmat avvisas) — bekräfta att besparingarna nu är rimliga och fria från skräpprodukter. Session 91 (P2): recept-korten är nu kollapsbara (rubrik + besparing, tryck för att fälla ut varorna) + antal i sektionsrubrikerna, så "Fler fynd" inte begravs — bekräfta att layouten känns scanbar på mobil. Session 92: fler korpus-fixar (grillspett→grönsak, småbarnsmat "Från X År", smaksatt bärvatten avvisas). Session 93: storpack (≥1 kg/1 l) flaggas med "storpack"-tag och nedviktas 50 % i "Fler fynd"-rankningen (visad besparing oförändrad) — bekräfta att taggen syns och att rankningen känns vettig.
- **Värdeviktad prisprio** (Session 94, PR): `weightedSaving()` viktar varje sparad krona efter erbjudandets ordinarie pris (golv 0.2 / tak 2.2 runt pivot 40 kr) + 1.5× protein-boost (substring `färs|kyckling|fläsk|kött|…|lax|torsk|fisk|räk|…`). Används som tröskel i `bucketBySaving()` (matsedeln) och sortering i `buildDealCandidates()` (Veckans fynd). Visad kr-besparing oförändrad. Bekräfta mot produktion: prisoptimerad generering ger färre vitlöks-/lök-drivna förslag och lyfter dyra protein-/färskvarureor i både menyn och fynd-popupen.
- **Atomär plan-skrivning** (Session 95, PR): `savePlanToSupabase()` skapar nu plan-raden **inaktiv**, skriver dagarna, och `activatePlan()` slår på den allra sist (handlern: skriv → `archiveOldPlan` → aktivera). Misslyckas dag-skrivningen städas plan-raden bort och den gamla planen är orörd. Förebygger "tom aktiv plan utan åtgärdsknappar" (Joakim, premiumvyn: 0 planerade + inga byt/växla-knappar). Bekräfta mot produktion att generering fungerar normalt och att en avbruten körning inte längre lämnar tom matsedel.
- **Protein-sortering + variation i Veckans fynd** (Session 96, PR): `buildDealCandidates()` rankar nu topplistan på huvudproteinets besparing och väger in variation (decay 0.55) så ingen proteintyp dominerar. Bekräfta mot produktion: efter prisoptimerad generering toppar "Fler fynd" med recept där det dyra proteinet är på rea, och listan är blandad (inte 25 kyckling i rad). Tunbart: `diversityDecay` (lägre = hårdare variation) och `mainProteinSaving`-kategorierna i `canonProteinCategory()`.

---

## Session 101 — Full nedmontering av klassiska veckovyn
Joakim: "Fortsätt att nedmontera klassiska vyn — gör det genomtänkt och felsäkert." Genomfört i fyra oberoende commits på branch `claude/remove-classic-view`, mergad till `main`. Netto −842/+91 rader. Nyckelinsikt: nedmonteringen är **rent presentationell** — plan-datan flödar genom `window._lastPlan`/`window._timelineByDate` orört, så befintlig veckoplan kan aldrig skadas; risken var trasigt UI, inte dataförlust. **(1) Premium alltid på:** tog bort `dlx-switch` + `setMode`/`applyMode`/`currentMode`/`STORAGE_KEY`; `body.week-deluxe` sätts ovillkorligt. **(2) Slutade rendera klassiska tidslinjen:** `renderWeeklyPlanData` bygger fortfarande timeline + sätter `window._timelineByDate` men renderar inte grid/nav-chips/scroll/bulk-banner; markup borttagen; premiumvyns scaffold ankrar på `#confirmPlanWrap`; `centerTodayCard`-anropet borttaget ur `navigation.js`. **(3) Migrerade delade editorer inline:** delade `#weekRecipeDetail`-bottenpanelen borttagen; fri dag → `blockedDayEditorHtml` inline; egen planering med recept → `dlxEditCustom`/`customDayEditorHtml` inline; alla nåbara delade funktioner gjordes panel-säkra. **(4) Städade död kod:** ~493 rader ur `plan-viewer.js`. Bumpat `app.js?v=112`, SW-cache v23.

**Hotfix efter deploy (löst):** matsedeln visade "Ingen matsedel ännu" på mobilen. Orsak: SW:n serverade undermoduler stale-while-revalidate med bar sökväg → ny `index.html` (utan `#weekGrid`) mötte gammal cachad `plan-viewer.js` → null-krasch. Fix: versionerade de tre ändrade importerna (`?v=112`) + SW serverar nu JS nätet-först, CSS/ikoner kvar SWR, cache v23. Lärdom: [[project_pwa_cache_strategy]].

**Mjukare hero-snap (Joakim):** `snapToHero` → mjuk `smoothScrollTo` (460 ms) + hoppar över om vyn ≈rätt. Uppföljning: CSS `scroll-snap-type` på `html` borttagen helt → fri native-rullning. `styles.css?v=116`, SW-cache v25.

**Rationaliserade dagkorten (Joakim):** egen-planering-etiketten → liten markör-ikon inline; noteringar samma serif-titelstil som recept; tomma dagar → lugn plus-ikon. Differentierade markörer: recept-ur-boken = grön gryt-ikon, egen notering = penna. `app.js?v=115`, `styles.css?v=117`, SW-cache v26. **Topp-omstrukturering + pull-to-reveal historik:** "Matsedeln"→"Matsedel"; `snapToHero` borttagen; tidigare recept fälls ut som dragspel nedåt via armad pill-knapp (`armHistory`/`dlxToggleHistory`). `app.js?v=116`, `styles.css?v=118`, SW-cache v27.

---

## Session 100 — Byt dag för egna anteckningar + todo-hook
Joakim: (1) lägg en hook som alltid startar en todo-lista vid sessionsstart, (2) gör det möjligt att byta plats på dagar man inte har recept på (egna anteckningar). **(1)** Ny andra SessionStart-hook i `.claude/settings.json` som echo:ar en TODO-påminnelse. **(2)** Egna anteckningar (egen planering) lagras som `meal_days`-rader med `plan_id = null`; de blockerades förut från "Byt dag" i premiumvyn (`modeCls`, `dlxCustomClick`, `dlxPickSwapTarget`) och i backend (`/api/swap-days` läste bara aktiva plan-rader och avvisade flytt *till* en custom-dag med 409). Fix — scope per Joakim: **full byt dag, bara premiumvyn** (klassiska vyn lämnad orörd, togs bort i Session 101). Backend `swap-days.js` omskriven: läser båda dagarna oavsett `plan_id`, byter *fullt* innehåll (inkl. `plan_id` + `custom_note`) i en atomär upsert när båda finns, annars flyttar raden via datumbyte (matchar nu på household+datum, inte `plan_id`); returnerar `customDays` i svaret. Premiumvyn: `modeCls` gör `custom` bytbar, "Byt dag"-knapp i custom-detaljen, `dlxCustomClick` väljer mål, `window._customDays` speglas från svaret. Invariant bevarad: ett recept byter bara dag → inköpslistan rörs ej. Bumpat `app.js?v=110`, SW-cache v21. Tester gröna (day-ops 34, match, corpus, shopping, select 432, data-mapper).

---

## Session 99 — Premiumvyn: vit platta i helg-utfällningen
Joakim: utfällningen av helg-korten blir vit inom det annars sandfärgade kortet (bild: ett "+ Planera dagen"-kort på söndag). Två fixar: (1) **Egen-planering-editorn** (huvudboven, Session 97 renderar den inline): editorn delas med klassiska vyns bottenpanel, där `.detail-inner` har ljus panel-bakgrund (`--linen-card`) och `.custom-option` är vita kort. Inline i premiumvyns sandkort blev det en vit platta. Scoped fix: `.dlx-detail-custom .detail-inner { background: transparent; border-top: none; padding: 0 }` + `.dlx-detail-custom .custom-option { background: transparent }` → editorn ärver kortets yta (sand på helg, linne på vardag), `.dlx-detail` ger redan ram + padding. (2) **Recept-korten:** `.dlx-act` / `.dlx-mini-btn` hade `background: var(--paper)` (rent vitt) → satt till `transparent` så outline-knapparna ärver kortets yta. Primärknappen (`Slumpa nytt`, rust) oförändrad. Bumpat `styles.css?v=113`, SW-cache v19.

**Sedan: tidslinjen kändes "busy" (bild)** — analys + Joakim valde A/C/D (ej B). (A) **Helgdags-chippen unifierad:** låg förut till vänster i main på gap-kort men till höger på receptkort (`renderDayCard`) — nu *alltid* strax före chevronen på alla korttyper; clay+rust-pillen bytt till dov ockra-ton (`color-mix(--ochre 16%)` + nya `--ochre-deep`) så rust reserveras för "Idag"/protein. (C) **Datum kalender-stil:** `<span class="dlx-day-date">` delad i `.dlx-day-num` (stort) + `.dlx-day-mon` (litet versalt) — slut på ojämn radbrytning av "20 juni" i den smala kolumnen (6 mallar via replace_all + tonight-kortet). (D) **Lugnare palett:** helg-sanden mjukad `#ede5d4`→`#efe8db` med `border-color` birch→birch-soft. (B — protein-dubbelkodning — valdes bort.) Bumpat `styles.css?v=114`, `app.js?v=109`, SW-cache v20.

---

## Session 98 — Premiumvyn: helg-utfällning + hero-snap
Joakim: (1) helgkort har avvikande färg som inte harmoniserar när de fälls ut, (2) hero-snappen rycker tillbaka skärmen så ett utfällt kort inte kan centreras. Fixar (CSS + en JS-rad): (1) `.dlx-day.is-weekend.expanded` lägger tillbaka utfällningens lichen-accent (annars vann `is-weekend`:s birch-ram pga källordning) — helg-tonen **behålls** även utfällt (Joakims val: behåll färgen, harmonisera bara accenten). (2) `renderDeluxe` togglar `host.has-expanded` när ett kort är utfällt, och `#weekDeluxe.has-expanded.has-history .dlx-hero { scroll-snap-align: none }` tar bort enda snap-ankaret så proximity-snappen inte drar tillbaka skärmen. Bumpat `styles.css?v=111`, `app.js?v=108`, SW-cache v17.

---

## Session 93 (2026-06-16) — Storpack-medvetenhet i besparingen

Mål (användarinvändning): hela varans besparing tillgodoräknas receptet, fast bara en bråkdel ofta används (t.ex. 2 kg ris). Exakt proportionering är opålitlig (dl vs kg, "ca"-vikter, ingen densitet) → vald väg: ärlig siffra + genomskinlighet + de-skewad rankning.

- **Förpackningsstorlek:** `normalizeOffers()` läser `displayVolume` och flaggar `bulk` via `isBulkVolume()` (≥1 kg / 1 l). `bulk` + `displayVolume` bärs med i offer och trådas genom `savingMatches` (generate.js byCanon).
- **"storpack"-tag** i fynd-raderna (Veckans fynd-popup + dag-popover) så man ser vilka besparingar som gäller en stor förpackning. Skärpt fotnot.
- **Nedviktad rankning:** `buildDealCandidates()` rankar via `rankSaving()` där storpack räknas till 50 % — **visad besparing (saving) ändras INTE**, raderna summerar fortfarande till rubriken; bara sorteringen av "Fler fynd" påverkas så ett recept som nätt och jämnt nuddar en stor rabatt inte toppar listan. Faller tillbaka på total när matchningar saknar savingPerUnit.
- **Verifierat:** +8 willys-offers (11→19, bulk-parsning) +4 match (rankning + att visad siffra är oförändrad). Hela sviten grön — match 123, corpus 41, shopping 81, select 432, data-mapper 27, day-ops 34, willys-offers 19, dispatch 93, cookies 29 (**879 assertions**). Versioner: `styles.css?v=109`, `app.js?v=106`, SW-cache v14.

---

## Session 92 (2026-06-16) — Fler korpus-fixar för besparings-matchern

Mål (användarbegäran, ny omgång skärmbilder från Veckans fynd): tre kvarvarande falska träffar som popupen avslöjade.

- **Grillspett → grönsak:** "Kycklingspett Paprika Örter" matchade `paprika` (−12,3 kr). GLOBAL_REJECT_RE fångar nu `[a-zåäö]*spett` (kött-/kycklingspett kryddade med en grönsak i namnet).
- **Småbarnsmat med åldersintervall:** "Fruktstång Druvor/äpple Från 1–3 År" matchade `äpple` (−10 kr). BABY_FOOD_RE utökad från bara `mån` till `(mån|år)` + intervall (`från \d+ [-–] \d* (mån|år)`).
- **Smaksatt bärvatten:** "Hydrate … Jordgubb Stilla Vatten Pet" matchade `jordgubbar` (−6,1 kr). Nya CANON_REJECT_PATTERNS för `jordgubbar`/`hallon`/`blåbär` (stilla vatten/hydrate/läsk/smoothie/saft…), i linje med befintliga citron/lime/apelsin-rejects.
- **Verifierat:** +6 korpus-fall (35→41), inkl. positiva guards (färsk paprika/jordgubbar matchar fortfarande). Hela sviten grön — match 119, corpus 41, shopping 81, select 432, data-mapper 27, day-ops 34, willys-offers 11, dispatch 93, cookies 29 (**867 assertions**). Backend-only, ingen version-bump.

---

## Session 91 (2026-06-16) — Veckans fynd P2: kollapsbara recept-kort

Mål (forts. på Session 89–90): popupens "I din matsedel"-lista var en vägg (8+ recept × flera rader) och "Fler fynd att haka på" begravdes långt under. Gör listan scanbar.

- **Kollapsbara kort:** varje recept-kort (både i planen och kandidater) har nu ett tryckbart huvud (recept + besparing + chevron + "N fynd"); varulistan är dold tills man fäller ut den (`dealToggleCard`). "Byt in" på kandidater ligger kvar synlig. `aria-expanded` sätts på huvudet.
- **Sektionsantal:** rubrikerna visar antal recept ("I din matsedel 8", "Fler fynd att haka på 12") så man förstår omfånget direkt.
- **Verifierat:** `node --check` rent; kärnsviten grön (frontend-only ändring, inga nya assertions). Versioner: `styles.css?v=108`, `app.js?v=105`, SW-cache v13.
- **Kvar:** live-verifiering att layouten känns scanbar på mobil.

---

## Session 90 (2026-06-16) — Brusrensning av besparings-matchningen

Mål (användarbegäran efter mobil-test av Veckans fynd-popupen): popupen avslöjade att besparings-matchern släppte igenom skräp — "Salt Hallon Ferrari" (godis) på `salt`, "Nötspett Peppar" (köttspett) på `peppar`, barnmat på `äpple`, marinerad antipasti på `vitlök`, rökt lax på `lax`, oljeblandning på `smör` — och att skafferivaror blåste upp besparingen. Inventerade problemen från 8 skärmbilder, bollade fram en plan, byggde P0.

- **Skafferi-exkludering (rotorsaken):** `extractRecipeCanons()` skippar nu `SAVING_SKIP_CANONS` = `PANTRY_ALWAYS_SKIP` (salt/peppar/vatten, nu exporterad) + matlagningsfett (olivolja/rapsolja/sesamolja/avokadoolja/smör/margarin). Påverkar BARA besparings-matchningen — inköpslista/dispatch orörda (oljor med mängd kan fortfarande hamna på listan). Dödar de mest upprepade falska träffarna och avinflaterar besparingen.
- **Reject-mönster:** `lax` → `kallrökt|varmrökt|gravad|gravlax|rökt` (recepten vill ha färsk filé), `vitlöksklyftor` → `marinerad`, samt globalt barnmat `från \d+ mån` (kräver "från" så lagrad ost/chark inte fastnar).
- **Verifierat:** +8 assertions i `match.test.js` (111→119) som låser A1–A6. Hela sviten grön — match 119, corpus 35, shopping 81, select 432, data-mapper 27, day-ops 34, willys-offers 11, dispatch 93, cookies 29 (**861 assertions**). Backend-only, ingen version-bump.
- **Kvar:** live-verifiering att besparingarna nu är rimliga (se *Väntar på live-verifiering*). P2 (UX): utvärdera popupens layout när bruset är borta — ej påbörjat.

---

## Session 89 (2026-06-16) — "Veckans fynd"-popup: transparens + byt in rea-recept

Mål (användarbegäran, bollat fram): vid prisoptimerad matsedel — en popup som visar vilka varor optimeringen hittat på rea och föreslår recept att välja efter. Vald design (efter tre frågerundor): popup *efter* generering, bara fynd som matchar recept, förslagslistan organiserad per recept, "Byt in" → användaren väljer dag.

- **Backend:** `api/generate.js` returnerar nu `deals: { candidates }` när `optimize_prices` är på — rea-recept som inte valdes, rankade efter besparing. Ren, testbar `buildDealCandidates()` i `willys-matcher.js` (exkluderar valda + under 10 kr, top 20). `api/replace-recipe.js` tar emot valfri `saving`/`savingMatches` vid specifikt byte och behåller dem (annars nollställs de som förr) + returnerar dem.
- **Frontend:** ny modul `js/weekly-plan/deals-popup.js` — popup i två delar (I din matsedel / Fler fynd att haka på). Varje förslag visar fångade rea-varor + "Byt in" som fäller ut en inbäddad dag-väljare (inget cross-view klick-fångande). Bytet går via `/api/replace-recipe` med besparingen medskickad, uppdaterar in-memory-planen + re-renderar. Premiumvyns hero-besparing blir en knapp som öppnar popupen; auto-öppnas en gång efter optimerad generering (`plan-generator.js`).
- **Verifierat:** `buildDealCandidates`-tester i `match.test.js` (103→111). Hela sviten grön — match 111, corpus 35, shopping 81, select 432, data-mapper 27, day-ops 34, willys-offers 11, dispatch 93, cookies 29 (**853 assertions**). `node --check` rent. Versioner: `styles.css?v=107`, `app.js?v=104`, SW-cache v12.
- **Kvar:** live-verifiering på mobil (se *Väntar på live-verifiering*). Ny **Kontroll #2** inlagd: dispatch till varukorgen måste välja just den rea-produkt besparingen räknats på (produktkod, ej bara canon-namn).

---

## Session 88 (2026-06-16) — Willys Plus-erbjudanden + dashboard-bantning

Två separata uppgifter.

- **Dashboard-bantning (PR #85, mergad):** dashboarden i CLAUDE.md hade svällt till en vägg av avklarad historik. Kollapsade de sex klara faserna (1, 3, 4, 6, 7, 8) till en "Klart"-rad, flyttade Session 87-prosan + live-verifieringen hit till arkivet, behöll bara aktivt innehåll. Netto −89/+35 rader.
- **Willys+ medlemserbjudanden — utredningen klar (Fas 1C2):** jämförde inloggat vs inkognito-svar från `campaigns/online?type=PERSONAL_GENERAL`. Identiska → Willys Plus-erbjudanden är **generiska klubbpriser, ingen inloggning behövs**, ligger redan i feeden appen hämtar anonymt. Hela 3-fas-utforskningen (BankID/cookie/scripted login) faller bort. `PERSONAL_SEGMENTED` var en återvändsgränd (tomt — individuellt riktade kuponger).
  - **Åtgärd:** `normalizeOffers()` tittade bara på `promotionType`, aldrig `campaignType`. Nu: (1) offers får `loyalty:true` när vald promo är `LOYALTY` → trådas genom `savingMatches` → "Willys Plus"-badge i besparings-popoveren; (2) `SubtotalOrderPromotion` släpps in (guard: `threshold` 0/null) → fångar klubbpriser som föll bort förut (Oxfilé −100 kr/kg, vattenmelon −15 kr/kg).
  - **Verifierat:** ny `tests/willys-offers.test.js` (11 assertions). Hela sviten grön — match 103, corpus 35, shopping 81, select 432, data-mapper 27, day-ops 34, willys-offers 11, dispatch 93, cookies 29 (**845 assertions**). Versioner: `styles.css?v=106`, `app.js?v=103`, SW-cache v11. Detaljer: `docs/research-willys-plus-2026-06-16.md`.
  - **Kvar:** live-verifiering mot produktion (badge syns + nya fynd räknas in) — se *Väntar på live-verifiering*.

---

## Session 87 (2026-06-12, natt) — Dagflytt-robusthet: flimmerfritt, atomära skrivningar, day-ops-tester

Mål (användarbegäran, nattjobb): byt/flytta/fri dag kändes oresponsivt, heron blinkade/fladdrade, och byten med historiska dagar fungerade inte som önskat. Förbättra UX-polish + säkra databaskopplingen. → **PR #83.**

- **Flimret löst i roten — sektionsvis diff-rendering:** `renderDeluxe()` skriver nu till fem persistenta sektioner (`setSec`: history/hero/banner/today/days, `.dlx-sec { display: contents }`) och byter innerHTML BARA när sektionens HTML faktiskt ändrats. Heron byggs aldrig om vid kortexpansion/byten, och realtime-ekot från egna skrivningar blir en visuell no-op.
- **Eko-dämpning:** egna skrivningar satte tidigare igång `loadWeeklyPlan()` via realtime ~1 s senare (full omhämtning = blinket). Nu: `suppressEcho()` sätter `window._planMutateUntil` (4 s) som `subscribeMealDays`-handlern respekterar; den hoppar också över reload när premiumvyns byt/flytta-läge är aktivt.
- **Responsivitet:** state-driven swap/flytt (`_dlxSwap/_dlxMove = { from, pending }`). Målval ger OMEDELBAR feedback — bannern växlar till "Byter dag…/Flyttar dag…" med spinner, källa+mål pulserar (`.dlx-busy`), och vid fel ligger läget kvar så man kan välja nytt mål eller avbryta. `_opBusy`-spärr mot dubbel-tryck/parallella åtgärder. Escape avbryter. Glöd-kvitto (`.dlx-flash`) på berörda dagar efter lyckad åtgärd. Bannern är sticky (följer med när man scrollar bland målen).
- **Historiska dagar:** aktiva planens passerade dagar är fullvärdiga byt-källor och mål (var redan tillåtet i backend — nu tydligt markerade). Ogiltiga mål (arkiverade veckor, egen planering, fria dagar, passerade tomma dagar) är nedtonade (`.dlx-dim`) men tryckbara → förklarande toast (arkiv är snapshots i `plan_archives` och kan inte muteras). Markeringarna beräknas i renderingen (`modeCls`) — inga imperativa klasspatchar som tappas vid re-render.
- **Backend-kvalitetssäkring (`api/_shared/day-ops.js` + omskrivna endpoints):**
  - Rotationslogiken utbruten till rena, enhetstestade funktioner (`planAfterMove`/`planAfterFree`/`planAfterUnfree`/`changedRows`) med **hård invariant: receptmängden får aldrig ändras** — verifieras före varje skrivning, annars 500 utan att röra DB.
  - **Atomära skrivningar:** rotationer går som EN bulk-upsert mot PK `(household_id, date)` (meal_days har INGEN id-kolumn — komposit-PK). Byt-mot-tom-dag är nu en enda `UPDATE date` (raden behåller allt) istället för insert+delete. skip-day free skapar svansdagen FÖRE rotationen → ett avbrott kan aldrig tappa recept (värsta fall en tillfällig dubblett).
  - **Alla DB-fel kontrolleras nu** — supabase-js kastar inte; tidigare `Promise.all`-skrivningar kunde misslyckas TYST och svara "ok". Varje write checkar `error` och ger begriplig svenska.
- **Verifierat:** ny testsvit `tests/day-ops.test.js` (34 assertions: rotation åt båda håll/sist/no-op, fria dagar pinnade, free→unfree round-trip exakt återställning, invariant, changedRows-minimalitet). Hela sviten grön — match 103, corpus 35, shopping 81, select 432, data-mapper 27, day-ops 34, dispatch 93, cookies 29 (**834 assertions**). `node --check` rent. Versioner: `styles.css?v=105`, `app.js?v=102`, SW-cache v10.
- **Live-verifierat (Joakim, 2026-06-13):** byt dag (inkl. historiska/passerade dagar), flytta dag (kläm in mellan dagar), fri dag (free/unfree) och byt mot tom dag — alla bekräftade live i den installerade appen. Flimmerfritt, responsivt, inköpslistan orörd.

---

## Session 86 (2026-06-11) — Helhetsomtag (Fable 5-natten): feedback, matlagningsläge, PWA

Mål (användarbegäran, fria händer): nattjobb med komplett analys + omtag där det ger värde. Två granskningsagenter auditerade frontend/backend; implementation på branch `claude/fable5-redesign-overhaul-4rb4dx` → **PR #73, preview-testad av Joakim och mergad till main 2026-06-12**.

- **Feedback-fundament (`js/ui/feedback.js`):** toast-system (`showToast`) + promise-baserad bekräftelsedialog (`confirmDialog`) i appens designspråk. Alla `alert()`/`confirm()` ersatta (shopping-list, ingredient-preview, kassera plan, ta bort recept, rea-varningen). **"Rensa lista" hade INGEN bekräftelse — nu kräver den en.** Borttagna inköpsvaror får "Ångra"-toast (raden hämtas före delete, återinsätts vid ångra).
- **Inköpslistan:** progressrad "X av Y klara" + progressbar (`updateShopProgress` uppdaterar på plats, även från realtime), kategoriräknare "klara av totalt", touch-vänliga rader (~48px), runda checkboxar, premium-kortstil. Nycklar/bock-logik orörda.
- **Matlagningsläge (`js/ui/cook-mode.js`):** "Börja laga" i receptdetaljen (receptboken via `renderDetailInner` + premiumvyn via `dlx-cook-btn`) → fullskärmsvy med stor text, bockbara ingredienser + steg, progressbar och **Wake Lock** (skärmen släcks inte vid spisen; återtas vid visibilitychange).
- **PWA:** `manifest.webmanifest` + `service-worker.js` (navigering: nät först, cache bara offline; statiska filer: stale-while-revalidate; `/api/` + andra origins rörs aldrig) + ikoner i `icons/` från `scripts/generate-icons.py` (ren Python, tallrik i Scandi-paletten, maskable + apple-touch-icon). Registreras i `app.js` med relativ sökväg (Vercel + GitHub Pages).
- **"Ikväll"-rad i premium-heron:** `buildTonight()` visar dagens middag (recept/egen planering/fri dag); tryck expanderar dagens kort.
- **Touch & tillgänglighet:** −/+-steppers runt sifferfälten i inställningarna (`stepNum`), `.prot-btn` ≥40px, `.pill-toggle` utökad träffyta (~44px), header-tab-kontrast 0.45→0.72, `.pill-untested`-kontrast höjd. Tomma matsedelsvyn fick CTA "+ Skapa matsedel" (`openNewPlan`). Receptkorten fick proteinfärgad rygg (samma språk som premiumvyns dagkort).
- **Backend-härdning:** `handler.js` maskerar programfel (TypeError m.fl.) med generiskt svenskt meddelande — avsiktliga `new Error("…")` visas fortfarande; `skip-day`/`swap-days` skriver nu med `plan_id`-filter (skyddar egen planering-rader på samma datum); `generate.js` validerar serverside (max 15 dagar, inställningsvärden klampas till spannet).
- **Verifierat:** `node --check` rent på alla ändrade filer; hela testsviten grön — match 103, corpus 35, shopping 81, select 432, data-mapper 27, dispatch 93, cookies 29 (800 assertions). Versioner: `styles.css?v=98`, `app.js?v=95`.
- **Efterfix (PR #74 + #75):** matlagningslägets progressrad döljdes bakom iPhone-pannan (Dynamic Island) i installerad app — sticky-`top` flyttad till `env(safe-area-inset-top)` + linen-remsa som täcker safe-arean vid scroll. Remsan måste vara ett riktigt element (`.cook-safe-strip` i normalt flöde) — sticky på `::before` till scroll-containern fastnade inte på iOS.
- **Efterfix (PR #76):** premiumvyn gömde ALLA dagåtgärder på bekräftad plan — "Byt dag" + "Fri dag — skjut planen" ska (som i klassiska vyn) finnas kvar även efter bekräftelse, eftersom de inte ändrar receptmängden/inköpslistan. Gaten delad i `canReplace` (slumpa/välj själv, kräver obekräftad) och `canMove` (byt/fri dag, kräver bara aktiv plan).
- **Efterfix (PR #77):** Ikväll-kortet ERSÄTTER nu dagens kort i listan (dubblerade samma info). Kortet visar datum ("Ikväll · Fredag 12 juni"), expanderar till full receptdetalj vid tryck (`recipeDetail` återanvänds, `<article>` — inte `<button>`, nästlade knappar är ogiltig HTML) och deltar i byt dag-flödet (`data-kind="recipe"` markeras som swap-källa/mål). Helt oplanerad dag (gap) ligger kvar i listan som "+ Planera dagen".
- **Efterfix (PR #79):** Ikväll-kortets datum flyttat till vänsterkolumn (`.dlx-day-when`/`dow`/`date` återanvänds) — samma layoutspråk som dagkorten. Eyebrow är åter bara "Ikväll". **(PR #80):** luft mellan Ikväll-kortet och första dagkortet (margin 0.2→0.9rem).
- **Ny funktion (PR #81): Flytta dag + Byt dag mot tomma dagar.** `api/move-day.js`: källdagens recept lyfts ur och kläms in före vald dag (eller sist) — innehållet roteras över plandagarnas fasta datum, fria dagar pinnade, inköpslistan orörd. Premiumvyn visar pulsande släppzoner (`.dlx-drop-zone`, `moveZoneCtx()` filtrerar no-op/passerade positioner; zon även före Ikväll-kortet + sist). `api/swap-days.js` gap-gren: byt mot oplanerad dag = receptet flyttas dit, källdagen blir tom, 409-krockskydd mot egen planering, plan-gränser räknas om + persisteras. Gap-klick routas via `dlxGapClick` (swap-läge → mål, flytta-läge → ignorera, annars egen planering). Fria dagar exkluderade som swap-mål. Se *Väntar på live-verifiering*.
- **Efterfix (PR #78):** "Visa historik"-knappen ersatt med scroll-reveal: historiken ligger i flödet ovanför heron, vyn positioneras vid heron via `snapToHero()` (flikbyte/lägesbyte/första datarender — ALDRIG på interaktions-omrenderingar, skulle rycka i scrollen) och `html { scroll-snap-type: y proximity }` + snap-ankare på `.dlx-hero` (gate: `.has-history`) gör att lätta uppåtscrollar fjädrar tillbaka — en bestämd scroll tar fram historiken. `--header-h` exponeras från scroll.js för `scroll-margin-top`.
- **Kvar:** snabbkoll mot produktion efter merge (se *Väntar på live-verifiering*).

---

## Session 85 (2026-06-08) — Premiumvyns dagkort: jämn höjd + veckonummer

Mål (användarbegäran): justera "Helg"-indikatorns läge i dagkorten — den gjorde att helgkort blev högre än vardagskort — och lägga till veckonummer i listan.

- **Helg → diskret prick på färgryggen:** textpillen "Helg" togs bort ur `dayBadges()` (låg staplad i vänsterkolumnen → varierande korthöjd). Helg markeras nu som en liten prick (`var(--lichen-deep)` + halo) på dagkortets färgrygg via `.dlx-day.is-weekend .dlx-rail::after`. Klassen injiceras på ett ställe i `renderDayCard()` (`html.replace('class="dlx-day', …)`) så alla 5 korttyper (recept/custom/fri/gap) täcks utan att röra varje mall. Suppr. på "idag" (rust-ramen räcker). Markören ligger utanför flödet → alla kort lika höga.
- **Veckoavdelare:** ny `renderDayList()` interfolierar en tunn `<div class="dlx-week-sep">Vecka N</div>` där ISO-veckan byter (ingen avdelare före första kortet — hero visar redan startveckan). Används för både kommande och historik. CSS: centrerad etikett med linjer på båda sidor (`var(--moss-muted)`/`var(--birch-soft)`). Hero-rutan visar fortsatt "Vecka X" / "Vecka X–Y".
- **Beslut bekräftade med användaren:** prick-på-rygg (ej hörnmärke/inline) + avdelare-i-listan (ej per-kort).
- **Verifierat:** `node --check` ren på modul + `app.js`. Hela beroendefria testsviten grön (match 103, corpus 35, shopping 81, select 432, data-mapper 27). Versioner bumpade: `styles.css?v=94`, `app.js?v=92`. Klassiska vyn + all plandata orörd.
- **Kvar:** live-verifiering på mobil mot produktion (se *Väntar på live-verifiering*).

---

## Session 84 (2026-06-08) — Premiumvy för matsedeln (alternativ high-end vy)

Mål: bygga en helt alternativ vy/utformning av fliken Matsedeln som hanterar alla befintliga funktioner — imponerande, välfungerande, snygg och praktisk. Startad autonomt (användaren sov).

- **Beslut:** additiv parallellvy, inte ersättning. Klassiska vyn + all plandata orörd (hård regel). Segmenterad växel **Premium/Klassisk** (presentationspreferens i `localStorage`), Premium som default.
- **Arkitektur:** ny VSA-modul `js/weekly-plan/plan-viewer-deluxe.js` (självinjicerande: lägger till växel + `#weekDeluxe`-container i `#weekContent`). Läser samma data (`window._timelineByDate`, `_lastPlan`, `RECIPES`) och **wrappar `renderWeeklyPlanData`** så båda vyerna alltid hålls i synk. Åtgärder återanvänder befintliga endpoints (`/api/replace-recipe`, `/api/swap-days`, `/api/skip-day`) + window-funktioner (`enterReplaceMode`, `openCustomDay`, `openBlockedDay`, `openSavingPopover`, confirm/discard).
- **UI:** mörkgrön hero med veckosammanfattning (måltider, vegdagar, sparat, proteinbalansmätare) + vertikala redaktionella dagskort (protein-färgrygg, inline-expansion av ingredienser/steg/noteringar) + egna swap-läge, hopfällbar historik, egen planering, fria/tomma dagar. CSS i `css/styles.css` (block "PREMIUMVY"). Versioner bumpade: `styles.css?v=93`, `app.js?v=90`.
- **Verifierat:** `node --check` ren, hela beroendefria testsviten grön (match 103, corpus 35, shopping 81, select 432, data-mapper 27). PR #69 → **mergad till main** (fast-forward `943c0fd`) på användarens begäran (preview-URL nåddes inte pga Vercels förhandsvisningsskydd → testas på produktionsadressen istället).
- **Kvar:** live-verifiering på mobil mot produktion (se *Väntar på live-verifiering*).

## Session 83 (2026-06-07) — Nattjobb: receptkvalitet (ingredienser + pedagogik, autonomt)

Mål: systematiskt gå igenom alla 262 recept och korrigera ingredienslistor + uppenbara logikfel, optimerat för inköpslistegenerering. Kördes oövervakat (schemalagd start 05:05). Spec: `docs/superpowers/specs/2026-06-07-receptkvalitet-nattjobb-design.md`. Slutrapport: `docs/qc-night/report-2026-06-07.md`.

- **Beslut (brainstorm):** konservativ steg-redigering (fixa uppenbart, flagga oklart), alla säkra fält utom `title`/`id`, live-skrivning med full backup + revert-bar rapport.
- **Arkitektur:** Endast MCP kan skriva till Supabase. Tre roller: *omdöme* (modellen föreslår ändrade fält), *validering* (`scripts/qc-night/validate.mjs` — 5 hårda invarianter mot den riktiga parsern: ingen prissatt ingrediens tappas, audit-icke-regression, sifferbevaring i steg, struktur/enum-skydd), *skrivning* (MCP). Dataväg: anon-läs/skriv-**bryggor** (`qc_export`/`qc_import` + PostgREST med publika anon-nyckeln) → ingen hand-transkribering av prod-data. Backup = in-DB snapshot `recipes_qc_backup_20260607` (primär revert) + JSON i git.
- **Resultat:** **37 recept ändrade live, 225 rena, 0 skippade, 21 flaggade.** Audit **P1 68→12 (−82%)**, P0 kvar 0; viktad svårighetsgrad −42% (1337→782). Fixmönster: stekolja→"till stekning", garnering→"till servering", `en nypa`→`1 nypa`, citrus skal+saft→`N citron`, mangled "X eller Y"/"/"→canon, rubrikrader-som-ingredienser (#63), "utan ben/skinn"-brus bort, herb-split (#93), ris-mangling (#124 "och kylt vitt"→ris).
- **Verifierat:** beroendefri testsvit grön (match 103, match-corpus 35, shopping 81, select 432, data-mapper 27). End-to-end `buildShoppingList` på ändrade recept ger rena rader. Bryggor borttagna; bara snapshot-backupen kvar.
- **Not:** Canon-tabell-tillägg (kod) hölls medvetet utanför (data-scope). P2 sänktes inte (kvar ~660) — domineras av ofarliga "uppdelat"/"på burk"-beskrivningar som redan parsas rätt + äkta namn utan canon. Se canon-kandidatlistan i rapporten + *Öppna utredningar*.

## Session 82 (2026-06-06) — Prestanda: upplevd lagg eliminerad (mätt mot live)

Mål: appen ska kännas helt lagg-/laddfri vid öppning och scroll. Mätte baslinjen mot live med Playwright under 4× CPU-strypning (≈ mellanklassmobil), åtgärdade, deployade och ommätte.

- **Rotorsak:** `renderRecipeBrowser()` byggde alla ~262 receptkort *med fulla dolda detaljer* (ingredienser+instruktioner) upfront → **13 340 DOM-noder**, 4 977 dolda `<li>`. Funktionen tog **~1251 ms** under 4× strypning och körs vid **varje sökbokstav, varje filter och vid laddning** → kändes som total frysning.
- **Fix 1 — lazy receptdetalj** (`recipe-browser.js` + `recipe-editor.js`): `renderCard` lämnar `.detail-inner` tom; `ensureDetail(card)` bygger den först vid öppning, flaggar `dataset.rendered`. DOM **13 340 → 4 486 noder (−66%)**, render **1251 → 161 ms (−87%)**. Sök matchar fortfarande på `window.RECIPES`-datan (ej DOM) → ingen regression.
- **Fix 2 — debounce sök** (`app.js`): listan byggs om först 140 ms efter sista tangenttryck. X-knappen uppdateras direkt.
- **Fix 3 — resurs-hints** (`index.html`): `preconnect` gstatic/supabase/jsdelivr + `modulepreload` av Supabase-ESM → snabbare kallstart.
- **Fix 4 — scroll-reflow** (`scroll.js`): cacha header-höjd i variabel (ResizeObserver håller den färsk) ist.f. `offsetHeight` per scroll-frame (tvingad layout).
- **Fix 5 — household-cache** (`supabase-client.js`): `household_id` cachas i localStorage (nyckel `hh:<userId>`) + `getSession` (lokalt) ist.f. `getUser` (nätverk) → tar bort ~590 ms sekventiell runda vid omladdning.
- **Verifierat live (deploy f65b183):** 262 kort, alla detaljer tomma tills öppning, öppnat kort får rätt ingredienser+steg. Matsedel-tidslinjen lätt (60 dagskort, 354 noder). Tester gröna (match 103, dispatch 88, shopping 81, select 432, data-mapper 27). Cache-bust `app.js?v=89`.
- **Not:** Playwright bakgrunds-throttlar `requestAnimationFrame` till 1 fps (idle rAF = 1001 ms oavsett DOM) → scroll-FPS går ej att mäta i harnessen; den enda rena mätningen (innan throttling rörts) gav 7 ms/frame, 0 droppade, redan med den *större* DOM:en. Scroll är alltså inte boven; den lättare DOM:en gör den ändå billigare.

---

## Session 81 (2026-06-05) — Nattjobb: matchnings-härdning (4 faser, auto-mergat)

Självgående nattjobb i 4 faser, en PR per fas, alla auto-mergade till main. Kod-only, test-gated, ingen live-data rörd. Full rapport: `docs/match-hardening-natt-2026-06-05.md`.
- **Fas 1 — täckning (PR #61):** ~45 nya canon-mappningar (havregryn, couscous, senap/dijonsenap, pastor: spaghetti/makaroner/tagliatelle/fettuccine, alla nudel-typer→`nudlar`, lagerblad, kardemumma, muscovado/farin→`socker`, hasselnötter/pekan/pistasch, kärnmjölk, savojkål/salladskål/palsternacka/sparris/kålrabbi, isbergssallad→`sallad`, edamame, kidneybönor, jordgubbar/blåbär/hallon/päron). CANON_SET → 220. Kategori-fix: kärnmjölk→Mejeri, edamame/kidneybönor→Grönsaker.
- **Fas 2 — reject-härdning (PR #62):** globalt reject breddat till alla icke-ingrediens-klasser (`barnmat|klämmis|ostbågar|kattmat|hundmat|djurfoder` + färdigrätt). `smör`→nötsmör-reject. `lime`/`apelsin`→läsk-reject (juice OK). Ny `tests/match-corpus.test.js` (35 accept/reject-fall) wired i hooken.
- **Fas 3 — självgranskning (PR #63):** moduler sunda; 1 robusthetsfix (`extractOfferCanon`/`rejectsMatch` coercar `offer.name || ""`).
- **Tester:** match 51→103, ny korpus 35. dispatch 81 / shopping 81 / select-recipes 432 / data-mapper 27 oförändrade gröna.
- **Bedömningsfall (väntar på Joakim, se rapport):** (1) ska generisk "grädde" få falla till vispgrädde? (2) ~~potatis/toalettpapper = köpenhet-bugg~~ **FIXAD (PR #65)** — se nedan. (3) full audit av långsvansen kräver Supabase-nätåtkomst (blockerat i nattmiljön).
- **Uppföljning samma session — lösvikts-fix (PR #65):** `addProducts` hårdkodade `pickUnit: "pieces"`. Willys-koder bär enheten i suffixet (`_ST` styck / `_KG` lösvikt). Lös potatis (`_KG`, pris/kg) skickad som "pieces" → 400 `error.illegal.argument` → "kunde inte matchas" trots korrekt träff. Ny `pickUnitForCode(code)` → `"kilograms"` för `_KG`, annars `"pieces"` (oförändrad default = ingen regression för styckvaror). +7 assertions (dispatch 81→88). **Live-verifiera:** vikt-enumet `"kilograms"` är inferred (`"pieces"` PoC-bekräftad); strikt förbättrande oavsett.

## Session 80 (2026-06-04) — Willys-export: felmatchningar + fabrikat-blockering + täckning

- **Bakgrund:** Session 79:s sök-fallback höjde träffarna 27→43, men live-körningen visade tre felmatchningar och en saknad funktion.
- **Runda 2 (live 46 varor, timeout borta):** tre nya felmatchningar fixade. `sallad` → "Salad Endive" (reject `endive|frisé|cikoria|witlof`). `yoghurt` → "Samoa Original Yoghurt" (yoghurt-reject utökat med `samoa|kokos|lakrits|dessert|drick…`). "Mac & Cheese"-färdigrätt → nytt **globalt** `PREPARED_DISH_RE` i `rejectsMatch` (`mac & cheese|färdigrätt|micro|panerad`) som gäller alla canons, eftersom färdigrätter ofta innehåller canon-ord. Kvar omatchat: bara `potatis` + `toalettpapper` (cart-add-enhet, se nedan).
- **Felmatchningar (reject-mönster i `shopping-builder.js`):** sökträffar som innehöll canon-ordet men var fel produktvariant slank igenom exakt-steget:
  - `citron` → "Citron Kolsyrat Vatten" (läsk). Nytt mönster: `kolsyrat|kolsyrad|läsk|soda|smoothie|sirap|nektar`.
  - `yoghurt` → "Körsbär Yoghurt" (smaksatt). Nytt mönster: fruktsmaker (körsbär/jordgubb/hallon/vanilj…). "Turkisk yoghurt" är egen canon → opåverkad.
  - `mjölk` → "Kondenserad mjölk". Utökat mönster: `kondenserad|mjölkpulver|mjölkfri`.
- **Fabrikat-blockering (önskemål):** blocklistan i Inköpspreferenser användes bara i AI-prompten, aldrig i "Skicka till Willys". Nu läser `dispatch-to-willys.js` `dispatch-preferences.json` (`fetchBlockedBrands()`) och trådar `blockedBrands` genom `matchCanons` (rea) + `createSearchClient` (sök). Ny `brandBlocked(offer, brands)` i `willys-matcher.js` matchar på namn + brandLine. Blockerad rea-vara faller automatiskt till sök efter ej-blockerat alternativ.
- **Täckning (lexikon i `shopping-builder.js`):** `frysta gröna ärter`→`ärtor`, `lätt färskost`→`färskost` (+ Mejeri-kategori), `kycklingbröst …`→`kycklingfilé`, `bananer`→`banan`, `toalettpapper`/`hushållspapper` self-canon (→ exakt-steg istället för fallback).
- **Timeout-fix (samma session):** fler matchningar (43+) gjorde att ~40 separata "lägg i korg"-anrop + ~60 sökningar översteg 60s-taket. Åtgärd i `dispatch-to-willys.js`: (1) `addProductsInBatches()` ersätter en-i-taget — lägger 8 varor per anrop, splittrar bara en *nekad* batch till en-i-taget (bevarar allt-eller-inget-isoleringen). (2) sök-parallellitet 6→10 (publika läsningar). Partiellt-lyckat-testet uppdaterat till realistisk allt-eller-inget-mock.
- **Tester:** match 60→78, dispatch 77→81. shopping 81 / select-recipes 432 / data-mapper 27 oförändrade gröna.
- **Kvar (ej fixat):** `potatis` matchar troligen men add:en faller — lös färskvara prissätts per kg, men `addProducts` skickar `pickUnit: "pieces"` → 400 → hamnar i "kunde inte matchas". Kräver pick-unit per produkt från sökresultatet. Separat live-diagnos. *(Åtgärdad i Session 81 / PR #65.)*

## Session 79 (2026-06-04) — Bättre matchnings-täckning vid Willys-export (sök-fallback)

- **Bakgrund:** Session 78:s skarpa körning hade 24 omatchade varor. Vanliga varor (färs, banan, toalettpapper m.fl.) hamnade aldrig i korgen.
- **Rotorsak:** Sök-fallbacken i `willys-search.js` krävde att produktens **återextraherade canon var exakt lika** med sök-canonen (`extractOfferCanon(result) === canon`). För strikt: när vi aktivt söker Willys på en term är topp-träffen nästan alltid rätt produkt, även om dess namn stemmar till en **annan** canon ("färs" → "Nötfärs" → `köttfärs`) eller till **ingen** canon ("banan", "toalettpapper") → `extractOfferCanon` ger `null` → avvisas.
- **Fix — tvåstegs-sök** (`willys-search.js`): Steg 1 behåller exakt canon-likhet (skyddar `vitlöksklyftor` → "Lök Vit Stor" och `grädde` → spraygrädde). Steg 2 är en **relevans-fallback**: om inget exakt-canon-träff finns, ta första köpbara, ej avvisade träff vars namn delar ordstam med sök-termen. `rejectsMatch` gäller i båda stegen. Sök-storlek 10→20 (fler kandidater för exakt-steget).
- **`relevantToCanon(canon, text)`** (ny, `willys-matcher.js`): canon-token (≥4 tecken) ska dela ordstam med produkt-token (identisk / prefix / suffix). Fångar sammansättningar (nötFÄRS) + plural (BANANer ⊃ banan), men avvisar korta/felplacerade deltoken ("vit"/"lök" ⊄ "vitlöksklyftor").
- **Tester:** match 51→60, dispatch 74→77. shopping 81 / select-recipes 432 / data-mapper 27 oförändrade gröna.
- **Kvar:** ren live-körning för att mäta ny täckning. Lexikon-utökning för vanlig färskvara (självcanons) kan höja exakt-steget ytterligare — ej akut.

## Session 78 (2026-06-04) — Fas 4F slutförd: "Skicka till Willys" live (27 varor i korgen)

- **Bakgrund:** Användaren ville slutföra Fas 4F (cookie-refresh + dispatch). Visade sig att server-setupen (gist + env vars) redan fanns sedan Session 42 — bara extension-installation + felsökning återstod.
- **Felsökning i ordning (varje fix egen squash-PR mot main):**
  1. **Timeout** (PR #48): `matchCanons` körde sök-anrop sekventiellt → 20s+. Parallelliserat med bounded concurrency (6). +`maxDuration` på dispatch.
  2. **Auth 401** (diagnos via DIAG/CK-loggar runt Vercel-loggtrunkering): cookie-setet var komplett (`JSESSIONID`+`axfoodRememberMe`) men sessionen **inaktuell** i gisten. "Uppdatera nu" i extensionen löste det. Inga Akamai/bot-cookies (replay funkar i princip).
  3. **400 error.illegal.argument** (PR #54): Willys `addProducts` är **allt-eller-inget** — en ogiltig kod sänker hela batchen. Fix: `addProductsOneByOne()` lägger varje produkt separat (concurrency 6), giltiga hamnar i korgen, ogiltiga → `missing`. +partiellt-lyckat-test.
  4. **FUNCTION_INVOCATION_TIMEOUT** (PR #55): per-produkt + sök översteg 15s. maxDuration 15→60, frontend-abort 20s→60s, cache-bust `app.js?v=88`.
- **Resultat:** skarp körning → `addedCount: 27` (6 rea + 21 sök), 24 omatchade (matchnings-täckning, separat). All tillfällig diagnostik bortstädad.
- **Tester:** dispatch 70→74 assertions. match/shopping/select-recipes/data-mapper oförändrade gröna.
- **Kvar att förbättra (ej akut):** matchnings-täckningen — vanliga varor som färs, potatis, bananer, toalettpapper matchade inte (Fas 1D). Dashboard-omstrukturering påbörjades men pausades för 4F.

## Session 77 (2026-06-03) — Ingrediens-kvalitetskontroll: plan + audit-verktyg (Fas 8.0)

- **Bakgrund:** Mål att minska problem vid generering av ingrediens-/inköpslistor. En optimal ingrediens har definierbar mängd (antal/vikt/volym).
- **Nyckelfynd:** `recipes.json` (263 recept) har glidit isär från Supabase (262 recept, id upp till 271). Inget i runtime läser filen — Supabase är sanningskällan. Beslut (användaren): städa i Supabase, **retirera `recipes.json` helt**.
- **Audit (`scripts/audit-ingredients.mjs`):** läser live från Supabase REST (eller `--source`-export), klassar 3 791 rader i 5 problemklasser med severity. Beroendefritt (plain `fetch`). Baseline: **P0=1** (`⅔ dl olivolja` — fraktionsbugg), **P1=309** (saknad mängd + flerradiga), **P2=1372** (567 icke-canon-namn + brus). "Namn (mängd)"-format räknas ej som defekt (parsern hanterar det).
- **Levererat:** plan `docs/ingredient-qc-plan-2026-06-03.md`, verktyg + rapport `docs/ingredient-audit-2026-06-03.md` + `ingredient-audit-latest.json`. PR #47.
- **Fas 8.1 + 8.2 (samma session):** Fraktionsfix (⅓⅔⅛) — P0 1→0, +5 assertions. Canon-utökning ~80 mappningar — täckning 17%→30%, P2 1372→728, C1 1294→517. Tester gröna (match 51, shopping 67, select-recipes 432).
- **Fas 8.3 (samma session):** Dry-run-analysen visade att merparten av P1 var (a) mängd i senare parentes/klausul som parsern missade och (b) falska positiva (adjektiv-"och", valfria garneringar) — **inte** äkta dataluckor. Löste därför i kod: doh-parsern skannar alla parenteser + "ca/från/+/storleksadjektiv"; audit hoppar vaga/valfria + adjektiv-"och". **P1 309→68 utan att röra live-datan** (säkrast). +14 assertions (shopping 81/81). De 68 kvarvarande är genuin författar-vaghet och renderas acceptabelt i listan.
- **Fas 8.4 (samma session):** `recipes.json` retirerad (hade glidit isär från Supabase). Ny delad källa `scripts/_lib/recipes-source.mjs` (REST, beroendefri) + `export-recipes.mjs` → gitignorerad cache som synkrona läsare/Python använder. Import-pipelinen (`scrape`/`promote`) skriver nu direkt till Supabase (dry-run-stöd kvar). 5 obsoleta engångsskript spärrade med tydligt meddelande. Kanoniskt ingrediensformat dokumenterat i CLAUDE.md. **Fas 8 helt klar.**
- **Resultat hela Fas 8:** P0 1→0, P1 309→68, P2 1372→772, canon-täckning 17%→30%, tester 545→564. Ingen live-data muterad.

## Session 76 (2026-06-03) — Flytta-knappen göms i ihopfälld ingredienssektion

- **Önskemål:** "Flytta till inköpslista"-knappen syntes alltid under ingredienssektionen, även när ingredienslistan var ihopfälld. Skulle döljas inom respektive ingredienslista.
- **Rotorsak:** `#flyttaBtn` låg utanför den hopfällbara `.ingredient-section-body` → `max-height`-kollapsen påverkade aldrig knappen.
- **Fix:** flyttade in knappen i `.ingredient-section-body` (index.html) + `padding-bottom: 1.2rem` på öppen sektion (css). Normal vy = ihopfälld → knappen dold; vid ny plan auto-expanderas sektionen (`expand=true`) → knappen syns. Ingen JS-ändring (`renderIngredientPreview` oförändrad).
- **Cache-bust:** `css/styles.css?v=92`.

## Session 75 (2026-06-02) — Säsongsanpassning syntes inte i räknaren

- **Symptom:** "Säsongsanpassning"-toggeln kändes som att den inte gjorde något — antalet recept "inom filtret" ändrades inte när den slogs på.
- **Rotorsak (två delar):** (1) `seasonWeight`-kryssrutan saknade `onchange` → triggade aldrig omräkning. (2) Räknaren "X recept matchar dina filter" (`updateSettingsPreview`) tittade bara på protein/oprövat/måltidstaggar, aldrig på säsong. Dessutom är säsong **medvetet en mjuk viktning** (2×/1×/0,5×, Fas 6C), inte ett hårt filter — den tar aldrig bort recept, så antalet kan inte sjunka.
- **Beslut (användaren):** behåll mjuk viktning (ingen risk att genereringen slår i taket vissa årstider), men **gör effekten synlig**.
- **Fix:** `onchange="updateSettingsPreview()"` på toggeln + ny `seasonForDate()` (samma indelning som backendens `getCurrentSeason`). När toggeln är på visar räknaren `… · Y i säsong (sommaren)`.
- **Verifierat:** `node --check` på `plan-generator.js`; frontend-säsongslogiken jämförd rad-för-rad mot `api/generate.js`; Supabase-data kontrollerad (240 taggade recept, värden `vår/sommar/höst/vinter`).
- **Cache-bust:** `js/app.js?v=87` (CSS oförändrad).

## Session 74 (2026-06-02) — Buggfix: namnändring i inköpslistan sparades inte

- **Rotorsak:** `renameShopItem` gjorde `parseInt(inputEl.dataset.id, 10)` — men `shopping_items.id` är en **UUID-sträng**, inte ett heltal. `parseInt` stympade UUID:n till ett meningslöst tal → `.update().eq('id', …)` matchade ingen rad (0 uppdaterade, inget fel) → namnet sparades aldrig och `updateNameInMemory` hittade inget → texten snäppte tillbaka. (Borttagning fungerade eftersom den använde id-strängen direkt utan `parseInt`.)
- **Fix:** använd `inputEl.dataset.id` som sträng rakt av. Dessutom uppdateras minnet nu **optimistiskt före** DB-anropet, så att en re-render (t.ex. "✓ Klar") visar nya namnet direkt istället för att tävla med den asynkrona sparningen; återställning sker bara vid faktiskt DB-fel.
- **Verifierat:** RLS tillåter UPDATE (members-policy på `shopping_items` via `list_id`→household). shopping-testet oförändrat.
- **Cache-bust:** `js/app.js?v=86` (CSS oförändrad, v=91).

## Session 73 (2026-06-02) — Inköpslista: redigerbar varutext i redigera-läge

- **Önskemål:** I redigera-läget ska man kunna ändra en varas text till vad man vill.
- **`itemTextCell(name, rowId)`** (ny): renderar ett `<input class="item-edit-input">` i redigera-läge (annars `<span class="item-text">`). Gäller både recept- och manuella varor.
- **`renameShopItem(inputEl)`** (ny): `onchange`/Enter → uppdaterar `shopping_items.name` (via `data-id`) + minne, utan omladdning. Recept: bara `rebuildShopText()` (positionsnycklar opåverkade). Manuella: full re-render (textbaserade nycklar måste räknas om). `updateNameInMemory()` migrerar manuella bock-nycklar.
- **`toggleEditMode`** re-renderar nu så text↔fält växlar.
- **XSS-härdning:** eftersom varunamn nu är användarredigerbara escapas receptvarornas text överallt (tidigare oescapad `${item}`), samt i kopiera-listan-HTML (`shop-text-items`). Klippbordstexten (`_fullText`) förblir rå.
- **Cache-bust:** `css/styles.css?v=91`, `js/app.js?v=85`. shopping-testet 62/62.

## Session 72 (2026-06-02) — Inköpslista: borttagning på plats + stabil kategoriordning

- **Önskemål:** Borttagen ingrediens ska försvinna utan att sidan laddas om, och kategoriordningen (t.ex. Mejeri) ska inte ändras.
- **Rotorsak:** `removeShopItem`/`removeManualItem` körde `loadShoppingTab()` (full DB-omladdning). `buildShopState` byggde kategoriordning från `.order('position')` — men `position` är per-kategori, så lika värden tie-breakas icke-deterministiskt av Postgres → kategorierna hoppade om vid varje omladdning. Dessutom triggade realtime-DELETE en *till* `loadShoppingTab()`.
- **Fix:** `applyRemovalById(id)` (ny) tar bort varan ur in-memory-state, re-keyar receptvarornas index kontigerligt och re-renderar från minnet (`renderFullShoppingList`) — ingen DB-fetch, ingen omladdning. `removeShopItem`/`removeManualItem` använder den. Realtime-`DELETE` gör samma sak på plats (lokala borttagningar blir no-op).
- **Stabil ordning:** `CATEGORY_ORDER` + `sortCategories()` i `buildShopState` → kanonisk ordning (Mejeri, Grönsaker, Fisk & kött, Frukt, Skafferi, Övrigt) även vid full laddning.
- **Cache-bust:** `js/app.js?v=84` (CSS oförändrad). shopping-testet 62/62.

## Session 71 (2026-06-02) — "Gör fri dag" / "Ångra fri dag" (free/unfree)

- **Rotorsak:** Frontend skickade `action: 'free'`/`'unfree'` men `api/skip-day.js` validerade bara `skip`/`block`/`unblock` (Session 54:s omskrivning hade aldrig committats — bara `b1b62e9`-versionen fanns). "Gör fri dag" gav 400.
- **`api/skip-day.js` omskriven** till `free`/`unfree` med rätt semantik:
  - **free:** vald dag blir fri (blockerad, inget recept); allt fr.o.m. den dagen skjuts en dag framåt och matsedeln **förlängs en dag** (`end_date + 1`) så inget recept tappas. Krockskydd om nästa dag redan har en rad (egen planering) → 409.
  - **unfree:** invers — fria luckan tas bort, allt dras bakåt, sista dagen tas bort, `end_date` krymper.
- **Inköpslistan rörs inte:** receptmängden är invariant vid free/unfree, så ingen ombyggnad sker → bockningar bevaras. Frontend återanvänder `window._lastShop` så ingrediensförhandsvisningen inte blankas.
- **Modellnyckel:** meal_days = en rad per kalenderdag i `[start_date, end_date]` (konsekutiva). Skift sker på `content`-array frikopplat från datum, sedan mappas tillbaka.
- **Verifierat:** standalone-simulering av skift-logiken (free→unfree round-trip == original; första/sista-dag-edge). `node --check` på berörda filer. Inte kört mot live-DB (skulle mutera användarens aktiva plan).
- **Felmeddelanden:** `modifyDay` visar nu serverns vänliga svenska meddelande (t.ex. krock) istället för bara generiskt.
- **Cache-bust:** `js/app.js?v=83` (CSS oförändrad, v=90).

## Session 70 (2026-06-02) — Redigera-läge i inköpslistan (ta bort varor helt)

- **Önskemål:** Kunna ta bort ingredienser helt ur inköpslistan, inte bara bocka av dem. Tidigare hade bara manuella varor en ×-knapp; receptvaror gick bara att bocka.
- **Redigera-läge:** Ny knapp "✎ Redigera" (`#editModeBtn` → `toggleEditMode()`) ovanför listan i handla-vyn. Aktiv → `#shoppingList` får klassen `.editing` → en ×-knapp (`.remove-item-btn`) visas på *varje* vara (recept + manuell). Knappen blir "✓ Klar". I redigera-läget gör radklick inget (bara × tar bort) — `toggleShopItem` early-returnar på `window._editMode`.
- **`removeShopItem(key)`** (ny): slår upp rad-id via `window._shopItemIds[key]`, raderar `shopping_items`-raden, laddar om med `_preserveChecked=false`. Manuella varor använder fortsatt `removeManualItem`.
- **`buildShopState` robustgjord:** nycklar baseras nu på kompakt index (0..n) per kategori istället för DB-`position`. Annars hamnade bock-state fel efter en borttagning (luckor i `position` → render-index och nyckel-index divergerade). Sorterar rader på `position` före indexering.
- **`setShopMode`:** döljer redigera-raden i text-vyn och lämnar redigera-läget vid byte till "Kopiera lista".
- **Cache-bust:** `css/styles.css?v=90`, `js/app.js?v=82`. shopping-testet 62/62 oförändrat.

## Session 69 (2026-06-02) — Lyft fram receptbyte i ej-bekräftad matsedel + bakgrundsbugg i meal_days-API:er

- **Hotfix (rotorsak till "Kunde inte byta recept"):** `api/replace-recipe.js`, `api/swap-days.js` och `api/skip-day.js` läste/uppdaterade `meal_days` via en `id`-kolumn som **inte finns** — tabellen har sammansatt nyckel `(household_id, date)`. PostgREST returnerade fel på den okända kolumnen → `data` null → endpointen svarade 404 "Dagen hittades inte i veckoplanen". Latent sedan Supabase-migrationen (Session 59), men osynlig eftersom knapparna låg gömda. Fix: `.select()` utan `id`, `.maybeSingle()`, och `.update().eq("household_id", …).eq("date", …)`. Verifierat mot live-DB via runtime-loggar + SQL.
- **Bakgrund:** Funktionerna att slumpa/välja recept fanns redan (`replaceRecipe`, `enterReplaceMode`), men låg gömda under "Ändra dag"-disclosuren från Session 68. Önskemål: lyft fram dem i preview-läget (ej bekräftad plan) innan inköpslistan byggs.
- **Detaljpanel:** "Slumpa nytt recept" + "Välj manuellt" lyfts ut ur disclosuren till en primär `.day-replace-actions`-rad (rust-primärknapp + outline) med hint-text. Disclosuren "Fler val" innehåller nu bara sekundära åtgärder (byt dag, gör fri dag, redigera egen planering). Gäller bara `canReplace = !readOnly && !planConfirmed && !isCustom`.
- **På kortet:** Den gamla `.swap-icon-btn` (bara byt dag) ersatt av `.day-card-actions`-kluster med två `.card-icon-btn`: 🔀 slumpa (`shuffleDay`) + ⇄ byt dag. Syns när kortet är markerat. Nya ikoner `ICON_SHUFFLE` + `ICON_PENCIL`.
- **`shuffleDay(date, btnEl)`** (ny): läser nuvarande recept-id live från kortet, anropar `/api/replace-recipe`, uppdaterar `window._lastPlan` och gör full re-render — undviker stale state.
- **`updateLastPlanDay()`** (ny hjälpare): håller `window._lastPlan` i synk även för panel-baserade byten (`replaceRecipe`, `selectRecipeForDay`) → en senare full re-render kan aldrig återställa en bytt dag (hård regel: befintlig veckoplan får aldrig förstöras).
- **`confirmPlan`:** tar nu bort `.day-card-actions` från korten efter bekräftelse (gamla `.swap-icon-btn.confirmed`-raden var en no-op — CSS-regeln saknades).
- **Tester:** match 51 / select-recipes 432 / shopping 62 / data-mapper 27 — oförändrade. (cookies + dispatch-testerna kräver `node_modules` och hoppas över lokalt.)
- **Cache-bust:** `css/styles.css?v=89`, `js/app.js?v=81`.

## Session 68 (2026-05-27) — Tidslinje-UX: matsedel-gruppering, kalender-datum, arkivkollaps

- **Matsedel-gruppruta (sticky etikett):** Ersatte absolut-positionerad `.plan-group-backdrop` med en vanlig flex-behållare `.plan-group` som omsluter matsedelns `.timeline-day`-element. Etiketten ("Matsedel 9 maj – 31 maj") har `position: sticky; left: 16px` och följer horisontell scroll utan JS-lyssnare. Bakgrundsfärg `--moss-soft`, etikettfärg `--lichen-deep`.
- **Kalender-stil datum:** Veckodag + datum lyftes ur korten till `.timeline-day-date`-etikett ovanför varje kort. `is-today` / `is-past` / `is-weekend` / `archive-day` på `.timeline-day`-wrappern → CSS styr färg.
- **Tillagningstid på kort:** `recipe.time` visas som `.week-day-time` (0.62rem, text-muted).
- **Arkivkollaps:** Arkivdagar döljs som standard (`archive-collapsed`). "Historik (N)"-chip i nav expanderar/kollapserar. `TIMELINE_DAYS_CAP` utökad till max 365d bakåt. OBS: chipsen syns bara när arkivdagar inte överlappas av aktiv plan.
- **"Ändra dag"-disclosure:** Knappar (byt recept, hoppa över, byt dag) samlas under `<details class="day-actions-details">`.
- **Cache-bust:** `css/styles.css?v=83`, `js/app.js?v=74`.

## Session 67 (2026-05-27) — Buggfix: dubbel Matsedeln-rubrik

- **Dubblerad rubrik borttagen:** `content-heading` lades till i Session 66 men den gamla `<h2 class="section-title">Matsedeln</h2>` inne i `#weekContent` togs aldrig bort → dubbla rubriker på mobil. Cache-bust v=70→71.

## Session 66 (2026-05-27) — Desktop-navigering + Amanda-fix

- **Supabase CLI installerad** (v2.101.0 via npm).
- **Amanda-fix:** `amanda.weimar@gmail.com` saknades i `household_members` → `getHouseholdId()` returnerade null. Lades till som `owner` via Supabase MCP. Inga kodändringar.
- **Ny registrering avstängd** (Authentication → Email → "Enable email signups" = off).

## Session 64 (2026-05-24) — Fas 3 klar + städning

- **`GEMINI_SCHEMA_PROMPT` utökat** med enhetskonvertering (cups→dl, tbsp→msk, oz→g, °F→°C m.fl.) + ingrediensöversättningar (heavy cream→vispgrädde, baking soda→bikarbonat m.fl.).
- **`postProcessForeignRecipe(recipe, apiKey)`** — anropas efter `extractJsonLd()` om domän ej `.se`. Kör Gemini för konvertering + översättning. Graceful degradation om Gemini misslyckas.
- **`callGemini()` splittad** i `callGeminiRaw()` + `callGemini()` för återanvändning.
- **`mapJsonLdToRecipe()`** strippar prisannoteringar (`$0.17*`) + tomma parenteser. Returnerar `seasons: []`.
- **Fas 3C live-verifierad:** budgetbytes.com, kochbar.de, jamieoliver.com → svenska ingredienser + metriska enheter.

## Session 63 (2026-05-24) — Realtime-subscriptions + 6E säsongsfix

- **`shopping_items`-prenumeration** i `shopping-list.js`: `subscribeShoppingItems(listId)` — riktad DOM-uppdatering vid UPDATE, full reload vid INSERT/DELETE. `unsubscribeShoppingItems()` vid clear.
- **`meal_days`-prenumeration** i `plan-viewer.js`: `subscribeMealDays(householdId)` — reload om inga aktiva interaktioner. Guard mot dubbelkoppling.
- **Feedback-loop-skydd:** `_checkedItems[key]` sätts optimistiskt → server-bekräftelse matchas mot lokal state → early return.
- **6E:** 3 säsongstaggar rättade i `recipes.json` + Supabase: ID 12, 98, 172.

## Session 62 (2026-05-24) — Auth-fix + arkitektur-sida

- **Arkitektur-sida** (`architecture.html`): SVG-diagram över GitHub/Vercel/Supabase/Willys/Gemini. Tillgänglig på `/architecture.html`.
- **Auth-omskrivning:** Magic link fungerade inte i iOS PWA (separata localStorage-utrymmen). OTP testades men Supabase rate-limitade. Slutlig lösning: **lösenordsbaserad inlogg** via `signInWithPassword`.
- **Lösenord satt via SQL:** `UPDATE auth.users SET encrypted_password = crypt(...)` — alla fick `hejhej22`.

## Session 61 (2026-05-23) — Städa efter Supabase-cutover

- **Borttaget:** `dualReadCheck()`, `api/recipes.js`, `api/custom-days.js`.
- **`api/shopping.js` trimmad** 53→25 rader: behåller bara `get_preferences`/`set_preferences`.
- **`toggleTested` migrerad** till Supabase i `recipe-browser.js`.
- **"Flytta till inköpslista"-knappen** fixad — `recipe_items_moved_at` mot Supabase direkt.
- **Vercel-funktioner:** 12→10.

## Session 60 (2026-05-23) — Fas 7E: cutover till main

- **Fas 7 KLAR** — `claude/crazy-mcclintock-d47bcb` mergad till `main` (commit `45a6433`).
- **Buggfix:** `api/confirm.js` satte `recipe_items_moved_at: null` → inköpslistan visades aldrig. Fix: sätts till `today`.
- **Buggfix auth:** `joakimweimar@gmail.com` lades till i `household_members`. Båda adresserna är nu owners.
- **671 assertions** (51 match + 62 shopping + 432 select-recipes + 70 dispatch + 29 cookies + 27 data-mapper).

## Session 59 (2026-05-23) — Fas 7D: all backend mot Supabase

- **`api/_shared/supabase.js`** (ny): service-role-klient med lazy Proxy-initialisering. `getHouseholdId()` hämtar första household.
- **`api/_shared/handler.js`**: `createSupabaseHandler` — CORS utan GITHUB_PAT.
- **`api/generate.js`**: recept från `recipes`-tabell, historik från `recipe_history`, arkiv till `plan_archives`, plan som `weekly_plans` + `meal_days`, shopping i `shopping_lists`/`shopping_items`.
- **`api/confirm.js`**: `confirmed_at` på `weekly_plans`, ny shopping-lista med items, bevarar manuella varor.
- **`api/skip-day.js`**: hämtar `meal_days`, shift i minne, batch-uppdaterar. **`api/swap-days.js`**, **`api/replace-recipe.js`**, **`api/discard-plan.js`**, **`api/dispatch-to-willys.js`**: alla mot Supabase.
- **671 assertions** oförändrade.

## Session 58 (2026-05-23) — Fas 7C steg 3: frontend mot Supabase

- **`js/app.js`**: recept från `recipes`-tabellen. **`js/recipes/recipe-editor.js`**: CRUD via Supabase, GitHub-polling borttagen.
- **`js/shopping/shopping-list.js`**: `buildShopState(list, items)` från Supabase-rader. `scheduleCheckedSave` batch-uppdaterar (max 2 requests). `addManualItem`→INSERT, `removeManualItem`→DELETE.
- **`js/weekly-plan/plan-viewer.js`**: fyra nya Supabase-hjälpfunktioner (`loadArchive`, `loadCustomDays`, `loadActivePlanFromSupabase`, `loadShopSummaryFromSupabase`). Custom-days skriver till `meal_days`.
- **545 assertions** oförändrade.

## Session 57 (2026-05-20) — Hotfix: appen laddade inte

- **Rotorsak:** Session 55:s manuella-varor-fix stängde `<li>`-template-literalen för tidigt → syntaxfel → hela ES-modulgrafen laddade aldrig.
- **Fix:** Sammanhängande template-literal. `onclick`-nyckel → citatsäkert `data-key`-attribut.
- **Lärdom:** `node --check` på alla `js/`-filer bör ingå i Definition of Done. Cache-bust v=67→68. PR #34 mergad.

## Session 56 (2026-05-20) — Nattjobb: schemalagd P1-fixning

- 12 P1-buggar fixade av remotejobb (CCR) kl 03:27 via `claude.ai/code/routines`. Commit `9ebe94e`. 644 assertions oförändrade.

## Session 55 (2026-05-20) — P1-buggfixar från kodgranskning

- `api/recipes.js` + `api/import-recipe.js`: `seasons`-fält tillagt i nya/importerade recept
- `api/dispatch-to-willys.js`: `res.ok`-kontroll på shopping-list-fetch
- `api/_shared/secrets-store.js`: cache nollställs innan skrivning (eliminerar stale-read-race)
- `js/shopping/shopping-list.js`: `removeManualItem` → `data-item`-attribut; bock-nycklar baseras på text (`manual::${item}`)
- `js/shopping/dispatch-preferences.js`: `prefsLoaded` sätts bara vid lyckad fetch; `savePrefs` debounced 500ms
- `js/shopping/dispatch-ui.js`: `AbortController` 20s timeout
- `js/weekly-plan/plan-viewer.js`: fade-lyssnare trackar DOM-referens efter re-render
- `js/weekly-plan/plan-generator.js`: `tureDays + vegDays` valideras + cappas mot `total_days`
- `css/styles.css`: `@keyframes spin` → `spinFast` för `.import-spinner`
- **644 assertions** oförändrade.

## Session 54 (2026-05-17) — Fri dag-sammanslagning + fri swap

- **`skip-day.js` omskriven** till två actions: `free` (skjuter framåt + förlänger) och `unfree` (drar bakåt + krymper). "Hoppa över"+"Blockera" → en knapp "Gör fri dag".
- **Fri swap:** `swap-days.js` omskriven. Byte mot fria plan-dagar + gap-dagar utanför planen (förlänger med fria dagar). Arkiv och custom-days avvisas.
- **Swap-UX:** Capture-phase click-lyssnare fångar swap-target-klick. `enterSwapMode` highlightar bredare urval.
- **644 assertions** oförändrade. Cache-bust v=64.

## Session 53 (2026-05-12) — Kodgranskning + P0-buggfixar

- **Kodgranskning:** 8 parallella agenter, 210 fynd (19 P0, 41 P1, 24 XSS m.fl.). Rapporter: `docs/review/00-summary.md` + `01`–`08`.
- **P0-fixar:** (1) `seasons: r.seasons || []` i fetchRecipes, (2) recipe-history uppdateras vid receptbyte, (3) saving/savingMatches kopieras vid skip, (4) `vitlöksklyftor` i Grönsaker, (5) swap blockeras på bekräftad plan + null-guards, (6) XSS-härdning: `escapeHtml()` i `utils.js`, applicerad i `renderIngredient`, `renderDetailInner`, `recipe-browser.js`, `shopping-list.js`.
- **545 assertions** oförändrade.

## Session 52 (2026-05-11) — Fri dag-interaktion + swap bakåt + Säsongsoptimering

- **Fri dag klickbar:** Panel med "Ångra fri dag" (`unblock`-action) + "Skriv notering" (→ custom-day).
- **Swap bakåt i tiden:** Tillåts på förflutna dagar i aktiv plan. `data-past` skiljer förflutna från readonly-arkiv.
- **Säsongsoptimering (Fas 6 klar):** 242 recept taggade `seasons`. `applySeasonWeight()`: 2x/1x/0.5x. Toggle i inställningar + filter i receptboken.
- **545 assertions**. Cache-bust v=62.

## Session 51 (2026-05-10) — Fas 1F live-verifierad + Inköpspreferenser + AI-prompt

- **Fas 1F:** `dry_run`-parameter verifierade prisoptimeringen end-to-end.
- **Inköpspreferenser:** Varumärkesblocklist + eko/svenskt-toggles. Sparas via `api/shopping.js` (`get_preferences`/`set_preferences`). Spec: `docs/superpowers/specs/2026-05-10-dispatch-preferences-design.md`.
- **AI-inköpsprompt:** Copy-paste-text för Claude i Chrome med varumärkesregler + oavbockade varor + 2s delay.
- **545 assertions**. Cache-bust v=60.

## Session 50 (2026-05-07) — Desktop-tidslinje + taggfilter + Ture-dagar

- **Desktop:** Tidslinje full bredd (max 1400px) vid ≥900px. Fade-gradienter via `.fade-left`/`.fade-right`.
- **Taggfiltrering:** Dynamiska checkboxar, `EXCLUDED_TAGS` exkluderar system-/protein-/kök-taggar.
- **Ture-dagar:** `ture_days`-parameter. `preferNonTure`-logik sparar ture-recept åt ture-dagar (loops 1–3). Buggar fixade: processingOrder sorterar ture-dagar först; `hasTure()` lowercase; 3 ture-recept fick `vardag30`; tidig validering om poolen är tom.
- **432 assertions** (538 totalt: 44 match + 62 shopping + 432 select-recipes).

## Session 49 (2026-05-06) — Buggfix inköpslista: kategorisering + truncering

- **Kategori-bugg:** `low.includes(kw)` → ordmängd-matchning `lowWords.has(kw)`. Fixar pankoströbröd→Mejeri, mangold→Frukt m.fl.
- **Trunceringsbugg:** `grönsaks- eller kycklingbuljong` → basnomen från afterEller-delen.
- **Filtrering:** "efter smak" strippas i `cleanIngredient()`.
- **62 assertions** oförändrade.

## Session 48 (2026-05-06) — Buggfix inköpslista (doh-mängder) + oprövade-fix
- **Inköpslista:** 5 rotorsaker: slash-bråk, ord-gräns på qtyPart, decimal-komma, float-avrundning, `nävar`/`huvuden` i SWEDISH_UNITS. 62 assertions.
- **Oprövade recept-gräns:** `underUntestedLimit()`-kontroll i alla pick()-loopar. Loop 5 som sista utväg. Test 13 tillagd.

### Höjdpunkter 31–47
Tidslinje-polish + custom-days (31–33); kassera-förslag + CDN-bugg (34); matchningsaudit 125→149 matches, CANON_REJECT_PATTERNS (35); testtäckning shopping + selectRecipes, PostToolUse-hooks (36); Willys cart-API PoC (37); Willys-dispatch full implementation + sökfallback (38–39); brainstorming cookie-refresh (40); mobil bottom-tab-nav (41); cookie-refresh-automation Chrome-extension MV3 + secret gist (42); design-system Scandi/nature (43); knapp-harmonisering fem tiers (44); 197 doh-recept scrapade (45); receptbrowser full refaktor + promotion (46); safe-area sticky-header-fix (47).

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

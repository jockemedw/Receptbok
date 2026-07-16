# Åtgärdslista — nattauditen 2026-07-12

Todo för att beta av auditens fynd, i rapportens rekommenderade ordning. Bocka av per rad; varje batch är tänkt som en egen session/PR med testsvit grön + versionsbump (vid frontend) enligt Definition of Done. Detaljer per fynd (evidence, repro, fixförslag): `docs/qc-night/repo-audit-2026-07-12.md` + `audit-verified.json`.

**Regler:** Batch 2 (DDL) körs ALDRIG utan Joakims uttryckliga OK i sessionen. Datamuterande batchar (1, 2, 5) testas mot hela sviten. Inga fixar får bryta invariant #1–#5.

## Batch 1 — Error-koll-svepet (P0-1 + Tema A) · backend — ✅ KLAR 2026-07-12
Mönster: destrukturera `{ data, error }` och kasta — handler.js översätter till svenskt fel.
- [x] **F089 (P0!)** `api/generate.js:372` — custom-day-guardens läsning: kasta vid `error` (invariant #1-skyddet)
- [x] F006 `api/confirm.js:30` — receptläsningen vid bekräftelse
- [x] F011 `api/confirm.js:42` — överföring av manuella varor + bockar
- [x] F012 `api/confirm.js:109` — `confirmed_at`-skrivningen (fire-and-forget)
- [x] F013/F221 `api/generate.js:89` — `fetchExistingShoppingList` (fel ≠ "ingen lista")
- [x] F005 `api/replace-recipe.js:112` — bytets skrivningar
- [x] F007 `api/replace-recipe.js:128` — listombyggnadens läsning
- [x] F313 `api/swap-days.js:110` — plan-gränsernas persist-fel (svar ≠ DB)
- [x] Bonus (samma tema): plans-/mealDays-läsningarna i `confirm.js:9/20` felkollas också (gav tidigare vilseledande 400)

## Batch 2 — DB-migrationer (P0-2 + F287) · F287 ✅ KÖRD 2026-07-16, F215 HÅLLS
SQL-filerna finns committade i `db/migrations/` (007 = F287, 008 = F215) och är idempotenta.
- [x] **F287** — `007` KÖRD mot live-Supabase 2026-07-16 (Joakims uttryckliga OK, via Management-API:t). Pre-koll: publikationen hade bara family_lists/-items. Efter: `meal_days` + `shopping_items` ligger nu i `supabase_realtime` → den döda cross-device-synken är väckt. **Kvar: live-verifiera realtime mellan två telefoner** (kan inte avgöras headless).
- [ ] **F215 (P0!)** HÅLLS (Joakims val 2026-07-16) — kräver JSON-dump av `recipes_qc_backup_20260607` (revert-snapshot Session 83) före `008`. Kör vid separat OK.
- [ ] Info (inget krav): `dispatch_preferences`-tabellen ligger förprovisionerad men okopplad (backlog #5) — dokumenterad, beslut vid #5-bygget.

## Batch 3 — Bockar & list-id (Tema C+D) · frontend — ✅ KLAR 2026-07-12 (live-verifiera 2 telefoner)
- [x] F229/F244/F252 `js/shopping/shopping-list.js:316–322` — bock-sparning full-state → delta (`_pendingChecks`-Map, mönster finns i `lists-view.js`)
- [x] F230 `shopping-list.js:63` — no-op-UPDATE:ar triggar omladdning med `_preserveChecked=false`
- [x] F035 `shopping-list.js:322` — manuella varors bockar sparas aldrig (nyckel-mismatch)
- [x] F036 `shopping-list.js:747` + F057 `js/today/today-view.js:364` — stale cachat list-id efter list-byte
- [x] F038 `shopping-list.js:30` — realtime-prenumeration migreras aldrig vid list-byte (hushållsskopa eller re-subscribe)

## Batch 4 — Parserfixar med korpus-bevis (Tema F) · backend — ✅ KLAR 2026-07-12
- [x] F306 `api/_shared/shopping-builder.js:543` — "X i olja/lag/spad" → self-canons + TOKEN_BLOCKLIST (6 recept drabbas)
- [x] F307 `:522` — self-canons "krossade/passerade tomater" (14 rader)
- [x] F308 `:448` — hoppa %-klausuler i doh-parsningen ("grädde (36)")
- [x] F270 `:481` — "X till Y"-intervall + decimalkomma-som-satskomma
- [x] P2-extra vid samma tillfälle: F309 (fläskkotlett/ost-kategorisering), F310 ("för N pers"-suffix), F311 (datastädning recept #271 — skrivande, kräver OK)
- [x] Efteråt: kör `scripts/audit-ingredients.mjs` + korpus-koll igen och jämför problemandelen (baslinje 0,40 %)

## Batch 5 — Plan-livscykelns integritet (Tema B) · backend — DELVIS KLAR 2026-07-12 (F090/F024/F194); F219/F232/F312 DEFERRADE (kräver nya RPC:er/DDL + Joakims OK)
- [ ] (DEFERRAD) F219 `api/generate.js:200` — meal_days-skrivningen in i den atomära RPC:n
- [ ] (DEFERRAD) F232 `api/generate.js:202` — `pg_advisory_lock` per hushåll mot samtidiga genereringar
- [ ] (DEFERRAD) F312 `api/swap-days.js:54` — RPC-transaktion + `sameRecipes()`-assert (vakten move/skip redan har)
- [x] F090 `api/generate.js:162` — arkivera ALLA gamla dagar som raderas, inte bara före nya startdatumet
- [x] F194 `api/generate.js:116` — confirmDialog i wizarden när bekräftad plan skulle ersättas
- [x] F024 `plan-viewer-deluxe.js:460` — blockera "Byt dag" mot passerade custom-dagar (+serverguard i swap-days)

## Batch 6 — Realtime-klientfixar (Tema E rest) — ✅ KLAR 2026-07-12 (live-verifiera)
- [x] F231 `plan-viewer.js:27` — släppta events → `_planStale`-flagga + omhämtning när läget avslutas
- [x] F259 `plan-viewer.js:28` — städa övergivna interaktionslägen i switchTab
- [x] F029 `lists-view.js:205` — `flRenameInput` in i KEEP_FIELDS

## Batch 7 — Prisoptimering & Willys-siffror (Tema G) — ✅ KLAR 2026-07-12
- [x] F290 `api/willys-offers.js:137` — kr/st vs kr/kg i `savingPerUnit` (fel besparing hela kedjan)
- [x] F292 `api/_shared/willys-cart-client.js:45` — flerköps-krav ("2 för X"): visa villkor + rätt qty/styckbesparing
- [x] F195 `prisoptimera.js:266` — varning innan byte på bekräftad plan (nollställer bockar)

## Batch 8 — Generering & wizard (Tema H) — ✅ KLAR 2026-07-12
- [x] F295 `api/_shared/select-recipes.js:89` — "endast Vegetarisk" gör generering omöjlig → preflight/veg-alla-dagar
- [x] F051 `plan-generator.js` — Blockera-dag-togglen tappar `blocked` vid rebuild

## Batch 9 — Dispatch (Tema I) — ✅ KLAR 2026-07-12
- [x] F078 `dispatch-ui.js:29` — busy-spärr mot dubbel dispatch
- [x] F076 `dispatch-preferences.js:49` — AI-prompten ska respektera skafferiet
- [x] F077 `dispatch-preferences.js:15` — blockera savePrefs när laddningen misslyckats (skriver annars över)
- [x] P2-syskon vid samma tillfälle: avbockade varor ska inte dispatchas (`dispatch-to-willys.js:365` — läs+filtrera `checked`, spegla pantry-filtret)

## Batch 10 — Import (Tema J) — ✅ KLAR 2026-07-12 (F067 live-verifiera på mobil)
- [x] F067 `recipe-import.js:137` — förhandsvisningen får aldrig `.open` (troligen trasigt flöde — verifiera live först)
- [x] F197 `recipe-import.js:137` — AbortController vid stängd import-sheet

## Batch 11 — Custom-dagar (Tema K) — ✅ KLAR 2026-07-12 (i Batch 6-committen)
- [x] F042 `plan-viewer.js:326` — visa fel när custom-val tyst hoppar över
- [x] F043 `plan-viewer.js:824` — `postCustomDays` ska signalera kollision
- [x] F255 `plan-viewer.js:851` — trim + tom-guard i `saveCustomDay`

## Batch 12 — App-skal & övrigt (Tema L) — ✅ KLAR 2026-07-12 (styles v169/app v135/SW v82)
- [x] F162 `js/app.js:33` — "appen har vilat" även på Idag-fliken
- [x] F196 `js/app.js:88` — Android-bakåtknapp: history-state för sheets/modaler
- [x] F083 `supabase-client.js:97` — återvisa auth-gaten vid utgången session
- [x] F266 `styles.css:3700` — dölj import-FAB när bottom-sheet är öppen
- [x] F212 `plan-viewer-deluxe.js:1090` (+today-view.js:20, plan-viewer.js:769) — ersätt handrullade escapers med `utils.jsStringAttr` (XSS)
- [x] F182 `prisoptimera.js:98` — tangentbord + ≥44px i deal-grupperna

## Batch 13 — P2-svepen · SÄKRA RENDER-FYND ✅ KLARA 2026-07-16 (workflow, ~65 fynd)
Fil-klustrad städ-workflow (10 agenter + verify), hela sviten grön, render-only + inert (canon separat). Version-bump styles v170/app v136/SW v83.
- [x] **CSS & markup:** touch-targets ≥44px (F143–156,170,171,187,188,201,204,177), WCAG-kontrast (F157/158/161/184/185/186), [hidden]-guards + overscroll (F144,267,268), aria-markup (F177/178/181/189,236), F142 dlx-sheet scroll-lås. **+ död klassisk CSS borttagen (~474 rader)** — `.timeline-*`, `.plan-group`, `.week-day-card` + compound; KEEP-selektorer verifierat orörda.
- [x] **feedback.js-klustret:** focus-trap, fokusåterställning, scroll-lock/inert, aria-live-host (F299–303).
- [x] **JS render/a11y/fel:** tangentbordsåtkomst (F174,180,190,191,192), svenska felfallbacks (F054,070,117,122,165,166,211,242,286,168), död kod (F135,001,050), text/format (F237,238,239,240,028,193,188), willys-offers isNaN-guard (F228).
- [x] **PWA:** maskable-ikon precache (F003), neutral manifest-färg (F160).
- [x] **Canon (separat commit, datamuterande):** F113 dubblettnyckel + canon-kandidater i NORMALIZATION_TABLE. Restpost: `offers.json` raderad.
- [ ] **Medvetet lämnade (designbeslut, ej render-only):** F155 (färg/ikon-väljarens tätpackade träffytor), F159 (mörk-tema-toast inverse-surface), F304 (toast pointer-events = interaktionsändring). Tas som designsteg om önskat.
- [x] **Inköpslistans parser-kvalitet (6 fynd, PR #186, datamuterande/testgrindat):** F105 (generell slash-bråk), F106 (eller-ombyggnad ordgräns), F107 (friendlyRound-golv, ej "0 dl"), F109 (svensk å/ä/ö-sortering), F110 (implicit+"st"-merge), F271 (osynliga tecken/NBSP). 15 nya regressionsassertions i shopping.test.js (99→114), korpus grön.
- [ ] **Kvar av Batch 13 (kräver Joakims OK — invariant-känsligt/utåtriktat):** `generate.js`-felhärdning F092/F094/F095/F225 (plan-aktivering, invariant #1) · dispatch-idempotens F124/F226/F126/F127/F128 (dubbel Willys-korg) · rate-limiting F208/F209/F210 · F108/F269 (kategoriserings-ordning, högre regg-risk) · F256 (case-okänslig tagg-matchning, recept-skrivväg) · api-felkontrakt-svepet (Batch 1-mönstret för icke-generate/dispatch-endpoints) · tester F272–274 · resterande js P2 per område.
- [ ] **Säkra defensiva guards (kan tas autonomt nästa omgång):** F134 (extractRecipeCanons TypeError-guard — stänger annars av prisopt för hela hushållet), F133 (BABY_FOOD_RE), F138 (alert HTTP-fel), F141 (proxy `this`), F116/F118/F119/F282 (import-validering), F123 (död kod).

## Live-verifiering (Joakim, mobil — även i status.md-kön)
- [ ] Riktig `/api/deals` + dispatch → Willys-JSON-formaten parsas fortfarande
- [ ] Extremgenerering (alla-veg + proteintoggle) mot riktiga korpusen
- [ ] Import-förhandsvisningen (F067) — syns den överhuvudtaget?
- [ ] Efter F287-migrationen (KÖRD 2026-07-16): realtime mellan två telefoner (bocka/planera på den ena → syns på den andra)
- [ ] Skärmläsartest av fel-toasts

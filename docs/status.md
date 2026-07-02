# Receptboken — Status & Dashboard

Rörlig projektstatus (roadmap, buggar, verifieringskö, utredningar, senaste session).
Den **stabila** projektkontexten bor i `CLAUDE.md`. Den här filen ändras ofta — läs den
vid sessionstart eller när du behöver veta vad som är öppet. Arkiv: `docs/session-log-archive.md`.

<!-- DIGEST:START -->
## Snabböversikt
- **Kända buggar:** inga bekräftade.
- **Konfig som väntar på Joakim:** (1) **kör `db/migrations/001_activate_plan_atomic.sql`** i Supabase SQL Editor → aktiverar atomär plan-aktivering (main säker även utan den, fallback finns) · (2) sätt `ALERT_WEBHOOK` (ntfy.sh) i Vercel → larm vid tyst Willys-degradering.
- **Verifieringskö (mobil, ej körd skarpt):** Session 105 nattjobb (pinch-zoom funkar nu + veckovyn renderar normalt efter död-kod-städ) · Session 102 nattjobb (svenska fel-toasts + död kod borttagen) · Session 101 nedmontering klassisk vy · Session 100 byt dag för egna anteckningar · Kontroll #2 dispatch rätt rea-vara.
- **Bygg näst:** #12 portionsskalning · #15 "Ikväll"-snabbredigerare · Hemköp parallell dispatch (PoC klar) · #5–7 Willys-cookies → Supabase/RLS.
- **Full detalj nedan.** Äldre verifieringspunkter (Session 84–96) ligger i `docs/session-log-archive.md`.
<!-- DIGEST:END -->

## Roadmap
**Klart** (detaljer i `docs/session-log-archive.md`): Fas 1 (extrapriser → receptförslag), Fas 3 (internationell receptimport), Fas 4 (automatisk varukorgsfyllning), Fas 6 (säsongsoptimering), Fas 7 (Supabase-migration), Fas 8 (ingrediens-kvalitetskontroll).

**Öppet:**
- **Fas 2 — Familjelärande algoritm:** 2A analysera data · 2B viktningsmodell · 2C "Favoriter"-vy
- **Fas 5 — App Store & monetisering:** 5B auth & datamodell · 5C kostnads-/intäktskalkyl (5A klar: Capacitor, `docs/research-teknisk-vag-app.md`)

## Kända buggar
Inga bekräftade just nu.

## Väntar på live-verifiering (kod klar, ej körd skarpt)
Aktiv kö — de senaste sessionernas ännu ej mobil-verifierade arbete. Äldre punkter (Session 84–96) är arkiverade i `docs/session-log-archive.md` under *Arkiverade verifieringspunkter*.

- **Atomär plan-aktivering (Session 103, PR #103, mergat till main):** `activatePlanAtomic()` i `api/generate.js` byter aktiv plan via en Postgres-RPC (`activate_plan_atomic`) i stället för två separata UPDATE — stänger fönstret där en avbruten process kunde lämna hushållet med noll aktiva planer. **Två lager verifiering kvar:** (1) **kör SQL:en** `db/migrations/001_activate_plan_atomic.sql` i Supabase SQL Editor — innan dess faller koden tillbaka till den gamla (testade) tvåstegsvägen, så `main` är säker oavsett; (2) efter att SQL:en körts: generera en ny matsedel skarpt och bekräfta att den aktiva planen byts korrekt och att den gamla planens dagar arkiveras (`plan_archives`). Hård regel: befintlig veckoplan tas aldrig sönder. Testsvit grön (plan-orchestration 37/37, inkl. nya rollback-/fallback-test), ej körd skarpt mot live-Supabase.
- **Nattjobb Session 102 (PR #100, mergat till main):** snabbkoll på mobil att de frontend-bitar som gått live fungerar normalt: (1) inköpslistans bockning + "Kopiera hela listan" + egen-planering (de tidigare tysta catch-blocken visar nu svenska toasts vid fel — happy path oförändrad), (2) receptbläddraren renderar (död state/filter-stubbar borttagna). Allt övrigt i nattjobbet är backend/test/inert. **Aktivera larmet:** sätt `ALERT_WEBHOOK` (gratis ntfy.sh-topic) i Vercel → pling vid tyst Willys-degradering + utgångna cookies. `pricingDegraded` returneras redan från `/api/generate` (UI-toast för den är ännu ej byggd).
- **Nedmontering av klassiska veckovyn** (Session 101): premium är nu enda vyn — växeln, klassiska tidslinjen och den delade `#weekRecipeDetail`-bottenpanelen är borta. Fri dag + "Redigera egen planering" (custom med recept) fälls nu ut **inline** i premiumkortet i stället för bottenpanelen. Testsvit grön men ej mobil-verifierad. Bekräfta på mobil mot produktion: (1) ingen Premium/Klassisk-växel syns längre, vyn renderar normalt; (2) **fri dag** — tryck på ett fri-dag-kort (även "Ikväll"-kortet om idag är fri dag): editorn fälls ut inline med "Ångra fri dag" + noteringsfält, och båda fungerar; (3) **egen planering med recept** — "Redigera" byter kortet till editorn inline (välj recept / notering / starta matsedel / ta bort), och "Byt dag" finns kvar; (4) generera/bekräfta/kassera matsedel, slumpa, byt dag, flytta dag, fri dag, "Veckans fynd"/Byt in fungerar fortfarande; (5) **hård regel:** befintlig veckoplan tas aldrig sönder. Fel vid fri dag visas nu som toast i stället för i panelen.
- **Byt dag för egna anteckningar** (Session 100): premiumvyn + `/api/swap-days` tillåter nu att en egen anteckning (egen planering, `plan_id null`) byter plats med en receptdag, en annan anteckning eller en tom dag. Bekräfta på mobil: (1) "Byt dag"-knappen syns i en utfälld anteckning (både ren not och not-med-recept), (2) byte not↔recept flyttar anteckningen till receptets datum och receptet till anteckningens datum, (3) inköpslistan är oförändrad efter bytet (samma recept, bara annat datum), (4) befintlig veckoplan tas inte sönder vid avbrutet/upprepat byte.
- **Kontroll #2 — dispatch väljer rätt rea-vara:** när ett Willys-erbjudande utnyttjats (besparing räknats på en specifik produkt) måste varukorgs-exporten (`/api/dispatch-to-willys`, `dispatch-matcher.js`) lägga *just den produkten* i korgen — inte en godtycklig sökträff på samma canon. Verifiera i skarp körning att rea-varan matchas mot erbjudandets produktkod, inte bara namnet.

## Öppna utredningar
**App-analys-backlog (`docs/app-analys-backlog.md` — statusbanner uppdaterad Session 105):** hela **P0 avklarad** — #1/#4/#8/#9/#26/#27 gjordes redan i Session 102-nattjobbet (backlogfilen listade dem felaktigt som öppna → rättat Session 104), #3 klar i Session 103, #2 kod klar (väntar på `ALERT_WEBHOOK`-env). Delvis: #11 (dokumenterad — keep-alive/graceful-fel kvar), #22 (zoom tillåten — knapp/textkomplement kvar), #23 (döda `#weekRecipeDetail`-block borta — dead `.week-day-card` JS/CSS kvar för granskat steg), #24, #25 (`fmtKr`/spegelkod kräver display-/plan-vägs-beslut). Prioriterade nästa steg: **#5–#7** (Willys-cookies ur secret gist → Supabase+RLS, JWT-baserad household-härledning, multi-user dispatch — Fas 5-blockerare), **#10** (custom-days-race). Produktspår: **#12 portionsskalning** + **#15 Ikväll-snabbredigerare** (agenternas två "bygg näst"). Hela listan med väg framåt i backlog-filen.

**Klassiska veckovyn — restpost: död CSS (Session 101):** själva nedmonteringen är **klar** (JS, markup, toggel, delad panel borta; premium enda vyn — se Senaste session). Kvar är bara ofarlig död klassisk-CSS i `css/styles.css` (`.week-day-card`, `.timeline-*`, `.plan-group`, swap-/nav-chip-regler). Den ligger **inflätad** med delade `.custom-*`/`.detail-inner`-regler som premiumvyns inline-editorer använder, så säkrast att städa i ett separat, granskat steg (per-selektor-koll mot receptbläddraren). `.holiday-dot` används av `plan-generator.js` → behåll. Detalj-minne: [[project_remove_classic_view]].

**Receptkvalitet — uppföljning från nattjobbet (Session 83, `docs/qc-night/report-2026-06-07.md`):**
- **Canon-kandidater (kod, EJ tillämpat):** säkra tillägg till `NORMALIZATION_TABLE` (plural-buljongtärningar, self-canons `matvete`/`torsk`/`pizzadeg`/`nori`/`citrongräs`, `portobellosvamp`→champinjoner). Vänta på Joakims OK.
- **Manuell uppdelning behövs:** #27 `oliver och hackade soltorkade tomater` (oliver tappas), #235 `rödkål (…morötter, salladslök, vinäger…)` (slaw-varor saknas). Kräver mängdbeslut.
- **Revert hela jobbet:** in-DB snapshot `recipes_qc_backup_20260607` finns → säg *"revert nattjobbet"*.

**Matchnings-täckning — långsvansen:** full audit av sällan-matchade ingredienser kräver Supabase-nätåtkomst. Öppet bedömningsfall (`docs/match-hardening-natt-2026-06-05.md`): ska generisk "grädde" tillåtas falla till vispgrädde i sök-fallbacken?

*(Willys+ medlemserbjudanden — löst Session 88: generiska klubbpriser, ingen inloggning behövs, ligger redan i `PERSONAL_GENERAL`-feeden. Se `docs/research-willys-plus-2026-06-16.md`.)*

**Hemköp parallell dispatch (PoC klar 2026-06-23 — väntar på beslut att bygga):** Hemköp ligger på samma Axfood-plattform som Willys; korgfyllning är bekräftad genomförbar — `scripts/hemkop-cart-poc.mjs` gav skarpt 200 på auth/sök/addProducts/verify, kod landade i korgen, format `<id>_ST`. Spec: `docs/superpowers/specs/2026-06-22-hemkop-poc-design.md`. Att bygga featuren ("Skicka till Hemköp" parallellt med Willys, två knappar i inköpslistan): (1) parametrisera bas-URL i `willys-cart-client`/`-search`/`-offers` → delade `axfood-*`-klienter; (2) separat Hemköp-cookie-uppsättning — gist-schema per butik + extensionen utökas att fånga `hemkop.se`-cookies; (3) butiksval-UI. **Öppen detalj:** Hemköp-butiks-ID behövs för erbjudande-/rea-matchning (campaigns-endpoint) — fanns ej i PoC-cURL:en, fråga användaren vid bygge. PoC-verktyget körs med rå "Copy as cURL" i `scripts/.hemkop-curl.local`.

## Claudes idéer
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata
- Portionsskalning i matlagningsläget — ×0.5/×2 räknar om mängderna i ingredienslistan

## Senaste session
**Session 105 — Nattjobb: lågrisk-städning (#23 delvis, #22 delvis, #11 delvis):** Joakim bad om ett paketerat nattjobb som städar av lågrisk-punkter som inte kräver hans input eller mobil-verifiering. **Tre punkter, alla verifierade statiskt:** (1) **#23** — tog bort 5 döda `#weekRecipeDetail`-no-op-block i `plan-viewer.js` (397/597/644/850/877; elementet borta ur `index.html` sedan Session 101 → blocken var redan no-ops) + sanerade en vilseledande kommentar. (2) **#22** — tog bort `maximum-scale=1.0, user-scalable=no` ur viewporten i `index.html` → nyp-zoom tillåts nu (a11y). (3) **#11** — dokumenterade Supabase free-tier-pausen + de två luckorna (keep-alive, graceful degradation) i CLAUDE.md. **Metod-fynd (viktigt):** backloggen påstod att `.week-day-card` var död klassisk-kod att ta bort — jag verifierade och det stämmer att klassen renderas *ingenstans* (premium använder `.dlx-day`/`.dlx-tonight`), men de två JS-queries som pekar på den (`plan-viewer.js:29`/`:281`) sitter i den *levande* realtids- resp. swap-vägen → flyttade till samma granskade CSS-städsteg, inte autonomt. (Jag hann påstå fel först — att klassen var *levande* — men verifierade innan jag skrev något skarpt.) **Medvetet ute ur nattjobbet:** #24 (`?v`-cachelinje — syns bara på mobil), #25 `fmtKr` (display-beslut) + plan-mutations-spegelkod, #2 `ALERT_WEBHOOK`/#11 keep-alive-cron (env/extern setup), #5–7/#10 (tenancy/plan-risk). **Verifiering:** `node --check` på `plan-viewer.js` grön + core-testsviten (match/corpus/shopping/select/data-mapper) grön. Ändringarna är frontend/docs — inga api/-tester berörda. **Kvar (mobil):** snabbkoll att veckovyn/premiumvyn renderar normalt och att pinch-zoom nu funkar.

Session 8–103 i `docs/session-log-archive.md`. Full git-historik: `git log --oneline`.

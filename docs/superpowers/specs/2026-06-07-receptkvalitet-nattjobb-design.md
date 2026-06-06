# Receptkvalitet — nattjobb (design)

**Datum:** 2026-06-07
**Mål:** Systematiskt gå igenom alla 262 recept i Supabase och korrigera dem så att
(a) ingredienslistorna genererar inköpslistor felfritt och pris-matchbart, och
(b) instruktionernas pedagogik/logik är korrekt. Körs oövervakat över natten utan
att kräva några godkännanden.

## Beslut (från brainstorm 2026-06-07)
- **Steg-redigering: konservativ.** Åtgärda uppenbara logikfel; lista tvetydiga fall i
  rapporten istället för att gissa. Rör aldrig tider, temperaturer eller mängder i stegen.
- **Motor: jag kör själv, batchvis.** Varje ändring valideras mot den riktiga parsern
  innan den skrivs. Inget externt API.
- **Fält: alla säkra fält** (`ingredients`, `instructions`, `notes`, `protein`, `tags`,
  `seasons`, `time`, `servings`) — **aldrig `title` eller `id`** (skyddar veckoplanen).
- **Tillämpning: live, med full backup + revert-bar diffrapport.**

## Arkitektur (rollfördelning)
Endast modellen (jag) kan skriva till Supabase via MCP `execute_sql`. Validering måste
ändå vara deterministisk. Därför tre roller:

1. **Omdöme (modellen):** läser varje recept, föreslår korrigerade fält som JSON.
2. **Validering (skript):** `scripts/qc-night/validate.mjs` importerar den *riktiga*
   parsern (`parseIngredient`, `normalizeName`, `CANON_SET` ur
   `api/_shared/shopping-builder.js`) och godkänner/underkänner varje förslag mot hårda
   invarianter. Beroendefritt, körs via `node`.
3. **Skrivning (modellen via MCP `execute_sql`):** bara förslag som passerat valideringen
   skrivs, batchvis.

Project ref: `zqeznveicagqwblltvsa` (`receptbok`, eu-central-1, ACTIVE_HEALTHY).

## Filer
- `docs/recipe-backup-<timestamp>.json` — full kopia av alla recept före körning. Revert-källa. Committas.
- `docs/qc-night/state.json` — körstate (id → status: pending/done/skipped, audit-deltan). Återupptagning.
- `docs/qc-night/report-<date>.md` — per-recept före→efter-diff + motivering + flaggade tvetydigheter.
- `docs/qc-night/proposals/<batch>.json` — modellens förslag per batch (input till validate.mjs).
- `scripts/qc-night/validate.mjs` — deterministisk validator (invarianter + audit-delta).

## Flöde

### Fas 0 — Setup (en gång)
1. `select * from recipes order by id` via MCP → skriv `docs/recipe-backup-<timestamp>.json`
   i formen `{ "generated": "...", "recipes": [ {rad}, ... ] }`. Committa.
2. Baseline-audit: `node scripts/audit-ingredients.mjs --source docs/recipe-backup-<ts>.json`
   (källfilen omformas vid behov till `{recipes:[{id,title,ingredients}]}`). Spara
   P0/P1/P2-nollnivån i state.
3. Skapa `docs/qc-night/state.json` med alla id = `pending`.

### Fas 1 — Per recept (batchar om ~12, återupptagbart)

**Spår A — Ingredienser (mekaniskt, parser-validerat):**
- Fixa tappade mängder (audit-klass C5/P0) så de parsas.
- Dela flera-ingredienser-på-en-rad (C3): `"X och Y"`, `"X eller Y"`, `"X / Y"` när båda är
  separata shoppingbara varor. **Inte** adjektiv-"och" (`"rostade och saltade"`,
  `"skal och saft"`) och inte serverings-/garneringsförslag.
- Städa beskrivande brus (C4): parenteser, `"på burk"`, `"av god kvalitet"`, varumärken,
  namn > 28 tecken.
- Omformulera icke-canon-namn (C1) till ett **troget** canon-synonym där det är samma
  produkt (`"crème fraîche 15%"` → `"crème fraiche"`). Byt **aldrig** den faktiska
  ingrediensen (t.ex. inte `vispgrädde` → `matlagningsgrädde`).
- **Uppfinn aldrig mängder.** Genuint vaga rader (`"olja till stekning"`, `"salt efter smak"`)
  lämnas — parsern skippar dem korrekt. Saknad mängd på en riktig ingrediens (C2): flytta in
  mängd bara om den uttryckligen står i steget; annars lämna + flagga.
- Standard-utdataformat: `"<mängd> <enhet> <namn>"`. (Parsern hanterar även doh-format
  `"<namn> (<mängd> <enhet>)"` men vi normaliserar till det förra.)

**Spår B — Instruktioner (konservativt):**
- Korsreferens ingredienser ↔ steg:
  - Ingrediens i listan som aldrig nämns i stegen → lägg till ett minimalt steg/led **om
    det är entydigt var den hör hemma**, annars flagga.
  - Steg nämner en ingrediens som saknas i listan → lägg till den i listan **om mängd står
    i steget**, annars flagga.
- Rätta uppenbart bruten ordning/logik (t.ex. "tillsätt löken" innan löken förberetts) —
  bara klara fall.
- Skriv aldrig om välfungerande prosa. Ändra aldrig tider/temp/mängder.

**Spår C — Övriga säkra fält:**
- `protein`: måste vara `fisk|kyckling|kött|fläsk|vegetarisk`. Rätta bara om uppenbart fel
  mot faktiska ingredienser (t.ex. `protein:"kyckling"` men receptet har lax, ingen kyckling).
- `tags`/`seasons`/`time`/`servings`: bara entydiga motsägelser (t.ex. `veg`-tagg men
  receptet har kött). Allt tveksamt → flagga, ändra inte.

### Hårda invarianter (validate.mjs — annars förkastas förslaget, originalet behålls)
1. **Ingen prissatt ingrediens försvinner:** varje canon-namn som i originalet parsade till
   en mängd finns kvar med en mängd i nya parsen.
2. **Antal shoppingbara ingredienser ≥ före** (splittar lägger till; städning tar inte bort).
3. **Per-recept audit-severity ≤ baseline** (ingen P0/P1/P2-regression för receptet).
4. **Sifferbevaring i instruktioner:** varje tal+enhet (`\d+ ?(min|g|dl|°|grader|...)`) som
   fanns i de gamla stegen finns kvar i de nya. Garanterar att ingen tid/temp/mängd ändrades.
5. **Strukturskydd:** `title` och `id` oförändrade; `protein` giltig enum; inga fält tomma
   som inte var tomma; arrays förblir arrays.

Förslag som bryter en invariant skippas **per fält** (om möjligt) eller helt, och loggas
med orsak. Aldrig en fråga till användaren.

### Fas 2 — Avslut
1. Slut-audit, jämför baseline → final (P0/P1/P2, canon-täckning).
2. Skriv sammanfattning överst i rapporten: antal recept ändrade/oförändrade/skippade,
   audit-delta, lista över flaggade tvetydigheter som behöver mänsklig blick.
3. Kör hela JS-testsviten (match, match-corpus, shopping, select-recipes, data-mapper) —
   bekräftar att parsern/koden är grön (data-ändringar ska inte påverka kodtester).
4. Committa + pusha alla artefakter (backup, rapport, state, validator). Data ligger i
   Supabase — ingen data-commit behövs.
5. Uppdatera CLAUDE.md-dashboard + arkivera sessionen (Definition of Done).

## Autonomi medan användaren sover
Batch → committa rapport+state → `ScheduleWakeup` (självgående loop) → nästa batch tills
state visar alla `done`/`skipped`. Återupptagbart: varje uppvaknande läser state och
fortsätter på nästa `pending`. Varje gate är automatiserad — inga godkännanden.

## Revert
Allt är ångerbart. På begäran (*"revert nattjobbet"*) återställer modellen varje recept ur
`docs/recipe-backup-<timestamp>.json` via MCP `execute_sql`. Diffrapporten dokumenterar
exakt vad som ändrades, recept för recept.

## Risker & motåtgärder
- **Oövervakad live-mutation av 262 recept** → full backup först + per-ändrings-invarianter +
  komplett diffrapport + enkel revert.
- **Felaktig pedagogik-omskrivning** → konservativ nivå + sifferbevaring + flagga hellre än
  gissa.
- **Veckoplanen förstörs** → `title`/`id` rörs aldrig; redan genererade inköpslistor/planer
  är snapshots och påverkas inte av receptändringar.
- **Krasch mitt i** → state-fil + batch-commits → återupptas där det slutade.

## Definition of Done
- Alla 262 recept har status `done` eller `skipped` i state.
- Slut-audit visar P0/P1/P2 ≤ baseline (mål: lägre).
- Testsviten grön.
- Backup, rapport, state, validator committade och pushade.
- CLAUDE.md-dashboard uppdaterad, session arkiverad.

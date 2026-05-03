# Design System Migration — Scandi/Nature Pivot

_Datum: 2026-05-03_
_Status: spec klar, väntar på implementation-plan_

## Bakgrund

Användaren iterativt designat en ny visuell identitet för Receptboken i Claude Design-verktyget (handoff-bundle: `receptboken-design-system`). Resultatet är ett fullskaligt skifte från dagens **warm-brown / terracotta / cream / gold**-tema till en dovare **lichen-grön / forest / rust / ochre / linen**-palett (Scandi/nature-direction). Utöver paletten innehåller designen:

- Renare knapp-geometri (en familj: 38px hög, 8px radie, 1.5px border, 5 tiers)
- 4px-radie pills i earth-tones (lo-fi/Scandi)
- Hand-tecknade lo-fi line-SVG-ikoner i `currentColor` ersätter färgglada emoji
- Lichen som "today / open / selected"-state istället för rust (rust reserveras strikt för CTA + today-prick)

Bundlen tillhandahåller `colors_and_type.css` som token-source-of-truth, samt `brand-iconography.html` med hand-tecknade SVG-paths för de nya glyferna.

## Mål

- Migrera Receptbokens visuella identitet i **en commit** (big-bang) per användarens val
- Ersätt **alla** sanktionerade emoji (✨ 💰 📤 📝 🍳 🛒 ＋ 📅 🔍 📋 🍽️ ⏳ ⚙) med hand-tecknade inline-SVG:er
- Uppdatera CLAUDE.md "Färgtema"-rad så projektets dokumenterade identitet matchar koden
- Inga data-, JSON-, eller backend-ändringar

## Icke-mål

- **Mobil-verifiering** — användaren har just nu inte åtkomst till mobilen (explicit OK)
- **Feature-flag eller theme-class** — användaren valde big-bang, ingen säkerhetslina
- **Nya komponenter eller layouts** — ren reskin
- **Layout-justeringar** — alla padding/margin/grid-regler står kvar; bara färger, radier på pills/knappar, och ikoner ändras
- **Bottom-nav-ikoner** — Book/CalendarDays/ClipboardCheck från Session 41 är redan Lucide-stil och fungerar med ny palett via `currentColor`, lämnas orörda

## Arkitektur

### Centralt: token-pivot i `:root`-blocket

Receptboken har idag 10 namngivna tokens i `:root` (rad 2–10 i `css/styles.css`) plus 12 strö-hex-träffar för brand-färger i resten av filen. Migrationen är därför en **token-rename** snarare än en grävoperation:

1. `:root`-blocket skrivs om från brun/terracotta-namngivna properties → lichen/forest/rust/ochre/linen-namngivna properties.
2. 12 strö-hex byts till `var(--*)`.
3. 4 plan-pastel-definitioner (rad 758–761) byts till earth-tone-pastels (moss/slate/birch/clay).
4. Pill-radien justeras från `var(--r-pill)` (999px) till 4px.
5. Knapp-radien justeras till 8px på primary/secondary; `var(--r-pill)` behålls bara för FAB.

### Filer som ändras

- `css/styles.css` — `:root`-block + 12 strö-hex + plan-pastels + pill/knapp-radii
- `index.html` — 13 emoji → inline-SVG (rad 30, 56, 63, 68, 103, 123, 207, 216, 220, 235, 253, 271 + ev. en till)
- `js/shopping/shopping-list.js` — emoji i dynamisk render
- `js/shopping/dispatch-ui.js` — emoji i dynamisk render
- `js/weekly-plan/plan-viewer.js` — emoji i dynamisk render (💰 sparat, 🍳/📝/📅 custom-day-options)
- `CLAUDE.md` — "Färgtema"-raden under "Tekniska beslut" + ny "Senaste session"-post

### Filer som INTE ändras

- `recipes.json`, `weekly-plan.json`, `shopping-list.json`, `recipe-history.json`, `plan-archive.json`, `custom-days.json`, `package.json`, `vercel.json`
- `api/` — alla endpoints, all backend-logik, alla `_shared/`-moduler
- `tests/` — 341 assertions rör backend, oberoende av CSS
- Bottom-nav-SVG:erna i `index.html`
- `extension/` — Chrome-extension för Willys-cookie-refresh, ingen UI-koppling till appen
- Övrig markup-struktur, klassnamn, DOM-shape

## Token-mappning

| Idag | Nytt | Roll |
|---|---|---|
| `--cream #faf7f2` | `--linen #f5f1e8` | Sid-canvas |
| `--warm-white #fff9f2` | `--linen-card #fdfcf8` | Recessed surface (öppnat receptkort) |
| `#ffffff` (cards) | `--paper #ffffff` | Full-contrast surface (samma värde, namngivet) |
| `--ink #1a1209` | `--forest #3d5544` | Body text |
| `--warm-brown #5c3d1e` | `--lichen #7a9482` | Brand chrome — top-header, brand-mark |
| (saknas) | `--lichen-deep #5e7a68` | Text-on-light, success |
| (saknas) | `--forest-deep #2c3f33` | Hover/pressed dark surfaces |
| `--terracotta #c2522b` | `--rust #b56a4c` | Enda mättade accenten — CTA + today-prick |
| (saknas) | `--rust-deep #9c5840` | Destructive |
| `--gold #d4a847` | `--ochre #c89a3e` | Wordmark italic-suffix, notes-box left-border |
| `--sage #7a9e7e` | `--lichen-deep #5e7a68` | Success (tested-pill, savings-text, shopping-checkmark) |
| `--light-sage #eaf2eb` | `--moss-soft #e3eadd` | Success-tint, today-tint |
| `--light-terra #fdf0eb` | `--clay #f1e2d8` | Accent-tint (rust-tinted surface) |
| `--weekend-bg` (befintligt) | `#ede4d3` (birch) | Weekend day-card bakgrund |
| `--border #e8ddd0` | `--birch-soft #d8d2c4` | Hairline-border |
| (saknas) | `--birch #a89e8a` | Tertiär text, ikon-stroke |
| (saknas) | `--moss-muted #7d8579` | Sekundär text, meta-rader |
| (saknas) | `--stone #ebe6da` | Inset wells |

### Plan-pastels (timeline-arkiv)

| Idag | Nytt |
|---|---|
| plan-0 `#f1f7ed`/`#d0e3c1` | moss `#e3eadd`/`#c8d2c2` |
| plan-1 `#edf4f7`/`#c1d8e3` | slate `#dde4e5`/`#c1cfd1` |
| plan-2 `#f7f3ed`/`#e3d6c1` | birch `#ede4d3`/`#d8c9b0` |
| plan-3 `#f5edf7`/`#d9c1e3` | clay `#ecd9cb`/`#dcc1ae` |

### Centrala konsekvenser

- **Top-header**: brun → lichen-grön
- **Active tab / CTA**: terracotta → rust (samma roll, dovare)
- **Today-state**: rust-ring **runt hela kortet** ersätts med **lichen-ring + moss-soft fyllning**. Rust används bara för **today-pricken** (en liten saturated punkt). Det är designens explicita policy: rust är en sällsynt accent.
- **Selected/open recipe-card-border**: terracotta → lichen (matchar today-staten — "selected = lugn", inte "selected = alarm")
- **Tested-pill**: sage → lichen-deep + moss-soft (samma success-roll, ny färgton)
- **Savings-text (💰 Sparat)**: sage-grön → lichen-deep
- **Wordmark italic-suffix**: gold → ochre
- **Notes-box left-border**: gold → ochre

## Emoji → hand-tecknad SVG-mappning

Stilkrav: 14×14 viewBox (eller 16×16 vid behov av luft), `currentColor` på `stroke`, `stroke-width: 1.5–1.75`, `stroke-linecap: round`, `stroke-linejoin: round`. Lite "ojämna" linjer (lo-fi-känsla, men inte handritade till oigenkännlighet). SVG-paths plockas ur `brand-iconography.html` i bundlen.

| Idag | Ny SVG | Plats(er) |
|---|---|---|
| ✨ Generera | sparkle/asterisk-mark (4-uddig stjärna med tunna strålar) | `index.html` rad 207 |
| ✓ Bekräfta | check-mark | injiceras i markup för "Bekräfta och bygg inköpslista" |
| 🛒 Inköpslista | basket/bag (enkel U + handtag) | `index.html` rad 220, 235 |
| 💰 Sparat | coin (cirkel + dubbla horisontella streck) | `js/weekly-plan/plan-viewer.js` |
| 📤 Skicka till Willys | arrow-up-right ur en låda | `index.html` rad 253 (samt `dispatch-ui.js` om dynamiskt) |
| 🍳 Recept | pan/bowl (cirkel + handtag-streck) | `js/weekly-plan/plan-viewer.js` (custom-day) |
| 📝 Egen notering | pen / notebook-line | `js/weekly-plan/plan-viewer.js` (custom-day) |
| 📅 Skapa veckomatsedel | calendar (befintlig `assets/icons/calendar-days.svg`-stil) | `js/weekly-plan/plan-viewer.js` (custom-day) |
| ＋ Ny plan / FAB | plus (befintlig `assets/icons/plus.svg`-stil) | `index.html` rad 103, 271 |
| 🔍 Sök | magnifier (befintlig `assets/icons/search.svg`-stil) | `index.html` rad 30 |
| 📋 Empty shop / loading | clipboard | `index.html` rad 68, 220 |
| 🍽️ No-results | bowl/utensil | `index.html` rad 56 |
| ⏳ Laddar | dashed circle / hourglass-line | `index.html` rad 63, 216 |
| ⚙ Inställningar | gear | `index.html` rad 123 |
| ▾ chevron | befintlig `chevron-right.svg` roterad 90° | `index.html` rad 123 |

Implementations-fasen plockar exakta `<path d="...">`-strängar ur `brand-iconography.html` (eller använder existerande SVG:er i `assets/icons/` när stilen redan matchar).

## Implementation-ordning (en commit)

1. Skriv om `:root`-blocket i `css/styles.css` med nya tokens (lichen/forest/rust/ochre/linen + tilläggs-tokens)
2. Byt 12 strö-hex i `css/styles.css` mot `var(--*)`
3. Byt 4 plan-pastels (rad 758–761)
4. Justera pill-radie (4px) och knapp-radie/-höjd
5. Byt 13 emoji i `index.html` mot inline-SVG
6. Byt emoji i `js/shopping/shopping-list.js`, `js/shopping/dispatch-ui.js`, `js/weekly-plan/plan-viewer.js` mot SVG-strängar
7. Uppdatera CLAUDE.md: "Färgtema"-rad under "Tekniska beslut" + ny "Senaste session"-post
8. Self-check: läs tillbaka varje editerad fil; grep:a efter `warm-brown`, `terracotta`, `--cream`, `--gold`, `--sage`, `--ink`, `--light-terra`, `--light-sage` → 0 träffar
9. Commit på feature-branch, push, mergea till `main`, push

## Risk och verifiering

| Risk | Mitigering |
|---|---|
| Visuell regression på mobil | Användaren accepterar fördröjd verifiering (har inte åtkomst nu) |
| Halv-migrerade selektorer (gammalt namn kvar någonstans) | Final grep efter alla 8 gamla token-namn; 0 träffar = grönt |
| Backend-tester bryts | 341 assertions rör inte CSS — risk = 0 |
| `recipes.json` eller annan JSON-data skadas | Migrationen rör inga JSON-filer — risk = 0 |
| Cookie-refresh-extension bryts | Extensions UI är fristående, ingen koppling till app-CSS |
| Rollback om något ser fel ut | En commit, en `git revert`. Användaren valde explicit ingen feature-flag. |

## Definition of Done

Per CLAUDE.md "Definition of Done":

1. ✅ Läs tillbaka varje editerad fil — Edit-hooken fångar syntaxfel automatiskt
2. ✅ Grep efter berörda funktionsnamn för att säkerställa inga sidoeffekter
3. ✅ Committa och pusha till `main`
4. ✅ Uppdatera Dashboard-sektionen i CLAUDE.md (senaste session, roadmap-checkbox för identitetsmigration)

## Öppna frågor

Inga. Användaren har låst:
- Scope: full identitetspivot (svar A på fråga 1)
- Sequencing: big-bang i en commit, ingen feature-flag (svar A på fråga 2)
- Ikoner: alla emoji → hand-tecknade SVG:er (svar A på fråga 3)
- Spec-review delegerad: "Jag litar på din tolkning av uppdraget, kör"

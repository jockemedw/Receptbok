# Design System Scandi Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrera Receptbokens visuella identitet från warm-brown/terracotta/cream/gold → lichen/forest/rust/ochre/linen ("Scandi/nature"), och ersätt alla färgglada emoji med hand-tecknade lo-fi line-SVG-ikoner.

**Architecture:** Token-only-pivot i `css/styles.css` (rename + add new tokens i `:root`, global rename av `var(--gamla)` → `var(--nya)`, samt uppdatering av strö-hex för brand-tinted varianter). 13+ emoji i `index.html` och 3 JS-moduler ersätts med inline-SVG enligt mönstret från Session 41 (bottom-nav). Inga JSON/data/backend-ändringar.

**Tech Stack:** Vanilla CSS custom properties. Vanilla ES modules. Inline SVG (Lucide-stil + hand-tecknad lo-fi).

**Spec:** `docs/superpowers/specs/2026-05-03-design-system-migration-design.md`

**Designkälla:** Bundlen extraherad till `/tmp/design-pkg/receptboken-design-system/`. SVG-paths i `project/preview/brand-iconography.html`. Token-värden i `project/colors_and_type.css`.

---

## Filer som ändras

| Fil | Ansvar |
|---|---|
| `css/styles.css` | Token-pivot + strö-hex-uppdatering + plan-pastels + pill-radie + knapp-geometri |
| `index.html` | Emoji → inline-SVG i statisk markup (13+ ställen) |
| `js/weekly-plan/plan-viewer.js` | Emoji i custom-day-options + savings-badge → SVG-strängar |
| `js/shopping/shopping-list.js` | Emoji i no-data + manual-add → SVG-strängar |
| `js/shopping/dispatch-ui.js` | 📤 i dispatch-button-label → SVG |
| `CLAUDE.md` | "Färgtema"-rad uppdateras + ny "Senaste session"-post |

## Branch och commits

- Skapa ny feature-branch `claude/design-system-scandi` (separat från befintlig dishingouthealth-branch)
- En commit per task så individuella delar är revertbara
- Vid task-slut: merge feature-branch → main → push (per CLAUDE.md operativ regel "Mergea till main")

## SVG-bibliotek (referens för alla tasks)

Alla SVG:er är 14×14 viewBox med `currentColor` på `stroke`, `stroke-linecap: round`, `stroke-linejoin: round`. För 16×16 viewBox används samma path skalad — paths nedan är 24×24 från designen och kan användas oförändrade i `viewBox="0 0 24 24"`. Klassen `.icon` definieras i Task 9 så `width: 1em; height: 1em; vertical-align: -0.125em` följer text-storleken.

```html
<!-- generera (✨) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 13.2 10.8 19 12 13.2 13.2 12 20 10.8 13.2 5 12 10.8 10.8z"/><path d="M19 5l.5 2 M5 19l-.5-2" opacity=".7"/></svg>

<!-- bekräfta (✓) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5 9.5 17.5 19.5 6.8"/></svg>

<!-- inköp (🛒 / shopping bag) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h13l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14 5.5V7"/></svg>

<!-- sparat (💰 coin) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>

<!-- dispatch (📤 arrow up-right out of box) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5"/><path d="M9 5h10v10"/></svg>

<!-- recept (🍳 chef hat / pot) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>

<!-- notering (📝 notebook) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>

<!-- kalender (📅 calendar) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>

<!-- plus (＋ FAB / add) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>

<!-- sök (🔍 magnifier) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>

<!-- clipboard (📋 empty / loading) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>

<!-- bowl (🍽️ no-results, line-art bowl) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9z"/><path d="M7 11V8 M12 11V6 M17 11V8"/></svg>

<!-- hourglass (⏳ loading, line-art) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12 M6 20h12 M6 4l6 8-6 8 M18 4l-6 8 6 8"/></svg>

<!-- gear (⚙ settings) -->
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>

<!-- chevron-down (▾) — bara rotera chevron-right -->
<svg class="icon icon-rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
```

---

## Task 1: Skapa feature-branch

**Files:** N/A (git-operation)

- [ ] **Step 1: Verifiera ren working tree på dishingouthealth-branchen**

Run: `git status`
Expected: `On branch claude/scrape-dishingouthealth-recipes-gwRU5`, eventuellt med ` M .gitignore` och `?? scripts/dish-scrape/` (oförändrat sedan senaste commit). Inga andra modifieringar.

- [ ] **Step 2: Skapa och växla till ny feature-branch från main**

Run:
```bash
git fetch origin main
git checkout -b claude/design-system-scandi origin/main
```
Expected: `Switched to a new branch 'claude/design-system-scandi'`. `git log -1` visar commit `dba699f` eller senare main-commit.

- [ ] **Step 3: Cherry-pick spec-commiten (om den inte redan finns på main)**

Run: `git log main --oneline | grep "design-system-migration-design" | head -1`

Om träff finns: spec ligger redan på main, hoppa till Task 2.

Om ingen träff: cherry-pick spec-commiten från dishingouthealth-branchen:
```bash
git cherry-pick 4d22dcc
```
Expected: spec-filen kopieras över utan konflikt.

---

## Task 2: Skriv om :root token-blocket i css/styles.css

**Files:**
- Modify: `css/styles.css:1-17`

- [ ] **Step 1: Läs befintligt :root-block**

Run: `Read css/styles.css offset=1 limit=20`
Expected output rad 1–17:
```
:root {
  --cream: #faf7f2;
  --warm-white: #fff9f2;
  --ink: #1a1209;
  --warm-brown: #5c3d1e;
  --terracotta: #c2522b;
  --sage: #7a9e7e;
  --gold: #d4a847;
  --light-sage: #eaf2eb;
  --light-terra: #fdf0eb;
  --border: #e8ddd0;
  --text-muted: #7a6a58;
  --color-success: var(--color-success);
  --color-success-dark: #4a7d4e;
  --color-danger: #b04030;
  --bottom-nav-h: 0px;
}
```

- [ ] **Step 2: Ersätt blocket**

Använd Edit-verktyget. `old_string` = hela blocket från Step 1 (rad 1–17 inklusive avslutande `}`). `new_string`:

```css
  :root {
    /* Surfaces */
    --linen: #f5f1e8;
    --linen-card: #fdfcf8;
    --paper: #ffffff;
    --stone: #ebe6da;

    /* Brand */
    --lichen: #7a9482;
    --lichen-deep: #5e7a68;
    --moss-soft: #e3eadd;
    --forest: #3d5544;
    --forest-deep: #2c3f33;

    /* Accent (sparingly) */
    --rust: #b56a4c;
    --rust-deep: #9c5840;
    --clay: #f1e2d8;

    /* Neutrals */
    --birch: #a89e8a;
    --birch-soft: #d8d2c4;
    --moss-muted: #7d8579;

    /* Highlight */
    --ochre: #c89a3e;

    /* Semantic aliases (för bakåtkompatibilitet under migrationen — ses över i task 9) */
    --border: var(--birch-soft);
    --text-muted: var(--moss-muted);
    --color-success: var(--lichen-deep);
    --color-success-dark: var(--lichen-deep);
    --color-danger: var(--rust-deep);

    --bottom-nav-h: 0px;
  }
```

- [ ] **Step 3: Verifiera att blocket är intakt**

Run: `Read css/styles.css offset=1 limit=40`
Expected: blocket finns, alla nya tokens definierade, body-blocket på rad ~30+ börjar med `body {` direkt efter att `@media`-blocket är intakt.

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
Token-pivot: nytt :root-block med scandi/nature-paletten

Ersätter warm-brown/terracotta/cream/gold-tokens med lichen/forest/
rust/ochre/linen. Gamla token-namn (--cream, --warm-brown, --terracotta,
--sage, --gold, --ink, --light-sage, --light-terra, --warm-white) finns
inte längre — references migreras i nästa task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Global rename av token-references i css/styles.css

Efter Task 2 är `:root`-blocket nytt men ~163 references använder fortfarande gamla namn. CSS bryts tills detta är gjort.

**Files:**
- Modify: `css/styles.css` (alla `var(--gamla)`-referenser)

- [ ] **Step 1: Replace --cream → --linen**

Använd Edit med `replace_all: true`:
- old: `var(--cream)`
- new: `var(--linen)`

- [ ] **Step 2: Replace --warm-white → --linen-card**

Edit replace_all:
- old: `var(--warm-white)`
- new: `var(--linen-card)`

- [ ] **Step 3: Replace --ink → --forest**

Edit replace_all:
- old: `var(--ink)`
- new: `var(--forest)`

- [ ] **Step 4: Replace --warm-brown → --lichen**

Edit replace_all:
- old: `var(--warm-brown)`
- new: `var(--lichen)`

- [ ] **Step 5: Replace --terracotta → --rust**

Edit replace_all:
- old: `var(--terracotta)`
- new: `var(--rust)`

- [ ] **Step 6: Replace --gold → --ochre**

Edit replace_all:
- old: `var(--gold)`
- new: `var(--ochre)`

- [ ] **Step 7: Replace --sage → --lichen-deep**

Edit replace_all:
- old: `var(--sage)`
- new: `var(--lichen-deep)`

- [ ] **Step 8: Replace --light-sage → --moss-soft**

Edit replace_all:
- old: `var(--light-sage)`
- new: `var(--moss-soft)`

- [ ] **Step 9: Replace --light-terra → --clay**

Edit replace_all:
- old: `var(--light-terra)`
- new: `var(--clay)`

- [ ] **Step 10: Verifiera 0 träffar för gamla token-namn**

Run: `Grep --cream\|--warm-white\|--ink\b\|--warm-brown\|--terracotta\|--sage\b\|--gold\|--light-sage\|--light-terra css/styles.css output_mode=count`
Expected: `0`

- [ ] **Step 11: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
Token-rename: alla var(--gamla) → var(--nya) i css/styles.css

Global replace av 9 gamla token-namn till deras nya scandi-motsvarigheter.
~163 references uppdaterade i ett pass.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Ersätt strö-hex för brand-färger med tokens

Vissa hex-värden är duplikat av token-värden eller minor variants. Lista nedan baserad på Grep-fynd:

**Files:**
- Modify: `css/styles.css` (specifika rader)

- [ ] **Step 1: Ersätt #5c3d1e (warm-brown) → var(--lichen)**

Edit replace_all:
- old: `#5c3d1e`
- new: `var(--lichen)`

(Träffar: rad 2611, 2616, 2621 — färg-användningar i dispatch-modal)

- [ ] **Step 2: Ersätt #c2522b (terracotta) → var(--rust)**

Edit replace_all:
- old: `#c2522b`
- new: `var(--rust)`

(Träffar: rad 2594, 2651 — färg-användningar i dispatch-modal)

- [ ] **Step 3: Ersätt #a6431f (terracotta-darker / hover) → var(--rust-deep)**

Edit replace_all:
- old: `#a6431f`
- new: `var(--rust-deep)`

(Träffar: rad 2603, 2654)

- [ ] **Step 4: Ersätt #a84522 (terracotta-darker / hover) → var(--rust-deep)**

Edit replace_all:
- old: `#a84522`
- new: `var(--rust-deep)`

(Träff: rad 2204 — `.flytta-btn:hover`)

- [ ] **Step 5: Ersätt #4a3018 (warm-brown-darker / hover) → var(--forest-deep)**

Edit replace_all:
- old: `#4a3018`
- new: `var(--forest-deep)`

(Träff: rad 2240 — `.manual-add-btn:hover`)

- [ ] **Step 6: Ersätt #4a7d4e (sage-deep) → var(--lichen-deep)**

Edit replace_all:
- old: `#4a7d4e`
- new: `var(--lichen-deep)`

(Träffar: rad 14 (om kvar), 1065, 1147, 1162 — savings-text och success-states)

- [ ] **Step 7: Ersätt #b04030 (danger) → var(--rust-deep)**

Edit replace_all:
- old: `#b04030`
- new: `var(--rust-deep)`

(Träffar: rad 990, 1020, 1262, 1263)

- [ ] **Step 8: Ersätt #d9534f (danger-variant) → var(--rust-deep)**

Edit replace_all:
- old: `#d9534f`
- new: `var(--rust-deep)`

(Träffar: rad 2359, 2360 — `.btn-delete`)

- [ ] **Step 9: Ersätt #e8ddd0 (border) → var(--birch-soft)**

Edit replace_all:
- old: `#e8ddd0`
- new: `var(--birch-soft)`

- [ ] **Step 10: Verifiera**

Run: `Grep "#5c3d1e\|#c2522b\|#a6431f\|#a84522\|#4a3018\|#4a7d4e\|#b04030\|#d9534f\|#e8ddd0" css/styles.css output_mode=count`
Expected: `0`

- [ ] **Step 11: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
Tokenisera strö-hex: brand-color-literaler → var(--*)

9 hex-literaler för warm-brown/terracotta/sage/danger som låg
hårdkodade i komponent-stilar bytta mot motsvarande nya tokens.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Uppdatera plan-pastels (timeline-arkiv)

**Files:**
- Modify: `css/styles.css:758-761`

- [ ] **Step 1: Läs nuvarande plan-pastel-block**

Run: `Read css/styles.css offset=755 limit=10`
Expected ungefär:
```
  .week-day-card.plan-color-0:not(.today):not(.selected) { background: #f1f7ed; border-color: #d0e3c1; }
  .week-day-card.plan-color-1:not(.today):not(.selected) { background: #edf4f7; border-color: #c1d8e3; }
  .week-day-card.plan-color-2:not(.today):not(.selected) { background: #f7f3ed; border-color: #e3d6c1; }
  .week-day-card.plan-color-3:not(.today):not(.selected) { background: #f5edf7; border-color: #d9c1e3; }
```

- [ ] **Step 2: Ersätt med earth-tone-pastels**

Edit:
- old: hela 4-radersblocket från Step 1 (med exakt indragning)
- new:
```
  .week-day-card.plan-color-0:not(.today):not(.selected) { background: #e3eadd; border-color: #c8d2c2; }
  .week-day-card.plan-color-1:not(.today):not(.selected) { background: #dde4e5; border-color: #c1cfd1; }
  .week-day-card.plan-color-2:not(.today):not(.selected) { background: #ede4d3; border-color: #d8c9b0; }
  .week-day-card.plan-color-3:not(.today):not(.selected) { background: #ecd9cb; border-color: #dcc1ae; }
```

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
Plan-pastels: bytt arkiv-pastels till earth-tone (moss/slate/birch/clay)

Tidigare grön/blå/beige/lila → moss/slate/birch/clay matchar nya
scandi-paletten. plan-3 pivot från lila → varm-clay enligt design.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pill-radie 999px → 4px och verifiera pill-färger

Designen specificerar 4px-pillar (lo-fi/Scandi) istället för fully-rounded. Token `--r-xs` = 4px finns redan i nya designen (men är inte i `:root`-blocket — vi använder hex-värdet 4px direkt).

**Files:**
- Modify: `css/styles.css:370-373` (pill-färger), `css/styles.css:607` och `css/styles.css:831` (border-radius: 999px)

- [ ] **Step 1: Läs pill-blocket**

Run: `Read css/styles.css offset=365 limit=12`

- [ ] **Step 2: Hitta var pillen får sin radie**

Run: `Grep -n "\.pill\b" css/styles.css output_mode=content`

Expected: en `.pill { ... }`-bas-regel med `border-radius: 999px;`. Notera radnumret.

- [ ] **Step 3: Ändra basradien**

Edit `css/styles.css`:
- old: `border-radius: 999px;` (i `.pill { ... }`-regeln, hitta exakta kontexten via Step 2)
- new: `border-radius: 4px;`

Använd `replace_all: false` och inkludera tillräckligt med kontext (raderna runt `.pill {`) för att inte råka byta i en annan selector.

- [ ] **Step 4: Verifiera de andra 999px-träffarna är inte också pills**

Run: `Grep -n -B2 "border-radius: 999px" css/styles.css`
Expected: Visa kontexten — om något ärver från `.pill` eller en annan pill-variant, byt även dessa till 4px. Annars lämna (FAB, scroll-top etc får behålla 999px).

Selectors som SKA ändras (om inte redan från Step 3):
- `.pill-protein`, `.pill-time`, `.pill-tested`, `.pill-untested` — om dessa har egen `border-radius: 999px` byts det till `4px`.

Selectors som behåller 999px:
- `.fab-import` (pill-knapp för FAB)
- `.scroll-top-btn`
- Eventuella runda overlays/dots

- [ ] **Step 5: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
Pill-radie: 999px → 4px (lo-fi scandi-stil)

.pill basklassen får 4px radie istället för fullt rundad. FAB och
scroll-top-knappen behåller 999px (de är runda affordances, inte taggar).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Lägg till .icon-klassen för inline-SVG

Designen kräver att SVG:erna sitter inline i text och följer typografisk höjd. Lägg en delad utility-klass.

**Files:**
- Modify: `css/styles.css` (lägg till efter `.pill`-basblocket eller i ett dedikerat utility-block)

- [ ] **Step 1: Hitta lämpligt ställe**

Run: `Grep -n "/\* ── PILL\|/\* ── HELPER\|/\* ── ICON" css/styles.css`

Om det finns en `/* ── ICON */`-sektion: lägg där. Annars lägg direkt efter pill-blocket.

- [ ] **Step 2: Lägg till .icon-utility**

Edit:
- old: en känd unik rad direkt efter pill-blocket (säg `.pill-untested { ... }`-raden, hela)
- new: samma rad + tomrad + nedanstående block:

```css

  /* ── ICON UTILITY (inline SVG follows text) ── */
  .icon {
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
    flex-shrink: 0;
    stroke: currentColor;
    fill: none;
  }
  .icon-rotate-90 { transform: rotate(90deg); }
  .icon-em-1-2 { width: 1.2em; height: 1.2em; }
  .icon-em-1-5 { width: 1.5em; height: 1.5em; }
  .icon-em-2 { width: 2em; height: 2em; }
```

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
Lägg till .icon utility-klass för inline-SVG

Följer text-storleken (1em), kan skalas via .icon-em-1-2/-1-5/-2 för
no-data-states. Förbereder emoji-byte i nästa tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Ersätt emoji i index.html — toolbar och inställningar

**Files:**
- Modify: `index.html` (rad 30, 123)

- [ ] **Step 1: Läs befintliga rader**

Run: `Read index.html offset=25 limit=15` och `Read index.html offset=120 limit=10`

- [ ] **Step 2: Ersätt 🔍 sök-ikonen (rad ~30)**

Edit:
- old: `<span class="search-icon">🔍</span>`
- new:
```html
<span class="search-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
```

- [ ] **Step 3: Ersätt ⚙ Inställningar (rad ~123)**

Hitta exakta sträng via Read. Typiskt:
`        ⚙ Inställningar <span id="settingsArrow">▾</span>`

Edit:
- old: `        ⚙ Inställningar <span id="settingsArrow">▾</span>`
- new: `        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Inställningar <span id="settingsArrow" class="icon icon-rotate-90"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>`

- [ ] **Step 4: Verifiera**

Run: `Grep "🔍\|⚙\|▾" index.html output_mode=count`
Expected: 0

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Toolbar/settings: emoji → inline-SVG

Sök-ikon (🔍), kugghjul (⚙) och chevron (▾) bytta mot hand-tecknade
line-SVG:er i currentColor. Följer text-storlek via .icon-klassen.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Ersätt emoji i index.html — generera och bekräfta

**Files:**
- Modify: `index.html` (rad ~103, ~207)

- [ ] **Step 1: Läs och hitta exakta strängar**

Run: `Read index.html offset=100 limit=8` och `Read index.html offset=205 limit=5`

- [ ] **Step 2: Ersätt ＋ Ny plan (rad ~103)**

Edit:
- old: `<button class="trigger-toggle-btn" onclick="toggleTrigger()">＋ Ny plan</button>`
- new: `<button class="trigger-toggle-btn" onclick="toggleTrigger()"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg> Ny plan</button>`

- [ ] **Step 3: Ersätt ✨ Generera ny plan (rad ~207)**

Edit:
- old: `      ✨ Generera ny plan` (med exakt indragning från Read i Step 1)
- new:
```html
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 13.2 10.8 19 12 13.2 13.2 12 20 10.8 13.2 5 12 10.8 10.8z"/><path d="M19 5l.5 2 M5 19l-.5-2" opacity=".7"/></svg> Generera ny plan
```

- [ ] **Step 4: Hitta och ersätt eventuell ✓ Bekräfta-knapp**

Run: `Grep "Bekräfta och bygg" index.html`

Om träff hittas och innehåller `✓` eller emoji: edit för att inleda label med check-SVG.

Edit (anpassa exakt sträng efter vad Grep visar):
- old: `✓ Bekräfta och bygg inköpslista`
- new: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5 9.5 17.5 19.5 6.8"/></svg> Bekräfta och bygg inköpslista`

Om ingen `✓` finns i markup: hoppa över (kommer ev. i JS).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Generera/bekräfta-knappar: emoji → inline-SVG

✨ → hand-tecknad sparkle, ＋ → plus, ✓ → check.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Ersätt emoji i index.html — no-data-states och inköpslista

**Files:**
- Modify: `index.html` (rad ~56, ~63, ~68, ~216, ~220, ~235, ~253, ~271)

- [ ] **Step 1: Läs sektionerna**

Run: `Read index.html offset=50 limit=25` och `Read index.html offset=210 limit=50` och `Read index.html offset=265 limit=10`

- [ ] **Step 2: Ersätt 🍽️ no-results (rad ~56)**

Edit:
- old: `<div style="font-size:2.5rem;margin-bottom:1rem">🍽️</div>`
- new: `<div class="no-data-icon icon-em-2"><svg class="icon icon-em-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9z"/><path d="M7 11V8 M12 11V6 M17 11V8"/></svg></div>`

- [ ] **Step 3: Ersätt ⏳ Laddar (rad ~63 och ~216)**

Edit replace_all:
- old: `<div class="no-data-icon">⏳</div>`
- new: `<div class="no-data-icon"><svg class="icon icon-em-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12 M6 20h12 M6 4l6 8-6 8 M18 4l-6 8 6 8"/></svg></div>`

- [ ] **Step 4: Ersätt 📋 Empty (rad ~68)**

Edit (notera: byt bara den ENA träffen för empty-state, inte de andra som kommer i Step 5):
- old: `<div class="no-data-icon">📋</div>`
- new: `<div class="no-data-icon"><svg class="icon icon-em-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg></div>`

- [ ] **Step 5: Ersätt 🛒 (rad ~220 i no-data och ~235 i section-title)**

Run: `Grep -n "🛒" index.html`
Expected: 2 träffar.

För **rad ~220** (no-data-icon):
Edit:
- old: `<div class="no-data-icon">🛒</div>`
- new: `<div class="no-data-icon"><svg class="icon icon-em-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h13l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14 5.5V7"/></svg></div>`

För **rad ~235** (section-title):
Edit:
- old: `<h2 class="section-title">🛒 Inköpslista</h2>`
- new: `<h2 class="section-title"><svg class="icon icon-em-1-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h13l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14 5.5V7"/></svg> Inköpslista</h2>`

- [ ] **Step 6: Ersätt 📤 Skicka till Willys (rad ~253)**

Run: `Grep -n "📤" index.html`

Edit:
- old: `        📤 Skicka till Willys`
- new:
```html
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5"/><path d="M9 5h10v10"/></svg> Skicka till Willys
```

- [ ] **Step 7: Ersätt ＋ FAB (rad ~271)**

Edit:
- old: `<button class="fab-import" id="fabImport" onclick="openImportModal()" title="Importera recept" aria-label="Importera recept">＋</button>`
- new: `<button class="fab-import" id="fabImport" onclick="openImportModal()" title="Importera recept" aria-label="Importera recept"><svg class="icon icon-em-1-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg></button>`

- [ ] **Step 8: Verifiera 0 emoji kvar i index.html**

Run: `Grep "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" index.html output_mode=count`
Expected: 0

(Anteckning: vissa bottom-nav-svgs etc står kvar oförändrade.)

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
No-data + inköpslista + FAB: emoji → inline-SVG

🍽️/⏳/📋/🛒/📤/＋ ersatta. Empty-state-ikoner skalade till .icon-em-2,
section-title-ikon till .icon-em-1-2, FAB till .icon-em-1-5.
Bottom-nav-SVG:erna oförändrade (redan Lucide-stil från Session 41).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Ersätt emoji i js/weekly-plan/plan-viewer.js

**Files:**
- Modify: `js/weekly-plan/plan-viewer.js`

- [ ] **Step 1: Hitta alla emoji i filen**

Run: `Grep -n "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" js/weekly-plan/plan-viewer.js -- output_mode=content`

Expected: lista över rader som innehåller emoji. Vanliga ställen:
- 💰 i savings-badge
- 🍳/📝/📅 i custom-day-options
- 🍳-prefix i custom-recipe slim-card

- [ ] **Step 2: Definiera SVG-konstanter högst upp i filen**

Edit (lägg in efter befintliga imports/state):
- old: hitta första `function ` eller första ` const `-rad efter eventuell header — ange unikt context
- new: samma rad föregånget av:

```javascript
const ICON_COIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>';
const ICON_POT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>';
const ICON_NOTE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>';
const ICON_CALENDAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>';

```

- [ ] **Step 3: Ersätt 💰 mot ICON_COIN**

För varje träff i Step 1 som innehåller `💰`:
Edit (anpassa per kontext — typiskt en template literal som `\`💰 Sparat ca ${kr} kr\``):
- old: `\`💰 Sparat`
- new: `\`${ICON_COIN} Sparat`

Om sträng-formen är annorlunda (t.ex. `'💰 ' + something`): byt till `ICON_COIN + ' ' + something`.

Notera att template literals med embedded variables ska behålla `${...}`-syntaxen runt ICON_COIN: `\`${ICON_COIN} Sparat ca ${kr} kr\``.

- [ ] **Step 4: Ersätt 🍳 mot ICON_POT**

Edit replace_all (om syntaxen är konsekvent — annars per fall):
- old: `🍳 `
- new: `${ICON_POT} ` (om i template literal) — anpassa efter exakt syntax

- [ ] **Step 5: Ersätt 📝 mot ICON_NOTE**

Samma mönster.

- [ ] **Step 6: Ersätt 📅 mot ICON_CALENDAR**

Samma mönster.

- [ ] **Step 7: Verifiera 0 emoji kvar**

Run: `Grep "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" js/weekly-plan/plan-viewer.js output_mode=count`
Expected: 0

- [ ] **Step 8: Commit**

```bash
git add js/weekly-plan/plan-viewer.js
git commit -m "$(cat <<'EOF'
plan-viewer.js: emoji → inline-SVG via konstanter

ICON_COIN/POT/NOTE/CALENDAR definierade högst upp, används i savings-
badge och custom-day-options. Hand-tecknad lo-fi-stil i currentColor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Ersätt emoji i js/shopping/shopping-list.js och dispatch-ui.js

**Files:**
- Modify: `js/shopping/shopping-list.js`
- Modify: `js/shopping/dispatch-ui.js`

- [ ] **Step 1: Hitta emoji i shopping-list.js**

Run: `Grep -n "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" js/shopping/shopping-list.js -- output_mode=content`

- [ ] **Step 2: Lägg in SVG-konstanter i shopping-list.js**

Edit (efter eventuell module-header / första sektion):
- new: prepend block med konstanter för de emoji som faktiskt finns. Exempel om `🛒` och `📋` används:

```javascript
const ICON_BAG = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h13l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14 5.5V7"/></svg>';
const ICON_CLIPBOARD = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
```

- [ ] **Step 3: Ersätt emoji-träffar med konstanter**

Per fall, anpassa efter sträng-typ (template literal vs concatenation).

- [ ] **Step 4: Hitta emoji i dispatch-ui.js**

Run: `Grep -n "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" js/shopping/dispatch-ui.js -- output_mode=content`

- [ ] **Step 5: Lägg in SVG-konstant i dispatch-ui.js**

```javascript
const ICON_DISPATCH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5"/><path d="M9 5h10v10"/></svg>';
```

- [ ] **Step 6: Ersätt 📤 i knapp-label, modal-rubriker etc**

Per kontext (kontrollera om dynamiska label-strängar finns).

- [ ] **Step 7: Verifiera**

Run:
```bash
Grep "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" js/shopping/shopping-list.js output_mode=count
Grep "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" js/shopping/dispatch-ui.js output_mode=count
```
Expected: 0 / 0

- [ ] **Step 8: Commit**

```bash
git add js/shopping/shopping-list.js js/shopping/dispatch-ui.js
git commit -m "$(cat <<'EOF'
shopping-list + dispatch-ui: emoji → inline-SVG-konstanter

Samma mönster som plan-viewer — ICON_*-konstanter högst upp, används
i template literals och dynamiska render-strängar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Slut-grep — verifiera att inga gamla referenser eller emoji finns kvar

**Files:** N/A (verifiering)

- [ ] **Step 1: Grep gamla token-namn i hela kodbasen**

Run:
```bash
Grep "var\(--cream\)|var\(--warm-white\)|var\(--ink\)|var\(--warm-brown\)|var\(--terracotta\)|var\(--sage\)|var\(--gold\)|var\(--light-sage\)|var\(--light-terra\)" output_mode=count
```
Expected: 0

- [ ] **Step 2: Grep gamla brand-hex**

Run:
```bash
Grep "#5c3d1e|#c2522b|#a6431f|#a84522|#4a3018|#4a7d4e|#b04030|#d9534f" -i output_mode=count
```
Expected: 0

- [ ] **Step 3: Grep emoji i alla relevanta filer**

Run:
```bash
Grep "[✨💰📤📝🍳🛒📅📋🍽⏳⚙🔍]|＋" --glob "{index.html,js/**/*.js,api/**/*.js,css/**/*.css}" output_mode=count
```
Expected: 0

- [ ] **Step 4: Backend-tester ska fortfarande passera**

Run: `node tests/match.test.js && node tests/shopping.test.js && node tests/select-recipes.test.js && node tests/dispatch-to-willys.test.js && node tests/cookies-endpoint.test.js`

Expected: alla testfiler exitar 0. (CSS rör inte backend-logik, så detta är en regressionscheck — borde gå direkt.)

- [ ] **Step 5: Inga ändringar att committa här**

Verifieringssteg utan kod-ändringar. Bara konstatera grön status och gå vidare.

---

## Task 14: Uppdatera CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Läs Tekniska beslut-sektionen**

Run: `Grep -n "^## Tekniska beslut" CLAUDE.md`

Sedan läs blocket: `Read CLAUDE.md offset=<line> limit=15`

- [ ] **Step 2: Ersätt Färgtema-raden**

Edit:
- old: `- **Färgtema:** Krämvitt \`#faf7f2\`, brun header \`#5c3d1e\`, terrakotta \`#c2522b\``
- new: `- **Färgtema:** Linen-canvas \`#f5f1e8\`, lichen-grön header \`#7a9482\`, rust-accent \`#b56a4c\` (CTA + today). Forest \`#3d5544\` text, ochre \`#c89a3e\` wordmark-suffix. Scandi/nature-paletten — designad i Claude Design, migrerad i Session 43.`

- [ ] **Step 3: Lägg till Session 43-post i "Senaste session"**

Hitta `### Senaste session — Session 42` med Grep: `Grep -n "Senaste session — Session 42" CLAUDE.md`

Edit:
- old: `### Senaste session — Session 42 (2026-04-26) — Fas 4F implementation: cookie-refresh-automation`
- new:
```
### Senaste session — Session 43 (2026-05-03) — Design-system-migration (Scandi/nature-pivot)
- **Motivering:** Användaren iterativt designat ny visuell identitet i Claude Design (handoff-bundle: `receptboken-design-system`). Pivot från warm-brown/terracotta/cream/gold → lichen-grön/forest/rust/ochre/linen ("Scandi/nature"). Plus hand-tecknade lo-fi line-SVG-ikoner istället för färgglada emoji.
- **Spec:** `docs/superpowers/specs/2026-05-03-design-system-migration-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-03-design-system-migration.md`
- **Token-pivot i `css/styles.css`:** `:root` skrivet om — 9 gamla tokens (--cream/--warm-brown/--terracotta/--sage/--gold/--ink/--light-sage/--light-terra/--warm-white) bytta mot 14 nya (--linen/--linen-card/--paper/--stone/--lichen/--lichen-deep/--moss-soft/--forest/--forest-deep/--rust/--rust-deep/--clay/--birch/--birch-soft/--moss-muted/--ochre). Semantic aliases (--border, --text-muted, --color-success, --color-success-dark, --color-danger) pekar nu till nya tokens. ~163 references uppdaterade via global rename. 9 strö-hex tokeniserade. Plan-pastels (timeline-arkiv) bytta från grön/blå/beige/lila → moss/slate/birch/clay (earth-tone). Pill-radie 999px → 4px (lo-fi/Scandi).
- **Emoji → inline-SVG:** 13+ emoji i markup och 4–8 i dynamiskt-renderad JS bytta mot hand-tecknade line-SVG:er i `currentColor` enligt mönstret från Session 41 (bottom-nav). SVG-paths från `brand-iconography.html` i designbundlen. Ny `.icon`-utility-klass följer text-storlek (1em) med `vertical-align: -0.125em`. Bottom-nav-SVG:erna oförändrade.
- **Centrala konsekvenser:** Top-header brun → lichen-grön. Active tab/CTA terracotta → rust. Today-state: rust-ring runt hela kortet → lichen-ring + moss-soft fyllning + rust-prick (rust används bara som liten saturated punkt). Selected/open recipe-card-border terracotta → lichen ("selected = lugn", inte "alarm"). Tested-pill, savings-text och success-states sage → lichen-deep.
- **Inga JSON/data/backend-ändringar.** 341 backend-tester passar oförändrat. Verifiering: läst tillbaka varje editerad fil + grep för 0 träffar på gamla token-namn, gamla brand-hex och emoji i appens kod.
- **Status:** Live på https://receptbok-six.vercel.app/. Användaren har inte mobil-access just nu — verifiering deferred. Rollback = `git revert` om regression upptäcks.

### Session 42 (2026-04-26) — Fas 4F implementation: cookie-refresh-automation
```

(Notera: rubriken för Session 42 går från "### Senaste session — Session 42" → "### Session 42" eftersom den inte längre är senast.)

- [ ] **Step 4: Verifiera CLAUDE.md syntax**

Run: `Read CLAUDE.md offset=<senaste session-rad> limit=30`
Expected: ny session 43-post visas korrekt, gamla 42-rubriken har kvar sitt innehåll men utan "Senaste session"-prefix.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
CLAUDE.md: Färgtema-rad uppdaterad + Session 43-post tillagd

Identitetsblocket reflekterar nya scandi-paletten. Session 42 demoteras
från "Senaste session" till tidigare session.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Push, merge till main, verifiera

**Files:** N/A

- [ ] **Step 1: Push feature-branchen**

Run: `git push -u origin claude/design-system-scandi`

- [ ] **Step 2: Mergea till main**

Per CLAUDE.md operativa regel "Mergea till main":

```bash
git checkout main
git pull origin main
git merge --no-ff claude/design-system-scandi -m "Merge: Design System Scandi-migration (Session 43)"
git push origin main
```

- [ ] **Step 3: Vänta ~30 sek för Vercel-deploy**

Användaren har sagt att de inte verifierar mobilt just nu. Hoppa till Step 4 utan att vänta.

- [ ] **Step 4: Slutrapport till användaren**

Skriv en kort sammanfattning till användaren:
- Antal commits och vad de täcker
- Branch-status
- Att verifiering på mobil är deferred enligt deras direktiv
- Vad som ändrats topologiskt (header-färg, today-staten, CTA-färg, ikoner) så de vet vad de tittar efter när de öppnar appen

---

## Risk-matris

| Risk | Sannolikhet | Mitigering |
|---|---|---|
| Halv-migrerade selektorer (`var(--warm-brown)` kvar någonstans) | Låg | Task 13 grep:ar | 
| Emoji-träff missas i dynamiskt JS | Medel | Task 13 grep i alla JS/HTML |
| Pill ser ut som taggad rektangel istället för avlång pill (för smal padding kvar) | Låg | Pill-padding rörs inte; bara radien |
| Backend-tester bryts | Mycket låg | CSS rör inte logik; Task 13 Step 4 verifierar |
| Emoji som finns i CLAUDE.md eller docs/ ändras felaktigt | Inte applicabelt | Greps är scoped till `index.html, js/**, api/**, css/**` |
| Rollback behövs | Låg | `git revert <merge-commit>` på main |

---

## Out of scope (gör INTE)

- **Knapp-geometri-harmonisering.** Spec nämnde "38px hög, 8px radie för primary/secondary, 5 tiers". Vid plan-skrivning upptäcktes att Receptboken har 10+ knapp-klasser (`.generate-btn`, `.confirm-plan-btn`, `.flytta-btn`, `.shop-mode-btn`, `.btn-save`, `.btn-delete`, etc.) med olika geometri per kontext. Att harmonisera dem är en separat layout-pass som ändrar UI-känslan utöver färg-pivoten. Skjuts till uppföljnings-session efter live-verifiering, om behovet känns kvar då.
- Layout-ändringar (padding, margin, grid, flex-konfig)
- Nya komponenter eller modaler
- Förändringar i `recipes.json` eller annan JSON-data
- Förändringar i `api/`-endpoints
- Förändringar i `tests/`
- Förändringar i `extension/` (Chrome-extension)
- Förändringar i bottom-nav-ikonerna (Book/CalendarDays/ClipboardCheck)
- Mobil-verifiering (användaren har explicit OK:at att skjuta upp)
- Feature-flag eller theme-class (användaren valde big-bang)

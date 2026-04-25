# Mobil bottom-tab-navigering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flytta flik-navigeringen från toppen till botten på mobil med ikon+text-flikar, minimera toppheadern, och bevara desktop-upplevelsen oförändrad.

**Architecture:** Två separata `<nav>`-element (befintlig `.header-nav` + ny `.bottom-nav`) som delar `switchTab()`-callback via `data-tab`-attribut. CSS-mediagräns vid 599px togglar `display:none` på respektive nav. Ny `--bottom-nav-h` CSS-variabel driver body-padding samt position på FAB och scrolltop-knapp så ingen krock uppstår.

**Tech Stack:** Vanilla HTML5 + CSS3 (custom properties, env(safe-area-inset-bottom), position:sticky/fixed) + ES2017 modules. Inga build-steg, inga externa beroenden.

**Spec:** `docs/superpowers/specs/2026-04-25-mobile-bottom-tab-nav-design.md` (commit `332f927`)

**Verifiering:** UI-CSS-ändringar har ingen automatiserad testtäckning i repot (existerande mönster — tester finns för data-pipelines, inte layout). Varje task verifieras manuellt via Antigravity live-preview eller Vercel preview-deploy. Definitiva regressionschecks görs i sista task efter alla ändringar landat.

---

## File Structure

| Fil | Ansvar | Tasks |
|-----|--------|-------|
| `index.html` | Markup för båda nav-element + viewport-meta + DOM-position för sökruta | T2, T3, T5, T6 |
| `css/styles.css` | All visuell logik: bottom-nav, mobil-toppheader, sticky sökruta, FAB/scrolltop-offset | T1, T4, T5, T6 |
| `js/ui/navigation.js` | switchTab() refaktor till querySelectorAll-pattern | T2 |

---

## Task 1: CSS-variabel + body padding + lyft FAB/scrolltop

**Mål:** Lägg infrastrukturen — `--bottom-nav-h` CSS-variabel som styr body-padding och position på FAB + scrolltop. Ingen visuell skillnad än (variabeln är 0 på desktop, bar:n existerar inte). Ändringen är safe att köra ensam — inget visuellt regreserar.

**Files:**
- Modify: `css/styles.css` (3 platser: `:root`, `body`, `#scrolltop`, `.fab-import`)

- [ ] **Step 1: Lägg `--bottom-nav-h` till `:root`-blocket**

Öppna `css/styles.css`, hitta `:root`-blocket (rad 1–16). Lägg till variabeln i slutet av blocket (efter `--color-danger`):

```css
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

- [ ] **Step 2: Lägg mobil-mediagräns för `--bottom-nav-h`**

Direkt efter `:root`-blocket (på rad 17, före `* { box-sizing... }`-raden):

```css
  @media (max-width: 599px) {
    :root {
      --bottom-nav-h: calc(64px + env(safe-area-inset-bottom, 0px));
    }
  }
```

- [ ] **Step 3: Lägg `padding-bottom` på `body`**

Hitta `body { ... }`-blocket (rad 20–25). Ändra till:

```css
  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--cream);
    color: var(--ink);
    min-height: 100vh;
    padding-bottom: var(--bottom-nav-h);
  }
```

- [ ] **Step 4: Uppdatera `#scrolltop` bottom-position**

Hitta `#scrolltop`-blocket (~rad 516). Ändra `bottom: 1.5rem;` till:

```css
    bottom: calc(var(--bottom-nav-h) + 1.5rem);
```

- [ ] **Step 5: Uppdatera `.fab-import` bottom-position**

Hitta `.fab-import`-blocket (~rad 2536). Ändra `bottom: 1.5rem;` till:

```css
    bottom: calc(var(--bottom-nav-h) + 1.5rem);
```

- [ ] **Step 6: Verifiera ingen visuell regression på desktop**

Öppna `index.html` i Antigravity live-preview vid bredd ≥600px. Kontrollera:
- FAB (`+`) sitter där den alltid suttit (bottom-left, ~24px från botten)
- Scrolltop (`↑`) syns när man scrollar och sitter där den alltid suttit (bottom-right)
- Inget extra utrymme längst ner i body (variabeln är 0 på desktop)

Förväntat: pixelmässigt identiskt med tidigare.

- [ ] **Step 7: Commit**

```bash
git add css/styles.css
git commit -m "css: introducera --bottom-nav-h variabel och lyft FAB/scrolltop"
```

---

## Task 2: data-tab-attribut + switchTab refaktor

**Mål:** Ändra `switchTab()` så den togglar `.active` på alla nav-knappar via `querySelectorAll('[data-tab]')` istället för 6 hårdkodade `getElementById`. Lägger `data-tab` på existerande topp-nav-knappar. Ingen visuell skillnad — toppnav fungerar oförändrad.

**Files:**
- Modify: `index.html` (rad 23–25)
- Modify: `js/ui/navigation.js` (rad 7–9)

- [ ] **Step 1: Lägg `data-tab` på topp-nav-knappar**

Hitta `<nav class="header-nav">` i `index.html` (rad 22–26). Ändra till:

```html
    <nav class="header-nav">
      <button class="header-tab active" id="tabRecept" data-tab="recept" onclick="switchTab('recept')">Recept</button>
      <button class="header-tab" id="tabVecka" data-tab="vecka" onclick="switchTab('vecka')">Veckans mat</button>
      <button class="header-tab" id="tabShop" data-tab="shop" onclick="switchTab('shop')">Inköpslista</button>
    </nav>
```

ID:n behålls för bakåtkompatibilitet.

- [ ] **Step 2: Refaktorera `switchTab()` i `js/ui/navigation.js`**

Öppna `js/ui/navigation.js`. Ersätt hela filinnehållet:

```js
// Tab-navigering: receptvy, veckovyn, inköpslistan.

export function switchTab(tab) {
  document.getElementById('receptView').style.display              = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',     tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',     tab === 'shop');
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('headerSearchArea').classList.toggle('hidden', tab !== 'recept');
  document.getElementById('fabImport').style.display              = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') window.loadShoppingTab();
  if (tab === 'vecka' && window.centerTodayCard) {
    requestAnimationFrame(() => window.centerTodayCard({ smooth: false }));
  }
  window.scrollTo({ top: 0 });
}

window.switchTab = switchTab;
```

Skillnad: 3 rader `getElementById('tabRecept|tabVecka|tabShop').classList.toggle(...)` ersätts av en `querySelectorAll('[data-tab]').forEach(...)`.

- [ ] **Step 3: Verifiera fliktoggling fortfarande funkar**

Öppna `index.html` i Antigravity live-preview (desktop-bredd). Klicka på var och en av:
- "Recept" → recept-vyn syns, aktiv-stil (gold underline) på flik
- "Veckans mat" → veckovyn syns, aktiv-stil flyttar
- "Inköpslista" → inköpslistan laddas, aktiv-stil flyttar

Förväntat: identiskt med tidigare beteende.

- [ ] **Step 4: Commit**

```bash
git add index.html js/ui/navigation.js
git commit -m "nav: lägg data-tab + refaktorera switchTab till querySelectorAll"
```

---

## Task 3: Bottom-nav-markup med konkreta SVG-ikoner

**Mål:** Lägg till `<nav class="bottom-nav">` i `index.html` med tre flikar (samma ordning: Recept, Veckans mat, Inköpslista), var och en med konkret line-style SVG-ikon + label. Bar:n är osynlig än (CSS i nästa task).

**Files:**
- Modify: `index.html` (efter rad 271, före `<div id="editModal">` på rad 273)

- [ ] **Step 1: Lägg `<nav class="bottom-nav">` direkt efter `.fab-import`-knappen**

Öppna `index.html`. Hitta raden med `<button class="fab-import" id="fabImport" ...>` (rad 271). Direkt efter den raden, före `<div id="editModal">`, lägg till:

```html
<nav class="bottom-nav" aria-label="Huvudnavigering">
  <button class="bottom-nav-tab active" data-tab="recept" onclick="switchTab('recept')" aria-label="Recept">
    <span class="bottom-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    </span>
    <span class="bottom-nav-label">Recept</span>
  </button>
  <button class="bottom-nav-tab" data-tab="vecka" onclick="switchTab('vecka')" aria-label="Veckans mat">
    <span class="bottom-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4"/>
        <path d="M8 2v4"/>
        <path d="M3 10h18"/>
      </svg>
    </span>
    <span class="bottom-nav-label">Veckans mat</span>
  </button>
  <button class="bottom-nav-tab" data-tab="shop" onclick="switchTab('shop')" aria-label="Inköpslista">
    <span class="bottom-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="8" y="2" width="8" height="4" rx="1"/>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        <path d="m9 14 2 2 4-4"/>
      </svg>
    </span>
    <span class="bottom-nav-label">Inköpslista</span>
  </button>
</nav>
```

**SVG-källor** (Lucide-stil):
- Recept = `Book` (uppslagen bok med rygg)
- Veckans mat = `CalendarDays` (rektangel med två "ringar" upptill + horisontell linje)
- Inköpslista = `ClipboardCheck` (klippblock med klämma + checkmark)

`active`-klassen sätts på recept-fliken som default (samma som toppnav).

- [ ] **Step 2: Verifiera markup laddas utan att synas**

Öppna `index.html` i Antigravity live-preview (vilken bredd som helst). Bottom-nav ska *inte* synas än — eftersom `.bottom-nav` saknar CSS, ärver den `display: block` (default `<nav>`). Det betyder att den faktiskt visas som tre vertikalt staplade knappar längst ner i sidan, men utan styling.

Detta är ok som mellanstadium — nästa task styler det. Om du vill verifiera att markup är giltig, öppna devtools → Elements → leta efter `<nav class="bottom-nav">` direkt under `.fab-import`-knappen.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "html: lägg bottom-nav-markup med Lucide-stil SVG-ikoner"
```

---

## Task 4: Bottom-nav CSS — synlig knapp-rad på mobil

**Mål:** Style bottom-nav så den syns som en bar i botten på mobil, gömd på desktop. Aktiv flik = krämvit pille bakom + terracotta ikon/text. Detta är task:en där bar:n blir visuellt levande.

**Files:**
- Modify: `css/styles.css` (lägg nytt block i slutet av filen)

- [ ] **Step 1: Lägg `.bottom-nav` CSS-block i slutet av `css/styles.css`**

Öppna `css/styles.css`. Scrolla till slutet av filen. Direkt efter sista raden (efter `.shop-dispatch-btn`-blocket eller motsvarande), lägg till:

```css
/* ─── BOTTOM NAV (mobil-only) ────────────────────────────────────── */
.bottom-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--warm-white);
  border-top: 1px solid var(--border);
  box-shadow: 0 -2px 16px rgba(0,0,0,0.06);
  padding: 6px 4px env(safe-area-inset-bottom, 0px);
  z-index: 100;
}

@media (max-width: 599px) {
  .bottom-nav { display: flex; }
}

.bottom-nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  background: none;
  border: none;
  border-radius: 14px;
  color: var(--text-muted);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
  -webkit-tap-highlight-color: transparent;
  min-height: 52px;
}

.bottom-nav-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
}

.bottom-nav-icon svg {
  width: 100%;
  height: 100%;
}

.bottom-nav-tab.active {
  color: var(--terracotta);
  background: var(--light-terra);
}

.bottom-nav-tab:active { transform: scale(0.96); }
```

- [ ] **Step 2: Verifiera bar:n syns på mobil-bredd**

Öppna `index.html` i Antigravity live-preview. Krymp fönstret till ≤599px (eller använd devtools → mobil-läge: iPhone 14 e.dyl.). Förväntat:
- Bar längst ner med tre ikon+text-flikar (Recept | Veckans mat | Inköpslista)
- Recept har terracotta pille (`--light-terra`-bakgrund) bakom + terracotta ikon/text
- Veckans mat och Inköpslista är muted-grå (text-muted-färgen)
- Klick på Veckans mat → toggleing fungerar (pillen flyttar). Detta funkar för att switchTab redan refaktorerades i Task 2.
- Klick fortsätter att synkronisera mellan toppnav (om synlig) och bottomnav

**Bredda fönstret tillbaka till ≥600px:** bar:n försvinner helt.

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "css: bottom-nav som synlig knapp-rad på mobil med pille-aktivstil"
```

---

## Task 5: Mobil-toppheader-minimering + viewport-fit

**Mål:** På mobil — minska toppheadern till bara titel-raden (gömma topp-nav-flikarna) och uppdatera viewport-meta så safe-area-inset aktiveras under iOS-notch.

**Files:**
- Modify: `index.html` (rad 5)
- Modify: `css/styles.css` (lägg nytt @media-block efter befintlig `@media (min-width: 600px)`-block)

- [ ] **Step 1: Uppdatera viewport-meta**

Öppna `index.html`. Hitta rad 5:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

Ändra till:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

`viewport-fit=cover` aktiverar `env(safe-area-inset-*)` på iOS-enheter med notch/home-indicator, vilket vi redan refererar i `--bottom-nav-h` (Task 1) och `.bottom-nav` padding (Task 4).

- [ ] **Step 2: Lägg mobil-toppheader-minimering i `css/styles.css`**

Öppna `css/styles.css`. Hitta `@media (min-width: 600px)`-blocket (~rad 68–77). Direkt efter det blocket (innan `.header-tab`-blocket på rad 79), lägg till:

```css
  @media (max-width: 599px) {
    .header-bar {
      flex-direction: row;
      padding: 0.4rem 1rem;
      align-items: center;
      justify-content: center;
    }
    header h1 {
      font-size: 1.05rem;
      padding-bottom: 0;
    }
    .header-nav { display: none; }
  }
```

- [ ] **Step 3: Verifiera mobil-header krymper och topp-nav göms**

Öppna `index.html` i Antigravity live-preview, mobil-bredd ≤599px. Förväntat:
- Toppheader är ~40px hög med endast "Receptboken"-titel centrerad
- Inga textflikar längst upp (Recept/Veckans mat/Inköpslista)
- Bottom-bar längst ner är primär-nav
- Vid bredd ≥600px: toppnav återvisas (text-flikar), header-höjden återgår till tidigare layout

- [ ] **Step 4: Commit**

```bash
git add index.html css/styles.css
git commit -m "css: minimera mobil-toppheader, lägg viewport-fit=cover för safe-area"
```

---

## Task 6: Sökfält — DOM-flytt + sticky styling

**Mål:** Flytta `<div class="header-search-area">` ut ur `<header>` och in som första barn i `<main id="receptView">`. Sticky-positionera så det stannar kvar längst upp vid scroll i recept-vyn. Funkar både desktop och mobil.

**Files:**
- Modify: `index.html` (flytta rad 28–34 från header till början av main)
- Modify: `css/styles.css` (uppdatera `.header-search-area`-blocket ~rad 104–117)

- [ ] **Step 1: Flytta DOM-noden**

Öppna `index.html`. Hitta `<div class="header-search-area" id="headerSearchArea">`-blocket (rad 28–34):

```html
  <div class="header-search-area" id="headerSearchArea">
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input id="search" type="search" placeholder="Sök på namn, ingrediens, tagg…" autocomplete="off">
    </div>
    <div class="filters" id="filters"></div>
  </div>
```

**Klipp ut hela blocket** (inkl. öppnings- och stängningstaggar — totalt 7 rader). Ta bort också blank-raden mellan `</nav>` och `<div class="header-search-area">`-blocket om du klipper rent. Resultatet av `<header>` ska bli:

```html
<header>
  <div class="header-bar">
    <h1>Recept<em>boken</em></h1>
    <nav class="header-nav">
      <button class="header-tab active" id="tabRecept" data-tab="recept" onclick="switchTab('recept')">Recept</button>
      <button class="header-tab" id="tabVecka" data-tab="vecka" onclick="switchTab('vecka')">Veckans mat</button>
      <button class="header-tab" id="tabShop" data-tab="shop" onclick="switchTab('shop')">Inköpslista</button>
    </nav>
  </div>
</header>
```

**Klistra in det utklippta blocket** som första barn i `<main id="receptView">`, *före* `<div class="replace-banner">`:

```html
<main id="receptView">
  <div class="header-search-area" id="headerSearchArea">
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input id="search" type="search" placeholder="Sök på namn, ingrediens, tagg…" autocomplete="off">
    </div>
    <div class="filters" id="filters"></div>
  </div>
  <div class="replace-banner" id="replaceBanner">
    Väljer recept till <strong id="replaceBannerDay"></strong> — tryck på ett recept nedan
    <button class="replace-banner-cancel" onclick="exitReplaceMode()">Avbryt</button>
  </div>
  <!-- ...resten oförändrad... -->
```

- [ ] **Step 2: Uppdatera `.header-search-area` CSS för sticky-beteende**

Öppna `css/styles.css`. Hitta `.header-search-area`-blocket (~rad 104–117). Det nuvarande blocket ser ut såhär:

```css
  /* ── SEARCH AREA (collapsible) ── */
  .header-search-area {
    padding: 0.6rem 1.25rem 0.85rem;
    overflow: hidden;
    max-height: 500px;
    opacity: 1;
    transition: max-height 0.4s ease, opacity 0.25s ease, padding 0.3s ease;
  }

  .header-search-area.hidden {
    max-height: 0;
    opacity: 0;
    padding-top: 0;
    padding-bottom: 0;
  }
```

Ersätt det blocket med:

```css
  /* ── SEARCH AREA (sticky inom recept-vyn) ── */
  .header-search-area {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--warm-brown);
    padding: 0.6rem 1.25rem 0.85rem;
    overflow: hidden;
    max-height: 500px;
    opacity: 1;
    transition: max-height 0.4s ease, opacity 0.25s ease, padding 0.3s ease;
  }

  .header-search-area.hidden {
    max-height: 0;
    opacity: 0;
    padding-top: 0;
    padding-bottom: 0;
  }
```

Ändringen: lägg till `position: sticky; top: 0; z-index: 50; background: var(--warm-brown);`. Övriga regler oförändrade.

- [ ] **Step 3: Verifiera sökfältet syns och sticka korrekt**

Öppna `index.html` i Antigravity live-preview.

**Mobil (≤599px):**
- Toppheader (~40px) syns med titeln
- Direkt under: brun sökruta sticka kvar längst upp i recept-vyn
- Scrolla recept-grid:en ner — sökrutan stannar fastlimmad under headern
- Klicka "Veckans mat" i bottom-bar → recept-vyn göms helt (även sökrutan, eftersom hela `<main id="receptView">` är `display:none`)
- Klicka "Recept" igen → sökrutan tillbaka

**Desktop (≥600px):**
- Toppheader full-storlek med toppnav
- Direkt under: brun sökruta (visuellt identiskt med tidigare layout)
- Scroll → sökrutan stickar längst upp i main, ovanpå recept-grid:en

- [ ] **Step 4: Commit**

```bash
git add index.html css/styles.css
git commit -m "html+css: flytta sökruta till recept-vyn som sticky banner"
```

---

## Task 7: Manuell verifiering enligt fullständig testplan

**Mål:** Köra igenom hela testplanen från specen, fånga ev. visuella eller funktionella regressioner, fixa inline om något hittas, och pusha till main.

**Files:** Inga ändringar planerade — bara verifiering. Eventuella regressioner fixas via riktade edits i `index.html` eller `css/styles.css`.

- [ ] **Step 1: Mobil-verifiering (≤599px) — använd Antigravity live-preview eller Vercel preview-deploy med mobil-läge i devtools**

Bocka av varje punkt:

- [ ] Bottom-bar syns på alla tre flikar; toppnav göms
- [ ] Aktiv flik har terracotta pille; inaktiva är muted-grå
- [ ] Klick på varje flik byter vy korrekt (recept ↔ vecka ↔ shop)
- [ ] Sökfält syns bara på recept-fliken (sticky toppen av main)
- [ ] FAB (`+`) på recept-fliken sitter ovanför bottom-bar:n
- [ ] Scroll-top-knappen (`↑`) sitter ovanför bottom-bar:n
- [ ] Toppheader-autohide funkar fortfarande (göms vid scroll-ner)
- [ ] Bottom-bar göms aldrig (kvar vid scroll)
- [ ] Footer ("Receptboken") syns ovanför bar:n, inte under
- [ ] iOS Safari (om enhet finns): home-indicator-ytan respekteras (ingen tap-zon under bar:n)

- [ ] **Step 2: Desktop-verifiering (≥600px)**

- [ ] Bottom-bar göms helt
- [ ] Toppnav fungerar exakt som idag (gold underline-stil oförändrad)
- [ ] FAB och scrolltop sitter på samma position som idag (`bottom: 1.5rem`)
- [ ] Sökfält syns inom toppheaderns visuella område
- [ ] Sökfält stickar på rätt sätt vid scroll i recept-vyn

- [ ] **Step 3: Cross-vy-verifiering**

- [ ] `centerTodayCard` triggas vid byte till vecka-fliken (verifiera: idag-kortet är centrerat när du byter till vecka)
- [ ] `loadShoppingTab` triggas vid byte till shop (inköpslista laddas)
- [ ] Replace-mode (klicka "Byt"-knapp på en plan-dag) — banner syns korrekt över eller under sticky sökrutan
- [ ] Custom-pick-mode (klicka tom dag → "Välj recept ur receptboken") — banner syns korrekt

- [ ] **Step 4: Fixa eventuella regressioner**

Om något i steg 1–3 fallerar, identifiera roten och fixa direkt i berörd fil. Vanliga troliga problem:
- Replace-banner gömd bakom sticky sökrutan (z-index-konflikt) → höja banner z-index eller positionera den efter sökrutan
- Bottom-bar SVG-ikoner ser felcentrerade ut (line-height-fel) → justera `.bottom-nav-icon { line-height: 0 }`
- Tunn vit linje mellan body och bottom-bar i Capacitor (transparant body) → `body { background: var(--cream) }` är redan satt, så bör vara OK

Committa varje fix separat med beskrivande meddelande.

- [ ] **Step 5: Final push till main**

```bash
git push origin main
```

Vercel deployar automatiskt (~30 sek). GitHub Pages uppdateras likadant.

- [ ] **Step 6: Live-verifiering på Vercel**

Öppna https://receptbok-six.vercel.app/ på en faktisk mobil (eller mobil-emulering i devtools). Bekräfta att alla checkpoints i Steg 1–3 fortfarande håller efter live-deploy.

- [ ] **Step 7: Uppdatera CLAUDE.md med session-post**

Lägg till sektion under Roadmap (eller "Senaste session — Session 41") med kort beskrivning av vad som ändrats. Markera "Mobil bottom-tab-navigering" i Idéer-listan som **DONE** eller flytta till Senaste session.

```bash
git add CLAUDE.md
git commit -m "docs: Session 41 — mobil bottom-tab-navigering implementerad"
git push origin main
```

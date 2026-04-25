# Designspec — Mobil bottom-tab-navigering

**Datum:** 2026-04-25
**Status:** Design klar — implementation-plan ej skriven
**Relaterad fas:** Förberedelse inför Fas 5 (App Store via Capacitor)

## Bakgrund

Receptbokens flik-navigering ligger idag uppe i headern som textknappar (Recept / Veckans mat / Inköpslista) med gold underline för aktiv flik. På mobil är detta längst bort från tummen och har "rubrik"-känsla snarare än "knapp"-känsla. Native mobil-appar placerar konsekvent sin primär-navigering i botten där tummen når naturligt.

Detta är ett rent UX-jobb innan Fas 5A (Capacitor-paketering) — bottom-tab-navigering är defacto-standard i App Store-/Play Store-appar och appen ska kännas native när den paketeras.

## Mål

- Flik-navigeringen flyttas till botten **enbart på mobil**
- Bottom-bar:n känns som en *knapp-rad* (visuell yta, inte bara text)
- Toppheadern minimeras på mobil för att kompensera för den nya bottom-chrome:n
- Befintlig FAB (`+`-import) och `#scrolltop`-knappen krockar inte med bar:n
- Desktop-upplevelsen lämnas oförändrad
- Implementationen är Capacitor-redo (safe-area-inset, ingen runtime-bredd-detektion utöver CSS)

## Beslut låsta i brainstormingen

| # | Val | Beslut |
|---|-----|--------|
| 1 | Innehåll i flik | Ikon + text under |
| 2 | Ikon-typ | Inline SVG, minimalistisk line-style (24px box, ~1.75px stroke, `currentColor`) |
| 3 | Toppheader på mobil | Minimeras till bara titel "Receptboken". Sökfält flyttas permanent in som sticky banner i recept-vyn |
| 4 | Aktiv-stil | Krämvit pille bakom ikon+text + terracotta färg på ikon+text |
| 5 | Auto-hide | Bottom-bar **alltid synlig** på mobil. Toppheader-autohide bevaras |
| 6 | FAB / scrolltop | Lyfts via CSS-variabel `--bottom-nav-h` så de hamnar ovanför bar:n på mobil |
| 7 | Markup-strategi | Två separata `<nav>`-element. Delad JS via `data-tab`-attribut |

## Arkitektur

### Komponenter som ändras

```
index.html
├── <header>
│   ├── .header-bar          [oförändrad i markup; CSS-tunnare på mobil]
│   │   ├── h1               [oförändrad]
│   │   └── nav.header-nav   [data-tab läggs till; display:none på mobil]
│   └── .header-search-area  [FLYTTAS UT — ny placering nedan]
├── <main id="receptView">
│   ├── .header-search-area  [NY PLACERING — sticky top, alltid första barnet i receptView]
│   ├── ...befintligt innehåll...
├── <footer>
├── #scrolltop               [bottom-position uppdateras via CSS-variabel]
├── .fab-import              [bottom-position uppdateras via CSS-variabel]
└── nav.bottom-nav           [NYTT — visas bara på mobil]
```

### Markup — `bottom-nav`

Placeras längst ner i `<body>`, efter sista modalen. Tre flikar i samma ordning som idag.

```html
<nav class="bottom-nav" aria-label="Huvudnavigering">
  <button class="bottom-nav-tab" data-tab="recept" onclick="switchTab('recept')" aria-label="Recept">
    <span class="bottom-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <!-- Bok / cookbook -->
        <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>
        <path d="M12 3v18"/>
      </svg>
    </span>
    <span class="bottom-nav-label">Recept</span>
  </button>
  <button class="bottom-nav-tab" data-tab="vecka" onclick="switchTab('vecka')" aria-label="Veckans mat">
    <span class="bottom-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <!-- Kalender -->
        <rect x="3" y="5" width="18" height="16" rx="2"/>
        <path d="M3 10h18"/>
        <path d="M8 3v4"/>
        <path d="M16 3v4"/>
      </svg>
    </span>
    <span class="bottom-nav-label">Veckans mat</span>
  </button>
  <button class="bottom-nav-tab" data-tab="shop" onclick="switchTab('shop')" aria-label="Inköpslista">
    <span class="bottom-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <!-- Checklista / klippblock -->
        <rect x="5" y="4" width="14" height="17" rx="2"/>
        <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    </span>
    <span class="bottom-nav-label">Inköpslista</span>
  </button>
</nav>
```

**Notera:** SVG-paths ovan är illustrativa — slutgiltig design landas i implementationen. Krav: tre tydliga, minimalistiska line-ikoner i samma visuella språk (likvärdig stroke-vikt, samma viewBox 0 0 24 24, ingen fill-färg).

### Markup — befintliga `header-nav` (smärre ändring)

Lägg `data-tab` så `switchTab()` kan toggla `.active` på båda nav-element via en query-selektor:

```html
<nav class="header-nav">
  <button class="header-tab active" id="tabRecept" data-tab="recept" onclick="switchTab('recept')">Recept</button>
  <button class="header-tab"        id="tabVecka"  data-tab="vecka"  onclick="switchTab('vecka')">Veckans mat</button>
  <button class="header-tab"        id="tabShop"   data-tab="shop"   onclick="switchTab('shop')">Inköpslista</button>
</nav>
```

ID:n behålls för bakåtkompatibilitet (andra moduler kan i nuläget referera dem; ny kod ska föredra `data-tab`-väljaren).

### CSS-arkitektur

#### Nya custom properties (i `:root`)

```css
:root {
  /* …befintliga variabler… */
  --bottom-nav-h: 0px;          /* Default desktop = 0 */
}

@media (max-width: 599px) {
  :root {
    --bottom-nav-h: calc(64px + env(safe-area-inset-bottom, 0px));
  }
}
```

`--bottom-nav-h` används av `.bottom-nav`, `.fab-import`, `#scrolltop` och `body { padding-bottom }`.

#### `.bottom-nav` (nytt block)

```css
.bottom-nav {
  display: none;                /* Default desktop */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--warm-white);
  border-top: 1px solid var(--border);
  box-shadow: 0 -2px 16px rgba(0,0,0,0.06);
  padding: 6px 4px env(safe-area-inset-bottom, 0px);
  z-index: 100;                 /* Samma som header */
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

.bottom-nav-icon svg { width: 100%; height: 100%; }

.bottom-nav-tab.active {
  color: var(--terracotta);
  background: var(--light-terra);
}

.bottom-nav-tab:active { transform: scale(0.96); }
```

`.active` slår på pillen via `background: var(--light-terra)` på själva knappen (rundad via `border-radius: 14px`). Inget pseudo-element behövs.

#### Toppheader på mobil (minimering)

Lägg till regler i befintlig mobil-blockering:

```css
@media (max-width: 599px) {
  .header-bar {
    flex-direction: row;
    padding: 0.4rem 1rem;
    align-items: center;
    justify-content: center;        /* Centrerar titeln */
  }
  header h1 {
    font-size: 1.05rem;
    padding-bottom: 0;
  }
  .header-nav { display: none; }    /* Toppnav göms */
}
```

Toppheaderns auto-hide-mekanik (`header.header-hidden`) bevaras oförändrad.

#### `.header-search-area` — sticky banner i recept-vyn

`.header-search-area`-divens DOM-noden flyttas så den blir **första barnet i `<main id="receptView">`** (inte längre inuti `<header>`). Det fungerar både på mobil och desktop:

```css
/* Sökfältet är nu sticky inom recept-vyn */
.header-search-area {
  position: sticky;
  top: 0;
  background: var(--warm-brown);    /* Behåller "header-känslan" på desktop */
  padding: 0.6rem 1.25rem 0.85rem;
  margin: 0 -1rem 1rem;             /* Bryter ut mot main-padding */
  z-index: 50;
  /* …befintlig overflow/transition kvar… */
}

@media (max-width: 599px) {
  .header-search-area {
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
}
```

`.header-search-area.hidden`-klassens beteende behålls oförändrat (göms när `switchTab` togglas till annan flik). På desktop får den samma färgton som headern → upplevs som en förlängning av toppheadern.

**Observation:** Detta innebär att `.header-search-area` på mobil hamnar **under** den minimerade toppheadern men **över** recept-grid:en. Eftersom toppheadern på mobil bara innehåller titel (~40px) blir layouten: titel · sökfält · grid · bottom-nav. Detta är medvetet — sök är receptvy-funktionalitet.

#### FAB och scrolltop — lyft via variabel

```css
.fab-import {
  bottom: calc(var(--bottom-nav-h) + 1rem);
  /* left, övriga befintliga regler oförändrade */
}

#scrolltop {
  bottom: calc(var(--bottom-nav-h) + 1rem);
  /* right, övriga befintliga regler oförändrade */
}
```

På desktop = `0 + 1rem = 1rem` (i praktiken samma 1.5rem-känsla som idag). På mobil = `64px + safe-area + 1rem` = säkert över bar:n.

#### Body padding-bottom (förhindra clipping)

För att sista raden i scroll-bart innehåll inte göms av bottom-nav på mobil:

```css
body {
  /* …befintligt… */
  padding-bottom: var(--bottom-nav-h);
}
```

Footer-elementet (`<footer id="footerEl">`) flyttas naturligt med och blir synligt över bar:n.

### JavaScript — `switchTab` refaktor

Befintlig `js/ui/navigation.js`:

```js
export function switchTab(tab) {
  document.getElementById('receptView').style.display           = tab === 'recept' ? '' : 'none';
  document.getElementById('weekView').classList.toggle('visible',  tab === 'vecka');
  document.getElementById('shopView').classList.toggle('visible',  tab === 'shop');
  document.getElementById('tabRecept').classList.toggle('active',  tab === 'recept');
  document.getElementById('tabVecka').classList.toggle('active',   tab === 'vecka');
  document.getElementById('tabShop').classList.toggle('active',    tab === 'shop');
  document.getElementById('headerSearchArea').classList.toggle('hidden', tab !== 'recept');
  document.getElementById('fabImport').style.display            = tab === 'recept' ? 'block' : 'none';
  if (tab === 'shop') window.loadShoppingTab();
  if (tab === 'vecka' && window.centerTodayCard) {
    requestAnimationFrame(() => window.centerTodayCard({ smooth: false }));
  }
  window.scrollTo({ top: 0 });
}
```

Refaktoreras till:

```js
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
```

Uppdateringen är minimal — sex `getElementById('tab*')` rader ersätts av en `querySelectorAll`-loop som täcker både `.header-tab` och `.bottom-nav-tab`. ID:n bevaras på toppnav-knapparna för bakåtkompatibilitet.

## Tillgänglighet (a11y)

- `<nav aria-label="Huvudnavigering">` på bottom-nav (toppnav är redan inom `<header>` → ärver landmark-roll)
- `<button aria-label="…">` redundans utan endast SVG (label-texten är synlig, men `aria-label` säkerställer fokus-readout om SVG laddas innan text)
- `aria-hidden="true"` på SVG (dekorativ, label-texten gör jobbet)
- Tap-target ≥ 44×44px → `min-height: 52px` på `.bottom-nav-tab` täcker det med marginal
- Tangentbordsfokus: `:focus-visible` ärver från befintlig globalt definierad style (kontrollera under implementation; lägg till om saknas)
- Reducerad rörelse: `:active`-scale fungerar oavsett `prefers-reduced-motion` (transform 0.96 är minimalt och under WCAG-vibrationsgränsen)

## Browser-/Capacitor-kompatibilitet

- `env(safe-area-inset-bottom)` stöds i Safari iOS 11+, Chrome Android, samt Capacitor WKWebView/WebView. Fallback `0px` säkerställer korrekt på äldre browsers
- `position: sticky` på `.header-search-area` stöds överallt vi bryr oss om
- Inga JS-features bortom ES2017 — passar Vercel + GitHub Pages utan transpilation
- Capacitor: `viewport-fit=cover` rekommenderas i `<meta name="viewport">` för att safe-area faktiskt ska aktiveras under iOS notch/home-indicator. **Tillägg krävs** — befintlig viewport-meta uppdateras till:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  ```

## Edge-cases och felhantering

| Edge case | Beteende |
|-----------|----------|
| Användare roterar mobil → desktop bredd (≥600px) | CSS-mediagräns togglar `display:none` på `.bottom-nav` direkt; toppnav återvisas; FAB-bottom återgår till 1rem (eftersom `--bottom-nav-h` blir 0) |
| iOS Safari URL-bar visas/försvinner | `position:fixed` på bottom-nav följer viewport korrekt (testat mönster) |
| Långa flik-namn ("Veckans mat", "Inköpslista") på smal mobil (<360px) | `font-size: 0.7rem` + `flex:1` ger ~120px per flik vid 360px-bredd → "Inköpslista" får plats utan radbrytning. Vid extremt smala enheter (<340px) kan label överflöda; `text-overflow: ellipsis` är onödigt eftersom `font-size` redan är aggressivt liten |
| Bottom-nav göms av on-screen tangentbord | Inget extra arbete; iOS/Android pushar viewport upp och `position:fixed` följer. Tangentbordet är aldrig öppet samtidigt som användaren navigerar mellan flikar |
| `replaceBanner`/`customPickBanner` (sticky banners i recept-vyn) | Behåller existerande layout. Bottom-nav är ovanför sticky element så ingen krock |

## Testplan

UI-CSS-ändringar har ingen testtäckning enligt repots befintliga praxis (tester finns för datapipelines, inte för layout). Manuell verifiering krävs:

**Mobil (≤599px) — Antigravity preview eller Vercel preview-deploy:**
1. ☐ Bottom-bar syns på alla tre flikar; toppnav göms
2. ☐ Aktiv flik har terracotta-pille; inaktiva är muted-grå
3. ☐ Klick på varje flik byter vy korrekt (recept ↔ vecka ↔ shop)
4. ☐ Sökfält syns bara på recept-fliken (sticky toppen av main)
5. ☐ FAB (`+`) på recept-fliken sitter ovanför bottom-bar:n
6. ☐ Scroll-top-knappen sitter ovanför bottom-bar:n
7. ☐ iOS Safari: home-indicator-ytan respekteras (ingen tap registreras under bar:n)
8. ☐ Toppheader-autohide funkar fortfarande (göms vid scroll-ner)
9. ☐ Bottom-bar göms aldrig (kvar vid scroll)
10. ☐ Footer ("Receptboken") syns ovanför bar:n, inte under

**Desktop (≥600px):**
1. ☐ Bottom-bar göms helt
2. ☐ Toppnav fungerar exakt som idag (gold underline-stil oförändrad)
3. ☐ FAB och scrolltop sitter på samma position som idag
4. ☐ Sökfält syns inom toppheaderns visuella område (sticky kollas)

**Cross-vy:**
1. ☐ `centerTodayCard` triggas fortfarande korrekt vid byte till vecka-fliken (rAF-anrop oförändrat)
2. ☐ `loadShoppingTab` triggas vid byte till shop
3. ☐ Replace-mode/custom-pick-mode-banners fortfarande synliga och funktionella ovanpå sticky sökfältet

## Out of scope

- Slå ihop import (`+` FAB) till bottom-bar som fjärde flik — användaren har valt 3 flikar i samma ordning som idag
- Animera flik-byten (slide-in, fade) — utelämnat (YAGNI)
- Olika ikon-set per OS (iOS-specifika ikoner via @media UA-detection) — utelämnat
- Refaktor av `js/ui/scroll.js` — toppheader-autohide oförändrad
- Ändringar i `state.js`, `app.js` eller andra moduler — switchTab-anropare påverkas inte (samma signatur)

## Implementation-ordning (förslag — landas i writing-plans)

1. Lägg till `--bottom-nav-h` CSS-variabel + uppdatera FAB/scrolltop/body padding
2. Lägg till `data-tab`-attribut på befintliga `.header-tab`-knappar
3. Refaktorera `switchTab()` till `querySelectorAll`-pattern
4. Lägg till `<nav class="bottom-nav">`-markup i `index.html`
5. Lägg till `.bottom-nav` CSS-block + mobil-mediagräns
6. Flytta `.header-search-area` DOM-position till början av `<main id="receptView">`
7. Uppdatera `<meta name="viewport">` med `viewport-fit=cover`
8. Minimera toppheader på mobil (CSS)
9. Manuell verifiering enligt testplan ovan
10. Commit + push

## Filer som ändras

| Fil | Typ av ändring |
|-----|----------------|
| `index.html` | Ny `<nav class="bottom-nav">`, `data-tab`-attribut på `.header-tab`-knappar, flytta `.header-search-area` DOM-position, uppdatera viewport-meta |
| `css/styles.css` | Ny `.bottom-nav`-block, ny `--bottom-nav-h` variabel, mobil-minimering av toppheader, sökfält som sticky banner, FAB/scrolltop bottom-position |
| `js/ui/navigation.js` | `switchTab` refaktor (querySelectorAll istället för 6× getElementById) |

Inga nya filer skapas. Inga JSON-strukturer rörs. Inga API-endpoints påverkas.

# Inköpspreferenser + AI-inköpsprompt

**Datum:** 2026-05-10
**Status:** Godkänd design

## Syfte

Ge användaren kontroll över vilka produkter som väljs vid inköp på willys.se,
via varumärkesblocklista och eko/svenskt-preferenser per kategori.
En promptgenerator bygger en copy-paste-text för Claude in Chrome
som handlar hela inköpslistan med preferenserna inbakade.

## Avgränsning

- Preferenserna påverkar **bara AI-prompten**, inte det befintliga API-dispatch-flödet (`/api/dispatch-to-willys`).
- Inget per-ingrediens-produktval i denna leverans (framtida fas).
- Ingen backend-logik — endpointet läser/skriver bara JSON till GitHub.

## Datamodell

Fil: `dispatch-preferences.json` i repo-roten.

```json
{
  "blockedBrands": ["eldorado"],
  "preferOrganic": {
    "Mejeri": false,
    "Grönsaker": true,
    "Fisk & kött": true,
    "Frukt": false,
    "Skafferi": false,
    "Övrigt": false
  },
  "preferSwedish": {
    "Fisk & kött": true
  }
}
```

Tomma/saknade fält tolkas som "ingen preferens" (falsy default).
Filen skapas vid första sparning — GET returnerar defaults om filen inte finns.

## API-endpoint

`api/dispatch-preferences.js`

| Metod | Beteende |
|-------|----------|
| GET   | Läser `dispatch-preferences.json` via GitHub API. Returnerar defaults (`{ blockedBrands: [], preferOrganic: {}, preferSwedish: {} }`) om filen saknas. |
| PUT   | Skriver hela objektet till `dispatch-preferences.json` via GitHub API (samma `writeFile`-mönster som övriga endpoints). |

Wrappas med `createHandler` (CORS + felhantering).

## UI — Inköpspreferenser

### Placering

I inköpsfliken, längst ner i listan (ovanför dispatch-knappen om den
finns, annars ovanför promptknappen). Preferens-UI:t och promptknappen
är **oberoende av dispatch-feature-flaggan** — de syns alltid när det
finns varor i inköpslistan.

Kollapsat som standard — en rad med kugghjulsikon + texten "Inköpspreferenser".
Expanderas vid klick.

### Innehåll (expanderat)

**1. Blockade varumärken**

Textfält (placeholder: "Lägg till varumärke...") + "+"-knapp.
Tillagda märken visas som pill-element med ×-knapp för borttagning.
Sparas normaliserat till lowercase.

**2. Ekologiskt**

En toggle per inköpskategori. Visar bara kategorier som finns i den
aktuella inköpslistan (läser `window._shopRecipeItems`-nycklarna).
Label: "Välj ekologiskt".

**3. Svenskproducerat**

Samma upplägg som ekologiskt. Label: "Välj svenskproducerat".

### Sparning

Varje ändring (lägg till/ta bort märke, toggle eko/svenskt) triggar
omedelbar PUT till endpointet. Ingen "Spara"-knapp — sparas direkt.
Laddningstillstånd visas med kort fade-animation på ändrad kontroll.

### Laddning

Vid `loadShoppingTab()` hämtas preferenserna via GET och cachas i
`window._dispatchPreferences`. UI:t renderas från cachen.

## Promptgenerator

### Knapp

"Kopiera AI-inköpsprompt" — placeras bredvid "Skicka till Willys"-knappen.
Samma visuella nivå (outline-stil). Lucide clipboard-ikon.

Klick → bygger prompttext → kopierar till urklipp → kort bekräftelse
("Kopierat!") som tonas ut efter 2 sekunder.

Knappen är **alltid synlig** så länge det finns varor i inköpslistan
(inte beroende av dispatch-feature-flaggan/Willys-credentials).

### Promptformat

```
Du ska handla på willys.se åt mig. Gå till willys.se och logga in om det behövs.

Sök efter varje ingrediens i sökfältet, välj den produkt som bäst
matchar beskrivningen, och lägg den i varukorgen.

VIKTIGT: Vänta 2 sekunder efter att du lagt en vara i varukorgen
innan du går vidare till nästa. Sidan behöver tid att registrera.

{om blockedBrands.length > 0}
UNDVIK dessa varumärken: {blockedBrands.join(", ")}

{om någon preferOrganic-kategori är true}
VÄLJ EKOLOGISKT för varor i dessa kategorier: {aktiva kategorier}

{om någon preferSwedish-kategori är true}
VÄLJ SVENSKPRODUCERAT för varor i dessa kategorier: {aktiva kategorier}

Inköpslista:

{för varje kategori med oavbockade varor}
## {kategorinamn}
- {vara 1}
- {vara 2}
...

{om manuella varor finns}
## Övrigt (manuellt tillagda)
- {vara 1}
...
```

### Regler

- Avbockade varor (`checkedItems`) hoppas över — bara ohandlade varor.
- Kategorier utan ohandlade varor visas inte.
- Preferensblock (varumärke/eko/svenskt) inkluderas bara när de har innehåll.
- Om inga varor finns → knappen inaktiverad (`disabled`).

## Filstruktur

| Fil | Typ | Beskrivning |
|-----|-----|-------------|
| `api/dispatch-preferences.js` | Nytt endpoint | GET/PUT för preferens-JSON |
| `js/shopping/dispatch-preferences.js` | Ny modul | UI-rendering + promptgenerator |
| `js/shopping/dispatch-ui.js` | Ändring | Anropar init för preferenser + promptknapp |
| `index.html` | Ändring | Script-tag för ny modul, cache-bust |
| `dispatch-preferences.json` | Ny datafil | Skapas vid första sparning |
| `css/styles.css` | Ändring | Stilar för preferens-UI (pills, toggles) |

## Felhantering

- GET-fel (nätverksfel, 404) → använd defaults, visa inget felmeddelande.
- PUT-fel → kort felmeddelande under preferens-sektionen: "Kunde inte spara — försök igen."
- Urklipps-API saknas (äldre webbläsare) → fallback: markera prompttexten i en textarea, visa "Markera och kopiera (Ctrl+C)".

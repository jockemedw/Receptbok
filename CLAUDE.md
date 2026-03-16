# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter.

## Arkitektur
```
Browser → Vercel /api/generate → Claude Haiku (receptval) → GitHub repo (JSON-filer) → Browser läser
```
- **Frontend:** `index.html` på GitHub Pages (backup) + Vercel (primär, under migration)
- **Backend:** Vercel serverless `/api/generate` — tar emot inställningar, filtrerar recept, anropar Claude Haiku, sparar JSON till GitHub
- **Data:** `recipes.json` (källa), `weekly-plan.json`, `shopping-list.json`, `recipe-history.json` — alla i repot
- **Secrets:** `ANTHROPIC_API_KEY` + `GITHUB_PAT` (contents:write) i Vercel env vars
- **Autentisering:** Ingen — familjeapp med okänd URL

## Designprinciper (följ alltid)
- **Gratis** — betallösningar kräver stark motivering
- **Ingen automatisk generering** — matsedeln triggas alltid manuellt. Familjen har litet barn och kan inte styra inköp till en fast veckodag. Föreslå aldrig cron-schema.
- **Delad data** — localStorage och device-specifika lösningar är aldrig acceptabla
- **AI bara där det behövs** — slump + filter är bättre än AI om resultatet är likvärdigt
- **Vercel är backend** — GitHub Actions används ej längre

## Kommunikation med användaren
- **Förklaringsnivå 3.5** — använd analogi + teknisk term i parentes vid behov. Nivå 1–2 för rutinändringar, 3.5 vid beslut eller felsökning.
- **Felmeddelanden** — alltid på begriplig svenska utan tekniska termer, med en handlingsorienterad uppmaning. Inte: `409 — SHA conflict`. Utan: `Kunde inte spara matsedeln — prova att generera igen.`
- Användaren är inte utvecklare. Claude Code hanterar all kod — användaren committar via GitHub Desktop.

## Deployment
- Commit + push till `main` → Vercel och GitHub Pages deployas automatiskt (~30 sek). Ingen manuell åtgärd behövs.
- `api/generate.js` → Vercel. `index.html` → GitHub Pages + Vercel. JSON-filer → syns direkt (CDN-cache ~60 sek).
- **Lokal testmiljö:** Antigravity har inbyggd live preview för `index.html` — öppna filen där för att testa UI utan att pusha. Genereringsknappen kräver Vercel-backend och kan ej testas lokalt.

## Operativa regler (följ utan att fråga)
- Använd alltid `Edit` på `index.html` — aldrig `Write` (filen är för stor, Write skriver över allt)
- Rör aldrig `recipes.json`-strukturen utan explicit instruktion
- Appen ska fungera på alla enheter. Mobilanvändning prioriteras vid designbeslut (touch-first, inga hover-states som primär interaktion)
- **Stanna och bekräfta** — om ett meddelande är feedback eller återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar innan du gör ändringar.

## Nyckelkfunktioner i index.html (sök vid behov, rör ej strukturen)
- `init()` — startar appen, laddar recept
- `loadWeeklyPlan()` — hämtar och renderar veckoplan + inköpslista
- `generatePlan()` — hanterar genereringsknappen och API-anropet
- `renderWeeklyPlanData()` — renderar veckovyn
- `renderShoppingList()` — renderar inköpslistan
- `applyFilters()` — filtrerar receptvyn

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp), inte bara den enskilda frågan
- Tänk på hela familjen som användare — inte bara den tekniska personen
- **Uppdatera CLAUDE.md efter varje större ändring**

## Repo-struktur
```
Receptbok/
├── index.html              # Frontend — Vanilla JS, Playfair Display + DM Sans
├── recipes.json            # Receptdatabasen (62 recept, rör ej strukturen)
├── weekly-plan.json        # Genereras av /api/generate
├── shopping-list.json      # Genereras av /api/generate
├── recipe-history.json     # Recepthistorik (senaste 8 planer) — undviker upprepning
├── api/
│   └── generate.js         # Vercel serverless: filtrering + Claude Haiku + GitHub-skrivning
├── vercel.json             # 60s timeout
├── package.json            # @anthropic-ai/sdk
└── CLAUDE.md
```

## Tekniska beslut
- **Färgtema:** Krämvitt `#faf7f2`, brun header `#5c3d1e`, terrakotta `#c2522b`
- **AI för receptval:** Claude Haiku `claude-haiku-4-5-20251001` — väljer recept, respekterar regler + historik
- **Inköpslista:** Byggs deterministiskt i JS från receptdata — ingen AI
- **Recepthistorik:** `recipe-history.json` — Claude instrueras undvika recept använda senaste 28 dagar
- **Receptlistan shufflas** innan Claude ser den — ger variation varje generering
- **Willys-integration:** Avaktiverad — EU-scraping-blockering (400-fel), ingen plan

## recipes.json — struktur (rör ej)
```json
{
  "meta": { "version": "1.0", "lastUpdated": "2026-03-08", "totalRecipes": 62 },
  "recipes": [{
    "id": 1, "title": "Receptnamn", "tested": false, "servings": 4,
    "time": 40, "timeNote": "ugn 150°",
    "tags": ["helg60", "fisk", "ugn"],
    "protein": "fisk",
    "ingredients": ["600 g torsk", "..."],
    "instructions": ["Steg 1...", "Steg 2..."],
    "notes": "Tips: ..."
  }]
}
```
**Protein:** `fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`
**Taggar:** `vardag30` (≤30 min vardag), `helg60` (≤60 min helg), `soppa/pasta/wok/ugn/sallad/gryta/ramen` (typ), `veg` (vegetariskt)

## Dataformat — genererade filer
```json
// weekly-plan.json
{ "generated": "2026-03-14", "startDate": "...", "endDate": "...",
  "days": [{ "date": "2026-03-14", "day": "Fredag", "recipe": "Titel", "recipeId": 23 }] }

// shopping-list.json
{ "generated": "2026-03-14", "categories": {
    "Mejeri": ["2 dl grädde"], "Grönsaker": ["1 purjolök"],
    "Fisk & kött": ["600 g torsk"], "Frukt": [], "Skafferi": [], "Övrigt": [] }}

// recipe-history.json
{ "history": [{ "date": "2026-03-14", "recipeIds": [47, 62, 51] }] }
```

## Nästa steg (prioritetsordning)
1. **Migrera till Vercel-URL** — CORS → `*`, fetch → relativ URL, GitHub Pages kvar som backup
2. **Inköpslistan** — se över hur ingredienser läses och rationaliseras (kända misstag)
3. **Standardvärden** — sätt rimliga defaults i generatorn (inte 0 på allt)
4. **Matlagningsläge** — "Laga detta recept"-knapp med avbockningsbara instruktioner
5. **Receptimport** — klistra in URL, hämta/tolka/översätt till `recipes.json`-format
6. **Inköpsliste-ombyggnad** — standard = kopiera-läge, separat flik med manuell tilläggsfunktion
7. **Portionsanpassning** — konvertera alla recept till 4 portioner (genomgång av recipes.json)
8. **Flerval i receptfilter** — möjlighet att klicka i flera filter samtidigt (nu är det ett åt gången)
9. **Prövat/Oprövat-filter** — lägg till båda som valbara filter i receptboken
10. **Agent/skill för receptväljaren** — träna/bygga en dedikerad agent (Claude skill) för receptvalet som anropas vid matsedelsgenerering, ersätter nuvarande prompt-lösning i `api/generate.js`

## Senaste session (2026-03-14 — Session 8)
- Stängde av Antigravity som todo-punkt — användaren pushar och refreshar, inget lokalt behov
- Lade till "Stanna och bekräfta"-regel i Operativa regler — agera ej på feedback utan att fråga först
- To-do-listan fastställd, inga kodfixar gjorda

**Nästa session börjar med punkt 1 i Nästa steg:** Migrera till Vercel-URL (CORS → `*`, relativa fetch-anrop).

# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
En personlig matplaneringsapp för familjen. Målet är ett komplett system som:
1. Låter användaren välja datum + inställningar (protein, tid, fritext) i appen
2. Genererar en matsedel för det valda datumintervallet — direkt i browsern (JS)
3. Sparar matsedeln + inköpslistan centralt i repot så att hela familjen ser samma data på alla enheter
4. Gör det enkelt att fylla Willys varukorg (framtida)

## Kärnarkitektur (beslutat 2026-03-12)
**Vercel = hosting + serverless backend. GitHub = datakälla (recipes.json) + datalagring (weekly-plan.json, shopping-list.json).**

```
Browser → Vercel /api/generate → Claude API → skriver JSON till GitHub repo → Browser läser filerna
```

- **Hosting:** Vercel (ersätter GitHub Pages) — gratis, kopplas direkt till GitHub-repot
- **Backend:** Vercel serverless funktion `/api/generate`
  - Tar emot: start_date, end_date, instruktioner (fritext), filter (protein, tid, oprövade)
  - Kör: receptfiltrering + Claude-anrop för receptval
  - Skriver: `weekly-plan.json` + `shopping-list.json` till GitHub repo via API
- **Autentisering:** Ingen — familjeapp, ingen utomstående känner till URL:en
- **Secrets:** `ANTHROPIC_API_KEY` + `GITHUB_PAT` (contents:write) i Vercel env vars — aldrig synliga för användaren
- **Data:** Alla enheter läser samma filer från repot

**Varför inte GitHub Actions längre?**
Actions var en workaround för att köra Python server-side. Vercel är den riktiga lösningen — ger en riktig backend utan krångel.

## Implementationsplan
1. Skapa Vercel-projekt kopplat till GitHub-repot (engångsgrej, användaren gör manuellt)
2. Skapa `api/generate.js` — serverless funktion som hanterar hela genereringen
3. Lägg till `ANTHROPIC_API_KEY` + `GITHUB_PAT` i Vercel env vars
4. Uppdatera `index.html` — kontrollpanelen anropar `/api/generate` direkt
5. Ta bort GitHub Actions workflow (eller behåll som backup)

## UI — Generera ny plan
- Datumväljare (start + slut)
- Fritextfält för instruktioner (förifyllt med standardtext)
- Proteintoggle-knappar
- Max tillagningstid vardag / helg
- Max antal oprövade recept
- Knapp: "Generera" → POST till `/api/generate` → spinner → sidan uppdateras

## UI — Inköpslista (växlingsvy)
Två lägen, ett i taget. Toggle/flik för att växla mellan dem.
- **Handla-läget:** Avbockningsbar lista per kategori (checkboxar, återställs vid ny plan)
- **Text-läget:** Ren textlista per kategori (kopierbar, t.ex. för att klistra in i meddelande)
Bara ett läge syns åt gången. Ska se snyggt ut — inte som en teknisk switch.

## Designprinciper (följ alltid dessa)
- **Gratis i första hand** — GitHub Pages + Actions free tier är basnivån. Betallösningar kräver stark motivering.
- **Noll handpåläggning** — appen ska fungera av sig själv. Föreslå aldrig lösningar som kräver återkommande manuella steg från användaren.
- **Automatisering via cron** är alltid att föredra framför manuella triggers.
- **Delad data för hela familjen** — localStorage och device-specifika lösningar är aldrig acceptabla. Data måste vara central och tillgänglig för alla enheter.
- **AI/API bara där det verkligen behövs** — slump + filter är bättre än AI om resultatet är likvärdigt. Ifrågasätt alltid om ett API-anrop tillför värde.
- **Vercel är backend** — serverless funktioner, secrets och API-anrop hanteras där. GitHub Actions används ej längre.

## Hur Claude ska tänka
- Förstå användarens **övergripande ambition** (självgående familjeapp), inte bara den enskilda frågan.
- Föreslå aldrig lösningar som kräver att användaren återkommande gör manuella steg.
- Tänk på hela familjen som användare — inte bara den tekniska användaren.
- **Uppdatera CLAUDE.md efter varje större ändring** i projektet så att nästa session alltid har korrekt kontext.

## Repo-struktur
```
Receptbok/
├── index.html          # PWA-frontend — läser recipes.json via fetch()
├── recipes.json        # Receptdatabasen (62 recept, rör ej strukturen)
├── weekly-plan.json    # Veckans matsedel — genereras automatiskt
├── shopping-list.json  # Inköpslista — genereras automatiskt
├── scripts/
│   └── generate_weekly_plan.py  # Python-script: filter + Claude + inköpslista
├── .github/workflows/
│   └── weekly-plan.yml          # GitHub Actions (manuell trigger)
├── CLAUDE.md           # Den här filen
└── README.md
```

## Tekniska beslut vi tagit
- **Hosting:** GitHub Pages (gratis, fungerar)
- **URL:** https://jockemedw.github.io/Receptbok/
- **Dataformat:** JSON för allt — recept, matsedel, inköpslista
- **Frontend:** Vanilla HTML/CSS/JS, inga ramverk, Playfair Display + DM Sans
- **Färgtema:** Krämvitt (#faf7f2), varm brun header (#5c3d1e), terrakotta (#c2522b)
- **AI för menyplanering:** ~~Anthropic Claude Haiku~~ — **borttaget**. Receptval sker nu via Python (filter + slump), ingen AI behövs.
- **Automation:** GitHub Actions — **cron-schema** (automatisk körning varje vecka)
- **Willys-integration:** Avaktiverad — EU-scraping-blockering (400-fel). Ersatt av kontrollpanel.
- **Inköpslista:** Byggs deterministiskt i Python från receptdata — inga AI-hallucinationer

## recipes.json — struktur
```json
{
  "meta": { "version": "1.0", "lastUpdated": "2026-03-08", "totalRecipes": 62 },
  "recipes": [{
    "id": 1,
    "title": "Receptnamn",
    "tested": false,
    "servings": 4,
    "time": 40,
    "timeNote": "ugn 150°",
    "tags": ["helg60", "fisk", "ugn"],
    "protein": "fisk",
    "ingredients": ["600 g torsk", "..."],
    "instructions": ["Steg 1...", "Steg 2..."],
    "notes": "Tips: ..."
  }]
}
```

### Protein-värden
`fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`

### Tag-konventioner
- `vardag30` = vardagsmat under 30 min
- `helg60` = helgmat upp till 60 min
- `soppa`, `pasta`, `wok`, `ugn`, `sallad`, `gryta`, `ramen` = maträtt-typ
- `veg` = vegetariskt (används parallellt med protein: vegetarisk)
- `provat` = vi har lagat det (använd fältet `tested: true` istället)

## weekly-plan.json — planerat format
```json
{
  "generated": "2026-03-09",
  "week": 11,
  "days": [
    { "day": "Måndag", "recipe": "Recepttitel", "recipeId": 23 },
    { "day": "Tisdag", "recipe": "Recepttitel", "recipeId": 7 }
  ]
}
```

## shopping-list.json — planerat format
```json
{
  "generated": "2026-03-09",
  "categories": {
    "Mejeri": ["2 dl grädde", "100 g smör"],
    "Grönsaker": ["1 purjolök", "500 g morötter"],
    "Fisk & kött": ["600 g torsk"],
    "Torrvaror": ["3 dl matvete"],
    "Övrigt": ["1 msk olivolja"]
  }
}
```

## generate_weekly_plan.py — arkitektur
Skriptet är uppdelat i tydliga ansvarsområden:
1. **Datumintervall** — läser `START_DATE`/`END_DATE` från env, fallback till idag + 6 dagar
2. **Constraints** — läser filtreringsinställningar från env (se nedan)
3. **Receptfiltrering** — Python filtrerar baserat på constraints:
   - Exkluderar fel protein (`ALLOWED_PROTEINS`)
   - Exkluderar oprövade om `UNTESTED_COUNT=0`
   - Exkluderar recept som är för långa för båda dagtyper (`MAX_WEEKDAY_TIME`, `MAX_WEEKEND_TIME`)
4. **Receptval** — slumpmässigt val ur filtrerade recept (Python, ingen AI). Respekterar vardag/helg-taggar och undviker upprepning av protein.
5. **Inköpslista** — byggs i Python från `recipes.json` (deterministisk, inga hallucinationer)
6. **Output** — skriver `weekly-plan.json` + `shopping-list.json`

### Workflow-inputs / Env-variabler
| Input (GitHub Actions) | Env-variabel | Default | Beskrivning |
|---|---|---|---|
| `start_date` | `START_DATE` | idag | Startdatum YYYY-MM-DD |
| `end_date` | `END_DATE` | start+6d | Slutdatum YYYY-MM-DD |
| `untested_count` | `UNTESTED_COUNT` | 0 | Max antal oprövade recept |
| `max_weekday_time` | `MAX_WEEKDAY_TIME` | 30 | Max tid vardagar (min) |
| `max_weekend_time` | `MAX_WEEKEND_TIME` | 60 | Max tid helg (min) |
| `vegetarian_days` | `VEGETARIAN_DAYS` | 0 | Antal vegetariska dagar |
| `allowed_proteins` | `ALLOWED_PROTEINS` | alla | Kommaseparerat: fisk,kyckling,kött,fläsk,vegetarisk |

## Nästa steg att bygga (i prioritetsordning)
1. ~~**GitHub Actions workflow**~~ ✅ Klart
2. ~~**AI-integration**~~ ✅ → ❌ Borttaget — ersatt av Python-slump
3. ~~**Inköpslista-vy i frontend**~~ ✅ Klart
4. ~~**Manuell trigger**~~ ✅ Klart (knapp i appen + workflow_dispatch)
5. ~~**Kontrollpanel för receptval**~~ ✅ Klart (inställningar i "Generera ny plan")
6. **Ta bort Claude API-anrop** — ersätt `call_claude()` i Python med slumpmässigt val
7. **Lägg till cron-schema** i `weekly-plan.yml` (automatisk körning varje vecka)
8. **Förbättra matsedelvyn** — ev. visa recept-detaljer direkt i tidslinjekortet
9. **Willys-erbjudanden** — avaktiverat. Möjlig framtida lösning: annan datakälla.

## Användarens tekniska nivå
Inte utvecklare men bekväm med GitHub Desktop, kan följa instruktioner.
Claude Code hanterar all kod — användaren committar och pushar via GitHub Desktop.
Workflow körs automatiskt via cron. Manuell trigger finns kvar som backup.

## AI-integration
~~Anthropic Claude Haiku användes för receptval~~ — **borttaget i session 4**.
Receptval sker nu helt i Python (filter + slumpmässigt val). Inget API-anrop, ingen kostnad, ingen API-nyckel behövs.

## Kostnadsmål
**Mål: helt gratis.**
GitHub Pages + Actions free tier: räcker gott.
Ingen AI-API används längre för receptval — kostnad: 0 kr.

---

## Sessionslogg

### 2026-03-10 — Session 1
**Vad vi gjorde:**
- Genomförde bred research och arkitekturanalys av hela projektet
- Beslutade om GitHub-centrerad arkitektur (Pages + Actions + Gemini)
- Konstaterade att Willys saknar publik API men att reverse-engineerade endpoints fungerar (jimmystridh/willys-mcp)
- Beslutade att använda ChatGPT Agent Mode för varukorgsifyllning (användaren tar över vid BankID)
- Separerade receptbok i `recipes.json` (data) och `index.html` (visning)
- Byggde ny `index.html` med ljust krämvitt/terrakotta-tema som läser JSON externt via fetch()
- Aktiverade GitHub Pages på https://jockemedw.github.io/Receptbok/
- Installerade GitHub Desktop för lokal filsynk
- Diskuterade Claude Code vs Antigravity — beslut: **kör Claude Code**
- Skapade denna CLAUDE.md som permanent projektkontext

**Var vi slutade:**
Grundstrukturen är på plats och fungerar. Frontend live på GitHub Pages. Nästa steg är att börja bygga GitHub Actions-automationen.

**Nästa session börjar med:**
Steg 1 i prioritetslistan — GitHub Actions workflow som genererar `weekly-plan.json` och `shopping-list.json` via Gemini API.

---

### 2026-03-10 — Session 2
**Vad vi gjorde:**
- Felsökte GitHub Actions-körning av `scripts/generate_weekly_plan.py`
- **Willys 400-fel:** Endpoint returnerar 400 — troligen EU-scraping-blockering. Accepterat, körs med 0 erbjudanden.
- **Gemini ej fungerande:** Alla Gemini-modeller antingen 404 (deprecated) eller `limit: 0` (EU-begränsning på free tier för svenska Google-konton). Bytte till Anthropic Claude API.

---

### 2026-03-11 — Session 3
**Vad vi gjorde:**
- Bytte AI från Gemini till **Anthropic Claude Haiku** (`claude-haiku-4-5-20251001`)
- Workflow körde framgångsrikt end-to-end
- Tog bort cron-schema (enbart manuell trigger)
- Byggde om veckyvyn till **horisontell tidslinje** (touch-scroll, idag markerad, dåtid nedtonad)
- **Kvalitetskontroll av inköpslistan** — hittade allvarliga hallucinationer (AI uppfann ingredienser, missade 15+)
- **Arkitekturell fix:** Claude väljer bara recept, Python bygger inköpslistan från `recipes.json` (deterministisk)
- Inaktiverade Willys-funktionen (EU-blockering, aldrig fungerande)
- Lade till **kontrollpanel** i "Generera ny plan"-sektionen:
  - Max antal oprövade recept (default: 0)
  - Max tillagningstid vardag/helg
  - Antal vegetariska dagar
  - Protein-filterval (toggle-knappar, alla aktiva som standard)
- Python pre-filtrerar receptdatabasen baserat på inställningarna *innan* Claude ser dem
- Parameterlistan i UI visar alla värden att kopiera in i GitHub Actions

**Var vi slutade:**
Allt är implementerat och klart att committa + pusha.

**Nästa session börjar med:**
Testa kontrollpanelen end-to-end via GitHub Actions.

---

### 2026-03-12 — Session 4
**Vad vi gjorde:**
- Insåg att Claude API-anropet för receptval är onödigt — kontrollpanelens filter gör redan jobbet
- Beslutade att ersätta `call_claude()` med slumpmässigt val i Python (billigare, snabbare, enklare)
- Beslutade att lägga tillbaka cron-schema i workflow (automatisk körning varje vecka, noll handpåläggning)
- Uppdaterade designprinciper i CLAUDE.md: gratis, automatiserat, delad data, AI bara där det behövs

**Var vi slutade:**
CLAUDE.md uppdaterat. Koden är ännu inte ändrad.

**Nästa session börjar med:**
1. Ta bort `call_claude()` ur `generate_weekly_plan.py`, ersätt med Python-slump
2. Lägg till cron-schema i `.github/workflows/weekly-plan.yml`

---

### 2026-03-12 — Session 4 (fortsättning)
**Vad vi gjorde:**
- Bestämde slutgiltig arkitektur: Vercel (hosting + serverless) + GitHub repo (data)
- Skapade `api/generate.js` — serverless funktion som kör receptfiltrering, Claude-anrop, bygger inköpslista, skriver JSON till GitHub repo via API
- Skapade `vercel.json` (60s timeout) och `package.json` (@anthropic-ai/sdk)
- Uppdaterade `index.html`:
  - Lade till fritextfält för instruktioner (förifyllt med standardtext)
  - Ersatte GitHub Actions-länken med riktig "Generera"-knapp som anropar `/api/generate`
  - Lade till mode-toggle för inköpslistan: Handla-läge (checkboxar) / Kopiera-läge (ren text med kopieringsknapp)
  - Tog bort "ange i GitHub Actions"-output

**Var vi slutade:**
Koden är klar att committa. Vercel är INTE satt upp ännu.

**Nästa session börjar med:**
1. Committa + pusha alla ändringar
2. Sätt upp Vercel: koppla repot, lägg in `ANTHROPIC_API_KEY` + `GITHUB_PAT` som env vars
3. Testa generera-knappen end-to-end

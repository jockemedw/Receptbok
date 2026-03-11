# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
En personlig matplaneringsapp för familjen. Målet är ett komplett system som:
1. Väljer recept ur receptboken baserat på familjens preferenser (kontrollpanel)
2. Genererar en veckomatsedel via Claude AI
3. Genererar en strukturerad inköpslista direkt från receptdata
4. Gör det enkelt att fylla Willys varukorg (via ChatGPT Agent Mode, framtida)
5. ~~Willys extrapriser~~ — avaktiverat (EU-scraping-blockering)

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
- **AI för menyplanering:** Anthropic Claude Haiku (bytte från Gemini pga EU-begränsningar)
- **Automation:** GitHub Actions — manuell trigger via workflow_dispatch (inget cron-schema)
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
3. **Receptfiltrering** — Python pre-filtrerar innan Claude ser recepten:
   - Exkluderar fel protein (`ALLOWED_PROTEINS`)
   - Exkluderar oprövade om `UNTESTED_COUNT=0`
   - Exkluderar recept som är för långa för båda dagtyper (`MAX_WEEKDAY_TIME`, `MAX_WEEKEND_TIME`)
4. **Claude** — väljer bara recept (returnerar days-array). Prompt inkluderar hårda regler.
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
2. ~~**AI-integration**~~ ✅ Klart (Anthropic Claude Haiku)
3. ~~**Inköpslista-vy i frontend**~~ ✅ Klart
4. ~~**Manuell trigger**~~ ✅ Klart (knapp i appen + workflow_dispatch)
5. ~~**Kontrollpanel för receptval**~~ ✅ Klart (inställningar i "Generera ny plan")
6. **Förbättra matsedelvyn** — ev. visa recept-detaljer direkt i tidslinjekortet
7. **Willys-erbjudanden** — avaktiverat. Möjlig framtida lösning: annan datakälla.

## Användarens tekniska nivå
Inte utvecklare men bekväm med GitHub Desktop, kan följa instruktioner.
Claude Code hanterar all kod — användaren committar och pushar via GitHub Desktop.
Workflow triggas manuellt direkt på GitHub (Actions-fliken), inte via lokal push.

## AI-integration
**Valt: Anthropic Claude API** (bytte från Gemini p.g.a. EU-begränsningar på free tier)
- Modell: `claude-haiku-4-5-20251001` med fallback till `claude-haiku-4-5`
- Secret: `ANTHROPIC_API_KEY` i GitHub Secrets
- Kostnad: ~1–2 kr/år vid en körning/vecka
- Inget automatiskt schema — körs manuellt via GitHub Actions workflow_dispatch

## Kostnadsmål
Max 20 kr/månad. Helst gratis.
Anthropic Haiku: ~$0.002/körning = ~10 öre/vecka = ~5 kr/år.
GitHub Actions free tier: räcker gott.

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

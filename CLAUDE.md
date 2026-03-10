# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
En personlig matplaneringsapp för familjen. Målet är ett komplett system som:
1. Hämtar aktuella extrapriser från Willys automatiskt varje vecka
2. Väljer recept ur receptboken med hänsyn till veckans erbjudanden
3. Genererar en veckomatsedel
4. Genererar en strukturerad inköpslista
5. Gör det enkelt att fylla Willys varukorg (via ChatGPT Agent Mode)

## Repo-struktur
```
Receptbok/
├── index.html          # PWA-frontend — läser recipes.json via fetch()
├── recipes.json        # Receptdatabasen (62 recept, rör ej strukturen)
├── weekly-plan.json    # Veckans matsedel — genereras automatiskt (finns ej än)
├── shopping-list.json  # Inköpslista — genereras automatiskt (finns ej än)
├── offers.json         # Willys erbjudanden — genereras automatiskt (finns ej än)
├── CLAUDE.md           # Den här filen
└── README.md
```

## Tekniska beslut vi tagit
- **Hosting:** GitHub Pages (gratis, fungerar)
- **URL:** https://jockemedw.github.io/Receptbok/
- **Dataformat:** JSON för allt — recept, matsedel, inköpslista, erbjudanden
- **Frontend:** Vanilla HTML/CSS/JS, inga ramverk, Playfair Display + DM Sans
- **Färgtema:** Krämvitt (#faf7f2), varm brun header (#5c3d1e), terrakotta (#c2522b)
- **AI för menyplanering:** Google Gemini API (gratis tier räcker)
- **Automation:** GitHub Actions (cron, söndagar) — ej byggt än
- **Willys-integration:** Via ChatGPT Agent Mode (användaren tar över vid BankID)

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

## offers.json — planerat format
```json
{
  "fetched": "2026-03-09",
  "source": "willys",
  "offers": [
    { "name": "Laxfilé", "normalPrice": 89, "offerPrice": 59, "unit": "400g" }
  ]
}
```

## Nästa steg att bygga (i prioritetsordning)
1. **GitHub Actions workflow** — hämtar Willys-erbjudanden + anropar Gemini + genererar weekly-plan.json och shopping-list.json
2. **Willys-erbjudanden** — via Tjek API (Willys ID: c371GA) eller direkt scraping
3. **Gemini API-integration** — prompt som tar recept + erbjudanden och returnerar veckoplanen
4. **Inköpslista-vy i frontend** — visa shopping-list.json snyggt
5. **Manuell trigger** — knapp i appen för att trigga ny veckoplan utan att vänta på cron

## Användarens tekniska nivå
Inte utvecklare men bekväm med GitHub Desktop, kan följa instruktioner.
Claude Code hanterar all kod — användaren committar och pushar via GitHub Desktop.

## Kostnadsmål
Max 20 kr/månad. Helst gratis.
Gemini free tier: 1500 requests/dag gratis — mer än tillräckligt.
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

# Research: Internationell receptimport — Fas 3

**Datum:** 2026-04-16  
**Metod:** Direkthämtning av receptsidor med WebFetch. 18 sajter undersökta, 12 nåbara.

---

## 1. Executive summary

Av de ~18 undersökta sajterna är **situationen bättre än förväntat för JSON-LD men sämre för bot-åtkomst**:

- **Fungerar direkt (JSON-LD + åtkomst):** budgetbytes.com (US). Kompletta, välstrukturerade data.
- **Troligen JSON-LD men blockerade för automatisk hämtning:** allrecipes.com, seriouseats.com, bbcgoodfood.com, bonappetit.com, marmiton.org, chefkoch.de — dessa använder Cloudflare eller liknande botskydd. De är kända för god SEO-markup men går inte att verifiera live.
- **JSON-LD saknas, men sidan är åtkomlig:** essen-und-trinken.de (DE), kochbar.de (DE), giallozafferano.it (IT), ricette.giallozafferano.it (IT), jamieoliver.com (UK) — dessa kräver Gemini-fallback.
- **Kräver inloggning för fullständiga recept:** jamieoliver.com (vissa recept), nytimes.com/cooking (paywall), bonappetit.com (delvis paywall).
- **Ingen åtkomst alls:** marmiton.org (FR), chefkoch.de (DE), allrecipes.com (US), seriouseats.com (US), bbcgoodfood.com (UK), foodnetwork.com (US) — alla blockerade i denna testmiljö.

**Slutsats:** Gemini-fallbacken i nuvarande `import-recipe.js` är redan rätt arkitektur för internationell import. Det krävs inga stora strukturförändringar — det behövs enhetkonvertering och ingrediensöversättning som ett post-processing-steg.

---

## 2. Site-by-site tabell

| Sajt | Språk | JSON-LD? | Enheter | Bot-åtkomst | Rekommendation |
|------|-------|----------|---------|-------------|----------------|
| **budgetbytes.com** | EN-US | **Ja, komplett** | Imperial (cups/Tbsp/tsp/oz/lb/°F) | Fri | Prioritet 1 — fungerar direkt via JSON-LD |
| **allrecipes.com** | EN-US | Troligen komplett (SEO-fokuserad sajt) | Imperial | Blockerad (Cloudflare) | Prioritet 1 om åtkomst — kräver Gemini-fallback |
| **seriouseats.com** | EN-US | Troligen komplett | Imperial + metric | Blockerad (Cloudflare) | Gemini-fallback |
| **foodnetwork.com** | EN-US | Okänt | Imperial | Blockerad (403) | Låg prioritet |
| **nytimes.com/cooking** | EN-US | Troligen komplett | Imperial/metric mix | Blockerad + paywall | Ingen implementering |
| **bonappetit.com** | EN-US | Okänt | Imperial | Blockerad (Cloudflare) | Gemini-fallback om åtkomst |
| **jamieoliver.com** | EN-UK | **Nej (verifierat)** | Metric (kg, g) + vaga mått | Delvis åtkomlig, delvis login | Gemini-fallback — metric-vänlig |
| **bbcgoodfood.com** | EN-UK | Troligen komplett | Metric + imperial | Blockerad (Cloudflare) | Hög prioritet om åtkomst |
| **deliciousmagazine.co.uk** | EN-UK | Okänt | Metric | Blockerad (403) | Låg prioritet |
| **chefkoch.de** | DE | Okänt | Metric (g, ml, El, Tl) | Blockerad (Cloudflare) | Gemini-fallback — metric-vänlig |
| **kochbar.de** | DE | **Nej (verifierat)** | Metric (g, ml, El, Tl) | Åtkomlig | Gemini-fallback — metric-vänlig |
| **essen-und-trinken.de** | DE | **Nej (verifierat)** | Metric (g, ml, El, Tl) | Åtkomlig | Gemini-fallback — metric-vänlig |
| **giallozafferano.it** | IT | **Nej (verifierat)** | Metric (g, kg, ml) | Åtkomlig (felaktiga URL:er) | Gemini-fallback — metric-vänlig |
| **ricette.giallozafferano.it** | IT | **Nej (verifierat)** | Metric (g, kg, q.b.) | Åtkomlig | Gemini-fallback — metric-vänlig |
| **cucchiaio.it** | IT | Okänt | Metric | URL-problem (404) | Gemini-fallback |
| **marmiton.org** | FR | Troligen komplett | Metric | Blockerad (Cloudflare) | Gemini-fallback om åtkomst |
| **cuisine-actuelle.fr** | FR | Okänt | Metric | Blockerad (ECONNREFUSED) | Låg prioritet |

### Verifierade observationer

**budgetbytes.com — verifierat:**
- JSON-LD `@type: Recipe` bekräftad på flera sidor
- `recipeIngredient` är platta strängar: `"½ cup plain breadcrumbs (70g, $0.17*)"`, `"1/3 cup honey"`, `"2 boneless, skinless chicken breasts (about 1.3 lbs. total)"`
- `recipeInstructions` är inkonsekvent: ibland HowToStep-objekt med `text`-fält, ibland platta strängar — varierar per recept
- `recipeYield` format varierar: `"4"`, `"8 1.5 cups each"`
- `totalTime` korrekt ISO 8601: `"PT30M"`, `"PT55M"`, `"PT1H45M"`
- Temperaturer förekommer i Fahrenheit i instruktionstext: `"160°F"` (inte i JSON-LD, utan i steps-text)
- Priser inbakade i ingredienssträngar: `"($0.17*)"` — måste stripas

**jamieoliver.com — verifierat:**
- Inget JSON-LD Recipe schema alls
- Metric-enheter (g, kg) + vaga engelska mått (cloves, bunch, pinch)
- Delvis inloggningsskydd (vissa recept kräver konto för fullständiga instruktioner)

**kochbar.de — verifierat:**
- Inget JSON-LD Recipe schema
- Tyska enheter: gr., TL (Teelöffel), EL (Esslöffel), Stk., Päckchen
- Sidan laddas utan hinder

**essen-und-trinken.de — verifierat:**
- Inget JSON-LD Recipe schema på någon testad sida
- Metric-enheter: g, ml, El, Tl, Stiel (stjälk), Prise (nypa)
- Ugnstemperaturer i Celsius: `"200 Grad (Umluft 180 Grad)"`
- Reklam-klutter i DOM, men extraherbara via Gemini

**giallozafferano.it / ricette.giallozafferano.it — verifierat:**
- Inget JSON-LD Recipe schema
- Enheter: g, kg, ml, cucchiaino (tsk), q.b. (quanto basta = "efter smak")
- Sidor laddas OK (testsidor hittades via hemsidan)

---

## 3. Enhetskonvertering — cheat sheet

### Volym (US imperial → metriskt → svenska)

| US/UK måttenhet | Metrisk | Svenska |
|-----------------|---------|---------|
| 1 cup (US) | 237 ml ≈ **2,4 dl** | 2,4 dl |
| 1 cup (UK) | 284 ml ≈ **2,8 dl** | 2,8 dl |
| ½ cup (US) | 118 ml ≈ **1,2 dl** | 1,2 dl → runda till 1 dl |
| ¼ cup (US) | 59 ml ≈ **0,6 dl** | ½ dl (avrunda) |
| 1 tbsp / Tbsp | 15 ml | **1 msk** |
| 1 tsp | 5 ml | **1 tsk** |
| 1 fl oz (US) | 30 ml | 3 msk |
| 1 pint (US) | 473 ml ≈ **5 dl** | 5 dl |
| 1 quart (US) | 946 ml ≈ **9,5 dl** | ~1 liter |
| 1 gallon (US) | 3,785 liter | 3,8 liter |
| 1 El (tyska) | 15 ml | **1 msk** |
| 1 Tl (tyska) | 5 ml | **1 tsk** |
| 1 cucchiaio (IT) | 15 ml | **1 msk** |
| 1 cucchiaino (IT) | 5 ml | **1 tsk** |
| 1 cuillère à soupe (FR) | 15 ml | **1 msk** |
| 1 cuillère à café (FR) | 5 ml | **1 tsk** |

### Vikt (imperial → metriskt)

| Imperial | Metrisk |
|----------|---------|
| 1 oz | **28,35 g** → runda till 30 g |
| 4 oz | 113 g → **115 g** |
| 8 oz (½ lb) | 227 g → **225 g** |
| 1 lb | **454 g** → runda till 450 g |
| 2 lbs | 907 g → **900 g** |
| 1 stick of butter (US) | **113 g** = ½ cup = 8 tbsp |
| 2 sticks of butter (US) | **225 g** |
| 1 knob of butter (UK) | **~20–30 g** (vagt, ange ca 25 g) |

### Temperatur (°F → °C)

**Formel:** `°C = (°F − 32) × 5/9`

Vanliga ugnsinställningar:

| °F | °C | Beskrivning |
|----|-----|-------------|
| 300 | 150 | Låg ugn (slow roast) |
| 325 | 165 | Låg-medel |
| 350 | 175 | Medel (vanligaste amerikanska) |
| 375 | 190 | Medel-hög |
| 400 | 205 | Hög |
| 425 | 220 | Hög |
| 450 | 230 | Mycket hög |
| 475 | 245 | Grill-nivå |

**Interna temperaturer (kött):**

| °F | °C | Livsmedel |
|----|-----|-----------|
| 145 | 63 | Fläsk (säker) |
| 160 | 71 | Malet nöt/fläsk, fisk |
| 165 | 74 | Kyckling (alltid) |
| 130–135 | 54–57 | Nöt medium-rare |

---

## 4. Ingrediensöversättning — fallgropar

### Mjöl och bakpulver (kritiska)

| Engelskt term | Vanligt SV-misstag | Korrekt SV | Kommentar |
|--------------|-------------------|------------|-----------|
| all-purpose flour | vetemjöl special | **vetemjöl** | AP flour = standard vetemjöl. "Special" är starkare |
| bread flour | vetemjöl | **vetemjöl special** | Högt proteininnehåll (12-14%) |
| cake flour | vetemjöl | **finvetemjöl** | Lägre proteinhalt, finare |
| self-raising flour | vetemjöl + bakpulver | **självjäsande mjöl** (sällsynt SV) | Ersätt med 100g vetemjöl + 1 tsk bakpulver |
| baking powder | bikarbonat | **bakpulver** | Olika kemier — INTE utbytbara 1:1 |
| baking soda / bicarbonate of soda | bakpulver | **bikarbonat** | Kräver syra i receptet |
| cornstarch (US) / cornflour (UK) | majsmjöl | **majsstärkelse** | Förtjockningsmedel |
| cornmeal | majsstärkelse | **grovt majsmjöl / polenta** | Grovmalt majs |

### Mejeri (kritiska)

| Engelskt term | Felöversättning | Korrekt SV | Kommentar |
|--------------|----------------|------------|-----------|
| heavy cream (US) | grädde | **vispgrädde** | 36% fetthalt — identisk med SV vispgrädde |
| heavy whipping cream | — | **vispgrädde** | Samma som heavy cream |
| light cream (US) | lättgrädde | **mellangrädde** (18%) | Ej densamma som vispgrädde |
| double cream (UK) | vispgrädde | **vispgrädde el. 40%** | 48% fett — tjockare än SV vispgrädde |
| single cream (UK) | — | **matlagningsgrädde** (15%) | Ej vispbar |
| sour cream | crème fraîche | **gräddfil** | Lägre fetthalt (~20%) än crème fraîche (34%) |
| crème fraîche | gräddfil | **crème fraîche** | Direkt lån fungerar |
| buttermilk | kärnmjölk | **fil / kärnmjölk** | SV fil fungerar i de flesta recept |
| half-and-half (US) | — | **lätt grädde + mjölk 1:1** | 10-12% fett, inget SV exakt ekvivalent |
| whole milk | standardmjölk | **standardmjölk (3%)** | OK |
| 2% milk | lättmjölk | **lättmjölk** | ~2% — identiskt |

### Örter (kritiska — US vs UK vs SV)

| US term | UK term | Korrekt SV | Varning |
|---------|---------|------------|---------|
| cilantro (blad) | coriander (blad) | **koriander** | "Coriander" i UK = BÅR blad ELLER frön beroende på kontext. Frön = korianderfrön |
| coriander seeds | coriander seeds | **korianderfrön** | OK direkt |
| arugula | rocket | **rucola** | Identiskt |
| scallion / green onion | spring onion | **salladslök** | OK |
| shallot | shallot | **schalottenlök** | OK |

### Kött — styckning (svårast)

| Engelskt term | Korrekt SV | Kommentar |
|--------------|------------|-----------|
| chuck / chuck roast | **högrev** | Grytbitar, lång kokning |
| brisket | **bringa** | Rökt eller bräserad |
| sirloin | **rostbiff** (ibland entrecôte) | Beror på exakt cut |
| tenderloin | **filé** | Oxfilé, ytterfilé beroende på djurslag |
| flank steak | **flankstek** | Direkt lån OK |
| short ribs | **revbensspjäll / högrevskivor** | Kontextuellt |
| ground beef | **nötfärs** | OK |
| ground pork | **fläskfärs** | OK |
| ground turkey | **kalkonsmalet kött** | Sällsynt i SV butik |
| bone-in chicken thighs | **kycklinglår med ben** | OK |
| drumsticks | **kycklingtrummor / kycklingklubbor** | Gemini hanterar detta bra |
| pork shoulder | **fläskkarré / fläskbog** | Karré = mer marmorerat, bog = magrare |

### Ost

| Engelskt term | SV | Kommentar |
|--------------|-----|-----------|
| cheddar (mild) | **mild cheddar** | Finns i SV, direktnamn OK |
| cheddar (sharp/extra sharp) | **lagrad cheddar** | "Sharp" = lagrad/stark |
| parmesan | **parmesan** | Acceptabelt generellt namn |
| parmigiano-reggiano | **parmigiano-reggiano** | Mer precist, dyrt original |
| grana padano | **grana padano** | Billigare alternativ, ofta utbytbart |
| mozzarella | **mozzarella** | Direktlån OK |
| ricotta | **ricotta** | Direktlån OK |
| gruyère | **gruyère** | Direktlån OK |
| swiss cheese | **emmentaler** | "Swiss" är generiskt — emmentaler är SV standard |

### Vaga mått

| Engelskt vagt mått | SV tolkning | Risk |
|-------------------|-------------|------|
| a knob of butter | **~25 g smör** | MEDEL — kan vara 10–50 g |
| a splash of cream | **~2 msk grädde** | HÖG — helt subjektivt |
| a handful | **~1 dl (löst)** | MEDEL |
| a pinch of salt | **1 krm salt** | LÅG — standardiserat |
| a dash | **1–2 krm** | LÅG–MEDEL |
| season to taste | **salt och peppar efter smak** | INGEN risk |
| a can of tomatoes | **400 g krossade tomater** | LÅG — standardstorlek 400g |
| a stick of butter | **113 g smör** | LÅG om US-recept (alltid 113g) |

---

## 5. Implementeringsstrategi

### Fas A — Prioritet 1 (minimal kodändring)

**budgetbytes.com fungerar redan i stort sett.**  
Enda justseringen: strippa priser från ingredienssträngar.

```
"½ cup plain breadcrumbs (70g, $0.17*)" 
→ ta bort (\$[\d.]+\*?) och ev. dubbla parens
→ "½ cup plain breadcrumbs (70g)"
```

Sedan skicka hela receptet till Gemini med ett **utökat prompt** som ber om enhetskonvertering och ingrediensöversättning:

```
BEFINTLIG PROMPT + tillägg:
"Konvertera ALLA måttenheter till metriskt/svenska:
- cups → dl (1 cup = 2,4 dl), tbsp → msk, tsp → tsk
- oz → g (×28), lb → kg (×0,454)
- °F → °C: (°F-32)×5/9, eller använd: 350°F=175°C, 400°F=205°C, 425°F=220°C
- sticks of butter → g (1 stick = 113 g)
Översätt ingrediensnamn till svenska.
Svara BARA med JSON-objektet."
```

**Tidskostnad:** ~2–3 timmar implementation. Kräver att JSON-LD-vägen kompletteras med ett post-processing-steg.

### Fas B — Prioritet 2 (Gemini-only för ej JSON-LD-sajter)

Sajter utan JSON-LD (jamieoliver, kochbar, essen-und-trinken, giallozafferano) faller redan igenom till Gemini-fallback. Gemini hanterar tyska/italienska text utmärkt och returnerar SV format om prompten är på svenska.

**Inget extra kod krävs** — men prompten bör tydliggöra att output alltid ska vara svensk (redan korrekt i nuvarande kod via `GEMINI_SCHEMA_PROMPT`).

### Fas C — Mejlad komplex konvertering (viktigt)

Nuvarande JSON-LD-väg i `mapJsonLdToRecipe()` returnerar råa engelska ingredienssträngar utan konvertering. Det behövs ett nytt steg:

```
JSON-LD extraherat → NYTT: sendToGeminiForConversion(ingredients, instructions)
                   → Gemini konverterar enheter + översätter
                   → Returnera SV recept
```

Detta aktiveras bara när källsidan är icke-svensk (detektera via URL eller `Accept-Language`/`hreflang`-hint i HTML).

### Kodfiler att ändra

1. **`api/import-recipe.js`** — `mapJsonLdToRecipe()`: lägg till `postProcessForeignRecipe()` som anropar Gemini för konvertering om källan är icke-svensk
2. **`api/import-recipe.js`** — `GEMINI_SCHEMA_PROMPT`: lägg till enhetskonverteringsinstruktioner (påverkar redan fallback + foto)
3. **Ingen ny fil behövs** — all logik kan leva i `import-recipe.js`

---

## 6. Riskbedömning

### Hög risk — tyst fel

| Scenario | Risk | Mitigering |
|----------|------|-----------|
| US "cup" tolkas som UK "cup" | ±20% volymfel | Ange alltid "US cup = 2,4 dl" i prompt |
| "Coriander" i UK-recept — frön vs blad | Fel ingrediens | Prompt: "I UK-recept: coriander utan förklaring = blad (koriander); 'coriander seeds' = korianderfrön" |
| Internt temperaturmål i °F kvar i instruktionstext | Kötttemperatur farlig/felaktig | Konverteringslogik måste scannat HELA instruktionstexten, inte bara strukturerade fält |
| "baking soda" → "bakpulver" (fel!) | Recept misslyckas | Explicit mappning i prompt |
| Heavy cream → matlagningsgrädde | Rätten stelnar/vispas fel | Explicit: heavy cream = vispgrädde |
| "all-purpose flour" → "vetemjöl special" | Bakning misslyckas | Explicit: AP flour = vetemjöl (inte special) |
| Priser i ingredienssträngar (budgetbytes) | Skräp i data | Strip `\(\$[\d.]+[*]?\)` regex |
| recipeYield "8 1.5 cups each" | parseInt ger 8 — OK | Nuvarande parser klarar detta (parseInt på första token) |

### Medel risk

| Scenario | Risk |
|----------|------|
| Botblockerade sajter (Cloudflare) | Brukaren kan inte importera från t.ex. allrecipes — förväntat beteende, nuvarande felmeddelande räcker |
| Gemini hallucinerar ingrediens vid otydlig HTML | Troligt ~5% av fallen — brukaren granskar alltid i edit-modal |
| "q.b." (quanto basta) från IT-sajter | Gemini tolkar korrekt till "efter smak" |
| Tyska Päckchen/Becher | Gemini kan konvertera till gram om kontexten är tydlig |

### Låg risk

| Scenario |
|----------|
| Metriska sajter (DE/IT/FR) — enheter är redan rätt eller nära |
| Instruktionssteg som plain strings vs HowToStep — nuvarande parser hanterar båda |
| ISO 8601 duration — parsas redan korrekt |

---

## Bilaga: Tyska och italienska enhetsförkortningar

**Tyska:**
- El / EL = Esslöffel = msk
- Tl / TL = Teelöffel = tsk  
- Prise = nypa = krm
- Stk. = Stück = st
- Päckchen = påse/paket (bakpulver = 15g; vanilj = 8g; jäst torr = 7g)
- Becher = kopp/förpackning (~200 ml för grädde, 150g för kvarg)
- Dose = burk (typiskt 400g för tomater)
- Stiel = stjälk
- Bund/Bündel = knippe

**Italienska:**
- cucchiaio = msk
- cucchiaino = tsk
- q.b. = quanto basta = efter smak
- spicchio = klyfta (vitlök)
- foglia = blad
- pizzico = nypa
- rametto = kvist (örter)

**Franska:**
- c. à s. = cuillère à soupe = msk
- c. à c. = cuillère à café = tsk
- pincée = nypa
- gousse = klyfta (vitlök)
- brin = kvist (örter)

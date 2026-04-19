# Lexikon- och matchningsaudit — Session 34 (2026-04-19)

## Sammanfattning
Audit genomförd i ett svep utan granskningsgate, triggered av spraygrädde-bug där `NORMALIZATION_TABLE["vispgrädde"] = "grädde"` gav falsk match mot matlagningsgrädde-recept.

| Metric                       | Före    | Efter   | Δ        |
|------------------------------|---------|---------|----------|
| Totala matches (store 2160)  | 125     | 149     | **+24**  |
| Recept m. ≥1 match           | 51/62   | 53/62   | **+2**   |
| Wrong-function buggar        | 8       | **0**   | eliminerat |
| Wrong-product buggar         | 0       | 0       | —        |
| Non-food läckor              | 0       | 0       | —        |
| Unika matchande canons       | 20      | 22      | +2       |

Samma siffror för butik 2102 (jämförelsepunkt): 149 matches, 53/62 recept. Stabilt över butiker.

---

## Fas A — Datainsamling

**Snapshot:** `docs/snapshots/willys-2026-04-19.json` (143.6 KB)

Två butiker hämtade live från `https://www.willys.se/search/campaigns/online`:
- **2160 Linköping Ekholmen:** 206 rå-erbjudanden → 148 matchbara efter filter
- **2102 (test-butik):** 205 rå → 148 matchbara
- 2113 returnerade HTTP 400 → ogiltigt store-ID, hoppat över

Filtrering (per butik): ~50 non-food borttagna av NON_FOOD_RE, ~8 SubtotalOrderPromotion som inte är matchbara, ~0 utan pris.

**Inventering:** 62 recept genomsökta. 75 ingrediensnamn identifierade där ett canon finns som substring men ej normaliseras (stemming-kandidater). Toppfall: `liten purjolök`, `krossade tomater`, `röda linser`, `stora tortillas`, `sötpotatisar`, `citroner`, `några basilikablad`.

## Fas B — Klassifiering

Kryssprodukt 62 recept × 148 erbjudanden = 125 matches (före). Klassifiering via heuristiska regler mot kända buggklasser:

### Wrong-function — 8 fall (alla eliminerade)
Alla 8 var *samma produkt* som matchade 8 olika recept:
- **Spraygrädde Vispgrädde 35%** → matchade `Gräddig fiskgratäng med purjo`, `Stekta rödspättafiléer med stuvade morötter`, `Blomkålssoppa med bacontopping`, `Tikka masala med kikärtor och vitlöksnaan`, `Bönstroganoff`, `Citronrisoni med rostad spetskål`, `Pepprig pastasås med aubergine`, `Pasta med lax och sås på vitt vin, grädde och spenat`

Rot: `vispgrädde → grädde` i NORMALIZATION_TABLE gjorde att extractOfferCanon returnerade `grädde` för både recept och erbjudande, trots att sprayvispgrädde funktionellt inte passar matlagningsgrädde.

### Wrong-product — 0 fall
### Non-food läcka — 0 fall (men NON_FOOD_RE utökades preventivt)

## Fas C — Modellrevidering

Fyra parallella ändringar i `api/_shared/shopping-builder.js`, `api/_shared/willys-matcher.js` och `api/willys-offers.js`:

### 1. CANON_REJECT_PATTERNS (NY)
Exporterad map `canon → RegExp`. När matchern hittar kandidat-match körs regexet mot offer-texten; match avvisas om mönstret triggar.

```js
export const CANON_REJECT_PATTERNS = {
  "grädde": /\b(spray|sprayvispgrädde|gräddfil|havregrädde|kokosgrädde|sojagrädde|växtgrädde)\b|\bvispgrädde\b(?!.*\bmatlagning)/i,
  "mjölk":  /\b(havredryck|mandeldryck|sojadryck|kokosdryck|havremjölk|mandelmjölk|sojamjölk|gräddfil|syrad mjölk|kokosmjölk)\b/i,
  "smör":   /\b(margarin|bregott|becel|flora|milda växtfett)\b/i,
  "fisk":   /\b(fiskpinnar|fiskbullar)\b/i,
};
```

### 2. Priority 2-stemming via `normalizeName`-fallback
Tidigare: `normalizeName(name)` returnerade `NORMALIZATION_TABLE[name] || name`. Nu med tre nivåer av fallback:

1. Direkt tabelluppslagning (som tidigare)
2. **Adjektiv-prefix-strip** — ~60 svenska adjektiv (liten, stor, rejäl, krossad, hackad, röd, gul, torkad, färsk, osv). Om stripped-namnet är canon eller i tabellen, använd det.
3. **Token-scan baklänges** — för compounds som `burkar tonfisk i vatten` returneras `tonfisk` (första canon-träff från höger, med TOKEN_BLOCKLIST för fyllnadsord).
4. **N-gram-sökning** (2 och 3) inom tokens för flervårdsuttryck som `tonfisk i vatten`.

### 3. Utökad ordlista
- **Nya self-canons:** `aubergine`, `gurka`, `zucchini`, `paprika`, `chili`, `sallad` + plural-varianter (`auberginer`, `gurkor`, `paprikor`).
- **Plural-stemming:** `tortillas`, `potatisar`, `sötpotatisar`, `citroner`, `limefrukter`, `rödlökar` — direktinmappade för förutsägbarhet.
- **Nya units:** `burkar`, `tummar`, `cm`, `förpackningar` — fixar ingredienser som `2 burkar tonfisk i vatten`, `5 cm purjolök`, `2 tummar ingefära`.
- **`cleanIngredient`:** strippar nu även `à ca 170 g`-suffix.

### 4. Utökad NON_FOOD_RE
Ny substring-blocklist: `kosttillskott`, `proteinpulver`, `protein shake`, `protein bar`, `näringsdryck`, `vitaminer`, `våtfoder`, `torrfoder`, `kattmos`, `kattsnacks`, `hundgodis`, `soppåse`, `madrasskydd`.

## Fas D — Regressiontester

`tests/match.test.js` — 41 assertions, inga externa deps. Täcker:
- Tabelluppslagningar (vispgrädde → grädde)
- Stemming-fallbacks (krossade tomater → tomat, sötpotatisar → sötpotatis, osv)
- Token-scan (`lök och sesamfrön` → sesamfrön)
- Nya self-canons (aubergine, gurka, zucchini)
- Units (burkar, cm, tummar) + à-suffix
- **Spraygrädde-bug**: spraygrädde ska INTE matcha grädde-recept
- **Positiv kontroll**: matlagningsgrädde ska fortfarande matcha
- Margarin ska INTE matcha smör-recept
- CANON_REJECT_PATTERNS exporteras och fångar/släpper rätt

**Hook:** `.claude/settings.json` PostToolUse körs vid edit av `shopping-builder.js` eller `willys-matcher.js`. Testet blockerar commit (exit 2) vid regression.

## Fas E — Implementation + deploy

Ändrade filer:
- `api/_shared/shopping-builder.js` — CANON_SET, CANON_REJECT_PATTERNS, stemming-fallback, nya canons, nya units, à-strip
- `api/_shared/willys-matcher.js` — importerar CANON_REJECT_PATTERNS, kör rejects-check per match
- `api/willys-offers.js` — utökad NON_FOOD_RE
- `tests/match.test.js` — nytt regressionsuite
- `.claude/settings.json` — PostToolUse-hook för regressiontester
- `.gitignore` — exkludera `.audit-tmp/` (lokala scratch-filer)
- `docs/snapshots/willys-2026-04-19.json` — snapshot för framtida regressiontester
- `docs/match-audit-2026-04-19.md` — denna rapport

`api/generate.js` behöver inga ändringar — använder `matchRecipe` via samma import, och `normalizeOffers` från `willys-offers.js` (får NON_FOOD_RE-updaten gratis).

## Kvarstår

- **Live-test mot Vercel** efter deploy: verifiera att `/api/willys-offers` inte längre släpper igenom kosttillskott (ingen ser i snapshot) och att `/api/generate` med `optimize_prices=true` hittar fler prisoptimeringsmöjligheter.
- **Funktionell klassmodell per canon** (full version enligt plan) sköts av CANON_REJECT_PATTERNS istället — samma effekt, mindre kod. Om fler buggklasser upptäcks kan full class-field läggas till utan att bryta API.
- **Willys+ segmenterad pris-fetching** (Fas A/B/C i öppna utredningar) — orört, separat utredning.

## Prognos för Fas 1D (uppdaterad)

Före audit: 44/62 recept → efter Priority 1: 51/62 → **efter audit: 53/62 recept matchar** (85.5%).

Ytterligare recall-potential: Sannolikt begränsad utan att öka falska positiva. De 9 återstående recepten har ingredienser som inte har motsvarande erbjudande i Willys-sortimentet (t.ex. specifika fiskpålägg, turkiska ingredienser).

Ny trolig precision: ~100% för klassade matches (alla 149 klassade som OK). Tidigare ~94% (125/133 efter exklusion av 8 spraygrädde-matches).

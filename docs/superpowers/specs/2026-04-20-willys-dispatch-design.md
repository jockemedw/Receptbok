# Willys-dispatch — designspec

**Datum:** 2026-04-20
**Fas:** 4 (Automatisk varukorgsfyllning)
**Status:** Design godkänd av användaren, klar för implementation-plan

## Syfte

Låta familjen trycka på en knapp i Receptboken och få veckans inköpslista automatiskt inlagd i deras Willys-korg online. Användaren betalar själv i Willys-checkouten (ingen auto-checkout).

## Bakgrund och validering

En PoC (`scripts/willys-cart-poc.mjs`) verifierade före designen att:

- `POST https://www.willys.se/axfood/rest/cart/addProducts` accepterar ett bulk-array av produktkoder i en enda request.
- Auth består av tre delar: sessioncookie (`JSESSIONID` + `axfoodRememberMe` + `AWSALB`/`AWSALBCORS`) och en CSRF-token i header `x-csrf-token`.
- CSRF-token är långlivad (minst flera timmar gammal fungerade fortfarande), troligen knuten till `axfoodRememberMe`-cookiens livslängd ≈ 3 månader.
- Token kan **inte** hämtas programmatiskt utan browser-engine — den sätts via XHR från klient-SPA:n efter boot, inte från server-renderad HTML.
- Verifiering fungerar via `GET /axfood/rest/cart` → returnerar `entries[]` med produktkod, namn och qty.

PoC:n kör kvar i `scripts/` (gitignorerade cookies) för framtida manuell sanity-check.

## Arkitektur

```
Frontend (inköpslista-vy)
    │ "Skicka till Willys"-knapp
    ▼
POST /api/dispatch-to-willys  (ny Vercel-endpoint)
    │  env: WILLYS_COOKIE, WILLYS_CSRF, WILLYS_STORE_ID
    ├─► canon-matcher (befintlig, Session 35)
    │       → {matched: [{code, qty: 1}], unmatched: ["..."]}
    ├─► preflight: GET willys.se/axfood/rest/cart (auth-check)
    ├─► POST willys.se/axfood/rest/cart/addProducts (bulk-array)
    ├─► GET  willys.se/axfood/rest/cart (verifiering)
    └─► returnerar {addedCount, missing, cartUrl}
    ▼
Frontend visar resultat + länk "Öppna din korg på willys.se"
```

**Nyckelval:**

- En enda Vercel-endpoint — samma mönster som `/api/generate`.
- Bulk-anrop (en request för alla produkter) — snabbt, minimal partial-failure-yta.
- Ingen auto-checkout. Användaren betalar själv i Willys.
- Qty alltid 1 per produkt. Varje recept motsvarar ungefär en förpackning.
- Återanvänder befintlig canon-matcher (`api/_shared/willys-matcher.js`, byggd i Session 35, 53/62 recept matchar, 149 matches mot store 2160).

## Auth & secrets

Tre env vars i Vercel, samma pattern som befintlig `GITHUB_PAT`:

| Env var | Innehåll | Livslängd |
|---|---|---|
| `WILLYS_COOKIE` | Full cookie-sträng från browser | ≈ 3 mån (= `axfoodRememberMe`) |
| `WILLYS_CSRF` | x-csrf-token från samma browser-session | samma |
| `WILLYS_STORE_ID` | `2160` (Ekholmen) | tills butik byts |

**Refresh-rutin (manuell, MVP):**

1. Logga in på willys.se
2. Devtools → Network → filtrera "addProducts" → lägg en vara i korgen
3. Högerklicka anropet → Copy as cURL
4. Extrahera cookie-strängen (efter `-b`) och CSRF-token (`x-csrf-token`-header)
5. Uppdatera de två env vars i Vercel-UI

Uppskattad frekvens: var tredje månad.

**Preflight-check:** Innan varje dispatch kör endpointen `GET /axfood/rest/cart`. 200 = OK, 401 = expired → felmeddelande till användaren.

**Automation på sikt (4E i roadmap):** Chrome-extension som skickar cookies + CSRF till Vercel via webhook varje gång willys.se besöks. Byggs först om manuell refresh blir friktion.

## Produkt-matchning

Återanvänder `api/_shared/willys-matcher.js` från Session 35 utan ändring.

**Flöde per ingrediens i shopping-list.json:**

1. Canon-matcher söker matchning mot cachade Willys-erbjudanden (endast reavaror i nuvarande offer-pool)
2. Ingen match → ingrediensen läggs i `unmatched[]`

**Pantry-hantering:** Befintlig `PANTRY_ALWAYS_SKIP`-lista i shopping-builder filtrerar bort salt/peppar/olja/vitlök m.fl. innan shopping-list genereras. Dessa kommer aldrig till matchern och behöver ingen ny logik.

**Täckning (MVP):** Endast reavaror. Befintlig matcher filtrerar offer-poolen till produkter med `potentialPromotions` (se `api/willys-offers.js:108`). Typisk vecka: 5–10 av 20–30 inköpslist-varor matchar. Resten rapporteras i UI:t som "lägg till manuellt".

**Planerat nästa-steg (Fas 4E):** Produkt-sökning för icke-reavaror via Willys söknings-API. Höjer täckning till ~75%+. Separat PoC + implementation efter att MVP (denna spec) är i drift. Inte del av denna spec.

## UI

**Ny knapp i inköpslistan-vyn** (`js/shopping/`):

```
┌─ Inköpslista — 2026-04-21 ────────────────┐
│                                            │
│  Mejeri (3)                                │
│    • grädde (2 dl)                         │
│    • kefir (1)                             │
│  ...                                       │
│                                            │
│  [📤 Skicka till Willys]                   │
└────────────────────────────────────────────┘
```

**Klickflöde:**

1. Confirm-dialog med sammanfattning: *"Fyll din Willys-korg med 23 produkter? 4 ingredienser kunde inte matchas och måste läggas till manuellt."*
2. Preflight → om 401, felmodal med refresh-instruktioner
3. Loader (~1 sek): *"Skickar till Willys..."*
4. Result-panel:

```
✓ 23 produkter tillagda i din Willys-korg

Kunde inte matchas (lägg till själv):
  • "färsk basilika (1 kruka)"
  • "limeblad (4 st)"

[Öppna din korg på willys.se →]
```

**Feature flag:** Knappen göms om backend rapporterar `featureAvailable: false` (= `WILLYS_COOKIE` saknas). Familjen ser ingen brusten knapp om env vars inte är satta.

**Mobil:** Knappen full-width. Resultat-panel scrollbar.

## Felhantering

Alla felmeddelanden på svenska, inga HTTP-koder mot användaren.

| Fel | Beteende | Meddelande |
|---|---|---|
| Cookies utgångna (401 preflight) | Dispatch avbryts innan POST | *"Dina Willys-cookies har gått ut. Be Joakim uppdatera dem i Vercel."* |
| CSRF ogiltig (401 vid POST trots OK preflight) | Retry 1 gång, sen samma som ovan | Samma |
| Partial success (POST 200, response flaggar enstaka fel) | Lägg till det som funkade | *"21 av 23 produkter tillagda. 2 misslyckades: kefir, purjolök."* |
| Nätverksfel mot willys.se | Retry 1 gång med 2s backoff | *"Kunde inte nå Willys. Prova igen om en stund."* |
| Ingen match alls | Avbryter innan POST | *"Hittade ingen matchning för veckans inköpslista. Prova en annan vecka eller lägg till manuellt."* |

Loggning: alla fel till Vercel logs med request-ID. Ingen känslig data (cookies/CSRF) i logs.

Timeout: Vercel 15s räcker. Willys-anropet tar ~1s. Ingen explicit timeout behövs.

## Tester

Ny fil: `tests/dispatch-to-willys.test.js`. Node-only, inga externa deps — samma mönster som Session 35/36.

| Testgrupp | Täcker |
|---|---|
| Matcher-integration | Given shopping-list + offer-snapshot, korrekt `matched`/`unmatched`-uppdelning |
| Qty alltid 1 | Oavsett mängdangivelse i ingrediens blir qty=1 i Willys-body |
| Empty shopping-list | Returnerar "ingen match" utan att POSTa |
| Partial failure | Mock där 2/23 saknar code → rapport innehåller dessa 2 |
| Preflight auth-check | Mock 401 på GET cart → dispatch avbryts utan POST |

Ingen live-test mot willys.se i CI. PoC-scriptet används för manuell sanity-check efter deploy.

**PostToolUse-hook** utökas: edit av `api/dispatch-to-willys.js` kör testerna automatiskt, blockerar commit vid regression. Samma pattern som hooks införda i Session 35/36.

**Totalt efter Fas 4:** 239 (nuvarande) + ~30 nya = ~270 assertions bevakade av hooks.

## Datamodell

Ingen ny persistent data. Endpointen är statelessen request–response. Inga nya JSON-filer i repot.

**Request:**
```json
POST /api/dispatch-to-willys
{
  "date": "2026-04-21"
}
```

Backend läser `shopping-list.json` för det datumet (samma mönster som andra endpoints).

**Response (success):**
```json
{
  "ok": true,
  "addedCount": 23,
  "missing": ["färsk basilika (1 kruka)", "limeblad (4 st)"],
  "cartUrl": "https://www.willys.se/cart"
}
```

**Response (auth-fel):**
```json
{
  "ok": false,
  "error": "auth_expired",
  "message": "Dina Willys-cookies har gått ut. Be Joakim uppdatera dem i Vercel."
}
```

**Response (feature disabled):**
```json
{
  "featureAvailable": false
}
```

## Filer som berörs

**Nya:**
- `api/dispatch-to-willys.js` — ny Vercel-endpoint
- `tests/dispatch-to-willys.test.js` — nya regressionstester

**Modifierade:**
- `js/shopping/` — ny "Skicka till Willys"-knapp + klickflöde + result-panel
- `index.html` — endast om knappen kräver ny markup (undvik om möjligt)
- `css/styles.css` — stilning av knapp, result-panel, feldialog
- `.claude/settings.json` — utökad PostToolUse-hook för den nya endpointen
- `CLAUDE.md` — Dashboard + Senaste session efter deploy

**Oförändrade (återanvänds):**
- `api/_shared/willys-matcher.js` — canon-matcher från Session 35
- `api/_shared/shopping-builder.js` — `PANTRY_ALWAYS_SKIP` filtrerar redan basvaror

## Beroenden

- PoC-scriptet (`scripts/willys-cart-poc.mjs`) kvar som sanity-check-verktyg, ingen runtime-beroende
- Canon-matcher måste fortsätta producera korrekta `code`-fält (`101684762_ST`-format) — bevakat av befintliga tester

## Öppna frågor

Inga kvar efter brainstorming. Alla designval fattade.

## Roadmap-koppling

Denna spec täcker Fas 4A–4D (MVP: rea-only dispatch). Fas 4E (produkt-sökning för icke-reavaror) är planerad som direkt uppföljning och kräver egen PoC + spec. Fas 4F (automatisera cookie-refresh) är noterad i CLAUDE.md och byggs bara om manuell refresh blir friktion.

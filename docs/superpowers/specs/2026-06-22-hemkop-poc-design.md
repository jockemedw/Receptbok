# Hemköp-PoC — designspec

**Datum:** 2026-06-22
**Fas:** 4 (uppföljning) — utforska parallell Hemköp-dispatch
**Status:** Design godkänd av användaren (väg A), klar för implementation-plan

## Syfte

Bekräfta — med ett fristående PoC-skript — om en Hemköp-korg (hemkop.se) går att
fylla programmatiskt på exakt samma sätt som Willys-korgen redan fylls. PoC:ns enda
jobb är att svara ja/nej på fyra okända punkter. Ingen produktionskod rörs, inget
auth-flow byggs. Beslut om vidare väg (parallell "Skicka till Hemköp"-knapp) fattas
*efter* att PoC:n gett svar.

## Bakgrund

Willys och Hemköp ligger båda på **Axfood-plattformen**. Den befintliga
`api/_shared/willys-cart-client.js` anropar `POST /axfood/rest/cart/addProducts` på
`willys.se` med auth = cookie-sträng (`JSESSIONID` + `axfoodRememberMe`) +
`x-csrf-token`-header, och produktkoder i formatet `<id>_ST` / `<id>_KG`. Hypotesen
är att hemkop.se kör samma motor och att skillnaden är så liten som bas-URL + butiks-ID.
Det är ett **antagande tills PoC:n bevisat det** — därför denna spec.

Detta speglar `scripts/willys-cart-poc.mjs` (Session 37) som validerade Willys-flödet
före Fas 4-designen.

## Vad PoC:n ska bekräfta

| # | Okänd | Hur PoC:n testar | Förväntat (om paritet) |
|---|---|---|---|
| 1 | Korg-endpoint | `POST hemkop.se/axfood/rest/cart/addProducts` med en känd kod, qty 1 | `200`, kod landar i korgen |
| 2 | Auth-modell | Preflight `GET hemkop.se/axfood/rest/cart` med klistrade cookies | `200` med cookies, `401` utan |
| 3 | Produktkods-format | Inspektera koder i sök/korg-svar | `<id>_ST` / `<id>_KG` |
| 4 | Sök & erbjudanden | `GET hemkop.se/search?q=<term>` och campaigns-endpoint med Hemköp-butiks-ID | `data.results[]` resp. kampanj-array |

PoC:n ska för varje punkt logga ett tydligt **PASS/FAIL** med rå statuskod, så att
utfallet är avläsbart direkt i terminalen.

## Arkitektur

```
scripts/hemkop-cart-poc.mjs   (fristående, körs med `node`)
    │  läser cookies + csrf från scripts/.hemkop-cookies.local (gitignorerad)
    │  läser HEMKOP_STORE_ID (arg eller konstant i toppen av filen)
    ├─► [2] preflight:  GET  hemkop.se/axfood/rest/cart            → PASS/FAIL
    ├─► [4] sök:        GET  hemkop.se/search?q=<term>             → PASS/FAIL + plockar en kod
    ├─► [4] erbjudanden: GET hemkop.se/<campaigns-endpoint>?q=<store> → PASS/FAIL
    ├─► [1] addProducts: POST hemkop.se/axfood/rest/cart/addProducts → PASS/FAIL
    ├─► [3] verify:     GET  hemkop.se/axfood/rest/cart            → kod i entries[]? + kods-format
    └─► skriver en sammanfattningstabell (4 rader PASS/FAIL) till stdout
```

**Nyckelval:**

- **Fristående skript** i `scripts/`, samma mönster och gitignore-strategi som
  `willys-cart-poc.mjs`. Ingen import från `api/` — PoC:n får hårdkoda Axfood-formen
  för att hållas läsbar och oberoende.
- **Manuellt klistrade cookies.** Ingen extension, ingen gist, ingen env-var-rotation.
  Cookie-strängen + CSRF läses från en gitignorerad lokal fil.
- **Read-then-write-then-verify.** PoC:n lägger *en* vara i korgen och verifierar via
  `GET /cart`. Den rör inte checkout och tömmer inte korgen (manuell uppstädning av
  användaren — samma som Willys-PoC:n).
- **Endpoint-upptäckt inbyggd.** Om ett antaget endpoint ger 404/annan form loggar
  PoC:n det råa svaret (trunkerat) så att rätt path kan härledas, istället för att
  bara faila tyst.

## Cookie- & butiks-input (krävs av användaren före körning)

Samma devtools-procedur som Willys-specen (rad 60–66):

1. Logga in på hemkop.se
2. Devtools → Network → filtrera `addProducts` → lägg en vara i korgen manuellt
3. Högerklicka anropet → Copy as cURL
4. Extrahera cookie-strängen (efter `-b`) och `x-csrf-token`-headern
5. Klistra in i `scripts/.hemkop-cookies.local` (format: se nedan)
6. Notera Hemköp-butiks-ID (syns i campaigns- eller store-anropet)

**`scripts/.hemkop-cookies.local`** (gitignorerad, JSON):
```json
{ "cookie": "<full cookie-sträng>", "csrf": "<x-csrf-token>", "storeId": "<id>" }
```

`.gitignore` utökas med `scripts/.hemkop-cookies.local` (Willys-motsvarigheten
`.willys-cookies.local` är redan ignorerad).

## Utfall & nästa steg (utanför denna spec)

PoC:n producerar ett beslutsunderlag, inte en feature:

- **Alla 4 PASS** → Hemköp-dispatch är genomförbar med minimal lyft. Nästa spec:
  generalisera `willys-cart-client`/`-search`/`-offers` till bas-URL-parametriserade
  Axfood-klienter + parallell "Skicka till Hemköp"-knapp (väg B i brainstormingen,
  med två knappar i inköpslistan).
- **Delvis PASS** (t.ex. korg funkar men sök skiljer) → notera vilka delar som skiljer;
  nästa spec begränsas till de delarna.
- **Auth FAIL** (1/2) → Hemköp skyddar korgen annorlunda; överväg browser-driven väg
  (Playwright) eller lägg ner. Dokumentera i CLAUDE.md *Öppna utredningar*.

Resultatet skrivs som en kort notis i CLAUDE.md (Roadmap Fas 4 + ev. *Öppna
utredningar*) — ingen Dashboard-roadmap-checkbox läggs till förrän en feature beslutas.

## Filer som berörs

**Nya:**
- `scripts/hemkop-cart-poc.mjs` — PoC-skriptet
- `scripts/.hemkop-cookies.local` — gitignorerad cookie-input (skapas av användaren)

**Modifierade:**
- `.gitignore` — lägg till `scripts/.hemkop-cookies.local`

**Oförändrade:** All produktionskod (`api/`, `js/`, extension, gist). PoC:n är helt
isolerad.

## Tester

Ingen automatisk testsvit — PoC:n *är* testet, körd manuellt mot live hemkop.se.
Utfallet (PASS/FAIL-tabellen) klistras in i sessionsloggen som bevis. Detta speglar
hur `willys-cart-poc.mjs` aldrig fick CI-tester utan användes som manuellt
sanity-check-verktyg.

## Öppna frågor

Inga kvar efter brainstorming. Cookie-export + butiks-ID levereras av användaren vid
körning; PoC:n upptäcker avvikande endpoints och loggar dem för manuell härledning.

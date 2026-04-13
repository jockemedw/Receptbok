# Research: Extrapriser → Receptförslag

*Skapad 2026-04-10, session 24*

---

## Mål
Hitta bästa sättet att hämta aktuella extrapriser från svenska dagligvarubutiker (primärt Willys Ekholmen) och matcha dem mot recept i `recipes.json` för att föreslå veckans billigaste matsedel.

---

## Datakällor — kartläggning

### A. ICA Inofficiellt API ⭐ (mest lovande)
- **Källa:** [svendahlstrand/ica-api](https://github.com/svendahlstrand/ica-api) — inofficiell dokumentation
- **Endpoint:** `GET /api/offers?Stores=XXXX` — returnerar erbjudanden per butik
- **Autentisering:** Kräver ICA-konto → `GET /api/login` → AuthenticationTicket
- **Format:** JSON
- **Butikssökning:** `GET /api/stores/search?Phrase=Ekholmen`
- **Status:** Inofficiellt men väldokumenterat, använt av hobbyprojekt i flera år
- **Risk:** ICA kan stänga/ändra utan förvarning
- **Research att göra:**
  - [ ] Skapa testkonto och verifiera att offers-endpointen fortfarande funkar
  - [ ] Undersök svarsformat — vilka fält finns? (produktnamn, pris, ordinarie pris, giltighetstid)
  - [ ] Testa med Willys-butik (Axfood, ej ICA) — **OBS: detta API gäller bara ICA**

### B. Tjek/eTilbudsavis API ⭐ (mest lovande för Willys)
- **Källa:** [ShopGun/Tjek Developer API](https://developers.shopgun.com/)
- **Vad:** Aggregerar reklamblad och erbjudanden från alla svenska kedjor (ICA, Coop, Willys, Hemköp, Lidl, City Gross)
- **Endpoint:** `api.etilbudsavis.dk` — sök erbjudanden med lat/lng/radius/query
- **Ägare:** Tjek A/S (danskt företag, driver eReklamblad i Sverige, 1,5M användare i Norden)
- **Format:** JSON
- **Risk:** Kan kräva API-nyckel/partneravtal
- **Research att göra:**
  - [ ] Registrera utvecklarkonto på developers.shopgun.com
  - [ ] Testa offers/search-endpoint med Willys Ekholmen-koordinater
  - [ ] Undersök rate limits och villkor (gratis för icke-kommersiellt?)
  - [ ] Utvärdera datakvalitet — har de produktnamn, pris, kategori?

### C. Willys.se direkt-scraping ⚠️
- **Status:** Vi vet sedan tidigare att Willys blockerar scraping (400-fel, noterat i CLAUDE.md)
- **Willys erbjudanden-sida:** https://www.willys.se/erbjudanden/butik
- **Problem:** Anti-bot (403/400), JavaScript-renderat, kräver butiksvalsession
- **Möjlig approach:** Headless browser med stealth-plugins, men fragilt och underhållskrävande
- **Research att göra:**
  - [ ] Testa med Playwright + stealth om det ens är möjligt
  - [ ] Undersök Willys-appens nätverkstrafik (mitmproxy) — finns det ett dolt API?
  - [ ] Bedöm juridisk risk (robots.txt, TOS)

### D. Matpriskollen
- **Källa:** [matpriskollen.se](https://matpriskollen.se/)
- **Vad:** Samlar ~200 000 erbjudanden/vecka från 3 000+ butiker sedan 2010
- **Affärsmodell:** Gratis för konsumenter, säljer aggregerad data till branschaktörer och Riksbanken
- **API:** Inget publikt API hittades
- **Research att göra:**
  - [ ] Kontakta Matpriskollen och fråga om API-tillgång för hobbybruk/liten app
  - [ ] Undersök om deras app har ett dolt API (nätverkstrafik)

### E. Vinnova-projektet (dött men intressant)
- **Källa:** [Vinnova — Ett globalt API för dagligvaruhandel](https://www.vinnova.se/p/ett-globalt-api-for-dagligvaruhandel-pa-natet/)
- **Vad:** MVP med konceptintegrationer mot ICA, Coop, MatHem. AI för produktmappning.
- **Status:** Projektet dog — medgrundare lämnade, brist på skala i Stockholm
- **Insikt:** Visar att problemet är känt men olöst. Produktmappning (matcha "kycklingfilé" mot "Kronfågel Kycklingfilé 900g") är en knäckfråga.

### F. Livsmedelsverket öppna data
- **Källa:** [livsmedelsverket.se/open-data](https://www.livsmedelsverket.se/en/about-us/open-data/)
- **Vad:** Näringsvärden, livsmedelsdatabas — ej prisdata
- **Användning:** Komplement (näringsvärde per recept) men inte relevant för extrapriser

---

## Researchsteg — prioritetsordning

### Steg 1: Tjek/eTilbudsavis API (session N+1)
**Varför först:** Enda kända API:et som täcker Willys + alla kedjor. Om det funkar löser det hela problemet.
- [ ] Registrera konto på developers.shopgun.com
- [ ] Hämta API-nyckel
- [ ] Testa `GET /offers/search?lat=58.41&lng=15.62&radius=5000&query=kyckling` (Ekholmen-koordinater)
- [ ] Dokumentera svarsformat
- [ ] Bedöm om det räcker för vår usecase
- **Leverans:** Teknisk rapport — funkar det? Datakvalitet? Begränsningar?

### Steg 2: ICA API som komplement (session N+2)
**Varför:** Om Tjek inte funkar eller saknar data, har ICA ett beprövat inofficiellt API.
- [ ] Skapa ICA-konto
- [ ] Testa `/api/login` + `/api/offers?Stores=XXXX`
- [ ] Jämför datakvalitet med Tjek
- **Leverans:** Teknisk rapport

### Steg 3: Willys-appen reverse engineering (session N+3, om steg 1–2 misslyckas)
**Varför:** Sista utvägen om inga API:er fungerar.
- [ ] Installera mitmproxy, kör Willys-appen genom proxy
- [ ] Dokumentera API-endpoints som appen använder internt
- [ ] Testa om de är åtkomliga utan app-certifikat
- **Leverans:** Dolt API dokumenterat eller "omöjligt"-bedömning

### Steg 4: Matchningslogik — ingrediens ↔ erbjudande (session N+4)
**Varför:** Oavsett datakälla behöver vi matcha "600 g torsk" i receptet mot "Torskfilé 400g" i erbjudandet.
- [ ] Analysera ingrediensnamn i `recipes.json` — hur många unika ingredienser?
- [ ] Bygg normaliseringstabell: receptingrediens → sökterm (t.ex. "kycklingfilé" → "kyckling")
- [ ] Fuzzy matching eller enkel contains-match?
- [ ] Testa mot verkliga erbjudandedata
- **Leverans:** Matchningsalgoritm + träffsäkerhetsrapport

### Steg 5: UX-design (session N+5)
- [ ] Var visas extrapris-info? Alternativ:
  - **A)** Egen "Veckans klipp"-flik med matchade recept
  - **B)** Badge/ikon på receptkort som matchar erbjudanden
  - **C)** Inställning i genereringen: "Prioritera billiga ingredienser"
  - **D)** Kombination: visa i receptbläddraren + vikta i `selectRecipes()`
- [ ] Mockup/skiss
- **Leverans:** UX-beslut

### Steg 6: Implementation (session N+6–N+7)
- [ ] Backend: `/api/offers.js` — hämtar och cachar erbjudanden (1 gång/dag)
- [ ] Matchningsmodul: erbjudande → recept
- [ ] Frontend: visa matchade erbjudanden
- [ ] Eventuell integration i `selectRecipes()` (viktning)
- **Leverans:** Fungerande feature

---

## Tekniska överväganden

### Caching
Erbjudanden uppdateras veckovis — vi behöver inte realtidsdata. En daglig cache räcker.
- Alternativ 1: Vercel serverless hämtar och cachar i JSON-fil i repot
- Alternativ 2: Vercel Edge Config eller KV-store
- Alternativ 3: Hämta client-side och cacha i sessionStorage

### Kostnad
- Tjek API: oklart (kan vara gratis för små volymer)
- ICA API: gratis (inofficiellt)
- Scraping: gratis men underhållskrävande
- Vercel: bör rymmas inom free tier (1 API-anrop/dag)

### Juridik
- ICA API: inofficiellt, kan stängas — men ingen aktiv blockering känd
- Tjek API: officiellt developer-program — renaste vägen
- Scraping: gråzon, robots.txt styr, TOS kan förbjuda

---

## Tjek API — Djupdykning (session 27, 2026-04-13)

### Teknisk bekräftelse
- **Endpoint:** `GET https://api.etilbudsavis.dk/v2/offers/search?lat=<lat>&lng=<lng>&radius=<m>&query=<term>`
- **Status:** HTTP 200, ingen API-nyckel krävs, ingen registrering
- **Testad:** 2026-04-13 med `lat=58.41, lng=15.62, radius=5000, query=kyckling`
- **Resultat:** 24 erbjudanden från ICA Supermarket, City Gross, Hemköp, Coop, Willys, Willys Hemma, Hypermat, Pekås, Tempo m.fl.
- **Developer-portalen (`developers.shopgun.com`) är nedlagd** — API:et lever men finns inte längre dokumenterat publikt.

### Svarsformat (relevanta fält)
```json
{
  "id": "...",
  "heading": "Kycklingfärs",                          // produktnamn (fritext, case varierar)
  "description": "Obs! Max 2 st | 500 g | Kronfågel", // ofta varumärke + mängd
  "pricing": { "price": 39, "pre_price": null, "currency": "SEK" },
  "quantity": {
    "unit": { "symbol": "g", "si": { "symbol": "kg", "factor": 0.001 } },
    "size": { "from": 500, "to": 500 },
    "pieces": { "from": 1, "to": 1 }
  },
  "run_from": "2026-04-12T22:00:00+0000",
  "run_till": "2026-04-19T21:59:59+0000",
  "dealer": { "name": "ICA Supermarket", "country": { "id": "SE" } },
  "images": { "thumb": "...", "view": "...", "zoom": "..." }
}
```

### Tjek som företag — hur datan faktiskt produceras

**Tjek A/S är ett B2B-SaaS-företag**, inte en gratis konsumenttjänst som skrapar data. Butikskedjorna är **betalande kunder**:

**Datapipeline (tre parallella spår, alla retailer-initierade):**
1. **CMS-portal** (`cms.tjek.com`) — butikerna loggar in och publicerar erbjudanden manuellt
2. **Incito-feeds** — proprietärt digitalt katalogformat; butikerna skickar produktfeed, Tjek genererar responsiv katalog med nästan-realtidsuppdatering
3. **AI-driven PDF-ingest** — butikerna laddar upp reklamblads-PDF, Tjeks AI extraherar erbjudandena (ersatte manuell OCR)

**Ingen skrapning av konkurrenters sajter.** Hela pipelinen förutsätter att butiken är en onboardad kund.

**Intäktsmodell:**
- Incito-licensavgifter (setup + hosting + 2 % årlig höjning)
- CMS-prenumerationer
- Insights (analytics sålt till butiker och varumärken)
- SDK/API-integrationsavgifter för butiker som vill bygga egna appar

**Konsumentapparna** (eTilbudsavis i DK, eReklamblad i SE, Mattilbud i NO) är **distributionskanalen** som gör B2B-produkten värdefull för butikerna. Räckvidd: 1,5 M MAU i Norden, 26 % av Danmarks befolkning (Kantar Gallup 2023).

**Centralt insikt:** Butiker **betalar Tjek för att få sina erbjudanden publicerade**, eftersom Tjek når deras kunder. Det är **betald marknadsföring**, inte motvillig scraping. Butikerna vill att datan sprids — det är hela affärsidén.

### Juridisk status för tredjepartsanvändning

Tjeks Terms & Conditions (lydelse: dansk lag, Köpenhamn som jurisdiktion) säger uttryckligen:

> "Any use of the Incito API outside Tjek's or the Customer's own platforms... must be agreed upon between the Parties in writing ahead of publication."

**Vår användning ligger i en gråzon:**
- Inte uttryckligen förbjudet (publika endpointen svarar utan auth)
- Inte licensierat för oss
- Community-projekt har använt legacy-API:et i flera år utan takedown
- Ingen "free developer tier" finns

**Risknivåer:**
| Scenario | Risk | Motivering |
|---|---|---|
| Privat familjeapp (nu) | 🟢 Mycket låg | Typfall för tolererad användning — en familj, ingen redistribution, ingen kommersialisering |
| Publicering i App Store (fas 5) | 🟡 Medel | Kräver skriftligt avtal — men datan är inte stulen, så samtalet är konstruktivt |
| Ingen graceful fallback | 🔴 Teknisk | Endpoint kan rate-limitas eller kräva auth när som helst — appen måste tåla det |

### Handlingsplan för framtida monetisering

**Innan publicering i App Store / kommersialisering:**

1. **Kontakta Tjek** — `services@tjek.com`. Beskriv appen som en liten konsumentapp som hjälper familjer matcha recept mot extrapriser. Fråga om:
   - Hobby/small-app-licens för API-åtkomst
   - Attribueringskrav (logga, länk tillbaka)
   - Rate limits
   - Kostnad (sannolikt rimlig eller gratis — mer exponering gynnar deras kunder)
2. **Granska deras Terms & Conditions** före avtalsförhandling
3. **Förbered fallback** — ICA API (inofficiellt) eller Matpriskollen som backup om Tjek säger nej
4. **Överväg partneravtal** — om appen växer kan det bli värt att betala för direktintegration via Incito

**Viktigt:** Eftersom butikerna redan betalar Tjek för att få datan spridd är incitamenten linjerade — Tjek tjänar på att datan når fler konsumenter. Samtalet bör vara konstruktivt.

### Tekniska skyddsåtgärder (gäller även för familjeversionen)

Oavsett om vi har avtal eller inte, designa integrationen så att Tjek är en **utbytbar datakälla, inte ett hårt beroende**:

1. **Aggressiv caching** — max 1 anrop per ingrediens per dag, lagras i repo eller Edge Config
2. **User-Agent** som identifierar oss: `"Receptboken/1.0 (hobby family app)"`
3. **Graceful fallback** — om API:et returnerar 403/429/500, gå tyst i dvala, aldrig krascha appen
4. **Datumstämpel i UI** — "Priser uppdaterade: YYYY-MM-DD" så användaren förstår att det är en ögonblicksbild
5. **Abstraktionslager** — all API-logik i `api/offers.js`, matchning i separat modul. Byter vi datakälla ska bara `offers.js` behöva ändras.

### Källor för denna djupdykning

- [Tjek corporate site](https://tjek.com/)
- [Tjek APIs and SDKs](https://tjek.com/apis-and-sdks)
- [Tjek Terms & Conditions](https://tjek.com/terms)
- [Tjek Incito product page](https://tjek.com/incito)
- [Tjek Insights](https://tjek.com/insights)
- [Tjek LinkedIn](https://www.linkedin.com/company/tjek/)
- [Tjek Crunchbase](https://www.crunchbase.com/organization/tjek)
- [Tjek JS SDK på GitHub](https://github.com/tjek/tjek-js-sdk)
- [Kantar Gallup användarstatistik sep 2023](https://www.linkedin.com/pulse/26-danes-use-etilbudsavis-58-know-app-kantar-gallup-september-2023)

---

## Logg

| Datum | Session | Vad som gjordes |
|-------|---------|-----------------|
| 2026-04-10 | 24 | Initial research och plan skapad. 6 datakällor identifierade, Tjek API mest lovande. |
| 2026-04-13 | 27 | Tjek API bekräftat live via direktanrop (24 erbjudanden för kyckling i Ekholmen). Djupdykning i Tjeks affärsmodell — B2B-SaaS där butiker är betalande kunder, datan är inte skrapad. Juridisk gråzon för tredjeparter dokumenterad. Handlingsplan för framtida monetisering fastställd. |

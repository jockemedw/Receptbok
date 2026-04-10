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

## Logg

| Datum | Session | Vad som gjordes |
|-------|---------|-----------------|
| 2026-04-10 | 24 | Initial research och plan skapad. 6 datakällor identifierade, Tjek API mest lovande. |

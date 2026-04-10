# Researchplan — App-expansion & nya features

*Skapad 2026-04-10, session 24. Betas av löpande i kommande sessioner.*

---

## Syfte
Undersöka och förbereda implementation av de features och det delprojekt som ger Receptboken unik edge på marknaden. Varje punkt är ett fristående forskningspaket som kan göras i en session.

---

## Fas 1 — Extrapris-integration (högst prioritet)

### 1A. Kartlägg prisdatakällor i Sverige
- [ ] Undersök Willys/Axfood: finns API, RSS, strukturerad data på sajten?
- [ ] Undersök ICA: erbjudande-API (ICA har haft öppet API historiskt — finns det kvar?)
- [ ] Undersök Coop: samma fråga
- [ ] Kolla tredjepartstjänster: Matpriskollen, Matspar, Prisjakt mat — har de API eller scrapebar data?
- [ ] Kolla om EU-regler (Digital Markets Act el. liknande) tvingar kedjor att öppna prisdata
- [ ] **Leverans:** Sammanställning av vilka datakällor som är realistiska, med teknisk approach per källa

### 1B. Designa "extrapris → receptförslag"-flödet
- [ ] Hur matchar vi erbjudanden mot `recipes.json`-ingredienser? (fuzzy match, ingrediens-normalisering)
- [ ] UX-skiss: var i appen visas det? Egen flik? Badge på recept? "Veckans klipp"-vy?
- [ ] Ska det påverka `selectRecipes()` (auto-vikta billiga recept) eller bara vara rådgivande?
- [ ] **Leverans:** UX-koncept + teknisk design

### 1C. Bygg MVP
- [ ] Implementation av datahämtning (API/scraping/tredjepartstjänst)
- [ ] Matchningslogik: erbjudande-ingrediens → recept
- [ ] Frontend-vy
- [ ] **Leverans:** Fungerande feature i appen

---

## Fas 2 — Familjelärande algoritm (låg kostnad, hög edge)

### 2A. Analysera befintlig data
- [ ] Vad kan vi redan utläsa från `recipe-history.json` + `tested`-flaggor?
- [ ] Vilka proteiner/taggar/recepttyper föredrar familjen statistiskt?
- [ ] **Leverans:** Analys-sammanfattning med insikter

### 2B. Designa viktningsmodell
- [ ] Hur viktas "testat + lagat ofta" vs "nytt och oprövat"?
- [ ] Ska det vara en inställning ("mer variation" ↔ "mer favoriter")?
- [ ] Integration i `selectRecipes()` — deterministiskt, ingen AI
- [ ] **Leverans:** Algoritm-design

### 2C. Bygg
- [ ] Implementera viktning i receptvalet
- [ ] Eventuell "Favoriter"-vy i appen
- [ ] **Leverans:** Fungerande feature

---

## Fas 3 — Automatisk varukorgsfyllning (svårast, starkast)

### 3A. Teknisk research
- [ ] Kan Claude in Chrome styra Willys.se / ICA.se varukorg?
- [ ] Testa manuellt: logga in, sök vara, lägg i korg — vilka steg krävs?
- [ ] Alternativ: Mat.se, Mathem — enklare gränssnitt?
- [ ] Finns det befintliga automationsverktyg (Playwright, Puppeteer) som funkar?
- [ ] Juridisk bedömning: bryter det mot användarvillkor?
- [ ] **Leverans:** Proof of concept-rapport

### 3B. Designa flödet
- [ ] Hur triggas det? Knapp i inköpslistan → "Fyll varukorg på Willys"?
- [ ] Felhantering: vara finns inte, vara slut, prisändring
- [ ] Ska det köra lokalt (Claude in Chrome) eller server-side?
- [ ] **Leverans:** UX-koncept + teknisk design

### 3C. Bygg MVP
- [ ] Implementation (beroende på vald approach)
- [ ] **Leverans:** Fungerande automation

---

## Fas 4 — Internationell receptimport (quality-of-life)

### 4A. Kartlägg format och sajter
- [ ] Vilka populära receptsajter vill vi stödja? (Dishing Out Health, AllRecipes, BBC Good Food, m.fl.)
- [ ] Vilka JSON-LD/schema.org-varianter använder de?
- [ ] Vilka enheter behöver konverteras? (cups, tbsp, oz, lb → dl, msk, g, kg)
- [ ] **Leverans:** Stöd-matris per sajt

### 4B. Bygg konvertering
- [ ] Enhetskonvertering (cups → dl etc.)
- [ ] Ingrediens-översättning (engelska → svenska)
- [ ] Testa mot 10+ receptsidor
- [ ] **Leverans:** Utökad importfunktion

---

## Fas 5 — App Store-konvertering (delprojekt)

### 5A. Teknisk väg
- [ ] PWA vs React Native vs native wrapper (Capacitor/TWA) — för-/nackdelar
- [ ] Vad krävs för App Store-godkännande? (Apple kräver "native-känsla")
- [ ] Vad behöver ändras i arkitekturen? (service worker, offline, push-notiser)
- [ ] **Leverans:** Teknisk rekommendation

### 5B. Autentisering & multi-tenant
- [ ] Behövs det? (om varje familj ska ha egen data)
- [ ] Enklaste auth-lösning (magic link, Apple Sign In, etc.)
- [ ] Datamodell: en `recipes.json` per familj, eller delad receptbank + privat plan?
- [ ] **Leverans:** Arkitektur-förslag

### 5C. Kostnads- & intäktskalkyl
- [ ] Apple Developer Program: 99 USD/år
- [ ] Hosting vid 100/1000/10000 användare (Vercel-kostnader, GitHub API-gränser)
- [ ] Break-even vid engångsköp $3–5 vs prenumeration $3–5/mån
- [ ] **Leverans:** Finansiell modell

---

## Prioritetsordning

| Fas | Edge-värde | Svårighetsgrad | Rekommenderad ordning |
|-----|-----------|----------------|----------------------|
| 2 — Familjelärande | Hög | Låg | ⬅ Börja här (data finns redan) |
| 1 — Extrapriser | Mycket hög | Medel | ⬅ Sedan här (unik hook) |
| 4 — Internationell import | Medel | Låg–Medel | Kan göras parallellt |
| 3 — Varukorgsfyllning | Mycket hög | Hög | Research tidigt, bygg sent |
| 5 — App Store | Hög | Hög | Sist (kräver att appen är feature-complete) |

---

## Logg

| Datum | Session | Vad som gjordes |
|-------|---------|-----------------|
| 2026-04-10 | 24 | Marknadsanalys klar (`docs/marknadsanalys-2026-04.md`). Researchplan skapad. |

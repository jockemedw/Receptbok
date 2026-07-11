# Monetiseringsanalys & roadmap — Receptboken/Familjehubben

*Sammanställd 2026-07-10 (nattsession på Joakims uppdrag). Bygger vidare på
`docs/marknadsanalys-2026-04.md` (Session 24), `docs/research-teknisk-vag-app.md`
(Fas 5A, Session 28) och `docs/plattform-familjehub-2026-07.md`.*

**Detta dokument är Fas 5C (kostnads-/intäktskalkyl + monetiseringsmodell) ur roadmapen —
plus en ärlig bedömning av om det överhuvudtaget är värt att göra.**

---

## 0. Kortversionen (TL;DR)

- **Appen har EN genuint unik och säljbar egenskap:** kedjan *reor → receptförslag →
  automatiskt fylld varukorg*. Två svenska AI-tjänster (Smaklig, Nomi) gör numera
  reoptimerade veckomenyer — men **båda är gratis i beta utan bevisad betalmodell,
  och ingen fyller varukorgen**. Sista länken i kedjan är fortfarande unik, men
  fönstret att vara "först med betalprodukten" håller på att smalna.
- **Men den säljbara egenskapen vilar på det skakigaste fundamentet:** inofficiella
  Willys-endpoints + sessionscookies infångade via en egen browser-extension.
  Det är gråzon juridiskt för en *kommersiell* tjänst och omöjlig onboarding för
  massmarknad. Detta är monetiseringens kärnproblem — inte tekniken i övrigt.
- **Realistisk framgångsbedömning:** kostnadstäckning (~0–1 000 kr/mån) är sannolik
  om man försöker; sidoinkomst (1–5 tkr/mån) är möjlig men kräver uthålligt
  marknadsföringsarbete som ingen kan koda bort; försörjning är osannolik (<2 %).
  Problemet är inte produkten — det är **distribution** (att nå familjerna),
  **innehållsrättigheter** (importerade recept får inte säljas vidare) och en
  dokumenterad varningsflagga: **Matpriskollen (350 000 användare) försökte ta
  betalt av konsumenter för prisdata — "sålde ingenting" — och lever i dag på
  annonser + B2B-dataförsäljning.** Svenskar betalar för matkassar (2–4 tkr/mån),
  inte hittills för prisinformation i appform.
- **Rekommenderad väg:** en **stegvis trappa med kill-kriterier** — M1 (5 vänfamiljer,
  gratis, mäter retention) → M2 (minimal betalningsviljetest) → M3 (Stripe på webben)
  → M5 (Axfood-partnerskap, opportunistiskt). Varje steg är billigt, reversibelt och
  kan avbrytas utan att familjeappen påverkas. **Familjens instans förblir gratis och
  orörd — hård regel.**
- **"Lättaste vägen"-frågan (Joakim 2026-07-10) besvarad i 4.1:** annonser är
  lättast att *bygga* men svårast att *nå målet* (kräver 1 500–3 000 hushåll mot
  prenumerationens 33–50); App Store-engångsköp är plan B (Apple sköter betaladmin
  men Capacitor-jobb + evigt nykundslöpband). **Webb-prenumerationen är faktiskt
  lättast räknat i människor per krona — och M4 (App Store) skjuts upp helt tills
  målet är nått på webben.**
- **Funktionsgapen mot konkurrenterna** (Joakims fråga 2): inventering + prioriterad
  integrationslista i **`docs/konkurrens-funktionsanalys-2026-07.md`** — G1–G5 före
  externa hushåll (allergifilter, onboarding, bilder, magisk länk, butiksgångordning),
  G6–G11 som premiumvärde/retention (rea-bevakningsnotiser, veckodigest,
  laga-på-det-du-har, restlogik, pris per portion, middagsbetyg).
- **✅ BESLUTAT (Joakim 2026-07-10/11):** ambitionsnivån är **kostnadstäckning
  inklusive Claude Code Max 20×** — appen ska tjäna in sitt eget utvecklingsverktyg.
  Skarpt mål: **~2 750 kr/mån ≈ 75 betalande hushåll** (kalkyl 5.1b). **Alla åtta
  öppna frågor är besvarade (avsnitt 9)** — roadmapen är fullt beslutad; kvar i M0
  är bara namnvalet (kandidatlista med ledighetskoll i M0-avsnittet).

---

## 1. Nulägesanalys — vad appen ÄR i juli 2026

### 1.1 Produkten
122 sessioner utveckling, ~19 000 rader kod, ~800 testassertioner, CI. Funktionellt:

| Förmåga | Status | Monetiseringsrelevans |
|---|---|---|
| Deterministisk matsedelsgenerering (historik, protein, vardag30/helg60, säsong) | Mogen | Bas-feature — det andra tar betalt för |
| Inköpslista (5-stegs pipeline, kategorier, skafferi, portionsskalning) | Mogen | Bas-feature, ovanligt bra utförd |
| **Prisoptimering: Willys-reor → receptförslag ("Prisoptimera")** | Skarp (S121) | **Unik. Kärnan i ett betalerbjudande** |
| **Willys-dispatch: fyll varukorgen automatiskt** | Fungerar (cookies via extension) | Unik men **oskalbar onboarding + juridisk gråzon** |
| Receptimport (foto/URL via Gemini gratis-tier) | Mogen | Bra feature, men skapar **upphovsrättsfråga** vid försäljning |
| Familjehubb: delade listor, anteckningar (Cozi-ersättare) | Skarp (S113–116) | Breddar värdet per hushåll, ökar daglig användning |
| Mobil-UX: mörkt tema, svep, poler-svep, touch-first | Mobil-verifierad (S120) | Säljbar kvalitetsnivå — ser inte ut som en hobbyapp |
| Auth + hushållsmodell (Supabase RLS `households`/`household_members`) | I drift | **Multi-tenant-grunden finns redan** — stor försprångspost |

Data: **264 recept** i databasen, varav **22 markerade testade**. 1 hushåll, 3 medlemmar.

### 1.2 Kostnadsstruktur idag: 0 kr/mån
Vercel Hobby (0 kr) + Supabase Free (0 kr) + Gemini free-tier (0 kr) + GitHub (0 kr).
Designprincipen "ingen AI i runtime" gör att **marginalkostnaden per användare är ~0 kr**
— en ovanligt bra utgångspunkt för freemium (de flesta AI-matappar blöder pengar per användare).

### 1.3 Vad som INTE finns
- Ingen självregistrering (avstängd), ingen onboarding, ingen betalinfrastruktur.
- Ingen närvaro: inget varumärke, ingen domän (kör `receptbok-six.vercel.app`),
  ingen App Store-app, noll externa användare, noll marknadsföring.
- Ingen juridisk grund: ingen integritetspolicy, ingen företagsform, inga avtal.

---

## 2. Tillgångar och blockerare — ärlig inventering

### 2.1 Tillgångar (i fallande säljbarhet)

1. **Reor→recept→korg-kedjan.** Differentieraren. Matpriserna är fortfarande ett
   topp-3-samtalsämne i svenska familjer 2026, och "appen räknar ut vilka middagar
   som är billigast att laga just den här veckan på din butik, och lägger varorna i
   korgen" är en story som säljer sig själv i en TikTok/Instagram-reel.
2. **Noll marginalkostnad.** Deterministiskt receptval = varje ny användare kostar
   ~0 kr tills gratis-tiers tak nås. Konkurrensfördel mot AI-appar.
3. **Multi-tenant-arkitekturen är till 70 % byggd.** Supabase-migrationen (Fas 7)
   gav households + RLS på alla tabeller. Det som återstår är känt och avgränsat
   (backlog #5–#6, se 2.2).
4. **UX-nivån.** Efter designinförandet + poler-svepet håller appen butiksklass på
   mobil. Det syns i skärmdumpar — viktigt för ASO/marknadsföring.
5. **Familjehubben.** Listor/anteckningar/kalender ökar antalet dagliga öppningar
   — retention är valutan i prenumerationsekonomi.

### 2.2 Blockerare (i fallande allvarlighet)

**B1 — Willys-beroendet (juridik + skalbarhet). Den enskilt största frågan.**
- Reor-feeden läses från inofficiella endpoints. För privat bruk: oproblematiskt.
  För en *betaltjänst* (juridiskt läge verifierat i nattens research):
  - Enskilda **priser är inte upphovsrättsskyddade**, men Willys pris-/sortiments-
    databas har sannolikt **databasskydd (49 § URL, sui generis)** — och upprepade
    systematiska uttag av små delar räknas ihop till "väsentlig del" (precis vad en
    veckovis rea-skrapare gör).
  - Även utan databasskydd kan Axfood **förbjuda scraping via användarvillkor**
    (EU-domstolens Ryanair-dom C-30/14). Willys villkor bör läsas manuellt före
    kommersialisering (JS-sidan gick inte att maskinläsa i researchen).
  - **TDM-undantaget** (svensk lag 2023) tillåter kommersiell datautvinning av
    lagligt tillgängligt innehåll — **tills** Axfood lägger ett maskinläsbart
    förbehåll (robots.txt/villkor). En opt-out släcker undantaget.
  - **Praktiken:** inga kända svenska rättsfall mot mat-scrapers; Matpriskollen och
    Matspar har hämtat kedjornas priser i 10+ år utan process. Realistisk risk är
    **teknisk blockering/avstängning**, inte stämning — dvs. driftsrisk snarare än
    juridisk katastrofrisk, men den får inte vara betalproduktens enda ben.
- Dispatchen (korgfyllning) kräver att **varje** hushåll kör browser-extensionen och
  fångar sina Willys-cookies — det överlever inte kontakt med en vanlig familj.
- **Konsekvens för roadmapen:** prisoptimering (reor-läsning) kan vara kvar i ett
  betalerbjudande med öppen risk (graceful degradering finns redan — larmbannern,
  S110), men **dispatchen ska betraktas som en familje-exklusiv bonus**, inte en
  produkt-feature, tills ett partnerskap finns.

**B2 — Receptinnehållet får inte säljas vidare som det är.**
264 recept varav en stor del importerade från webben/foto. Ingredienslistor är fritt
fram; **instruktionstext är upphovsrättsskyddad**. Att sälja tillgång till en databas
med kopierade instruktioner är en reell risk. Lösningen är dock enkel och redan
halvvägs: gör **recepten privata per hushåll** (RLS-mönstret finns) — varje familj
bygger sin egen bok via import (privat bruk = OK), och appen säljer *verktyget*, inte
*innehållet*. Seed-recept till nya hushåll begränsas till de egna/testade.

**B3 — Tenancy-resterna (backlog #5–#6).**
`getHouseholdId()` tar "första hushållet" (`api/_shared/supabase.js`) och service-role-
nyckeln kringgår RLS i skrivande endpoints; Willys-cookies ligger i en secret gist med
en kontobred PAT. Känt, avgränsat, medelstor insats — men **absolut blockerare** innan
ett enda externt hushåll släpps in.

**B4 — Gratis-tiers är inte kommersiellt användbara.**
- **Vercel Hobby förbjuder kommersiell användning i villkoren** → Pro (20 USD/mån)
  krävs i samma stund som betalning tas. Hobby-planens **12-funktionersgräns är redan
  nådd** (S121 — deploy blockerades) — Pro löser även den.
- Supabase Free pausar efter inaktivitet och har 500 MB/50k MAU-tak → Pro (25 USD/mån)
  vid riktiga kunder (paus-beteendet är oacceptabelt för betalande).
- Gemini free-tier: importvolym växer linjärt med användare; free-tier-data kan
  användas för träning (integritetsfråga att deklarera) → betald nyckel vid skala.
- **Praktisk grundkostnad för en kommersiell drift: ~45–60 USD/mån (~550–750 kr/mån).**
  Break-even vid ~15–20 betalande hushåll à 39 kr/mån.

**B5 — Distribution.** Ingen kanal till målgruppen. Detta är det som dödar de flesta
indie-appar — inte tekniken. Marknadsföring är mänskligt arbete varje vecka
(innehåll, ASO, communitysvar) och kan inte delegeras till kodsessioner.

**B6 — Drift- och supportansvar.** Betalande kunder förvandlar "appen har vilat" från
kuriosa till supportärende. En person + Claude klarar 50 hushåll; 5 000 är ett jobb.

**B7 — Formalia.** Verifierat i researchen: löpande prenumerationsintäkter uppfyller
Skatteverkets tre näringskriterier (självständighet, varaktighet, vinstsyfte) →
**näringsverksamhet från första kronan**, dvs. enskild firma + F-skatt (gratis att
registrera; Stripe accepterar enskild firma med personnummer). Momsregistrering
krävs först över **120 000 kr/år** (momsbefrielse under). GDPR-minimum: integritets-
policy (art. 13), registerutdrag/radering inom en månad, biträdesavtal med Supabase/
Vercel/Stripe (alla har standard-DPA); ingen DPO/konsekvensbedömning behövs på denna
nivå — matplaner är inte känsliga uppgifter. Kortdata rör aldrig egen server med
Stripe Checkout. Överkomligt (en kväll + blankett) men måste finnas **innan** första kronan.

---

## 3. Marknaden (uppdaterat juli 2026)

*Basen från april-analysen står sig: global marknad 1–2,5 mdr USD, ~12–13 % CAGR;
svensk betalningsvilja bevisad via matkassar (Cheffelo 1 188 MSEK 2025); kedjornas
gratisappar (ICA 4,6★, Coop) dominerar men är kedjelåsta; Yummly/PlateJoy/Middagsfrid
nedlagda = även finansierade aktörer faller på intäktssidan.*

### 3.1 Matpriskollen — nischens facit (viktigaste researchfyndet)
Sveriges etablerade rea-app: **~350 000 aktiva användare** (2025), grundad 2010.
Tre lärdomar som träffar Receptboken rakt i affärsmodellen:
1. **Konsumentappen är helt gratis** — intäkterna kommer från annonser i appen och
   **B2B-försäljning av aggregerad prisdata** (bl.a. Riksbanken är kund).
2. Grundaren **försökte sälja premiumtjänster till konsument — "sålde ingenting"** —
   och gick tillbaka till gratis B2C. Betalningsviljan för *prisinformation* som
   sådan är alltså empiriskt testad och underkänd i Sverige.
3. Deras datainsamling är delvis **manuell** (~200 000 erbjudanden/vecka knappas in
   från reklamblad; ordinariepriser hämtas från kedjornas nätbutiker utan avtal) —
   dvs. även den stora aktören bygger på egen insamling, inte partnerskap, och har
   gjort så i 15 år utan kända rättsprocesser.

**Slutsatsen för Receptboken:** det som eventuellt bär betalning är inte *reorna*
(gratis-facit) utan *tjänsten som omsätter dem i färdiga middagar, lista och korg* —
plus familjehubben. Premium måste säljas som "slipp tänka", inte som "se priser".

### 3.2 Direktkonkurrenter har dykt upp — och EN tar redan betalt
- **Smaklig** (smaklig.app): svensk AI-veckomeny optimerad mot ICA/Coop/Lidl/Willys-
  kampanjer, hävdar 150–250 kr sparande/vecka. **Gratis under beta.**
- **Nomi** (hejnomi.se): AI-veckomeny med ICA-, Coop- **och Willys**-kampanjer.
  **Gratis under beta.**
- **SmartaMenyn** (smartamenyn.se): AI-veckomeny från erbjudanden (ICA, Coop,
  Hemköp, Lidl) — **gratis provperiod → två betalplaner via Stripe** *(uppdaterar
  Session 123-slutsatsen "ingen tar betalt": en aktör vågar — okänt hur det går,
  men modellen webb-Stripe-prenumeration för rea-baserad matplanering finns skarp
  i Sverige)*. Funktionsdetaljer i `docs/konkurrens-funktionsanalys-2026-07.md`.
- **Matspar.se**: prisjämförelse för e-matbutiker, tjänar pengar på affiliation.
- Konceptet "reor → veckomeny" är alltså inte längre unikt; **korgfyllningen och
  familjehubb-kombinationen är det.** Att två AI-startups valt samma nisch validerar
  idén — och betyder samtidigt att båda bränner pengar på AI-runtime som Receptboken
  slipper (deterministiskt urval = 0 kr/användare). Om någon av dem lyckas ta betalt
  sätter de prisankaret; om de dör bekräftar de Matpriskollen-facit.

### 3.3 Benchmark för prenumerationsappar (RevenueCat 2026, 115 000+ appar)
- Freemium-konvertering: median **~2 % (D35)**; hard paywall/trial **~10,7 %** —
  trial-först ger 8–9× högre intäkt per install. Talar för **30 dagars gratis
  premium-trial** snarare än evig generös gratisnivå för externa hushåll.
- Retention är brutal: **bara 23–40 % av årsprenumeranter förnyar första gången**;
  35 % av årsavhoppen sker redan månad 1. Median-LTV per betalande ~25 USD (Västeuropa).
- Indie-median: **<1 000 USD/mån**; topp-kvartilen (tajt nisch + prenumeration)
  når 3 000–15 000 USD/mån efter 12–18 månader. Räkneexempel i avsnitt 5.

### 3.4 Prisläge att förhålla sig till (verifierat juli 2026)
ICA/Coop-apparna: gratis (finansierade av handeln). **Cozi Gold 39 USD/år (~400 kr).**
**AnyList 14,99 USD/år för helt hushåll (~155 kr) — obekvämt lågt ankare för
familjedelning.** Plan to Eat 49 USD/år. Lifesum Premium ~500–550 kr/år (bevisar att
svenskar betalar för mat/hälsa-appar). Matkassar: HelloFresh från 46 kr/portion,
Linas från 39 kr/portion ⇒ 2 000–4 000 kr/mån för "slipp planera".
**Rimligt prisfönster för Receptboken: 29–39 kr/mån eller 249–349 kr/år per hushåll**
(alla medlemmar ingår) — med "appen betalar sig själv första rea-veckan" som ankare
och besparingssiffran ("−X kr denna vecka" finns redan i heron) som kvitto i appen.

---

## 4. Monetiseringsmodeller — värdering mot just denna app

| Modell | Bedömning | Motivering |
|---|---|---|
| **Freemium-prenumeration per hushåll (webb-Stripe först)** | ✅ **Rekommenderad** | Gratis: planering+lista (bas). Premium: prisoptimering, familjehubb-extra, obegränsad import. Noll marginalkostnad gör gratis-delen ofarlig; Stripe på webben undviker Apples 15–30 % tills App Store-steget. |
| Engångsköp (39–79 kr) | ⚠️ Reserv | Enkelt, men ger inte löpande intäkt som täcker löpande infra; ingen naturlig plats utan App Store. Kan bli App Store-modellen i M4 om prenumeration känns fel där. |
| Donation/tip jar | ✅ Som komplement | Noll risk, noll friktion. Kan slås på redan i M1 (Ko-fi/Swish) för att mäta uppskattning. |
| Annonser | ❌ | Kräver tiotusentals användare; förstör UX:en som är säljargumentet; Yummly-läxan. |
| Affiliate mot butik | ⚠️ Bevakas | Willys saknar program, men **Mat.se (Axfood-ägt) har kört affiliate via Adtraction (7 %/5 %)** — dagligvaru-affiliate existerar alltså i Sverige. Om Willys/Axfood öppnar ett blir dispatch-kedjan plötsligt en intäktsmotor i stället för en risk. |
| **B2B/partnerskap (Axfood/Willys)** | 🎯 Wildcard | Appen *driver korgar till Willys* — dispatchen ökar deras konvertering. En pitch "vi gör er reklamblads-app till en middagsplanerare" är inte orimlig, men kräver bevisad användarbas först. Rätt läge: efter M3, eller som svar om Axfood hör av sig (B1). |
| White-label till kommun/region (matsvinn) | 💤 Långskott | Matsvinnsstoryn (16 kg/person/år) kan bära offentliga pengar (Vinnova-spåret), men upphandlingsvärlden är ett eget yrke. Parkeras. |

### 4.1 Joakims följdfråga (2026-07-10): LÄTTASTE vägen till Max-täckning?
*"Annonser i webapp vs låg kostnad i App Store, t.ex."* — här är den ärliga
jämförelsen. Två saker är gemensamma för ALLA vägar och går inte att välja bort:
(a) **multi-tenant-arbetet** (M1: #5–#6 + onboarding G1–G5) — även annonser kräver
främmande användare; (b) **Vercel Pro (~250 kr/mån)** — all intäktsdrift bryter
Hobby-villkoren. "Lätt" kan alltså bara handla om det som kommer *efter* M1.

| Väg | Byggjobb utöver M1 | Pappersarbete | Människor som krävs för ~1 200–2 000 kr/mån | Ärlig bedömning |
|---|---|---|---|---|
| **Annonser i webappen** (AdSense) | Minst (script + samtyckesbanner) | Minst (ingen betalning; annonsintäkt deklareras ändå) | **~300–500 dagligt aktiva ≈ 1 500–3 000 hushåll** (eCPM Norden ~2–4 USD, ~4 visningar/dag) | **Lättast att bygga, svårast att nå målet** — kräver 20–40× fler hushåll än prenumeration, förstör UX:en som är säljargumentet, och GDPR-samtyckesbanner på en familjeapp skaver. Realistiskt utfall vid 100–500 användare: **50–300 kr/mån**. Yummly-läxan + Matpriskollen (350k användare för att leva på annonser+B2B) säger allt. |
| **Låg-pris engångsköp i App Store** (29–49 kr) | Störst: Capacitor 3–5 v + Mac + granskningsrisk (4.2) + $99/år | Näst minst — **Apple är merchant of record** (sköter betalning, moms, kvitton; ingen Stripe, ingen momshantering) | **~30–45 NYA köpare varje månad, för alltid** (49 kr − 15 % Apple ≈ 41 kr) | Engångsköp är ett **löpband**: intäkten dör den månad nykundsflödet dör, och svensk nisch-ASO utan marknadsföring ger typiskt 0–2 köp/dag som avtar. Rimlig som *plan B* om Stripe/firma känns för tungt och Mac finns — inte som huvudväg. |
| **Webb-prenumeration** (Stripe, 39 kr/mån) | Litet–medel: Stripe Checkout + kundportal (~1–2 sessioner) | Störst engångspuckel: enskild firma + F-skatt (en kväll) + integritetspolicy — sedan i princip noll löpande (moms först >120 tkr/år) | **~33–50 betalande hushåll, EN gång** — sedan handlar det om churn, inte nyförsäljning | **Lättast att NÅ målet** — minst antal människor per krona, återkommande intäkt, och SmartaMenyn bevisar att modellen är gångbar i exakt denna nisch. Formalian är en puckel, inte ett löpande jobb. |
| **Donation/tip jar** (Swish-QR/Ko-fi) | Trivialt | Inget (små gåvor) | Tusentals användare (typiskt <5 % ger något, en gång) | Slå på ändå — kostar inget — men det är inte en väg till 1 000+ kr/mån. |

**Reviderat svar på "lättaste vägen":**
1. **Skenbart lättast (annonser) är i praktiken svårast** — annonsmatten kräver en
   användarbas som i sig är hela problemet. Bygg-enkelheten är en fälla.
2. **Faktiskt lättast är webb-prenumerationen**, därför att målet mäts i människor:
   33–50 hushåll (nåbart via vänkrets + två Facebookgrupper) mot 1 500–3 000
   (annonser) eller 30–45 nya köpare/mån i evighet (App Store). Pappersarbetet är
   en engångskväll — byggjobbet är mindre än Capacitor-spåret.
3. **App Store-engångsköpet är legitim plan B** (Apple sköter all betaladmin) och
   kan läggas till *senare* som extra kanal — men som enda väg är löpbandet skörare
   än 40 prenumeranter.
4. Roadmapens M-trappa står därmed kvar, med två förenklingar för "lättast möjligt":
   **hoppa över M4 (App Store) helt tills målet är nått på webben**, och håll M2
   minimal (en landningssida + vänfamiljernas facit räcker som beslutsunderlag —
   full fejkdörr-kampanj bara om vänkretsen tvekar).
5. *(Fotnot för fullständighet: den allra lättaste "vägen" är att sänka kostnaden —
   Max 5× i stället för 20×, eller Pro — men det är att flytta målet, inte nå det.)*

**Paywall-snittet (förslag):**
- **Gratis (medvetet basal, inte "generös"):** matsedel + inköpslista + 1 hushåll +
  X recept-imports/mån + listor. Syftet med gratisnivån är spridning och familje-
  inbjudningar — inte att vara bra nog att stanna på.
- **Premium (per hushåll, alla medlemmar — startar med 30 dagars full trial):**
  Prisoptimera-flödet, obegränsad import, kalender/hubb-features, portionsskalning,
  arkiv/historik. Trial-först eftersom det konverterar 8–9× bättre än ren freemium
  (avsnitt 3.3) och Matpriskollen-facit (3.1) dömer ut "gratis smakprov på prisdata".
- Dispatchen: familje-exklusiv (B1) tills partnerskap — säljs inte.

---

## 5. Realistisk framgångsanalys

### 5.1 Räkneexemplet som styr allt
Mål 5 000 kr/mån (meningsfull sidoinkomst) vid 39 kr/mån/hushåll:
- ≈ **128 betalande hushåll** (efter Stripe-avgift ~2 %+1,8 kr).
- Vid freemium-konvertering ~2 % (RevenueCat-median) ⇒ **~6 400 registrerade
  hushåll**; med trial-först-modell (~10 %) ⇒ **~1 300**. Därför trial, inte evig
  gratis-premium.
- Vid typisk aktiverings-tratt (nedladdning→aktiv ~30 %) ⇒ **tusentals hushåll ska
  hitta, prova och förstå appen.** Utan mediabudget = 1–2 års uthålligt innehålls-
  arbete, eller ett viralt genombrott (lotteri).
- Och intäkten läcker: **bara 23–40 % av årsprenumeranter förnyar år 2** — basen
  måste alltså återfyllas löpande bara för att stå still.

Kostnadstäckningsmålet (~750 kr/mån infra + 1 100 kr/år Apple) nås redan vid
**~20–25 betalande hushåll** — det är realistiskt via vänkrets + mun-till-mun +
en Facebookgrupp ("Matbudget-Sverige"-sfären är stor och aktiv).

### 5.1b Det beslutade målet: täcka Claude Code Max (Joakim 2026-07-10)
Claude Code Max kostar ~950 kr/mån (5×-planen, 100 USD) eller ~1 900 kr/mån
(20×-planen, 200 USD). Läggs kommersiell infra (~750 kr/mån, B4) ovanpå blir
självfinansieringsmålet:

| Post | 5×-planen | 20×-planen |
|---|---|---|
| Claude Code Max | ~950 kr/mån | ~1 900 kr/mån |
| Infra (Vercel Pro + Supabase Pro + domän/Apple) | ~850 kr/mån | ~850 kr/mån |
| **Att tjäna in** | **~1 800 kr/mån** | **~2 750 kr/mån** |
| Betalande hushåll à 39 kr/mån (netto ~37 kr) | **~49** | **~75** |
| — varav vid mix 50 % årsplan (299 kr/år ⇒ ~24 kr/mån netto) | ~59 | ~90 |

**✅ Beslutat 2026-07-11: planen är Max 20×** ⇒ det skarpa målet är höger­kolumnen:
**~2 750 kr/mån ≈ 75 betalande hushåll** (eller ~90 vid hälften årsplaner).

**Tolkning:** målet är nåbart utan viralt genombrott — 50–75 hushåll är
"vänkrets + två aktiva Facebookgrupper + mun-till-mun under ett år", inte en
marknadsföringsapparat. Men det är 2–3× över rena infra-brytpunkten, så M2:s
betalningsviljetest är fortfarande obligatoriskt innan betalkod byggs. Viktig
psykologisk detalj: Max-kostnaden finns redan i dag (hobbyn betalar den oavsett) —
varje betalande hushåll är alltså ren reduktion av en befintlig utgift, och
även ett *delmål* (t.ex. 25 hushåll = infra + halva Max) är en riktig vinst.

### 5.2 Sannolikhetsbedömning (subjektiv men motiverad)

| Utfall inom 18 mån | Sannolikhet | Främsta hinder |
|---|---|---|
| Familjen får bättre app av resan (M1-effekten) | ~95 % | — |
| Infra-täckning (~20 betalande) | **40–60 %** om M1–M3 genomförs | Uthållighet i M2-marknadsföringen |
| **🎯 BESLUTAT MÅL: Claude Max + infra (~50–75 betalande)** | **25–40 %** | Samma som ovan + kräver att mun-till-mun faktiskt bär förbi vänkretsen |
| Sidoinkomst 1–5 tkr/mån | **10–20 %** | Distribution (B5) + Willys-risk (B1) |
| Försörjning (>25 tkr/mån ≈ 650+ betalande) | **<2 %** | Allt ovan + konkurrens från gratis kedjeappar |
| Axfood-partnerskap/exit | ~5 % | Kräver bevisad bas + tur med timing |

### 5.3 Varför oddsen ändå är bättre än genomsnittsindien
1. Produkten finns och är polerad — 90 % av indie-projekt dör före denna punkt.
2. Marginalkostnad ~0 ⇒ gratis-tier kan vara generös utan att blöda.
3. Differentieraren (reor→middag→korg) är äkta och lätt att demonstrera på video.
4. Utvecklingskostnaden är ~0 kr (Claude kodar) — kalkylen som knäcker andra
   (utvecklartimmar) existerar inte här. Det enda som investeras är Joakims tid
   på marknadsföring/support och små infrakostnader.

### 5.4 Varför man ändå ska vara ödmjuk
Yummly (100 MUSD-förvärv), PlateJoy, Middagsfrid — alla döda. ICA:s gratisapp har
tusentals recept, hela sortimentet och noll pris. **Matpriskollen med 350 000
användare kunde inte sälja premium till konsument.** Smaklig och Nomi jagar samma
nisch med riskkapital-tålamod och gratis beta — de kan pressa förväntningen till
"sånt här ska vara gratis" innan Receptboken ens hunnit fram. Familjer byter ogärna
vanor, och "gratis och bra nog" slår ofta "bättre men 39 kr". Den ärliga slutsatsen:
**detta är värt att testa billigt och stegvis, inte värt att satsa stort på förhand.**

---

## 6. Roadmap — stegvis trappa med kill-kriterier

Principer: (1) **familjens instans påverkas aldrig** — varje steg är additivt och
reversibelt; (2) inget steg kräver att nästa genomförs; (3) varje grind har ett
mätbart kriterium — nås det inte: stanna, utan skam, med en bättre familjeapp som tröstpris.

### M0 — Beslut & fundament *(1 session + Joakims beslut)*
- [x] ~~Joakim väljer ambitionsnivå + tidsbudget~~ ✅ 2026-07-11: **Max 20× ⇒ mål
      ~2 750 kr/mån ≈ 75 hushåll; 2–5 h/vecka icke-kod** — kill-kriteriet passerat.
- [x] ~~Besluta Willys-hållning~~ ✅ 2026-07-11: enligt förslaget (reor i premium
      med öppen risk, dispatch familje-exklusiv).
- [ ] **Namnval (enda kvarvarande M0-punkten):** Joakim väljer ur kandidatlistan
      nedan (eller eget) + domänköp (~150 kr/år). Blockerar M2 (landningssidan),
      inte M1-bygget.

**Namnkandidater (2026-07-11, DNS-grovkollade — inga NS-poster = troligen ledig .se;
verifiera på internetstiftelsen.se före köp):**

| Kandidat | Karaktär |
|---|---|
| **veckoro.se** ⭐ | Kort, varumärkesbart, bär hela hubben (mat + listor + kalender = "ro i veckan"). Rimmar med kärnlöftet: slipp tänka. |
| **hemmaveckan.se** ⭐ | Varmt, familjebrett, beskriver produkten (allt hemma, en vecka i taget) |
| **veckoklar.se** ⭐ | Aktivt löfte ("veckan är klar"), funkar i marknadsföring ("Bli veckoklar på 2 minuter") |
| familjeveckan.se | Tydligt familjefokus, något längre |
| middagsveckan.se | Starkt för matdelen, smalare för hubben |
| matlugn.se / middagslugn.se | "Ro/lugn"-temat (middagsro.se var upptaget) |
| husmiddag.se | Mysigt men bara middag |
| reamiddag.se | Beskriver prisvinkeln exakt — men låser varumärket vid reor (B1-risk) |
| matrondellen.se | Lekfullt, minnesvärt, säger mindre |

*Upptagna (kollade): matro, middagsro, vardagsro, veckomat, middagsklar,
familjehubben, vardagshubben, matlyckan, veckovis, middagshjulet, veckotallriken,
matplaneraren, matveckan (befintlig konkurrent-app!).*

### M1 — Produktifiering light: 5 vänfamiljer, gratis *(4–8 sessioner, 0 kr)*
Syfte: bevisa att en familj som inte heter Weimar kan onboardas och **stannar**.
- [ ] **#6** JWT-härledd household i alla skrivande endpoints (tenancy-blockeraren).
- [ ] **#5** Willys-cookies gist → Supabase-tabell m. RLS (även utan dispatch-utrullning:
      städar bort kontobred PAT).
- [ ] Recept **privata per hushåll** (B2) + seed-paket av egna/testade recept.
- [ ] Inbjudningskoder + självbetjänad registrering (Supabase Auth är redo) +
      minimal onboarding (backlog #21-resten).
- [ ] Per-hushåll butiksval (#7-resten); hushåll utan Willys-koppling får appen
      utan prisoptimering (graceful, larmbanner-mönstret finns).
- [ ] Mät: veckoaktiva hushåll, genererade matsedlar/vecka (enkel `usage_events`-tabell).
- **Grind till M2:** ≥3 av 5 familjer genererar matsedel vecka 6. *(Retention är
  det enda som betyder något — inte vad de säger, utan vad de gör.)*

### M2 — Betalningsviljetest *(2–3 sessioner + Joakims marknadsföringstimmar, ~150 kr)*
Syfte: bevisa betalningsvilja **innan** betalkod byggs ("fejkdörr").
- [ ] Landningssida på egen domän: story = "veckans middagar efter veckans reor".
- [ ] Väntelista + prisfråga (29/39/49 kr/mån-varianter) + "Lås din plats"-knapp
      som mäter klick men inte tar betalt.
- [ ] Joakim/familjen postar i 3–5 relevanta FB-grupper + en demo-reel.
- [ ] GDPR-minimum för väntelistan (samtycke, radering).
- **Grind till M3:** ≥100 e-postadresser och ≥5 % klick på pris-knappen inom 8 veckor.

### M3 — Monetiserings-MVP: Stripe på webben *(4–6 sessioner, ~750 kr/mån)*
- [ ] Enskild firma + F-skatt (B7) — **före** första betalningen.
- [ ] Vercel Pro + Supabase Pro; betald Gemini-nyckel med tak.
- [ ] Stripe Checkout + kundportal; `subscriptions`-tabell; feature-flaggor
      (gratis/premium-snittet i avsnitt 4).
- [ ] Integritetspolicy, användarvillkor, ångerrätt; radera-mitt-konto-flöde.
- [ ] Skarp prissättning: 39 kr/mån / 299 kr/år per hushåll, **30 dagars full trial
      i stället för evig generös gratisnivå** (trial konverterar 8–9× bättre än
      freemium enligt RevenueCat 2026 — och Matpriskollen-facit säger att "gratis
      light-version av prisdata" aldrig konverterar).
- **Grind till M4:** ≥20 betalande hushåll inom 3 månader (= infra självfinansierad).
  **Slutmålet (beslutat 2026-07-10):** 50–75 betalande = Claude Max + infra täckta
  (kalkyl 5.1b); M4 körs bara om M3-kurvan pekar dit men inte når ända fram organiskt.

### M4 — Distribution & App Store *(6–10 sessioner + 1 100 kr/år + Mac-tillgång)*
- [ ] Capacitor enligt Fas 5A-analysen (fortsatt giltig; Mac-frågan öppen — #6 nedan).
- [ ] IAP-prenumeration på iOS (Small Business-programmet 15 % gäller fortfarande
      2026; EU/DMA-alternativen med externa betallänkar är möjliga men avgiftsbelagda
      och krångliga — inte värt det på denna volym). Google Play i EES: ~15 %
      effektivt med Play Billing, ~10 % med webblänk (nya reglerna juni 2026).
      Webb-Stripe förblir parallell huvudkanal (0 % butiksavgift).
- [ ] ASO + löpande innehåll (veckans reor-middag som organisk kanal).
- **Grind till M5/fortsättning:** betald tillväxt >churn tre månader i rad.

### M5 — Partnerskap (opportunistiskt, ingen egen tidslinje)
- Pitch till Axfood när basen är bevisad, eller som svar på kontakt från dem (B1).
  Dispatch-tekniken (redan Hemköp-PoC:ad!) är förhandlingskortet: den ökar deras
  e-handelskonvertering.

---

## 7. Spår Noll — det legitima alternativet
Om svaret på fråga #1 är "egentligen ingen": **gör ingenting av ovan.** Appen är
redan sin egen avkastning (familjenytta + lärande). Enda åtgärder värda att göra
ändå: #5–#6 (säkerhetshygien, städar PAT/gist oavsett) och ev. en tip jar om vänner
frågar. Detta är inte ett misslyckande — det är det rationella valet om tidsbudgeten
för icke-kod-arbete är noll, eftersom **B5 (distribution) inte kan automatiseras.**

---

## 8. Riskmatris (monetiseringsspecifik)

| Risk | Sannolikhet | Konsekvens | Mitigering |
|---|---|---|---|
| Axfood blockerar/varnar vid kommersiell drift | Medel (växer med synlighet) | Premium-kärnfeaturen degraderas | Larmbanner finns; premium får inte *enbart* vila på reor (bundla hubb-features); partnerspåret M5 |
| Upphovsrättsklagomål på recept | Låg–medel | Pinsamt + nedtagningskrav | B2-åtgärden i M1 (privata recept per hushåll) eliminerar i praktiken |
| Ingen betalningsvilja (M2 faller) | Medel–hög | Sluta vid M2 — total förlust ~150 kr + timmar | Fejkdörr före betalkod; kill-kriterium |
| Support äter kvällarna | Medel vid >50 hushåll | Motivationskollaps | Generösa tomlägen/felmeddelanden finns redan; FAQ; tak på antal hushåll tills det känns rätt |
| Apple avvisar Capacitor-appen (4.2) | Medel | M4 försenas | Offline+push byggs före submission (5A-planen); webben förblir primär kanal |
| Familjeappen försämras av multi-tenant-komplexitet | Låg | Hård regel bruten | Varje M-steg testgatat; `household_id`-scoping är redan mönstret; familjen = hushåll #1, inget specialfall |
| Free-tier-villkorsbrott före M3 (kommersiell drift på Hobby) | Låg | Vercel stänger av | M1–M2 tar inga pengar → Hobby OK; Pro köps i M3 innan första kronan |

---

## 9. Frågorna — ALLA BESVARADE av Joakim 2026-07-11

1. ✅ **Ambitionsnivå:** kostnadstäckning inkl. Claude Code Max. **Max-plan: 20×
   (200 USD/mån)** ⇒ skarpt mål **~2 750 kr/mån ≈ 75 betalande hushåll** (5.1b).
2. ✅ **Tidsbudget icke-kod: 2–5 h/vecka** — räcker för M1–M3-planen i lugn takt
   (vänfamiljer, landningssida, gruppinlägg, support). Spår Noll är därmed inaktuellt.
3. ✅ **Willys-riskaptit: ja, enligt förslaget** — reor-läsning ingår i premium med
   öppen degraderingsrisk; dispatchen/korgfyllningen förblir familje-exklusiv tills
   ev. partnerskap.
4. ✅ **Recepten: Claude grovmärker alla 264** (käll-URL, formuleringar, importhistorik)
   → Joakim godkänner listan (en kvällsgenomgång). Blir en M1-uppgift: `origin`-fält +
   märkningskörning + granskningslista.
5. ✅ **Företagsform: ja** — enskild firma + F-skatt registreras i M3, före första
   betalningen.
6. ✅ **Mac: ingen** — ett framtida M4 kräver moln-Mac (~350 kr/mån under byggperioden).
   Noterat; påverkar inget nu eftersom M4 är uppskjutet tills målet nåtts på webben.
7. ✅ **Namnet: Claude tar fram förslag** — kandidatlista med ledighetskoll finns i
   M0-avsnittet (6, M0); Joakim väljer. Ingen brådska — blockerar M2 (landningssida),
   inte M1.
8. ✅ **Vänfamiljer: väljs när M1 är byggd** — bygget startar först; minst en
   icke-teknisk familj rekryteras vid utrullning.

**Konsekvens: roadmapen är fullt beslutad.** Nästa konkreta steg är M1-bygget
(tenancy #5–#6, G1–G5 ur funktionsanalysen, recept-grovmärkningen) — startas när
Joakim säger till.

---

## 10. Källor & underlag
- `docs/marknadsanalys-2026-04.md` — marknadsstorlek, konkurrenter, klagomålsanalys (Session 24)
- `docs/research-teknisk-vag-app.md` — Fas 5A Capacitor-beslut, App Store-ekonomi (Session 28)
- `docs/plattform-familjehub-2026-07.md` — plattformsriktningen (2026-07-04)
- `docs/app-analys-backlog.md` — #5/#6/#7 tenancy-blockerare, #21 onboarding
- Live-data: Supabase (264 recept/22 testade/1 hushåll), `git log` (122 sessioner)
- Nattens webbresearch 2026-07-10 — källor listade nedan per påstående

**Webbkällor (research 2026-07-10):**

*Matpriskollen & svenska aktörer:*
- [Matpriskollen — appen](https://matpriskollen.se/ladda-ner-appen) · [aktuellt (350k användare)](https://matpriskollen.se/aktuellt)
- [Breakit — "Sålde ingenting": Matpriskollens premiumflopp](https://www.breakit.se/artikel/42582/ulf-mazurs-matpriskollen-okar-igen-trots-jattefloppen-salde-ingenting)
- [Dagens PS — Matpriskollens datainsamling](https://www.dagensps.se/privatekonomi/ny-app-hjalper-dig-att-hitta-lagsta-matpriserna/)
- [Smaklig — AI-veckomeny mot kampanjer](https://smaklig.app/) · [Nomi](https://hejnomi.se/) · [Matspar](https://www.matspar.se/)
- [Adtraction — Mat.se-affiliateprogram (7 %/5 %)](https://adtraction.com/se/annonsor/1123786744)

*Juridik (scraping/databasskydd):*
- [Lawline — databasskydd 49 § URL](https://lawline.se/answers/upphovsrattslagens-databasskydd-och-produktinformation)
- [Kluwer — Ryanair v PR Aviation C-30/14 (villkorsförbud mot scraping)](https://legalblogs.wolterskluwer.com/copyright-blog/ryanair-ltd-v-pr-aviation-bv-contracts-rights-and-users-in-a-low-cost-database-law/)
- [Fondia — TDM-undantaget & maskinläsbart förbehåll](https://fondia.com/se/sv/aktuellt/artiklar/raetten-att-traena-ai-system-pa-upphovsraettsligt-skyddat-material-pa-internet)
- [Lunds universitet — webbskrapning: svagt genomdrivbart skydd i praktiken](https://www.lu.se/lup/publication/9033376)

*Benchmarks & prisankare:*
- [RevenueCat — State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps/) · [trends & benchmarks](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/)
- [9to5Mac — årsprenumeranter förnyar sällan](https://9to5mac.com/2026/05/27/new-report-shows-annual-app-subscribers-rarely-return-after-they-cancel/)
- [Cozi Gold 39 USD/år](https://www.cozi.com/cozi-gold/) · [AnyList 14,99 USD/år hushåll m.fl. — jämförelse](https://weeklymealsplanner.app/guides/top-tier-meal-planning-with-the-best-recipes-to-grocery-list-app)
- [Lifesum Premium-priser](https://lifesum.com/sv/premium/) · [Matkompassen — HelloFresh per portion](https://matkompassen.se/matkassar/tjanster/hellofresh/pris-per-portion/)

*App Store-ekonomi:*
- [Apple Small Business Program (15 %)](https://developer.apple.com/app-store/small-business-program/) · [Apple DMA-villkor EU](https://developer.apple.com/support/dma-and-apps-in-the-eu/)
- [Android Developers Blog — Play-avgifter EES juni 2026](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html)

*GDPR & företagsform:*
- [IMY — det här gäller enligt GDPR](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/) · [registrerades rättigheter](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/)
- [Skatteverket — hobby vs näringsverksamhet](https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hobby.4.58d555751259e4d661680003940.html)
- [Stripe — enskild firma utan separat bolag](https://support.stripe.com/questions/selling-on-stripe-without-a-separate-business-entity) · [momsbefrielse under 120 tkr](https://stripe.com/resources/more/how-to-handle-vat-exempt-sales-as-a-sole-proprietor-in-sweden)

*Researchluckor (transparens):* Willys exakta villkorsklausul om automatiserad åtkomst
kunde inte maskinläsas (JS-renderad sida — läs manuellt före M3); Smakligs/Nomis
framtida prissättning obekräftad ("gratis under beta" per juli 2026); eEze/Snålkassen
hittades inte som aktiva tjänster.

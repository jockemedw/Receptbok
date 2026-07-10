# Monetiseringsanalys & roadmap — Receptboken/Familjehubben

*Sammanställd 2026-07-10 (nattsession på Joakims uppdrag). Bygger vidare på
`docs/marknadsanalys-2026-04.md` (Session 24), `docs/research-teknisk-vag-app.md`
(Fas 5A, Session 28) och `docs/plattform-familjehub-2026-07.md`.*

**Detta dokument är Fas 5C (kostnads-/intäktskalkyl + monetiseringsmodell) ur roadmapen —
plus en ärlig bedömning av om det överhuvudtaget är värt att göra.**

---

## 0. Kortversionen (TL;DR)

- **Appen har EN genuint unik och säljbar egenskap:** kedjan *reor → receptförslag →
  automatiskt fylld varukorg*. Ingen svensk app kombinerar matplanering med
  prisoptimering på riktiga butiksreor och autofylld korg. "Spara pengar på maten"
  är dessutom rätt budskap 2026.
- **Men den säljbara egenskapen vilar på det skakigaste fundamentet:** inofficiella
  Willys-endpoints + sessionscookies infångade via en egen browser-extension.
  Det är gråzon juridiskt för en *kommersiell* tjänst och omöjlig onboarding för
  massmarknad. Detta är monetiseringens kärnproblem — inte tekniken i övrigt.
- **Realistisk framgångsbedömning:** kostnadstäckning (~0–1 000 kr/mån) är sannolik
  om man försöker; sidoinkomst (1–5 tkr/mån) är möjlig men kräver uthålligt
  marknadsföringsarbete som ingen kan koda bort; försörjning är osannolik (<2 %).
  Problemet är inte produkten — det är **distribution** (att nå familjerna) och
  **innehållsrättigheter** (importerade recept får inte säljas vidare).
- **Rekommenderad väg:** en **stegvis trappa med kill-kriterier** — M1 (5 vänfamiljer,
  gratis, mäter retention) → M2 (landningssida + betalningsviljetest, fortfarande
  ingen betalkod) → M3 (Stripe på webben, freemium) → M4 (App Store) → M5 (Axfood-
  partnerskap, opportunistiskt). Varje steg är billigt, reversibelt och kan avbrytas
  utan att familjeappen påverkas. **Familjens instans förblir gratis och orörd — hård regel.**
- **Beslutet som styr allt** (öppen fråga #1): är målet kostnadstäckning, sidoinkomst
  eller produkt? Roadmapen är byggd så att M1–M2 är rätt oavsett svar.

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
  För en *betaltjänst*: sannolikt brott mot Axfoods användarvillkor, och vid synlig
  framgång är utfallen (a) IP-blockering, (b) advokatbrev, (c) partnerskapsinvit —
  i den ordningen sannolikast. Databasskyddet (sui generis, InfoSoc/databasdirektivet)
  ger Axfood formell hävstång även om rena prisuppgifter i sig inte är skyddade verk.
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

**B7 — Formalia.** Företagsform (enskild firma räcker initialt), F-skatt vid
näringsverksamhet, integritetspolicy/GDPR (registerutdrag, radering, biträdesavtal
med Supabase/Vercel/Stripe), konsumentköplagen (ångerrätt digitala tjänster).
Överkomligt men måste finnas **innan** första kronan.

---

## 3. Marknaden (uppdaterat juli 2026)

*Basen från april-analysen står sig: global marknad 1–2,5 mdr USD, ~12–13 % CAGR;
svensk betalningsvilja bevisad via matkassar (Cheffelo 1 188 MSEK 2025); kedjornas
gratisappar (ICA 4,6★, Coop) dominerar men är kedjelåsta; Yummly/PlateJoy/Middagsfrid
nedlagda = även finansierade aktörer faller på intäktssidan.*

### 3.1 Färska datapunkter (research 2026-07-10)

<!-- RESEARCH:START — fylls i från nattens research-agent -->
*(Se avsnitt 3.2–3.4 nedan; detaljerade källor sist i dokumentet.)*
<!-- RESEARCH:END -->

### 3.2 Närmaste förebilden: Matpriskollen
Svensk app som bevakar extrapriser/reor i matbutiker — beviset att nischen
"spara pengar på matreor" bär en svensk konsumentprodukt. Viktig skillnad:
Matpriskollen *visar* reor; Receptboken *omsätter reor i middagar och en korg*.
Det är ett steg längre upp i värdekedjan — men bygger på samma känsliga datakälla.

### 3.3 Benchmark för indie-prenumerationsappar
Tumregler som håller 2026: freemium-konvertering **2–5 %** för konsumentappar,
årschurn hög, och medianintäkten för indie-appar är nära noll — men nischappar med
tydlig pengaspar-story överpresterar. Räkneexempel längre ned (avsnitt 5).

### 3.4 Prisläge att förhålla sig till
ICA/Coop-apparna: gratis (finansierade av handeln). Cozi Gold ~449 kr/år.
Plan to Eat ~49 USD/år. AnyList ~10–15 USD/år. Matkassar 500–900 kr/vecka.
**Rimligt prisfönster för Receptboken: 29–49 kr/mån eller 249–399 kr/år per hushåll**
— under Cozi Gold, klart under matkassens veckopris, med "appen betalar sig själv
första veckan du handlar på rea" som ankare.

---

## 4. Monetiseringsmodeller — värdering mot just denna app

| Modell | Bedömning | Motivering |
|---|---|---|
| **Freemium-prenumeration per hushåll (webb-Stripe först)** | ✅ **Rekommenderad** | Gratis: planering+lista (bas). Premium: prisoptimering, familjehubb-extra, obegränsad import. Noll marginalkostnad gör gratis-delen ofarlig; Stripe på webben undviker Apples 15–30 % tills App Store-steget. |
| Engångsköp (39–79 kr) | ⚠️ Reserv | Enkelt, men ger inte löpande intäkt som täcker löpande infra; ingen naturlig plats utan App Store. Kan bli App Store-modellen i M4 om prenumeration känns fel där. |
| Donation/tip jar | ✅ Som komplement | Noll risk, noll friktion. Kan slås på redan i M1 (Ko-fi/Swish) för att mäta uppskattning. |
| Annonser | ❌ | Kräver tiotusentals användare; förstör UX:en som är säljargumentet; Yummly-läxan. |
| Affiliate mot butik | ❌ idag | Inga publika svenska program (ICA/Coop/Axfood). Bevakas — ändras detta blir det den naturliga modellen. |
| **B2B/partnerskap (Axfood/Willys)** | 🎯 Wildcard | Appen *driver korgar till Willys* — dispatchen ökar deras konvertering. En pitch "vi gör er reklamblads-app till en middagsplanerare" är inte orimlig, men kräver bevisad användarbas först. Rätt läge: efter M3, eller som svar om Axfood hör av sig (B1). |
| White-label till kommun/region (matsvinn) | 💤 Långskott | Matsvinnsstoryn (16 kg/person/år) kan bära offentliga pengar (Vinnova-spåret), men upphandlingsvärlden är ett eget yrke. Parkeras. |

**Paywall-snittet (förslag):**
- **Gratis:** matsedel + inköpslista + 1 hushåll + X recept-imports/mån + listor.
- **Premium (per hushåll, alla medlemmar):** Prisoptimera-flödet, obegränsad import,
  kalender/hubb-features, portionsskalning, arkiv/historik.
- Dispatchen: familje-exklusiv (B1) tills partnerskap — säljs inte.

---

## 5. Realistisk framgångsanalys

### 5.1 Räkneexemplet som styr allt
Mål 5 000 kr/mån (meningsfull sidoinkomst) vid 39 kr/mån/hushåll:
- ≈ **128 betalande hushåll** (efter Stripe-avgift ~2 %+1,8 kr).
- Vid 3–5 % freemium-konvertering ⇒ **2 500–4 000 registrerade, aktiva hushåll**.
- Vid typisk aktiverings-tratt (nedladdning→aktiv ~30 %) ⇒ **~10 000 hushåll ska
  hitta, prova och förstå appen.** Utan mediabudget = 1–2 års uthålligt innehålls-
  arbete, eller ett viralt genombrott (lotteri).

Kostnadstäckningsmålet (~750 kr/mån infra + 1 100 kr/år Apple) nås redan vid
**~20–25 betalande hushåll** — det är realistiskt via vänkrets + mun-till-mun +
en Facebookgrupp ("Matbudget-Sverige"-sfären är stor och aktiv).

### 5.2 Sannolikhetsbedömning (subjektiv men motiverad)

| Utfall inom 18 mån | Sannolikhet | Främsta hinder |
|---|---|---|
| Familjen får bättre app av resan (M1-effekten) | ~95 % | — |
| Kostnadstäckning (~20 betalande) | **40–60 %** om M1–M3 genomförs | Uthållighet i M2-marknadsföringen |
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
tusentals recept, hela sortimentet och noll pris. Familjer byter ogärna vanor, och
"gratis och bra nog" (ICA) slår ofta "bättre men 39 kr". Den ärliga slutsatsen:
**detta är värt att testa billigt och stegvis, inte värt att satsa stort på förhand.**

---

## 6. Roadmap — stegvis trappa med kill-kriterier

Principer: (1) **familjens instans påverkas aldrig** — varje steg är additivt och
reversibelt; (2) inget steg kräver att nästa genomförs; (3) varje grind har ett
mätbart kriterium — nås det inte: stanna, utan skam, med en bättre familjeapp som tröstpris.

### M0 — Beslut & fundament *(1 session + Joakims beslut)*
- [ ] Joakim väljer ambitionsnivå (öppen fråga #1) och tidsbudget (#2).
- [ ] Namnkoll: "Receptboken" är generiskt/upptaget — arbetsnamn + ledig .se-domän
      (t.ex. i familjehubb-riktningen; domän ~150 kr/år är enda kostnaden i M0).
- [ ] Besluta Willys-hållning (öppen fråga #3): reor-läsning kvar som premium-feature
      med öppen risk, dispatch förblir familje-exklusiv.
- **Kill-kriterium:** vill Joakim inte lägga ≥2 h/vecka på icke-kod (support,
  marknadsföring) → välj *Spår Noll* (avsnitt 7) i stället.

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
- [ ] Skarp prissättning: 39 kr/mån / 299 kr/år, 30 dagars gratis premium.
- **Grind till M4:** ≥20 betalande hushåll inom 3 månader (= infra självfinansierad).

### M4 — Distribution & App Store *(6–10 sessioner + 1 100 kr/år + Mac-tillgång)*
- [ ] Capacitor enligt Fas 5A-analysen (fortsatt giltig; Mac-frågan öppen — #6 nedan).
- [ ] IAP-prenumeration på iOS (Small Business 15 %) parallellt med webb-Stripe.
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

## 9. Öppna frågor till Joakim (ingen åtgärd tagen — bara planerad)

1. **Ambitionsnivå?** (a) Spår Noll, (b) kostnadstäckning, (c) sidoinkomst, (d) produkt.
   Roadmapen antar (b)–(c); M1 är rätt även för (a) light (säkerhetshygienen).
2. **Tidsbudget för icke-kod?** Marknadsföring/support är det enda Claude inte kan
   göra åt dig varje vecka. <2 h/v ⇒ Spår Noll är ärligast.
3. **Willys-riskaptit:** OK att premium delvis vilar på inofficiella endpoints med
   öppen degraderingsrisk? (Roadmapens antagande: ja för reor-läsning, nej för dispatch.)
4. **Vilka av de 264 recepten är genuint egna** (får seedas till nya hushåll) vs
   importerade (måste förbli privata)? Grov märkning räcker (fält finns ej — liten migration).
5. **Företagsform:** bekväm med enskild firma + F-skatt i M3? (Alternativ: vänta med
   betalning tills hobbygränsen är utredd — researchnoten nedan.)
6. **Mac-tillgång för M4?** (Capacitor/iOS kräver Xcode — egen Mac, lånad, eller
   moln-Mac ~350 kr/mån.)
7. **Namnet:** förslag önskas? (Kravet: ledigt .se, funkar för "familjehubb", inte
   bara recept.)
8. **Får vänfamiljerna i M1 väljas nu?** 3–5 stycken, gärna en utan teknikintresse
   (bästa testet av onboardingen).

---

## 10. Källor & underlag
- `docs/marknadsanalys-2026-04.md` — marknadsstorlek, konkurrenter, klagomålsanalys (Session 24)
- `docs/research-teknisk-vag-app.md` — Fas 5A Capacitor-beslut, App Store-ekonomi (Session 28)
- `docs/plattform-familjehub-2026-07.md` — plattformsriktningen (2026-07-04)
- `docs/app-analys-backlog.md` — #5/#6/#7 tenancy-blockerare, #21 onboarding
- Live-data: Supabase (264 recept/22 testade/1 hushåll), `git log` (122 sessioner)
- Nattens webbresearch 2026-07-10 — källor listade nedan per påstående

<!-- KÄLLOR-RESEARCH:START -->
*(fylls i av nattens research)*
<!-- KÄLLOR-RESEARCH:END -->

# Konkurrens- & funktionsanalys — vad andra appar kan som Receptboken bör ta in

*Sammanställd 2026-07-10 (Session 124), på Joakims uppdrag: "analysera konkurrensen
och sammanfatta alla funktioner de erbjuder som bör integreras i min app."
Komplement till `docs/monetisering-roadmap-2026-07.md` (mål: ~50–75 betalande
hushåll = Claude Code Max + infra täckta). Research: två agenter (svenska +
internationella appar), ~60 källor, juli 2026.*

**Läsanvisning:** avsnitt 1–2 är rå funktionsinventering (referens). Avsnitt 3 är
själva svaret — gap-listan, prioriterad mot målet. Avsnitt 4 är det vi medvetet
INTE ska bygga.

---

## 1. Internationella appar — funktionsinventering

### 1.1 Jow (FR/US) — den viktigaste förebilden
Gratis för användaren; >85 % av intäkterna är korgprovision från partnerbutiker
(~8–9 M användare). **Exakt samma kedja som Receptboken: recept → mängdräknad
varukorg → butik.** Skillnaden: Jow har avtal, Receptboken har cookies.
- Onboarding frågar hushållsstorlek, **köksutrustning** (ugn? airfryer?), smak/diet,
  mål → personlig receptkatalog
- Veckomeny föreslås automatiskt, användaren byter/tar bort
- "Smart cart": exakta mängder per hushåll, skafferivaror kan adderas i samma korg,
  säljs som anti-svinn ("köp bara det du behöver")
- Justerbara portioner uttalat för att planera **rester som lunchlådor**
- Steg-för-steg + videotutorials; budgetmeny-läge; "spara ~10 % på maten, 2,5 h/vecka"
- Friktion (recensioner): hoppet till butikens checkout känns "muddy" — Receptbokens
  dispatch är faktiskt *smidigare* än förebildens

### 1.2 Mealime
- Setup: diet, **12 allergier, 124 ingrediens-nivå-"dislikes"** ("200+ personaliseringsval")
- **Cook mode handsfree:** håll handen över skärmen för nästa steg (kladdiga händer)
- [PREMIUM $2,99/mån]: näringsinfo, kalorifilter, egna receptanteckningar,
  **se tidigare matsedlar**, veckans Pro-recept

### 1.3 Plan to Eat ($49/år, ingen gratisnivå)
- Dra-och-släpp-kalender med **måltidsslots** (frukost/lunch/middag); månadssvy
- **Återanvändbara menyer** — spara en veckas plan, släpp in igen
- **Staples-lista:** ofta köpta varor, klicka in på inköpslistan
- **Freezer-funktion:** logga infrysta rätter med antal + datum; "laga dubbelt,
  frys hälften"; plocka från frysen in i planen
- Listor per butik; delning av recept/menyer/listor med familj

### 1.4 Paprika (engångsköp ~5 USD)
- Inbyggd browser-import från valfri receptsajt
- **Pantry med utgångsdatum; pantry-varor avmarkeras automatiskt på inköpslistan**
- Matlagningsläge: skärmen släcks inte, **klickbara koktider startar timer**
- Svaghet: ingen riktig familjedelning (delat konto som workaround)

### 1.5 AnyList (gratis + Complete 14,99 USD/år för hushåll)
- **Kategoriordning per butik** som matchar butikens layout
- **Favoriter** (tap-to-add av ofta köpta) + **"recently crossed off"** (lägg
  tillbaka nyss avbockade)
- Notis/foto per vara (märke, exakt variant); platspåminnelser; Siri/Alexa-röst;
  hemskärms-widgets
- [PREMIUM]: webb-åtkomst, Apple Watch, budget, butiksspecifika ordningar

### 1.6 Samsung Food (fd Whisk)
- **Receptimport från TikTok/Instagram/Pinterest via share-knappen — AI läser
  även video utan skriven text**
- AI-anpassning: "gör vegetariskt", byt ingrediens — allt räknas om
- [PREMIUM Food+ 59,99 USD/år]: 7-dagars AI-matsedlar, näringsspårning,
  **Vision AI: fota kylen → ingredienser identifieras → receptförslag på det du har**

### 1.7 Eat This Much (premium ~5 USD/mån vid årsköp)
- Automatisk plan utifrån mål; olika mål per veckodag
- **Leftovers-logik i genereringen: söndagens middag schemaläggs som måndagens
  lunch; egna rest-mönster ("laga 1 gång, ät 3")**
- **Veckoplan + inköpslista mailas automatiskt innan veckan börjar** (retention-mekanik)

### 1.8 Cozi (gratis + Gold 39 USD/år)
- Färgkodad familjekalender; måltider i samma vy som barnens aktiviteter;
  **markerar dagar med fullbokat schema** ("planera de hektiska dagarna enkelt")
- **Cozi Today / dagligt agenda-mail till alla familjemedlemmar med dagens schema +
  middag** — deras starkaste retention-mekanik
- [GOLD]: Shopping Mode (bockade sjunker ner — Receptboken har redan detta!),
  månadsvy, födelsedagsspårning, ändringsnotiser
- [MAX]: AI Event Import (inbjudan→kalender), AI Recipe Creator

### 1.9 BigOven
- **"Use Up Leftovers": ange upp till 3 rest-ingredienser → receptförslag** (gratis, klassikern)
- RecipeScan: handskrivna receptkort digitaliseras (kreditbaserat, långsamt —
  Receptbokens Gemini-fotoimport är redan bättre)

### 1.10 SuperCook (helt gratis)
- Pantry med 2 000+ ingredienser, **röstinmatning** ("öppna kylen och rabbla")
- Visar **enbart recept du kan laga nu**; "nästan-matchningar" (1 vara saknas)

### 1.11 Flipp + eMeals (deals-nischen)
- **Flipp:** lägg valfri vara på listan → bästa pris per butik matchas automatiskt;
  **notis när en bevakad vara får rea** (watchlist — direkt jämförbar med
  Prisoptimera); kuponger + lojalitetskort
- **eMeals (4,99–12,49 USD/mån):** middagsplaner **byggda runt enskilda kedjors
  veckoreor** (redaktionellt, inte algoritmiskt — Receptboken gör det algoritmiskt);
  listan skickas till Walmart/Kroger/Instacart; "~2 000 USD/år besparing" som pitch

### 1.12 Tvärgående mönster (internationellt)
- **Retention:** auto-genererad veckoplan som mailas/notifieras (Eat This Much,
  eMeals, Jow) · dagligt agenda-mail (Cozi) · deal-notiser på bevakade varor (Flipp)
- **Betalväggs-standard:** näringsinfo/makron ligger bakom premium nästan överallt;
  likaså plan-historik, webb/watch-åtkomst, månadsvy
- **Helt gratis är korg-/annonsfinansierat:** Jow (korgprovision), SuperCook, Flipp

---

## 2. Svenska appar — funktionsinventering

### 2.1 ICA-appen (gratis, Stammis-konto)
- Recept: tusentals, favoriter, samlingar; **"Skaka fram recept"** (slumpat förslag);
  "Laga läge" (ingredienser + steg sida vid sida, skärmen släcks inte)
- **Rea-koppling i receptvyn:** visar direkt om en ingrediens är på erbjudande
- Inköpslista (styrkan): delas i realtid inom Stammis-kontot; **sortering efter
  varornas placering i din favoritbutik**; streckkodsscanning; **"minns vad du
  brukar köpa" + påminner om sällanköpsvaror**; synkas till självscanningshandtaget
- Personliga erbjudanden (köphistorik), klipp-kuponger, bonuspoäng
- E-handel: recept → varukorg; "Smart shop" fyller korgen med det du brukar köpa
- **Ingen automatgenererad matsedel** — bara redaktionella veckomenyer

### 2.2 Coop-appen (gratis, medlemskonto)
- **Scan & Pay** i butik (köfritt, Swish); scanna varor hemma → inköpslistan
  ("kylskåps-AI" föreslår mängd utifrån konsumtionsmönster); allergener vid scanning
- Poäng + Poängshop (stark återkomstmekanik); personliga erbjudanden
- **Nya Matkassen (SmakShare + Northfork):** flexibel matkasse utan abonnemang —
  egen veckomeny, pris per portion, recept matchas till Coops sortiment

### 2.3 Arla Mat/Köket (helt gratis)
- 5 000–6 500 recept; egen veckomatsedel med noteringar + 2 redaktionella
  veckomenyer/vecka; näringsvärde per portion; timer per receptsteg
- **Gamification (dec 2025): räknare för lagade recept + "din utveckling som
  hemmakock"** + historik; personaliserad startsida; dagliga middagstips-notiser
- Inga pris-/familjefunktioner

### 2.4 Tasteline
22 000+ recept, redaktionella veckomenyer per tema — men appen är i praktiken
vilande; ingen generering, prisdata eller delning. Inte längre en rörlig konkurrent.

### 2.5 Smaklig (smaklig.app) — närmaste konkurrenten, gratis under beta
- **AI-veckomeny (7 recept, ~30 sek) från veckans kampanjer i vald butik:**
  ICA, Coop, Hemköp, City Gross, Lidl, **Willys**
- Onboarding: **14 allergener (server-side hårdfilter, säljs som säkerhetskritiskt)**,
  kostpreferenser, näringsmål
- **"Sous-chefen": tweaka recept i fritext** ("utan sparris", "3 portioner") →
  meny + lista räknas om
- **Kostnad per portion** per recept; "protein per krona"-jämförelse; näringsspårning
- Sparande-claim 150–250 kr/vecka; matsvinnsvinkel; SEO-landningssidor som funnel
- **Ingen familjedelning/multi-användare** — lucka Receptboken redan fyller

### 2.6 Nomi (hejnomi.se) — gratis under beta
- AI-veckomeny (5 middagar) på kampanjpriser ICA/Coop/**Willys**; alternativ:
  **fota reklambladet → AI:n scannar priserna** (löser datatillgång utan avtal!)
- Allergener "blockerade djupt i systemet"; **lär sig per familjemedlem** (ensam
  om det); **skafferi: ange vad du har hemma → räknas bort ur inköpslistan**

### 2.7 Matpriskollen (helt gratis, ingen inloggning)
- **Bevakningar med push:** lägg bevakning på en vara → notis när den kampanjas
  i dina valda butiker (deras starkaste återkomstmekanik)
- **"Priskollen":** scanna streckkod → varans pris i andra butiker + ordinarie
  pris (avslöjar fejkreor); **varukorgsjämförelse** mellan butiker (≥5 varor)
- Rea → recepttips (från Arla Mat) via gryt-ikon; delbar inköpslista

### 2.8 Lifesum (Premium ~149 kr/mån)
Individcentrerad hälsoapp: måltidsplaner + inköpslista bara i vissa premiumplaner,
AI-fotologgning, makron. Ingen prisdata/familj — annan kategori, bevisar bara
svensk betalningsvilja för mat-appar.

### 2.9 Övriga svenska (kort men viktiga)
- **SmartaMenyn (smartamenyn.se): TAR BETALT — gratis provperiod → två betalplaner
  via Stripe.** AI-veckomeny från erbjudanden (ICA, Coop, Hemköp, Lidl); "matprofil";
  byt enskilda rätter; favoritrecept återanvänds; **inköpslista sorterad per butik
  med pris per vara**; login via magisk länk. *Beviset att någon vågar ta betalt i
  nischen — korrigerar roadmapens "ingen tar betalt".*
- **Matlistan:** klassiska svenska inköpslistan — röst-, fritext- och EAN-inmatning;
  automatisk butikssortering; receptimport från alla svenska receptsajter;
  **länkade familjekonton med live-avbockning**; offline-läge i butik
- **SmakShare:** spara recept från **Instagram/TikTok**/bloggar; auto-taggning;
  premium-vägg: smart inköpslista + matplan; recept → coop.se-varukorg via Northfork
- **MatVeckan:** familjeveckomeny + lista sorterad efter butikens gångar
- **Plantry / Middax:** veckomeny-lightappar (svajpa förslag, slumpvecka,
  multipla timers, Safari-import)

### 2.10 Tvärgående mönster (Sverige)
- **Butiksspecifik gångordning på listan är svensk standard** (ICA, Matlistan,
  MatVeckan, SmakShare, SmartaMenyn) — Receptboken saknar den
- **Rea-bevakningsnotiser** är Matpriskollens/Flipps starkaste återkomstmekanik —
  Receptboken har datat men inte notisen
- **Skafferiavdrag i listan** finns bara hos Nomi (och Receptboken! — #13 är byggd)
- **Ingen svensk tredjepartsapp fyller varukorg hos Willys** — ICA Smart shop och
  SmakShare→Coop finns, men Willys-dispatchen är fortsatt unik
- **Alla AI-utmanare kör "gratis under beta"** som förvärvsstrategi; bara
  SmartaMenyn har skarp betalvägg

---

## 3. GAP-ANALYS — funktioner att integrera, prioriterade mot målet

Baslinje — det Receptboken **redan har** och som andra tar betalt för eller saknar:
reor→recept-generering (Smaklig/Nomi/SmartaMenyn:s kärna), Willys-korgfyllning
(ingen tredjepartsapp har det), skafferiavdrag i listan (bara Nomi i övrigt),
handla-läge med sjunkande bockade varor (Cozi **Gold**-feature), portionsskalning,
delade familjelistor + anteckningar (ingen svensk matapp har anteckningar),
fotoimport via Gemini (bättre än BigOvens krediter), mörkt tema, drag-omordning.
Utgångsläget är alltså starkt — gapen nedan är det som saknas för *främlingar*
(onboarding), *återkomst* (retention) och *förväntad standard*.

### P1 — Krävs innan externa hushåll (hör till roadmapens M1)

| # | Funktion | Förebild | Varför | Insats |
|---|---|---|---|---|
| G1 | **Allergen- & ogilla-filter i genereringen** (hårdfilter server-side + ingrediensnivå-"dislikes") | Smaklig (14 allergener, "säkerhetskritiskt"), Mealime (124 dislikes), Jow | Familjen Weimar behövde det aldrig — främlingar har allergier dag 1. Utan det är appen oanvändbar för många hushåll. Kräver allergen-taggning av recepten (engångsjobb, Gemini kan grovmärka + manuell koll på seed-recepten) | Medel–stor |
| G2 | **Onboarding-wizard** (hushållsstorlek, butik, allergier, proteiner, ev. utrustning) | Jow (guld­standard), Smaklig | Dagens app förutsätter Joakims inställningar. Wizard = första intrycket för varje ny familj; återanvänd genereringsguidens sheet-mönster | Medel |
| G3 | **Receptbilder** (+ käll-URL vid import) | Alla (ICA, Arla, Jow …) | Enda visuella gapet mot butiksklass; redan backlog #17. Bilder på seed-recepten räcker till start | Medel |
| G4 | **Magisk länk-login** | SmartaMenyn, Matlistan | Lösenord är onödig friktion vid onboarding; Supabase Auth har OTP/magic link inbyggt | Liten |
| G5 | **Butiksspecifik gångordning på inköpslistan** | ICA, Matlistan, MatVeckan, AnyList (premium), SmartaMenyn | Svensk standard — förväntas av alla som handlat med ICA-appen. Enkel variant: användaren drar kategoriordningen per butik (drag-infran från S122 finns redan!) | Liten–medel |

### P2 — Retention & premiumvärde (hör till M2–M3; det som får 50–75 hushåll att STANNA)

| # | Funktion | Förebild | Varför | Insats |
|---|---|---|---|---|
| G6 | **Rea-bevakningar med notis** ("bevaka kycklingfilé → mejl/push när den är på rea på din Willys") | Matpriskollen (deras #1-mekanik), Flipp watchlist | Kräver bara befintlig offers-feed + canon-lexikon + en bevakningstabell. **Den enskilt starkaste återkomstmekaniken i hela inventeringen**, och ett självklart premium-argument | Medel |
| G7 | **Veckodigest via mejl** ("söndag: dags att planera — veckans 5 bästa reor på din butik" / "ikväll: köttfärssås") | Cozi Today (daglig agenda), Eat This Much (veckoplan mejlas) | Mejl är den enda kanalen utan app-installation; drar tillbaka användare varje vecka. OBS: *föreslår*, genererar inget — bryter inte "ingen automatisk generering" | Medel |
| G8 | **"Laga på det du har"** — receptförslag från skafferiet + minsta kompletteringsköp | SuperCook, BigOven (3 rester), Nomi, Samsung Food Vision AI | Skafferimodellen (#13) + match-infran finns; detta är en ny vy ovanpå. Stark matsvinns-story (16 kg/person-argumentet) för marknadsföringen | Medel |
| G9 | **Rest-logik i planen** ("laga dubbelt söndag → rester tisdag") | Eat This Much (auto-schemalagda rester), Plan to Eat (frysfunktion), Jow (lunchlådor) | Backlog #14 finns redan; Eat This Much visar den färdiga modellen. Sparar riktiga pengar → stärker besparings-pitchen | Medel |
| G10 | **Pris per portion / "veckan kostar ca X kr"** | Smaklig, Coop Matkassen, Jow | Reor-datat + portioner finns; även grov skattning (reavaror exakt, resten schablon) gör besparingen konkret. Marknadsföringsguld ("middag från 25 kr/portion") | Liten–medel |
| G11 | **Middagsbetyg per familjemedlem** | Nomi (ensam om per-medlem), Cozi Max AI | Redan planerad (M6/#16) — höj prioritet: det är Fas 2-datakällan OCH en daglig mikrointeraktion | Liten (UI) |

### P3 — Differentierare & polish (efter M3, väljs efter användarfeedback)

| # | Funktion | Förebild | Varför | Insats |
|---|---|---|---|---|
| G12 | **Import från TikTok/Instagram via dela-menyn** | Samsung Food (video-AI), SmakShare | Målgruppen (25–40) hittar recept i flödet; PWA share target + Gemini på länk/bildtext. Video-transkribering = senare | Medel |
| G13 | **Favoriter/"brukar köpa" på inköpslistan** (tap-to-add + nyss avbockade tillbaka) | AnyList, ICA ("minns vad du brukar köpa") | Data finns i shopping-historiken; ren frontend-vinst | Liten |
| G14 | **Hemköp som andra butik** | Smaklig/Nomi (flera kedjor) | PoC:en är redan verifierad (2026-06-23); breddar målgruppen bortom Willys-hushåll | Medel |
| G15 | **Slumpa-fram-middag-gest** ("skaka fram" / snurra) | ICA, Middax | Billig glädje-feature; slumpmotorn finns | Liten |
| G16 | **Röstinmatning på listan** | Matlistan, AnyList (Siri), SuperCook | Web Speech API; bra i köket med kladdiga händer | Liten–medel |
| G17 | **Handsfree-bläddring i matlagningsläget** (vift med handen / stort tryckmål) | Mealime cook mode | Matlagningsläget finns; gör det köksvänligare | Liten |
| G18 | **Gamification light** ("X middagar lagade, Y kr sparade totalt") | Arla (hemmakock-utveckling) | Ackumulerad besparing är Receptbokens naturliga "poäng" — `savingMatches` sparas redan | Liten |

**Sekvensering mot monetiseringsroadmapen:** M1 = G1–G5 (utan dem går inga
främlingar att släppa in) · M2/M3 = G6–G11 (det som motiverar 39 kr/mån och håller
churnen nere — notera att G6+G7+G10 tillsammans ÄR premium-pitchen "appen bevakar
priserna och planerar veckan åt er") · efter M3 = G12–G18 i den ordning användarna
skriker efter dem.

---

## 4. Medvetet INTE — funktioner vi avstår och varför

| Funktion (finns hos) | Varför vi avstår |
|---|---|
| **AI-generering i runtime** (Smaklig, Nomi, SmartaMenyn, Cozi Max) | Deterministiskt urval är vallgraven: 0 kr marginalkostnad medan konkurrenterna betalar per genererad meny. Deras svar på skalning är vår gratislunch. AI stannar i importen (låg volym). |
| **Näringsinfo/makron** (premium-standard: Mealime, BigOven, Samsung Food, Lifesum) | Stort datajobb (näringsdata per ingrediens), fel målgrupp — familjen vill ha middagsro, inte makron. Ompröva bara om betalande användare ber om det. |
| **Poäng/bonus, self-scan, egen e-handel** (ICA, Coop) | Kedjornas hemmaplan — kräver deras data/avtal. Konkurrera inte där de är starkast. |
| **Community/receptdelning offentligt** (BigOven, Samsung Food, SmakShare) | Moderationsbörda + upphovsrättsrisk (B2 i roadmapen). Familjeprivat är en feature, inte en brist. |
| **Fota kylen-AI / streckkodsscanning av varor** (Samsung Food Vision, Coop) | Gimmick-kvot hög, AI-kostnad per användning, skafferilistan löser samma behov manuellt. |
| **Egen kalendermotor** (Cozi) | Redan beslutat (P3): läs familjens befintliga kalender via ICS — bygg inte dubbelbokföring. |
| **Prishistorik/fejkrea-avslöjande** (Matpriskollen) | Kräver longitudinell prisdatabas (deras 15-årsförsprång). Vi *använder* reor, vi *arkiverar* dem inte. |

---

## 5. Sammanfattning

Receptboken står sig förvånansvärt väl: kärnkedjan (reor→recept→korg) är fortfarande
ensam i Sverige, och flera "premium-features" hos konkurrenterna (handla-läge,
skafferi, familjelistor, portionsskalning) är redan byggda och gratis. Gapen är
koncentrerade till tre områden: **(1) främlings-beredskap** (allergier, onboarding,
bilder — G1–G5), **(2) återkomstmekanik** (bevakningsnotiser, veckodigest,
laga-på-det-du-har — G6–G11), **(3) svensk standard-polish** (butiksgångordning).
Prioriteringen ovan är sekvenserad rakt in i monetiseringsroadmapens M-faser.

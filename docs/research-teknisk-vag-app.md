# Teknisk väg till App Store — Receptboken
*Sammanställd 2026-04-16, Session 28*

---

## 1. Executive Summary och rekommendation

**Rekommendation: Capacitor (Fas 5A)**

Av de tre utvärderade vägarna är Capacitor det enda alternativet som uppfyller samtliga icke-förhandlingsbara krav: App Store-godkännande på iOS *och* Android, bevarad GitHub-som-databas-arkitektur (via befintlig Vercel-backend), minimal omskrivning, och trovärdig offline-upplevelse.

PWA-vägen blockeras av Apple — inget sätt att lista en ren PWA i App Store finns 2026, och en "Add to Home Screen"-lösning ger inte den legitimitet och synlighet som krävs för monetisering. Mot Google Play fungerar PWA via TWA men kräver ändå kodning, och halvlösningen (Google Play OK, iOS inte alls) är kommersiellt ointressant.

React Native kräver en fullständig omskrivning av frontend — uppskattningsvis 8–16 veckor — och den vinst det ger (bättre native UX) motiveras inte av produktens nuvarande skede. Det är rätt väg om Fas 5B–5C pekar mot multi-tenant SaaS med hög omsättning, men för ett familje-MVP är det överdrivet.

**Viktigt förbehåll:** Beslutet om Capacitor vs React Native kan inte göras slutgiltigt förrän Fas 5C (monetiseringsmodell) är beslutad. Se avsnitt 5.

---

## 2. Jämförelsematris

| Dimension | PWA | Capacitor | React Native |
|---|---|---|---|
| **Migreringskostnad** | 1–2 v (Google Play via TWA) / omöjlig (iOS App Store) | 2–4 veckor | 8–16 veckor |
| **Datalagring bevarad** | Ja (Vercel-backend orörd) | Ja (Vercel-backend orörd) | Ja (Vercel-backend orörd), men kräver auth-refaktor om multi-user |
| **iOS App Store** | Nej — ren PWA accepteras inte | Ja — kräver native-känsla (offload, push, navigation) | Ja |
| **Google Play** | Ja — via TWA (Bubblewrap/PWABuilder) | Ja | Ja |
| **Betallösningar** | Stripe direkt (webb) | Stripe på Android fritt; Apple IAP krävs på iOS för digitala varor (EU: alternativ möjligt med komplex fee-struktur) | Samma som Capacitor |
| **Offline-stöd** | Service Worker (god, men Safari evikterar data efter 7 dagar inaktivitet) | Service Worker + Capacitor Preferences + Network plugin (robust) | AsyncStorage + NetInfo (robust, men kräver omskrivning av datahämtning) |
| **Push-notiser** | Kräver manuell Home Screen-installation på iOS; 10–15× lägre opt-in | Firebase FCM + APNs via @capacitor-firebase/messaging (standardmetod) | Firebase FCM + APNs (standardmetod) |
| **Antal kodbaser** | 1 (web = allt) | 1 (delad web-kod + native shell) | 2 (RN-app + web förblir separat) |
| **Underhållsbörda** | Låg | Låg–medel (Capacitor-uppgraderingar, iOS/Android-certifikat) | Hög (två kodbaser, RN-versionsbrytningar) |

---

## 3. Djupdyk per väg

### 3A. PWA — Progressive Web App

#### Vad är det
Appen serveras som vanlig webbsida. Användaren läggs till på hemskärmen via "Add to Home Screen" (iOS/Android) eller laddas ned direkt från Google Play via Trusted Web Activity (TWA).

#### Migreringsarbete från Receptbokens nuläge
Receptboken är redan en fungerande webbapp. Att göra den till en installable PWA kräver:
- `manifest.json` (app-namn, ikoner 192px och 512px, `display: standalone`)
- Service Worker med cache-strategi (t.ex. via Workbox — ~1 dag att sätta upp)
- HTTPS — redan uppfyllt via Vercel
- Lighthouse-poäng ≥80 — troligen uppfyllt redan

**Google Play via TWA:** Kör sedan Bubblewrap CLI eller PWABuilder för att generera ett Android App Bundle (AAB). Digital Asset Link-fil läggs på `.well-known/assetlinks.json` på Vercel. Totaltid: 1–2 veckor inklusive Google Play-granskning (~5 dagar).

**Apple App Store: Blockerat.** Apple avvisar appar som enbart är webbladdare (Guideline 4.2). Ingen TWA-ekvivalent finns på iOS. En ren PWA kan installeras via "Lägg till på hemskärmen" utan App Store, men det ger ingen synlighet, ingen betalningsfunktionalitet via IAP, och noll trovärdighet för monetisering.

#### Data-layer: Orörd
Vercel-backend och GitHub-som-databas förblir exakt som idag. Appen anropar `/api/generate` m.fl. via vanliga fetch-anrop.

#### Kritiska begränsningar
- **Safaris 7-dagars eviktionsregel:** Safari tömmer all PWA-lagrad data (localStorage, IndexedDB, Cache API) efter 7 dagars inaktivitet. För Receptboken innebär det att offline-cacheade recept, matsedel och inköpslista kan försvinna. Källorna bekräftar att ingen workaround existerar (2026).
- **Push-notiser:** Fungerar på iOS 16.4+ men kräver att användaren manuellt installerat appen via hemskärmen, inte bara öppnat webbsidan. Opt-in-frekvens är 10–15× lägre än native-appar.
- **Ingen iOS App Store-distribution** — fatalt för Fas 5 (monetisering, legitimitet).

#### Slutsats om PWA
Lämpligt som komplement (Google Play-distribution gratis för befintliga användare), inte som primär App Store-strategi. Rekommenderas som en parallell kanal efter Capacitor-lanseringen, inte som ersättning.

---

### 3B. Capacitor — Native Shell runt befintlig webbkod

#### Vad är det
Capacitor (Ionic) är ett verktyg som packar din befintliga webbapp i en native iOS/Android-shell som exponerats som ett binärt paket till App Store. WebView renderar din HTML/CSS/JS lokalt i appen, ej som en URL-laddare.

#### Migreringsarbete från Receptbokens nuläge

**Steg 1 — Buildsteg (1–3 dagar):**
Receptboken saknar idag ett build-steg. Capacitor behöver en `dist/`-mapp att packa. Det enklaste alternativet: konfigurera Vite (eller en enkel `cp`-skript) för att kopiera `index.html`, `js/`, `css/` och statiska JSON-filer till `dist/`. Ingen ramverkskonvertering krävs — vanilla ES modules fungerar direkt.

**Steg 2 — Capacitor init (1–2 dagar):**
```
npm install @capacitor/core @capacitor/cli
npx cap init Receptboken com.receptboken.app --web-dir dist
npx cap add ios
npx cap add android
```

**Steg 3 — API-URL-hantering (0,5 dag):**
Appen anropar idag `/api/generate` (relativ URL). I Capacitor körs appen lokalt i WebView — relativa URLs pekar mot `capacitor://localhost`. Alla API-anrop måste pekas om till den absoluta Vercel-URL:en (`https://receptbok-six.vercel.app/api/...`). Detta görs enklast via en config-konstant i `js/state.js` eller `js/app.js`.

**Steg 4 — Vercel CORS (0,5 dag):**
Vercel-backenden tillåter idag `*` i CORS. Capacitor-appen skickar requests från `capacitor://localhost` — verifiera att CORS-wildcard täcker detta (det ska det, men bör testas).

**Steg 5 — Native-känsla för App Store-godkännande (1–2 veckor):**
Apple avvisar "repackaged websites" (Guideline 4.2). Capacitor-appar godkänns *om* de tillför genuine native functionality. Minimum för att undvika avvisning:
- Offline-cache via Service Worker (Workbox) — visar att appen fungerar utan nät
- Korrekt splash screen och ikoner (alla storlekar: 1024px för iOS)
- Native navigation (inga browser-backknapper synliga)
- Push notification-infrastruktur (behöver inte vara aktivt, men scaffolding räcker)
- Statusbar-styling via `@capacitor/status-bar`

**Steg 6 — Apple Developer-certifikat och provisioning profiles (1–3 dagar beroende på erfarenhet):**
Kräver Apple Developer-konto ($99/år, ~1 100 SEK/år). Xcode behövs på en Mac (eller Mac-i-molnet som MacStadium).

**Steg 7 — Google Play:**
Enklare. Android App Bundle bygges via `npx cap build android`. Google Play Developer-konto kostar $25 engångsavgift. Granskningstid: 1–7 dagar.

**Total realistisk tidsram: 3–5 veckor** för en erfaren webbutvecklare utan djup iOS/Android-bakgrund. Merparten av tiden (2–3 veckor) handlar om App Store-certifikat, Xcode-bygge, och native-känsla nog för Apple-granskning.

#### Data-layer: Orörd med en viktig asterisk
Vercel-backenden (`api/generate.js`, `api/_shared/github.js` etc.) är helt orörd. GITHUB_PAT bor i Vercel env vars, aldrig i mobilappen. Mobilappen kallar Vercel-endpoints precis som webbläsaren gör idag.

**Asterisk — GITHUB_PAT exponeras inte i klienten.** Det är redan sant idag. Men i en app med fler användare (Fas 5) skulle varje skrivoperation gå via samma PAT, vilket innebär att all användardata delar samma GitHub-repo. Det är ett arkitekturellt tak, inte ett omedelbart problem för ett familjescenario.

**GitHub API rate limits:** Authenticated requests (via Vercel-backend) tillåter 5 000 anrop/timme. För 3 familjemedlemmar är det mer än nog. Vid skalning till fler familjer (multi-tenant) behöver detta ses över.

#### Offline-stöd
Capacitor stödjer Service Workers, men WebView på iOS är Safari WebKit — samma 7-dagars eviktionsregel gäller för Service Worker-cache. Lösningen är `@capacitor/preferences` (ersätter localStorage med persistent native storage) för kritisk data (matsedel, inköpslista). Receptdatabasen (`recipes.json`) kan cachas vid första laddning och hanteras separat.

#### Push-notiser
Via `@capacitor-firebase/messaging`. Setup: Firebase-projekt (gratis), APNs-certifikat i Apple Developer Portal, FCM-nyckel uppladdat till Firebase. Beräknad tid: 2–4 dagar. Krångligaste delen är APNs-certifikat och Xcode-konfiguration, inte koden.

#### Betallösningar
- **Google Play (Android):** Stripe kan användas fritt — ingen tvingad Google Play Billing om du inte säljer digitala varor in-app. Se upp: Google kräver Google Play Billing om betalningen avser "digitala varor konsumerade i appen" (t.ex. premium-features). Extern webbshop via länk är tillåtet utan avgift.
- **Apple App Store (iOS, globalt):** IAP krävs för digitala varor sålda i appen. Apple tar 30% (15% via Small Business Program under $1M/år). Extern webbshop-länk utan IAP är sedan maj 2025 *tillåten* i USA efter Epic v. Apple-domen — appen kan hänvisa till extern betalningssida via länk utan att Apple tar provision på köpet. I EU gäller DMA: sedan juni 2025 är alternativa betalningsflöden tillåtna i EU-distribuetion av appen, men med en komplicerad fee-struktur: ca 20% totalt till Apple (13% store services + 5% CTC + 2% acquisition). **Slutsats: Stripe direkt är möjligt utan Apple-provision via länk-ut, men med UX-friktion.**

#### Underhållsbörda
En kodbas. Capacitor-uppgraderingar (1–2 ggr/år) kan introducera breaking changes. iOS/Android-certifikat löper ut och måste förnyas. Troligen 1–2 dagars underhåll per kvartal.

---

### 3C. React Native — Fullständig omskrivning

#### Vad är det
React Native kompilerar JavaScript-komponenter till native iOS/Android-widgets. Det är inte ett webview — det renderar faktiska UIKit/Jetpack Compose-komponenter.

#### Migreringsarbete från Receptbokens nuläge
All frontend-kod måste skrivas om. React Native använder:
- `View`, `Text`, `ScrollView` istället för `div`, `p`, `ul`
- `StyleSheet.create()` istället för CSS-klasser
- React-komponenter istället för vanilla JS + DOM-manipulation
- `fetch` fungerar, men all state-hantering (idag via `window.*`-variabler) måste konverteras till React state/context

Receptbokens ~11 frontend-moduler (ca 3 000–4 000 rader JS) och 1 620 rader CSS behöver skrivas om. Det är realistiskt 8–16 veckor för en solo-utvecklare utan React Native-erfarenhet. Om React Native Expo används (rekommenderat för nya projekt) förenklas builds och certifikathantering avsevärt.

**Datalagring:** Vercel-backend är orörd. RN-appen kallar samma API-endpoints.

#### Fördel mot Capacitor
- Faktisk native rendering — bättre scroll-prestanda, native gestures
- Bättre tillgänglighet (native accessibility tree)
- Expo EAS Build hanterar iOS-certifikat i molnet — kräver ingen Mac

#### Nackdelar
- Två kodbaser (web-appen förblir separat eller byggs om med React Native Web — eget arbete)
- React Native versionsbrytningar är historiskt jobbiga
- Ingen direkt återanvändning av befintlig CSS eller DOM-baserad JS
- Lärtröskel hög om ingen React-bakgrund finns

#### Slutsats om React Native
Motiverat *om* Fas 5C pekar mot SaaS-produkt med betalande externa användare och krav på polerad native-upplevelse. Inte motiverat för ett familje-MVP eller ett engångsköps-scenario.

---

## 4. Monetiserings-koppling (beroenden på Fas 5C)

Fas 5C (monetiseringsmodell) är inte beslutad. Nedan flaggas de tekniska beslut som direkt beror på vald modell.

| Monetiseringsmodell | Konsekvens för teknikval |
|---|---|
| **Engångsköp via App Store** (t.ex. 39 kr) | Capacitor räcker. IAP för iOS, Google Play Billing för Android. Apple Small Business Program: 15% provision. Enkel att implementera. |
| **Prenumeration** (t.ex. 39 kr/mån) | Capacitor räcker. IAP med auto-renewable subscription på iOS. Kräver server-side receipt validation — ny backend-logik behövs. |
| **Extern prenumeration via Stripe (web)** | Möjligt utan Apple-provision via länk-ut (USA, maj 2025) eller DMA-kanal (EU, juni 2025), men med UX-friktion ("du lämnar nu appen"). Apple kan godkänna eller avvisa beroende på hur länken presenteras. **Risk: Oklart utrymme, policyförändringar pågår.** |
| **Freemium (gratis basapp, premium features)** | Capacitor räcker, men kräver feature-flaggor i frontend och auth-logik i backend. GitHub-som-databas räcker inte för multi-user-auth — behöver t.ex. Supabase eller Firebase Auth. |
| **Gratis med donation (tip jar)** | Enklast. Capacitor eller PWA (Google Play) räcker. Extern länk till Ko-fi/Stripe. Ingen IAP-integration. |

**Beslut som INTE kan tas förrän 5C är klar:**
1. Behövs auth (konto per familj)? → Om ja: GitHub-som-databas räcker inte, Supabase (free tier: 500 MB, 50 000 MAU) behövs.
2. Behövs IAP? → Om ja: 2–4 extra veckor för IAP-implementation och receipt validation.
3. Är Stripe-via-länk-ut acceptabel UX? → Beror på om betalningströskeln är avgörande för konvertering.

---

## 5. Öppna frågor som blockerar åtagande

1. **Fas 5C saknas** — Ingen monetiseringsmodell är beslutad. Kapacitorn är rätt väg för de flesta scenarier, men IAP-integration och eventuell auth-backend beror helt på 5C.

2. **Mac-tillgång för iOS-bygge** — Xcode krävs på macOS för att producera ett `.ipa`-paket och ladda upp till App Store Connect. Alternativ: Expo EAS (React Native) eller tjänster som MacStadium (~$30/mån). Capacitor-vägen kräver antingen en Mac eller en moln-Mac. Bör klaras ut tidigt.

3. **Apple Developer Program** — $99/år (~1 100 SEK). Är detta budgeterat? Ingen app kan distribueras via iOS App Store utan det.

4. **"Repackaged website"-risken konkretiserad** — Apple avvisar webview-appar som inte tillför native-känsla. Hur stor är risken för Receptboken? Appen är redan touch-first, men saknar: offline-stöd (kritiskt för granskning), push-notiser (bra att ha), och native gesture-navigation. Dessa måste adderas *innan* App Store-submission, inte efter avvisning.

5. **GitHub-som-databas vid skalning** — Fungerar perfekt för 1 familj. Vid 10+ familjer uppstår PAT-säkerhetsproblem (en PAT skriver för alla) och rate limit-risker. Arkitekturomskrivning till per-familj-databas (Supabase/Firebase) är 2–4 veckors arbete och kräver auth. **Beslutet om när detta behöver ske beror på Fas 5C.**

6. **GDPR vid multi-user** — Idag lagras ingen persondata (ingen auth, inga konton). Om auth införs lagras e-postadresser och matvanor (potentiellt känslig data) — GDPR-påverkan kräver integritetspolicy, rätt till radering, och korrekt datahanteringsavtal med infrastrukturleverantören. GitHub EU Data Residency finns (Azure Netherlands/Sweden), men är Enterprise-tier. Supabase erbjuder EU-regioner (Frankfurt) på gratisnivå.

---

## 6. Riskbedömning

### Risker som kan tvinga en omskrivning

| Risk | Sannolikhet | Konsekvens | Mitigation |
|---|---|---|---|
| **Apple avvisar Capacitor-appen** (Guideline 4.2) | Medel — kräver native-känsla | 1–4 veckors arbete för att adda offline/push | Bygg offline-support *innan* submission |
| **GitHub API rate limits** vid skalning | Låg (familjeapp) / Medel (publik) | Backend-refaktor till Supabase/Blob | Gör ingenting nu; planera in vid >10 familjer |
| **Apple ändrar IAP-policy igen** | Hög historisk frekvens | Kan kräva ny payment-implementation | Håll IAP-koden isolerad bakom ett abstraktionslager |
| **Safaris 7-dagars eviktionsregel** | Hög (faktisk begränsning) | Offline-data försvinner för inaktiva användare | Capacitor Preferences för kritisk data |
| **React Native-version bryter Capacitor-liknande appar** | Låg (irrelevant om Capacitor väljs) | N/A | N/A |
| **Monetiseringsmodell kräver multi-tenant auth** | Medel om publik lansering | 3–6 veckors backend-refaktor | Designa Vercel-API:t med auth-lager i åtanke från start |

### Risker med PWA som enda väg
- Ingen iOS App Store — fatal för monetisering och legitimitet.
- Safaris eviktionsregel förstör offline-upplevelse.
- Trolig lösning: använd PWA som komplement (Google Play), Capacitor som primär iOS-kanal.

---

## Appendix A: Kostnadsjämförelse (år 1)

| Post | PWA | Capacitor | React Native |
|---|---|---|---|
| Apple Developer Program | — | $99/år | $99/år |
| Google Play | $25 engång | $25 engång | $25 engång |
| Mac-tillgång (om saknas) | — | ~$30/mån (MacStadium) eller egen Mac | Expo EAS Build (~$14/mån) |
| Vercel Hobby (befintlig) | $0 | $0 | $0 |
| Supabase (om auth behövs) | $0 (gratis tier) | $0 (gratis tier) | $0 (gratis tier) |
| **Summa år 1** | **$25** | **$124–$484** | **$192–$312** |

---

## Appendix B: Datatillgång för mobil — nuläge och risker

Receptbokens datalagringsmodell (JSON-filer i GitHub-repo, skrivna via PAT i Vercel env vars) är **säker** i nuläget:
- PAT exponeras aldrig i klientkod — stannar i Vercel
- Mobilapp anropar Vercel-endpoints precis som webbläsaren gör
- GitHub API authenticated limit: 5 000 req/timme — mer än tillräckligt för en familj

Vid multi-tenant (fler familjer):
- Varje familj skulle behöva ett eget GitHub-repo *eller* en delad databas med per-user isolation
- GitHub-as-DB skalar inte till publika appar — Supabase eller Vercel KV är naturliga nästa steg
- Migreringskostnad: ~2–4 veckor + auth-refaktor

---

## Källor

- [MobiLoud — Can You Publish a PWA to App Store and Google Play (2026)](https://www.mobiloud.com/blog/publishing-pwa-app-store)
- [Capacitor — Official Documentation](https://capacitorjs.com/docs/)
- [Ionic Blog — Capacitor with VanillaJS](https://ionic.io/blog/create-powerful-native-mobile-apps-with-capacitor-vanillajs)
- [Apple Developer — App Review Guidelines 4.2](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Developer — Privacy Manifest Files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple Developer — EU DMA Support Page](https://developer.apple.com/support/dma-and-apps-in-the-eu/)
- [RevenueCAT — Apple EU DMA June 2025 Update](https://www.revenuecat.com/blog/growth/apple-eu-dma-update-june-2025/)
- [RevenueCAT — Epic v Apple Anti-Steering Ruling](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy/)
- [MacRumors — Apple App Store EU Rule Change DMA (June 2025)](https://www.macrumors.com/2025/06/26/app-store-eu-rule-change-dma/)
- [MacRumors — Apple Wins Ability to Charge Fees on External Links (Dec 2025)](https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/)
- [Android Developers — Trusted Web Activities Overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Google Play Help — Data Safety Section](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Capgo Blog — Privacy Manifest for iOS Apps](https://capgo.app/blog/privacy-manifest-for-ios-apps/)
- [Capgo Blog — Stripe Payments in Capacitor after New Apple Guidelines](https://capgo.app/blog/setup-stripe-payment-in-us-capacitor/)
- [Capawesome — Push Notifications Guide for Capacitor](https://capawesome.io/blog/the-push-notifications-guide-for-capacitor/)
- [GitHub Changelog — Updated Rate Limits for Unauthenticated Requests (May 2025)](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)
- [Vercel — Blob Storage Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Supabase — Pricing](https://supabase.com/pricing)
- [MobiLoud — App Store Review Guidelines Webview Wrapper](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
- [nextnative.dev — App Store Review Guidelines 2025](https://nextnative.dev/blog/app-store-review-guidelines)
- [GitHub Docs — REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [Recording Law — Sweden Data Privacy Laws GDPR 2026](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/sweden-data-privacy-laws/)

# Cookie-refresh-automatisering — designspec

**Datum:** 2026-04-25
**Fas:** 4F (Automatisk cookie-refresh för Willys-dispatch)
**Status:** Design godkänd av användaren, klar för implementation-plan

## Syfte

Eliminera den manuella refresh-rutinen för `WILLYS_COOKIE` och `WILLYS_CSRF`. Idag kräver Fas 4D/4E att användaren ~4 gånger per år öppnar willys.se → DevTools → kopierar cURL → extraherar värden → uppdaterar Vercel env vars → väntar på redeploy. Mål: noll touch — användaren ska aldrig behöva tänka på cookies igen.

## Bakgrund

- Manuell dispatch fungerar live sedan Session 39 (2026-04-25). Verifierat: `Kefir → Arla Cultura Kefir Naturell` landade i willys.se/cart.
- `axfoodRememberMe`-cookien har ≈ 3 månaders livslängd. Nuvarande session löper ut ≈ 2026-07-15.
- `WILLYS_CSRF` följer samma session — båda måste rotateras tillsammans.
- Användarens willys.se-besöksmönster: varannan-var tredje vecka (när auto-genererad varukorg ska beställas). Detta är bekvämt inom 3-månadersfönstret för passiv refresh.

## Skopval

**Ambitionsnivå:** Noll touch (användaren bestämde i brainstorming-fasen). Rationale: 4 manuella interventioner per år är för mycket friktion för en familjeapp.

**Vald väg:** Chrome-extension (Manifest V3) som passivt fångar cookies + CSRF vid willys.se-besök och POSTar till Vercel-endpoint som skriver till en secret gist på GitHub. Dispatch-endpointen läser sedan från gist i stället för env vars.

**Förkastade alternativ:**

- **Headless-login från Vercel-cron** — högt risktagande att Willys+ kräver BankID/SMS-OTP, och anti-bot-detektion på Cloudflare. Inte verifierat utan att riskera kontolåsning.
- **Bookmarklet** — kräver manuellt klick (bryter "noll touch"-målet) och kan inte läsa httpOnly-cookies via `document.cookie`.
- **Förenklad manuell CLI** — flyttar friktion utan att eliminera den.
- **Vercel Blob private som lagring** — fungerande men introducerar ett nytt SDK för en enda JSON-fil. Secret gist återanvänder befintlig GITHUB_PAT-infrastruktur.
- **Preflight-validering av cookien före gist-skrivning** — YAGNI; cookien kommer rakt från live-session, så false positives är sällsynta. Dispatch-felet är ändå tydligt om cookien är död.

## Arkitektur

```
[Chrome-extension] ──POST──> [/api/cookies/willys] ──skriv──> [privat gist]
                                                                     │
                                                            läs ──> [/api/dispatch-to-willys]
```

Tre nya/ändrade pjäser:

1. **Chrome-extension** (ny katalog `extension/`)
2. **Vercel-endpoint `POST /api/cookies/willys`** (ny)
3. **Dispatch-endpoint** (`api/dispatch-to-willys.js`) byter cookie-källa från env vars till gist, med fallback till env vars under övergångsfas

**Nyckelval:**

- Endpointen är **klient-agnostisk från dag ett** — accepterar `{userId, cookie, csrf, storeId}` även när `userId` är hårdkodat `"joakim"`. Samma backend kan ta emot WebView-trafik från Capacitor-appen i Fas 5A utan ändring.
- **Secret gist** som lagring — återanvänder befintligt GitHub-PAT-mönster (samma scope-modell som `weekly-plan.json`-skrivningar), nytt scope `gist` adderas på PAT. Säkerhetsmodellen: gist:ens URL är åtkomstkontrollen (anyone-with-link-can-read), och gist-ID:t lagras i Vercel env var → samma skyddsnivå som `GITHUB_PAT`.
- **Inte env vars** för cookien framåt — varje refresh skulle tvinga en redeploy (~30 sek nedtid på dispatch).

## Komponenter

### 1. Chrome-extension (`extension/`)

```
extension/
  manifest.json
  background.js       # service worker — all logik
  popup.html
  popup.js
  popup.css
  icon-128.png
  README.md           # install-instruktioner
```

**Manifest V3, kärn-permissions:**

```json
{
  "manifest_version": 3,
  "name": "Receptbok Willys-cookies",
  "version": "1.0",
  "permissions": ["cookies", "webRequest", "storage", "alarms"],
  "host_permissions": [
    "https://www.willys.se/*",
    "https://receptbok-six.vercel.app/api/cookies/*"
  ],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```

**CSRF-fångst (passiv):** `chrome.webRequest.onSendHeaders` lyssnar på alla utgående requests till `*.willys.se`. När en request bär `x-csrf-token`-header → spara token + timestamp i `chrome.storage.local`.

**Cookie-läsning:** `chrome.cookies.getAll({ domain: 'willys.se' })` plockar alla cookies för domänen, joinas till `name=value; name=value` (samma form som nuvarande `WILLYS_COOKIE` env var). Funkar oavsett `httpOnly`-flagga eftersom det är extension-API, inte `document.cookie`.

**Refresh-trösklar (rate-limited):**

| Sedan senaste refresh | Beteende | Popup-status |
|---|---|---|
| < 7 dagar | Skip (allt fräscht) | ✓ grön "aktuell" |
| 7–60 dagar | Refresha vid nästa willys-besök | ✓ grön "aktuell" |
| 60–80 dagar | Refresha aggressivt | ⚠ gul "uppdatera snart" |
| > 80 dagar | Refresha + visa varning | ❌ röd "kritiskt" |

`chrome.alarms` triggar samma kontroll vid browser-start för att fånga cookies som riskerar löpa ut innan nästa willys-besök.

**Race-skydd:** En `refresh_in_flight`-flag i `chrome.storage.local` med 30 sek TTL hindrar dubbel-POSTs vid snabba sekventiella willys-requests.

**Popup-inställningar (options-page):** Två fält:

- `WILLYS_REFRESH_SECRET` (shared secret) — sätts en gång efter install
- `storeId` — defaultar till `2160` (Ekholmen), redigeras om du flyttar till annan butik

### 2. Vercel-endpoint `POST /api/cookies/willys`

**Auth:** `X-Refresh-Secret`-header valideras mot ny env var `WILLYS_REFRESH_SECRET` (genereras manuellt en gång med `openssl rand -hex 32`).

**Payload:**

```json
{
  "userId": "joakim",
  "cookie": "JSESSIONID=...; axfoodRememberMe=...; AWSALB=...; CORS=...",
  "csrf": "abc123...",
  "storeId": "2160"
}
```

**Validering:**

- Secret-header matchar → annars 401
- `userId` icke-tom sträng → annars 400
- `cookie` icke-tom sträng → annars 400
- `csrf` icke-tom sträng → annars 400
- `storeId` icke-tom sträng → annars 400

**Skrivning till gist:**

- Läser nuvarande gist-innehåll
- Patchar `users[userId]` med nya värden + `updatedAt: new Date().toISOString()`
- Skriver tillbaka via GitHub Gists API
- Vid SHA-konflikt: retry en gång med fresh SHA (samma mönster som `_shared/github.js`)

**Svar:**

```json
{ "ok": true, "updatedAt": "2026-04-25T13:42:11.000Z" }
```

**Exporteras** som named export `runRefresh({secret, payload, gistClient})` för testbarhet — samma mönster som `runDispatch` i Session 38.

### 3. Storage — secret gist på GitHub

En secret gist, en fil `willys-secrets.json`:

```json
{
  "users": {
    "joakim": {
      "cookie": "JSESSIONID=...; axfoodRememberMe=...; ...",
      "csrf": "abc123...",
      "storeId": "2160",
      "updatedAt": "2026-04-25T13:42:11.000Z"
    }
  }
}
```

Skapas manuellt en gång på gist.github.com med visibility "secret". Gist-ID:t läggs i ny env var `WILLYS_SECRETS_GIST_ID`. PAT:en uppdateras med `gist`-scope i samma engångsoperation.

### 4. Dispatch-endpoint — uppdaterad cookie-källa

`api/dispatch-to-willys.js`:

- Läser från gist via ny shared-modul `api/_shared/secrets-store.js` med 5-minuters in-memory cache
- Fallback till env vars (`WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID`) om gist tom eller otillgänglig
- Felmeddelande till UI om båda källor saknas: "Kunde inte ladda Willys-inställningar — försök igen"

**GET-handler (feature-availability)** uppdateras: `featureAvailable: true` om gist har en giltig `users[joakim]`-entry **eller** env vars är satta.

## Setup-flöde (engångs)

1. Användaren genererar `WILLYS_REFRESH_SECRET` lokalt (`openssl rand -hex 32`)
2. Sätter den som env var i Vercel
3. Skapar secret gist manuellt på gist.github.com med en tom fil `willys-secrets.json` (`{"users":{}}`) → kopierar gist-ID
4. Sätter `WILLYS_SECRETS_GIST_ID` som env var i Vercel
5. Uppdaterar GITHUB_PAT med `gist`-scope
6. `git pull` för att hämta `extension/`-katalogen
7. Chrome → `chrome://extensions` → Developer Mode → "Load unpacked" → väljer `extension/`
8. Klickar extension-ikon → "Inställningar" → klistrar `WILLYS_REFRESH_SECRET` → spara
9. Browsar willys.se som vanligt → popup-ikonen blir grön ✓ inom ~10 sek

## Dataflöde

```
1. Du öppnar willys.se inloggad
2. Browser skickar authenticated request med x-csrf-token
3. Extension webRequest.onSendHeaders fångar token → chrome.storage.local
4. Extension kollar: last_refresh_at > 7 dagar sedan?
   ├── nej → skip
   └── ja  → ↓
5. chrome.cookies.getAll för willys.se → joina till "n=v; n=v" sträng
6. POST /api/cookies/willys med X-Refresh-Secret-header
7. Endpoint validerar → läser gist → patchar users[joakim] → skriver tillbaka
8. Extension: uppdaterar last_refresh_at + status="green"

(separat trigger)
9. Du klickar "Skicka till Willys" i appen
10. /api/dispatch-to-willys läser gist (5-min cache) → använder cookie+csrf
```

## Felmatris

| Var | Fel | Status | Extension-beteende | Användar-UX |
|---|---|---|---|---|
| Endpoint | Saknad/fel secret | 401 | Popup röd, "Öppna inställningar" | Engångsfix vid install/rotation |
| Endpoint | Malformerad payload | 400 | Logga lokalt, popup gul | (skall inte hända i produktion) |
| Endpoint | Gist-skrivning failade | 502 | Retry vid nästa willys-besök | Tyst, läker själv |
| Endpoint | PAT saknar `gist`-scope | 500 | Popup röd | Engångsfix i Vercel env |
| Extension | Inga cookies för willys.se | n/a | Popup gul: "Logga in på willys.se" | Du loggar in → nästa besök fungerar |
| Extension | Ingen CSRF fångad än | n/a | Skip refresh, vänta nästa request | Tyst, läker själv |
| Extension | Network error vid POST | n/a | Retry vid nästa willys-besök | Tyst |
| Dispatch | Gist otillgänglig | n/a | n/a | Fallback till env vars; annars: "Kunde inte ladda Willys-inställningar — försök igen" |
| Dispatch | Willys returnerar 401 | n/a | n/a | "Willys-sessionen har löpt ut. Öppna willys.se och logga in." |

## Edge cases

- **Två installationer (laptop + stationär):** Båda pushar till samma gist, last-write-wins. OK — samma `userId`.
- **Du clearar extension-data:** Secret + last_refresh-state försvinner; gist är intakt → dispatch funkar tills cookien dör. Du paste:ar secret igen i popup, klart.
- **Cookie roterar mid-session:** Extension fångar nya värdet vid nästa willys-request → automatiskt uppfångat.
- **Du loggar ut på willys.se:** `axfoodRememberMe` finns kvar lokalt men Willys har invaliderat den server-side. Extension vet inte → första dispatchen efteråt får 401 → tydligt felmeddelande.
- **Du flyttar till annan butik:** Editerar `storeId` i popup → skickas med nästa refresh.

## Migrering (utan downtime)

Befintlig dispatch fungerar på env vars. Switchen till gist får inte gå med en big-bang.

1. **Bygg endpoint + extension i en feature-branch.** Dispatch lämnas helt orörd.
2. **Live-test endpointen manuellt** med `curl` — POSTa kända cookies, verifiera att gist:en uppdateras.
3. **Installera extensionen + browsa willys.se → verifiera att gist auto-uppdateras** (innan dispatch ens läser från gist).
4. **Switcha dispatch:** läs gist först, fallback till env vars om gist tom/otillgänglig. Så länge fallback finns kvar är det noll risk. Env vars städas bort först när vi sett gist-vägen funka i ≥2 dispatchar.

## Testtäckning

Stilen följer befintligt mönster — Node-only assertions, inga externa deps, bevakas av PostToolUse-hook (regress = exit 2, blockerar commit).

**Ny testfil `tests/cookies-endpoint.test.js`** (~25 assertions):

- Secret-validering: saknad header → 401, fel värde → 401, korrekt → 200
- Payload-validering: tom cookie → 400, tom csrf → 400, saknat userId → 400
- Gist-patch-logik: existerande user uppdateras, ny user skapas, andra users orörda
- Retry-på-SHA-konflikt: en lyckas på andra försöket
- `runRefresh({secret, payload, gistClient})` exporteras som named export

**Utökning av `tests/dispatch-to-willys.test.js`** (~+5 assertions):

- Dispatch läser från gist när tillgänglig
- Dispatch faller tillbaka till env vars om gist saknas
- Dispatch returnerar tydligt felmeddelande om båda källor saknas

**PostToolUse-hook** uppdateras: edits i `api/cookies/willys.js` eller `api/_shared/secrets-store.js` triggar `cookies-endpoint.test.js`.

**Manuell verifiering:**

- Install + secret-paste i popup
- Browsa willys.se → kolla popup blir grön inom ~10 sek
- Vänta 7+ dagar (eller fejka `last_refresh_at` i `chrome.storage.local` via DevTools) → besöka willys.se igen → ny refresh
- Klicka dispatch → verifiera att inköpslistan landar i willys.se/cart som vanligt

## Out of scope

För att hålla 4F fokuserad lämnas följande till framtida sessioner:

- **WebView-klient i Capacitor** — Fas 5A, samma backend-endpoint väntar på den
- **Multi-user signup, login, per-user secrets** — Fas 5B
- **Encryption at rest** — onödigt för en single-user gist; private gist + GitHub TLS räcker
- **Chrome Web Store-publicering** — developer mode räcker tills Fas 5 lanseras till andra
- **Auto-update av extensionen** — `git pull` när det är förändrat
- **Telemetri / fjärrloggning** — felen syns lokalt i popup
- **Preflight-validering av cookien innan skrivning** — YAGNI, lägg till om silent-rot syns
- **Refresh-strategi-finputsning** (7d/60d/80d-trösklarna) — ändras inline om empiri visar fel
- **Migrera bort env vars helt** — fallbacken ligger kvar tills nästa större städsession

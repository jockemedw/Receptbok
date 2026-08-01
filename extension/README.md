# Receptbok butikscookies (Chrome-extension)

Skickar passivt cookies + CSRF-token från **willys.se och hemkop.se** till
Receptbokens dispatch-endpoint, så att varukorgen alltid kan fyllas automatiskt
utan manuell rotation. Butikerna hålls isär: varje butik har egna cookies, egen
CSRF-token och egen 7-dagarströskel.

## Engångs-setup (server-side)

Kör dessa **innan** du installerar extensionen — annars får du 401 från endpointen.

1. **Generera shared secret lokalt:**
   ```
   openssl rand -hex 32
   ```
   Spara värdet — du behöver det både i Vercel och i extensionen.

2. **Skapa secret gist på gist.github.com:**
   - Logga in som `jockemedw` → https://gist.github.com
   - Filename: `willys-secrets.json`
   - Content: `{"users":{}}`
   - Visibility: **Secret** (välj "Create secret gist", inte public)
   - Kopiera gist-ID:t från URL:en (`https://gist.github.com/jockemedw/<GIST_ID>`)

3. **Uppdatera GITHUB_PAT:**
   - GitHub → Settings → Developer settings → Personal access tokens → välj befintlig PAT
   - Bocka i `gist`-scopen
   - Spara. Om token regenereras: uppdatera `GITHUB_PAT` i Vercel.

4. **Sätt env vars i Vercel** (Production + Preview):
   - `WILLYS_REFRESH_SECRET` = värdet från steg 1
   - `WILLYS_SECRETS_GIST_ID` = gist-ID från steg 2
   - Behåll `WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID` tills gist-vägen är verifierad i ≥2 dispatchar — då kan de tas bort.

5. Vänta ~30 sek på Vercel-redeploy.

## Installera extensionen

1. `git pull` så `extension/`-katalogen finns lokalt.
2. Öppna Chrome → `chrome://extensions`
3. Aktivera **Developer Mode** (toggle uppe till höger)
4. Klicka **Load unpacked** → välj `extension/`-katalogen
5. Extension-ikonen dyker upp i toolbar.

## Konfigurera

1. Klicka på extension-ikonen → popup öppnas.
2. Öppna **Inställningar**.
3. Klistra **Shared secret** (samma värde som `WILLYS_REFRESH_SECRET` i Vercel).
4. Verifiera **Butiks-ID (Willys)** (default `2160` = Ekholmen). Ändra om du flyttar.
   Hemköp behöver inget butiks-ID — det används bara av Willys rea-flöde.
5. Klicka **Spara**.

## Uppgradera från 1.0 (Willys-only)

Version 1.1 lade till Hemköp. Efter `git pull`:

1. `chrome://extensions` → klicka **Uppdatera** på kortet (nya host-permissions för
   `hemkop.se` kräver omladdning — utan den fångas inga Hemköp-cookies).
2. Besök https://www.hemkop.se inloggad en gång.
3. Öppna popupen → båda butikerna ska visa grönt.

Willys-statusen följer med automatiskt; gamla `csrfToken`/`lastRefreshAt` migreras
till de nya per-butiksnycklarna vid första start.

## Verifiera att det fungerar

1. Öppna ny tab → besök https://www.willys.se (logga in om du inte redan är)
2. Vänta ~5–10 sek
3. Öppna popup → **Willys** ska vara **grön ✓ "Aktuell"** med "Senast uppdaterad: nu"
4. Upprepa för https://www.hemkop.se → **Hemköp** blir grön
5. Verifiera i secret gist att `users.joakim.stores.willys.updatedAt` respektive
   `users.joakim.stores.hemkop.updatedAt` har dagens timestamp.
6. Klicka **Skicka till butik** i Receptboken → välj butik → kontrollera att
   inköpslistan landar i den butikens varukorg.

## Statusindikator (visas per butik)

| Färg | Betydelse |
|---|---|
| 🟢 Aktuell | Senaste refresh < 60 dagar sedan |
| 🟡 Uppdatera snart | 60–80 dagar sedan |
| 🔴 Kritiskt | > 80 dagar — kritiskt nära cookie-utgång |
| 🟡 Inte uppdaterad än | Ingen lyckad refresh; logga in på butikens sajt |
| 🔴 Fel: ... | Endpoint eller nätverk failade — se popup-meddelandet |

## Felsökning

- **"Shared secret saknas"** → öppna inställningar, klistra in värdet
- **"Ingen CSRF fångad än"** → besök en sida hos butiken (inte bara root) som triggar XHR
- **"Inga cookies"** → logga in på butikens sajt igen
- **Hemköp står kvar på "Inte uppdaterad än"** → tillägget är inte omladdat efter
  uppgraderingen; se *Uppgradera från 1.0* ovan
- **"Endpoint svarade 401"** → secret matchar inte; jämför mot Vercel env var
- **"Endpoint svarade 502"** → gist-skrivning failade; kontrollera GITHUB_PAT har `gist`-scope
- **"Endpoint svarade 500"** → en env var saknas i Vercel (`WILLYS_REFRESH_SECRET`, `GITHUB_GIST_PAT`, `WILLYS_SECRETS_GIST_ID`)

## Out of scope

- **Mobile / Capacitor**: extension fungerar bara i desktop-Chrome. Capacitor-app
  (Fas 5A) återanvänder samma backend-endpoint via in-app WebView-capture.
- **Auto-update**: `git pull` när det är förändrat; ladda om i `chrome://extensions`.
- **Multi-user**: en `userId` (`joakim`) hårdkodat. Multi-user kommer i Fas 5B.

## Säkerhet

- Shared secret är åtkomstkontroll till endpointen — behandla som ett lösenord.
- Cookies lämnar aldrig din maskin förutom till `receptbok-six.vercel.app`.
- Secret gist är osökbart (security through obscurity); URL:en + GitHub-TLS är skyddet.

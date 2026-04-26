# Receptbok Willys-cookies (Chrome-extension)

Skickar passivt willys.se-cookies + CSRF-token till Receptbokens dispatch-endpoint
så att korgen alltid kan fyllas automatiskt utan manuell rotation.

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
4. Verifiera **Butiks-ID** (default `2160` = Ekholmen). Ändra om du flyttar.
5. Klicka **Spara**.

## Verifiera att det fungerar

1. Öppna ny tab → besök https://www.willys.se (logga in om du inte redan är)
2. Vänta ~5–10 sek
3. Öppna popup → status ska vara **grön ✓ "Aktuell"** med "Senast uppdaterad: nu"
4. Verifiera i secret gist att `users.joakim.updatedAt` har dagens timestamp.
5. Klicka **Skicka till Willys** i Receptboken → kontrollera att inköpslistan landar i willys.se/cart som vanligt.

## Statusindikator

| Färg | Betydelse |
|---|---|
| 🟢 Aktuell | Senaste refresh < 60 dagar sedan |
| 🟡 Uppdatera snart | 60–80 dagar sedan |
| 🔴 Kritiskt | > 80 dagar — kritiskt nära cookie-utgång |
| 🟡 Inte uppdaterad än | Ingen lyckad refresh; logga in på willys.se |
| 🔴 Fel: ... | Endpoint eller nätverk failade — se popup-meddelandet |

## Felsökning

- **"Shared secret saknas"** → öppna inställningar, klistra in värdet
- **"Ingen CSRF fångad än"** → besök en willys.se-sida (inte bara root) som triggar XHR
- **"Inga cookies"** → logga in på willys.se igen
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

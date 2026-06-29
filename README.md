# Receptboken

Personlig matplaneringsapp för en familj (två vuxna + ett litet barn). Du väljer
datum och inställningar; appen genererar en matsedel + inköpslista och sparar allt
centralt så hela familjen ser samma data på alla enheter. Inköpslistan kan
dessutom skickas direkt till Willys varukorg.

Produktion: <https://receptbok-six.vercel.app/>

> Den uttömmande projektkontexten — designprinciper, sessionslogg, roadmap och
> tekniska beslut — bor i [`CLAUDE.md`](./CLAUDE.md). Den här filen är en
> snabb orientering.

## Arkitektur

```
Browser → Vercel /api/* (serverless JS) → deterministisk receptväljare
        → Supabase (sanningskälla) ← Browser läser/skriver direkt (med RLS)
```

- **Frontend:** `index.html` (ren markup) + ES-moduler i `js/`. Inget ramverk.
  Hostas på Vercel (primärt) och GitHub Pages (backup). PWA med service worker.
- **Backend:** Vercel serverless-funktioner i `api/`. Tar emot inställningar,
  filtrerar/väljer recept **deterministiskt** (ingen AI i runtime) och skriver
  till Supabase.
- **Data:** Supabase (Postgres) — recept, veckoplaner, inköpslistor, historik,
  hushåll/medlemmar. `recipes.json` m.fl. är retirerade.
- **Auth:** Supabase Auth (lösenord, delad familjeinloggning). Registrering
  avstängd — nya medlemmar läggs till manuellt.
- **AI används bara vid receptimport** (Google Gemini, gratistier) för foto/URL.
  Receptvalet är alltid AI-fritt och deterministiskt.

## Kodstruktur (VSA — en feature per fil)

- **`js/`** — `app.js` (entry), `state.js` (delade `window.*`), `utils.js`,
  `ui/` (scroll, navigation), `shopping/`, `weekly-plan/` (generator, viewer,
  ingredient-preview), `recipes/` (browser, editor, import), `auth-gate.js`,
  `supabase-client.js`. Moduler anropar varandra via `window.*` — inga cirkulära
  ES-importer.
- **`api/`** — en endpoint per fil. Delad infrastruktur i `api/_shared/`
  (`handler.js` CORS+auth, `supabase.js` db-klient, `github.js`,
  `willys-matcher.js`, `shopping-builder.js`, `select-recipes.js`, m.fl.).
- **`extension/`** — Chrome-tillägg som förnyar Willys-cookies för dispatch.
- **`docs/`** — research, specs och sessionsarkiv.

## Köra tester

Inga npm-scripts — allt körs direkt med `node`. Endast dispatch-/cookies-testerna
behöver beroenden (`@supabase/supabase-js`).

```bash
npm install                       # bara för dispatch/cookies-testerna
for f in tests/*.test.js; do node "$f"; done   # hela sviten
node --check js/app.js            # syntaxkoll av frontend
```

CI (`.github/workflows/test.yml`) kör hela sviten + `node --check` på varje push
och pull request. Lokalt kör `.claude`-hooks relevanta tester automatiskt vid
filändringar.

## Deployment

Push till `main` → Vercel och GitHub Pages deployar automatiskt (~30 sek). Ingen
manuell åtgärd. Verifiering sker mot live på mobil (ingen lokal testmiljö för UI).

## Miljövariabler (Vercel)

| Variabel | Används av |
|----------|-----------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | alla Supabase-endpoints |
| `GITHUB_PAT` | endpoints som skriver till repot |
| `GITHUB_GIST_PAT`, `WILLYS_SECRETS_GIST_ID` | Willys-cookie-store (dispatch) |
| `WILLYS_REFRESH_SECRET` | delad hemlighet för Chrome-tilläggets cookie-refresh |
| `GOOGLE_API_KEY` | receptimport via Gemini (foto/URL-fallback) |
| `ALERT_WEBHOOK` | *valfritt* — pling vid tyst Willys-degradering (t.ex. ntfy.sh) |

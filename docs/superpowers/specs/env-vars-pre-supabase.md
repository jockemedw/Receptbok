# Vercel-env vars före Supabase-integration

**Datum:** 2026-05-16
**Syfte:** Snapshot av alla Vercel-env vars INNAN Vercel-Supabase-integration
installeras. Används för att verifiera att R5 inte utlöses
(env-var-överskrivning).

## Hur du fyller i tabellen

1. Öppna https://vercel.com/dashboard → projekt **receptbok** → Settings →
   Environment Variables
2. För varje variabel i tabellen nedan: kopiera namnet (är redan ifyllt) och
   skriv in de **första 4 tecknen** av värdet i kolumnen "Sig (4 tkn)".
   Visa värdet via "Reveal"-knappen vid raden, kopiera, klistra in 4 första.
3. Markera "Finns" med ✅ om variabeln existerar, ❌ om den saknas.
4. Spara filen och säg till Claude — då går vi vidare med
   Supabase-integration.

## Förväntade env vars (från spec)

| Variabel | Finns | Sig (4 tkn) | Anteckning |
|---|---|---|---|
| `GITHUB_PAT` | ✅ | `gith` | contents:write på Receptbok-repo. Added Mar 12, All Environments |
| `GITHUB_GIST_PAT` | ✅ | `(tom)` | classic PAT (fine-grained stöder inte gists). Added Apr 26, Sensitive. **Värdet är tomt** — Fas 4F-engångs-setupen ej genomförd |
| `GOOGLE_API_KEY` | ✅ | `AIza` | Gemini API för receptimport via foto/URL. Added Apr 1, All Environments. **Obs: spec sa "GEMINI_API_KEY" — verkligt namn är GOOGLE_API_KEY** |
| `WILLYS_COOKIE` | ✅ | `(tom)` | sessioncookie till willys.se, ~7 d livslängd. **Värdet är tomt** — dispatch beror på gist-vägen eller cookies har utgått |
| `WILLYS_CSRF` | ✅ | `(tom)` | x-csrf-token, ~3 mån livslängd. Added Apr 25, Sensitive. **Värdet är tomt** |
| `WILLYS_STORE_ID` | ✅ | `(tom)` | förväntat 2160 (Ekholmen). Added Apr 25. **Värdet är tomt** — koden behöver fallback eller failar |

## Extra variabler (inte i originalspecen)

| Variabel | Finns | Sig (4 tkn) | Anteckning |
|---|---|---|---|
| `WILLYS_REFRESH_SECRET` | ✅ | `sk_l` | signerar `/api/cookies/willys`-anropet från Chrome-extension (Fas 4F). Added Apr 26, Sensitive |

## Efter installation av Vercel-Supabase-integrationen

Integrationen ska lägga till **nya** namn utan att röra de ovan:

Nya förväntade: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`,
`POSTGRES_URL_NON_POOLING`, `SUPABASE_JWT_SECRET`.

**Verifiera efter installation:** gå tillbaka till samma sida, kontrollera
att alla 4-tecken-signaturer i tabellen ovan **är oförändrade**. Om någon
signatur har ändrats → R5 har utlösts → avbryt och rapportera till Claude.

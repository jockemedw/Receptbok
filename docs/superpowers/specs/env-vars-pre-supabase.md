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
| `GITHUB_PAT` | | | contents:write på Receptbok-repo |
| `GITHUB_GIST_PAT` | | | classic PAT (fine-grained stöder inte gists) |
| `GEMINI_API_KEY` | | | för receptimport via foto/URL |
| `WILLYS_COOKIE` | | | sessioncookie till willys.se, ~7 d livslängd |
| `WILLYS_CSRF` | | | x-csrf-token, ~3 mån livslängd |
| `WILLYS_STORE_ID` | | | t.ex. 2160 = Ekholmen |

## Eventuella extra variabler

Om Vercel-dashboarden visar fler env vars än ovan: lägg till dem här med
samma format. Vanliga kandidater Claude inte känner till:

| Variabel | Finns | Sig (4 tkn) | Anteckning |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |

## Efter installation av Vercel-Supabase-integrationen

Integrationen ska lägga till **nya** namn utan att röra de ovan:

Nya förväntade: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`,
`POSTGRES_URL_NON_POOLING`, `SUPABASE_JWT_SECRET`.

**Verifiera efter installation:** gå tillbaka till samma sida, kontrollera
att alla 4-tecken-signaturer i tabellen ovan **är oförändrade**. Om någon
signatur har ändrats → R5 har utlösts → avbryt och rapportera till Claude.

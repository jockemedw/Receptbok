# Willys+ medlemserbjudanden — utredning klar (2026-06-16)

## Frågan
Fas 1C2: kan appen få med Willys+ ("Willys Plus") medlemserbjudanden, och kräver
det inloggning (cookie-export / scripted login / BankID)?

## Svar: nej, ingen inloggning behövs
Willys+ medlemserbjudanden är **generiska klubbpriser** (lika för alla medlemmar),
inte individuellt riktade. Willys exponerar dem **publikt** i samma
`PERSONAL_GENERAL`-feed som appen redan hämtar anonymt.

Verifierat 2026-06-16 genom att jämföra inloggat vs inkognito (ej inloggat) svar
från:
```
https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_GENERAL&page=0&size=5
```
Båda gav identiskt resultat: facet `campaignType` → `GENERAL` (229) + `LOYALTY`
"Willys Plus" (41), totalt 270. Hela 3-fas-utforskningen (BankID/cookie/scripted
login) faller alltså bort.

`type=PERSONAL_SEGMENTED` var en återvändsgränd — returnerar `results: []`
(individuellt riktade kuponger; testkontot hade inga vid testtillfället).

## Hur erbjudandena skiljs åt
Varje promotion bär `campaignType`:
- `"LOYALTY"` = Willys Plus (klubbpris)
- `"GENERAL"` = vanlig rea

En produkt kan ha flera promotions (t.ex. Coca-Cola: LOYALTY "5 för 55" +
GENERAL "3 för 52").

## Vad som åtgärdades (samma session)
`normalizeOffers()` tittade tidigare bara på `promotionType`, aldrig `campaignType`:
1. **Märkning:** offers får nu `loyalty: true` när vald promo är `LOYALTY`.
   Trådas genom `savingMatches` → "Willys Plus"-badge i besparings-popoveren.
2. **Vidgat filter:** `SubtotalOrderPromotion` släpps nu in (tidigare skippad).
   Det fångar klubbpriser som föll bort förut — t.ex. Oxfilé −100 kr/kg,
   vattenmelon −15 kr/kg. Guard: bara `threshold` 0/null (ovillkorade) — promos
   villkorade av ordersumma (`threshold > 0`) skippas, eftersom priset då inte är
   ett rent styckpris.

Test: `tests/willys-offers.test.js` (11 assertions) låser beteendet.

## Kvar
Live-verifiering mot produktion: bekräfta att Willys Plus-erbjudanden dyker upp i
besparingsvyn med badge, och att de nya SubtotalOrderPromotion-fynden räknas in.

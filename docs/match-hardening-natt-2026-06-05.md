# Nattjobb: Matchnings-härdning — rapport 2026-06-05

Självgående nattjobb (4 faser) för att höja matchnings-täckning och täppa
felmatchningar i Willys-exporten. Allt kod-only, test-gated, auto-mergat till
main. Ingen live-data rörd, inga skarpa Willys-anrop.

## Sammanfattning

| Fas | PR | Resultat |
|-----|----|----|
| 1 — Täckning (lexikon) | #61 | ~45 nya canon-mappningar, CANON_SET → 220 |
| 2 — Reject-härdning + korpus | #62 | Globalt reject breddat + ny korpus (35 fall) |
| 3 — Självgranskning | #63 | Moduler sunda; 1 robusthetsfix (saknat produktnamn) |
| 4 — Rapport | (denna) | Dokumentation + dashboard |

**Tester:** `match.test.js` 51 → **103** assertions. Ny `match-corpus.test.js`
**35** fall. dispatch 81 / shopping 81 / select-recipes 432 / data-mapper 27 —
oförändrade gröna.

## Fas 1 — nya canon-mappningar
Self-canons + säkra varianter för vanliga ingredienser som föll tillbaka till
rånamnet (matchades då bara via sök-relevans, ej exakt-steget, och hamnade i
Skafferi i inköpslistan):

- **Spannmål/pasta/nudlar:** havregryn, couscous/pärlcouscous, risoni,
  vermicelli, spaghetti (+fullkorns-), makaroner, tagliatelle,
  fettuccine/fettuccini, ris-/ägg-/glas-/udon-/soba-/ramennudlar → `nudlar`
- **Kryddor/skafferi:** lagerblad, kardemumma, senap (+dijon-/grovkornig →
  `senap`), senapsfrö, fänkålsfrö, kokosflingor
- **Socker:** muscovado-/farin-/brun farin → `socker`
- **Nötter:** hasselnötter, pekannötter, pistasch-/pistagenötter → `pistaschnötter`
- **Mejeri:** kärnmjölk
- **Grönsaker:** savojkål, salladskål, palsternacka, sparris, kålrabbi,
  edamame, kidneybönor, isbergssallad → `sallad`
- **Frukt:** jordgubbar, blåbär, hallon, päron

Kategori-nyckelord: kärnmjölk → Mejeri, edamame/kidneybönor → Grönsaker.

## Fas 2 — reject-härdning
- **Globalt reject** (gäller alla canons) breddat från enbart färdigrätt till
  klasser som *aldrig* är en receptingrediens: `mac & cheese | färdigrätt |
  micro | panerad | barnmat | klämmis | ostbågar | kattmat | kattfoder |
  hundmat | hundfoder | djurfoder | hundgodis`.
- **smör** fångar nu nötsmör (jordnöts-/cashew-/mandel-/shea-/kakao-/solros-).
- **lime** + **apelsin** får dryckes-/läsk-reject (juice förblir OK).
- Ny **korpus-regression** (`tests/match-corpus.test.js`) med 35 accept/reject-
  fall över klasserna + positiva kontroller mot över-reject. Wired i hooken.

## Fas 3 — robusthetsfix
`extractOfferCanon` / `rejectsMatch` coercar nu `offer.name || ""` (ett rått
pris-erbjudande utan namn gav annars strängen "undefined" i text-matchningen).

---

## Bedömningsfall som väntar på Joakim

1. **Vispgrädde vs generisk "grädde".** Koden avvisar medvetet *bar* vispgrädde
   för canon `grädde` (designval sedan Session 35 — "grädde" ska träffa
   matlagnings-/vanlig grädde). Effekt: om butiken bara har vispgrädde blir
   "grädde" omatchad. **Fråga:** ska generisk "grädde" tillåtas falla till
   vispgrädde när ingen vanlig grädde hittas?

2. **potatis + toalettpapper matchas fortfarande inte.** Stark misstanke:
   cart-add med `pickUnit: "pieces"` mot en kilo-/styckvara → Willys 400.
   Detta är INTE en matchnings-bugg utan en köpenhet-bugg och rördes inte av
   nattjobbet (kräver verklig Willys-svarsdata). **Förslag:** kort live-
   diagnos som loggar köpenheten för de varor som faller.

3. **Långsvansen av icke-canon-ingredienser.** Det datadrivna svepet med
   `scripts/audit-ingredients.mjs` gick inte i nattmiljön — nätverkspolicyn
   blockerar utgående mot Supabase. Fas 1 byggde på ett urval (1350 av 2689
   distinkta rader via MCP) + domänkunskap, så det finns fler sällan-använda
   ingredienser kvar att mappa. **Förslag:** kör audit lokalt med Supabase-
   credentials (eller i ett jobb med nätåtkomst) för en fullständig lista.

4. **Lossy generaliseringar i inköpslistan.** dijonsenap → `senap`,
   isbergssallad → `sallad`, muscovado/farin → `socker`, alla pastor som egna
   canons (ej hopslaget till generisk `pasta`). Rimligt för Willys-matchning,
   men bekräfta att det är OK att inköpslistan visar den generaliserade formen.

## Inte rört (per spärrarna)
Ingen Supabase-mutation, inga skarpa dispatch-/cart-/cookie-anrop, ingen rörd
veckoplan. pickUnit-buggen (potatis/toalettpapper) lämnad för gemensam
live-diagnos.

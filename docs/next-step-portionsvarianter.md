# Nästa steg — Portionsvarianter (statiska, förbakade) för matlagningsläget

**Status:** design beslutad, EJ påbörjad. Fortsätt i lokal session på Joakims dator
(där Supabase-secrets finns). Detta dokument är hela överlämningen — läs det först.

## Problemet
Portionsskalningen (Session 104, PR #106) skalar **bara ingredienslistan** live via
`scaleIngredient` (`js/ui/portion-scale.js`). Men `instructions[]` innehåller ofta samma
mängder i löptext ("häll i 2 dl grädde"), och de står kvar oskalade → ×2 ger "4 dl" i
listan men "2 dl" i steget. Inkonsekvent och riskabelt mitt i matlagningen.

## Beslutad lösning (efter diskussion med Joakim)
**Statiska, förbakade portionsversioner av hela receptet — ingen runtime-beräkning, ingen
runtime-AI, ingen självgående Gemini-generator.**

- **Portioner, inte ×-faktorer.** Chips i matlagningsläget: **2 / 4 / 5 / 6 / 8 portioner**.
  Receptets eget `servings` (oftast 4) = default/aktiv. Varje portionsantal har en egen
  färdig version med rätt mängder i **både ingredienser och instruktioner**, temp/tid/mått
  orörda.
- **Genereras av Claude (Opus 4.8) vid utveckling** — inte en runtime-/import-modell och
  INTE ett självgående Gemini-jobb. Håller sig inom principen "AI bara vid utveckling",
  ger högsta kvalitet, och varje recept blir en **granskbar diff Joakim godkänner** innan
  något skrivs till Supabase.
- **Runtime blir trivialt:** matlagningsläget slår bara upp rätt förbakad version. Funkar
  offline (PWA/Wake Lock vid spisen).

### Varför inte de avfärdade alternativen
- **Runtime-LLM (vid matlagning):** bryter "ingen AI i runtime", kostar per interaktion per
  användare för evigt, och dör offline vid spisen. Avfärdat.
- **Deterministisk regex som skalar löptexten:** kan inte förstå prosa → skalar fel tal
  (ugnstemp "200°", tid "20 min", "24 cm form", "dela i 4 bitar"). Avfärdat.
- **Självgående Gemini-generator över korpusen:** Joakim vill ha det kvalitativt och
  kontrollerat, inte en oövervakad omskrivning av sanningskällan. Avfärdat.

## Datamodell (fält-OK givet av Joakim)
Nytt fält på receptet (Supabase `recipes` + `js/data-mapper.js`):
```json
"scaled": {
  "2": { "ingredients": ["..."], "instructions": ["..."] },
  "5": { "ingredients": ["..."], "instructions": ["..."] },
  "6": { "ingredients": ["..."], "instructions": ["..."] },
  "8": { "ingredients": ["..."], "instructions": ["..."] }
}
```
- Nyckel = portionsantal. Versionen som matchar `servings` = originalet (behöver ej lagras/
  genereras — matlagningsläget använder receptets egna `ingredients`/`instructions` för den).
- Bara portionsantal ur {2,4,5,6,8} som **inte** är basantalet behöver genereras.
- **Rör aldrig** receptets original-`ingredients`/`instructions` — `scaled` är additivt.

## Kontroll- & kvalitetskedja (kärnkravet från Joakim: "så kvalitativt och kontrollerat som möjligt")
1. **Pilot först** — generera 2/4/5/6/8-versioner för 2–3 recept (välj ett med mängder i
   löptexten + ett med ägg/vitlöksklyftor), visa Joakim som diff, låt honom döma kvaliteten.
2. **Mekanisk verifierare** ovanpå Claudes text (bygg som testbar funktion + skript):
   - temp/tid/mått-strängar står **exakt oförändrade** mot originalet (`°`, `grader`, `min`,
     `minut`, `timme`, `h`, `cm`, `mm`).
   - mängder skalade **monotont** i rätt riktning (fler portioner → större mängd).
   - **inga rader tappade/tillagda** (samma antal ingrediens- och instruktionsrader).
   - **heltal för styckesaker** (ägg, vitlöksklyftor) — flagga "2,5 ägg" för mänskligt beslut
     i stället för att tyst skriva bråkdel.
3. **Snapshot + revert** innan någon skrivning (som QC-nattjobbet: in-DB
   `recipes_backup_<datum>`, kommando "revert portionsjobbet").
4. **Skrivning recept-för-recept, granskat** — inte en stor sväng. Ingen skrivning förrän
   Joakim godkänt pilotten.

### Udda faktorer (t.ex. 5 portioner från ett 4-portionsrecept = ×1,25)
Detta är själva anledningen att en granskad Claude-väg slår ett automatiskt jobb: runda till
vettiga heltal för styckesaker, håll volymer/vikter rimliga (½/¼ ok), och **flagga** allt
tveksamt åt Joakim i stället för att tyst producera nonsens.

## cook-mode-integration (`js/ui/cook-mode.js`)
- Byt chip-raden från ×0.5/×1/×2 till **portions-chips 2/4/5/6/8**; default = receptets `servings`.
- När ett chip väljs: rendera `r.scaled[n]` (ingredienser + steg). För basantalet: rendera
  receptets egna original.
- **Behåll `scaleIngredient` som fallback** för recept som ännu inte fått `scaled`-fältet
  (visa då bara ingrediens-skalning som idag, eller dölj chips tills bakad — designbeslut i
  bygget). Ta inte bort `portion-scale.js` — det blir fallbacken.
- Bock-state (`.done`) ska bevaras vid byte precis som idag.

## Relation till PR #106 (live ×0.5/×2-skalning)
PR #106 ligger i verifieringskön men **ersätts** av detta spår (statiska portioner). Beslut i
bygget: antingen bygg vidare i samma PR/branch, eller stäng #106 och gör detta som ny feature.
`scaleIngredient`/`portion-scale.js` + dess 27 tester behålls som fallback oavsett.

## Konkreta första steg i den lokala sessionen
1. `node scripts/export-recipes.mjs` (secrets finns lokalt) → synkar `scripts/.cache/recipes.json`.
2. Välj 2–3 pilotrecept (ett med löptext-mängder, ett med ägg/klyftor).
3. Claude genererar 2/4/5/6/8-versioner för dem → visa som diff.
4. Bygg den mekaniska verifieraren (testbar) + kör den på pilotresultatet.
5. Joakim granskar → justera prompt/regler → först därefter snapshot + skrivning, och sen
   skala upp till hela korpusen recept-för-recept.
6. Parallellt: lägg `scaled` i `js/data-mapper.js` (`recipeFromRow`/`recipeToRow`) + koppla
   cook-mode till portions-chipsen.

## Filer som berörs
- `js/ui/cook-mode.js` — portions-chips + uppslag av `scaled`-versioner.
- `js/ui/portion-scale.js` — behålls som fallback (rör ej de 27 testerna).
- `js/data-mapper.js` — `scaled`-fältet i rad↔objekt-mappningen.
- `scripts/` — ny generator (Claude-driven, granskad) + verifierare + snapshot/revert.
- Supabase `recipes` — nytt `scaled`-fält (additivt, rör ej original).

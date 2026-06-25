# Lessons — återkommande mönster

Levande logg över mönster som dyker upp gång på gång i Receptboken. Tänkt att läsas
före nytt arbete så samma fel inte återupprepas.

## A11y-mönster (från nattauditen 2026-06-24)

- **Klickbara element är nästan alltid `<div>`/`<span>`/`<li>`/`<article>` med inline
  `onclick`, aldrig `<button>`.** Återkommer i receptkort, dagskort, statuspiller,
  ingrediens-/steg-rader, sektionsrubriker. Konsekvens: hela interaktiva ytor är
  osynliga för tangentbord och skärmläsare. *Standardmönstret i koden bör vara
  `<button>` (eller `role="button" tabindex="0"` + keydown) för allt klickbart.*

- **Modaler/overlays byggs visuellt korrekt men utan fokuskontrakt.** Ingen flyttar
  fokus in, ingen fokusfälla, ingen återställning av fokus vid stäng, ofta ingen
  Escape. Gäller edit/import/dispatch-modaler, popovers, "Veckans fynd", cook-mode.
  `confirmDialog` (`feedback.js`) är närmast rätt och kan bli mall. *Bygg en delad
  `openModal(el, {labelledby})`-hjälpare i stället för att upprepa overlay-markup.*

- **Dynamisk statustext skrivs till containrar utan `aria-live`/`role="status"`.**
  Fel- och bekräftelsemeddelanden (Spara, Hämta, prefs-fel, dispatch-resultat) når
  inte skärmläsare. Toast-systemet har en live-region — inline-fälten ärver den inte.

- **Formulärfält etiketteras med `placeholder` i stället för `<label>`/`aria-label`.**
  Återkommer i alla fritextfält utom edit-modalen (som wrappar i `<label>` — rätt mönster).

- **Färgpaletten ligger nära men under WCAG-tröskeln för text.** Beräknat: rust-CTA
  vit text 4.09, text-muted 3.39, birch 2.35, header-flik 0.72-alpha — alla < 4.5 för
  normal text. Forest-knappen och `--rust-deep` klarar gränsen. *Vid nya färgval: kör
  `scratchpad/contrast.mjs`-mönstret (sRGB-luminans) innan en färg används som text.*
  CSS:en har redan en kommentar som erkänner header-flikens låga kontrast — kända
  brister hamnar i kommentarer i stället för att åtgärdas.

- **`user-scalable=no` i viewport** stänger av zoom helt (WCAG 1.4.4). Lätt att missa
  för att den ser "mobil-snygg" ut.

## Kod-/tillståndsmönster

- **Dubbla nyckelscheman för samma state-objekt.** `_checkedItems` för manuella varor
  skrivs under `manual::${idx}` (DB-load) men läses under `manual::${item}` (render) →
  bock tappas vid serveromladdning. *När en nyckel byggs på två ställen: extrahera en
  enda `keyFor(...)`-funktion.*

- **Nedmontering lämnar null-guardad död kod, inte kraschar.** Efter att klassiska
  veckovyn togs bort refererar `plan-viewer.js` fortfarande `weekRecipeDetail`/
  `.week-day-card` — men allt är `if (el) {…}`-skyddat, så "rent presentationell
  nedmontering" stämmer. Risken vid sådana borttagningar är *trasigt UI via stale
  service-worker-cache* (Session 101-buggen), inte dataförlust.

- **Tidiga returer som hoppar över state-rensning.** `renderShoppingData` returnerar
  vid tom data *innan* den döljer spinner/no-data → kvarhängande laddningstillstånd.
  *Rensa vy-tillstånd överst i render-funktionen, före eventuella early returns.*

- **Tomma `catch {}` är medvetna här** (begripliga svenska fel per CLAUDE.md) men gör
  felsökning svår och kan svälja oväntade fel utan logg.

## Process

- Appen är auth-gated mot live-Supabase → obevakade browser-journeys går inte att köra
  rakt av. Deterministiska fynd kommer i stället från kodläsning + uträkning (kontrast,
  null-deref-grep). Skilj alltid på DETERMINISTISK och BEDÖMNING i rapporter; BEDÖMNING
  ska verifieras på mobil/med skärmläsare innan den räknas som bekräftad.

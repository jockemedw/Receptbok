# Handoff: ny design för Receptboken

## Uppdrag

Implementera den nya designen för Receptboken enligt mockuperna i `docs/design/mockups/`. Designen är beslutad – det som ska göras är att ta den till appen, i den ordning och med den indelning du bedömer rimlig. Börja med att läsa `CLAUDE.md`, `docs/status.md` och mockuperna, och gör din egen discovery av hur dagens vyer, styling och data hänger ihop innan du föreslår en plan.

## Kontext och fattade beslut

Designarbetet gjordes i Claude Design mot appens riktiga innehåll (vecka 43, 10 riktiga recept med riktiga bilder). Följande är bestämt och ska inte omprövas:

1. **Typsnitt.** Bricolage Grotesque tas bort helt. DM Sans används överallt – rubriker, logotyp, receptnamn, brödtext. Vikt 700 behövs för rubriker.

2. **Receptbilder, hämtade från källan.** Recepten importerade från dishingouthealth.com (ca 75 av 165) har `notes` på formen `Källa: <engelsk originaltitel>, dishingouthealth.com`. Testat på 10 recept: originaltiteln matchad mot sajtens `post-sitemap.xml` ger exakt slug-träff på samtliga, och varje receptsida exponerar bilden både som `og:image` och som `Recipe.image` i JSON-LD. Bilderna ska lagras som kopior (nedskalade, kvadratiskt beskurna, webp) – inte hotlinkas. Recept utan källa får en tydlig platshållare i UI:t; de löses i ett senare steg.
   - Detta kräver att receptstrukturen får fält för källänk och bild. Enligt CLAUDE.md invariant 2 ska Joakim ge uttryckligt OK i sessionen innan migration körs – fråga, vänta, kör sedan.

3. **Receptvyn är master–detail på desktop** (mockup `B-Master-detail`): smal lista med miniatyr, titel och protein/tid till vänster; vald receptdetalj till höger med bild, titel, nyckeltal, handlingsknappar *Börja laga / Inköpslista / Planera in* direkt under rubriken, därefter ingredienser och steg i två kolumner. På mobil (`A-Recept-mobil`): fotogrid två i bredd, filterchips i topp, sök, bottennavigering.

4. **Receptlistan.** Filterchips (Alla, Vegetariskt, Fisk & skaldjur, Kyckling, Under 30 min, Provade, Ugn) och sortering högst upp – de flytande knapparna nere till höger utgår. Status "Oprövat" visas inte; endast "Provat" visas, som bock + text. Mockuperna grupperar på taggarna `vardag30`/`helg60` – nuvarande gruppering på kök får gärna finnas kvar som alternativ.

5. **Matsedel** (`B-Matsedel`, `B-Matsedel-mobil`): desktop visar hela veckan som sju kolumner; varje dag har bildruta (foto när receptet har ett, annars ikon som skiljer egen dag från recept), tom dag är ett streckat "Lägg till", ikväll markeras med accentram. Statistikbandet ("1 måltid / 0 veg. dagar" + stapel) ersätts av en textrad under rubriken. Knappar: veckonavigering, *Inköp för veckan*, *Föreslå matsedel* (= dagens Generera, med Bekräfta/Kassera-flödet oförändrat). Mobil: dagslista med datumkolumn, miniatyr och draghandtag.

6. **Inköp** (`B-Inkop`, `B-Inkop-mobil`): varor grupperade per avdelning med källan (receptnamn / "Eget tillägg") som liten etikett per rad, "Har hemma" som avbockad sektion sist. Inmatning högst upp. Desktop har en fast högerpanel: plockat-räknare, butiksval, *Skicka till Willys* som enda accentknapp, *Kopiera lista* sekundär, och en veckoremsa som visar vilka dagar listan bygger på. Mobil: *Skicka till Willys* fast i botten ovanför navigeringen. Avdelningsnamnen i mockupen är exempel – appens egen kategorisering styr.

7. **Idag** (`B-Idag`, `B-Idag-mobil`): kvällens kort får konkreta handlingar ("Välj ett recept i stället", "Byt dag") i stället för "Mer"; veckoöversikten visar dagnamn + rätt i text (desktop) respektive prickar med förklaring (mobil) i stället för de streckade pillren; inköpsstatus med snabbinmatning; på desktop en kort "Att göra"-lista (t.ex. fyll tom dag, skicka listan).

8. **Desktop ska använda bredden.** Dagens ~490 px centrerade kolumn ersätts av layouter som fyller upp till ca 1200 px. Headern blir låg: logotyp, nav, sök på en rad.

9. **Lagningsläget** är inte mockat, men ska i ett senare steg bli steg-för-steg med ingredienser kopplade till aktuellt steg, timers från stegtexten, och skalning avrundad till köksenheter (inte "226,67 g"). Ta inte det nu om det inte faller ut naturligt.

10. **Tema.** Mockuperna är ritade i mörkt tema med appens befintliga tokens (`--linen`, `--linen-card`, `--paper`, `--forest`, `--rust`, `--lichen-deep`, `--hairline`, proteinfärgerna). Ljust tema ska fungera lika bra via samma tokens.

## Mockuperna

`docs/design/mockups/*.dc.html` är fristående HTML-filer med inline-styling; öppna dem i webbläsare eller läs koden – exakta mått, färger, avstånd och radavstånd står där. `docs/design/mockups/img/` innehåller de tio testbilderna (640×640 webp) med recept-id i filnamnet. `canvas.json` beskriver vilka filer som hör till vilken vy.

| Fil | Vy |
|---|---|
| A-Recept-grid.dc.html | Receptlista desktop, bildgrid (referens; master–detail är vald) |
| A-Recept-mobil.dc.html | Receptlista mobil |
| A-Receptdetalj.dc.html | Receptdetalj som egen sida (ej vald, referens) |
| B-Master-detail.dc.html | Recept desktop – lista + detalj (vald) |
| B-Matsedel.dc.html / B-Matsedel-mobil.dc.html | Matsedel |
| B-Inkop.dc.html / B-Inkop-mobil.dc.html | Inköp |
| B-Idag.dc.html / B-Idag-mobil.dc.html | Idag |

## Förväntat arbetssätt

- Föreslå en indelning i steg (t.ex. typsnitt → bilder → receptvy → matsedel/inköp → idag) innan du kodar, och markera per steg om det är render-only eller datamuterande.
- Följ konventionerna i CLAUDE.md (versionsbump, max 12 filer i `api/`, JWT på skrivande endpoints, tester gröna, mobil först).
- Verifiering sker mot live-deployen på mobil av Joakim; logga i verifieringskön i `docs/status.md`.

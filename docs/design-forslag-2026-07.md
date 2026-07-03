# Designförslag 2026-07 — "Idag först"

**Interaktiv prototyp (öppna på mobilen):** https://claude.ai/code/artifact/ddad7251-ca56-4be4-92e2-5148dddf253c
**Status:** förslag — inget i den skarpa appen är ändrat. Väntar på Joakims riktningsbeslut.

> **Reviderad efter Joakims feedback (samma dag):** *"Jag är inte helt förtjust i rutnätet
> i bakgrunderna och i överkant av korten … Byt även 'veckans väv'. Det räcker med
> 'kommande veckan'."* → Rutnätstexturen (linneväven) är helt borttagen — bakgrunden är
> nu ren linne med en knappt märkbar varm ton uppe vid rubriken; djupet kommer från
> kortskuggorna. De randiga kortöverkanterna ersatta med ett smalt **helfärgat band i
> vänsterkanten** i proteinets färg (samma språk som dagkorten). Sektionen heter
> **"Kommande veckan"** och de två vävlinjerna bakom trådstaplarna är borta.
> Vävmetaforiken i texten nedan är justerad därefter.

Prototypen är en fristående hifi-mockup med exempeldata. Alla flöden är körbara:
tabbar, dag-sheet, receptdetalj, generera-wizard (hela kärnloopen: förslag → NY-piller →
bekräfta → inköpslista), avbockning i handla-läget, matlagningsläge med portionsskalning,
ljust + mörkt tema.

## Designtes
Appen ska svara innan man frågar. Familjens enda dagliga fråga är *"vad blir det ikväll?"*
— därför öppnar appen på svaret, inte på en receptlista. Identiteten fördjupas i stället
för att bytas: linne, lav och rost behålls (valda i Session 43), men får en signatur,
en bättre serif och ett mörkt tema.

## De fem pelarna

### 1. Idag först — ny standardflik
Ny flik **Idag** (ersätter Recept som startvy): Ikväll-hjälten (rätt, tid, protein,
extrapris-chip, *Börja laga* + *Mer* → dag-sheeten), "I morgon"-rad, minivy av veckans
väv, snabb-inmatning till listan. Dagens `data-active-tab="recept"` blir `"idag"`;
bottom-nav får 4 flikar: Idag · Matsedel · Lista · Recept.

### 2. Kommande veckan — veckan i färg (signaturen)
Veckoöversikten visar varje dag som en stapel i sitt proteins färg (fisk-fjordblå,
kyckling-ockra, kött-roströd, fläsk-lera, veg-lav — skärpta versioner av `PROTEIN_COLOR`).
Passerade dagar tonas, idag får en ring. Samma färgspråk återkommer som ett smalt
helfärgat band i vänsterkanten på Ikväll-kortet och receptkorten (dagkorten har det
redan) — proteinbalansen syns direkt utan statistik. Ersätter foto-behovet: appen har
inga receptbilder, färgbanden ger korten identitet ändå.

### 3. Tre tryck från tanke till inköpslista
"Ny matsedel" blir en fokuserad wizard-sheet i tre steg i stället för dagens utfällda
formulär: **(1) Vilka dagar?** (förval "Nästa vecka" m.fl. chips) → **(2) Familjens
vecka** (portioner, veg-dagar, oprövade, prisoptimera, säsong, proteiner — allt minns
sig självt, oftast trycker man bara vidare) → **(3) Generera** med pulserande
färgstaplar och statusrader ("Balanserar veckans proteiner…"). Förslag markeras med NY-piller +
banner, klisterbar *Bekräfta · bygg lista*-rad. Manuell trigger som alltid — bara
förpackningen ändras.

### 4. Byggd för en hand
- **Handla-läget:** progressring ("4 / 21"), kategorier med sticky-rubriker och
  "X kvar"-räknare, stora tryckytor (~52 px), bockade varor sjunker till "I korgen",
  extrapris-chip på rea-varor.
- **Matlagningsläget:** helskärm, ett steg i taget i stor Fraunces, stegprogress,
  portionsstepper som skalar mängderna live (= backlog #28), infällbar ingredienslista,
  wake-lock-hint.

### 5. Samma själ, högre finish
- **Typografi:** Playfair Display → **Fraunces** (kokboksserif med optisk storlek,
  varmare och mer "matvärld"); DM Sans behålls för UI. Wordmarkens *Recept*boken*-italic
  i ockra behålls.
- **Mörkt tema:** hela paletten tokeniserad med furu-mörk grund (`#1d2721`), ljusare
  proteinfärger, `--on-accent` för text på rost-knappar. Idag saknar appen mörkt läge helt.
- **Motion med mening:** sheet-glid, bock-animation i listan, pulserande färgstaplar
  vid generering — inget dekorativt; `prefers-reduced-motion` respekteras.
- **Mikrocopy:** knappar säger vad som händer ("Bekräfta · bygg lista"), tomma lägen
  är inbjudningar, fel är handlingsorienterade — enligt befintlig felmeddelande-princip.

## Tokens (ur prototypen)
Ljust: linen `#f6f2e9` · card `#fffdf7` · ink `#2f4136` · lichen `#7a9482`/`#587463` ·
rust `#b05f3f` · ochre `#c89a3e`. Mörkt: grund `#1d2721` · card `#263229` · ink `#ede7d9`.
Protein: fisk `#4d7fa8` · kyckling `#c8862a` · kött `#a34d3d` · fläsk `#c07a5a` · veg `#5e7a68`
(mörkt tema: ljusade varianter). Typo: Fraunces 400–700 + italic, DM Sans 300–600.
Radie: kort 18–24 px, sheets 26 px. Inga bakgrundstexturer — ren linne med svag varm
radial ton uppe; djup via kortskuggor.

## Vad som INTE ändras
Ingen backend-ändring, ingen datamodell-ändring, inga nya beroenden (typsnitten är
statiska filer). Dag-sheeten (Session 107) behålls som universellt interaktionsmönster —
prototypens dag-sheet är samma mentala modell med ny kostym. Deterministiskt receptval,
manuell generering, delad data — allt orört.

## Införandeplan — status 2026-07-03: godkänd av Joakim, HELT INFÖRD
Steg 1 ✅ (`2e4f0d4`) · steg 2 ✅ (`4408f60`) · steg 3 ✅ (`808f101`, som "Ikväll överst
i Matsedel" — ingen separat flik, se commit) · steg 4 ✅ wizard-sheet (`663d0f9`) ·
steg 5 ✅ progressring (`0e2c1a9`, "I korgen" uppskjuten) · steg 6 ✅ (`4aee3cd`) ·
**mörkt tema ✅** (`3026401` — token-nivå, följer OS-läget). Väntar mobil-verifiering.

## Införandeplan (förslag, inkrementell — appen funkar efter varje steg)
1. **Tokens + typografi** — ny palett/typsnitt i `styles.css`, Fraunces self-hostas
   (`fonts/`), mörkt tema via `prefers-color-scheme`. Lägst risk, störst omedelbar effekt.
2. **Kommande veckan-översikten + färgband på korten** — ren CSS/rendering i
   `plan-viewer-deluxe.js` + `recipe-browser.js`; proteinfärgerna skärps i `utils.js`
   (`PROTEIN_COLOR`).
3. **Idag-fliken** — ny slice `js/today/` som återanvänder Ikväll-logiken ur
   premiumvyn; nav-omflytt i `index.html` + `navigation.js`.
4. **Wizard-sheeten** — omförpackning av trigger-sektionen (`plan-generator.js`);
   samma fält, samma API-anrop.
5. **Handla-läget** — progressring + "I korgen"-flytt i `shopping-list.js`.
6. **Matlagningsläget** — steg-vy + skalning i `cook-mode.js` (löser #28 på köpet).

Varje steg mobil-verifieras mot live-Vercel innan nästa påbörjas (verifieringskön).

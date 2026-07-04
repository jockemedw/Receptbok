# Listor-förslag 2026-07 — vägen till full Cozi-ersättning

**Status:** förslag (Session 115). Grundat på Joakims tre skärmbilder: vår Listor-flik
(mörkt läge) + två skärmar ur familjens skarpa Cozi. Inget byggt än — detta är
prioriteringsunderlag inför fortsatt utveckling av P1/P2-fliken.

---

## Vad vi faktiskt såg i er Cozi

Familjens verkliga användning (inte teoretisk):

| Cozi-flik | Era listor | Mönster |
|---|---|---|
| **Shopping** | Inköpslista · Ture (barnkläder-storlekar) · Huset (husprojekt: stege, regntunna…) · Apotek · Matvaror | Bestående listor per **kontext/butik/person**, inte engångslistor |
| **To Do** | Shared To Do (blandade uppgifter: "Skapa lista renoveringar", "Flytta brädor utomhus"…) · Packlista | Uppgiftslistor |
| **Chores** | (verkar oanvänd i bilderna) | — |

**Nyckelobservationer om Cozis UI som ni är vana vid:**
1. **Innehållet syns direkt på översikten** — varje lista visar sina första ~3 rader + "+ N more items". Man ser vad som står på "Huset" utan att öppna den.
2. **Snabbtillägg inline** — "+ Add list items" direkt från översikten.
3. **Kategoriflikar** — Shopping / To Do / Chores separerar listtyper.
4. **Ikon per lista** (kundvagn / bock) för snabb scanning.
5. **Dra-handtag** för att ordna om listor.
6. **Reklambanner** (Omio) — Cozis gratisnivå visar annonser.

## Var vår flik står idag (P1 + P2)

| Har | Saknar mot Cozi |
|---|---|
| Listor med bockning, "Nollställ bockarna", arkiv, Realtime-synk | **Item-förhandsvisning på korten** — vi visar bara "X kvar av Y", inte *vad* som står |
| Anteckningar som eget segment (P2) | **Snabbtillägg från översikten** — måste öppna listan för att lägga rad |
| Mörkt läge, **noll reklam**, integrerat med matsedel + inköpslista | **Gruppering** av listtyper (Cozis flikar) |
| Fäst-på-Idag | **Ikon/färg per lista**, dra-för-att-ordna |

**Det vi redan slår Cozi på:** ingen reklam, mörkt läge, allt bor bredvid matsedeln
och inköpslistan, gratis och privat. Bytet ska kännas som en uppgradering, inte en
kompromiss.

## Föreslagna steg (prioriterade)

### L1 — Item-förhandsvisning på listkorten · *störst daglig vinst*
Visa de första ~3 raderna + "+N till" direkt på varje listkort, som Cozi. Idag måste
man öppna "Huset" för att minnas att stegen står där. Detta är den enskilt största
skillnaden mot Cozi i vardagsanvändning. Bockade rader tonas/utelämnas i förhandsvisningen.
**Insats:** liten (vi har redan `itemsOf(list.id)` — bara rendering på kortet).

### L2 — Snabbtillägg av rad från översikten · *näst störst*
Ett "+ Lägg till"-fält direkt på listkortet (eller ett expanderbart) så man kan slänga
in "blöjor" på Inköpslistan utan att öppna den. Speglar Cozis "+ Add list items".
**Insats:** liten–medel (återanvänder `flAddItem`).

### L3 — Ikon eller färg per lista · *scanning*
En liten ikon eller färgprick per lista (kundvagn för handel, hus för projekt, resväska
för packning…) så översikten blir scanbar som Cozis. Enklast: en valfri emoji/färg vald
vid skapande, sparad i en ny kolumn (`icon`/`color`) — kräver en liten migration (006).
**Insats:** medel.

### L4 — Gruppering av listtyper · *bara om ni känner behovet*
Cozis Shopping/To Do/Chores-flikar. **Rekommendation: vänta.** För ~8 listor är hårda
flikar troligen överarbete — en lång, scanbar lista (med L1+L3) räcker långt. Om ni ändå
vill gruppera: en lätt `category`-tagg med sektionsrubriker (som anteckningssegmentet)
är enklare än flikar och räcker. Beslut när L1–L3 använts ett tag.

### L5 — Dra för att ordna om listor · *lyx, lågt läge*
Manuell omordning med dra-handtag. Trevligt men lågt värde jämfört med L1–L3.

### Chores = redan i roadmapen (M4 rutiner & sysslor)
Cozis Chores-flik motsvarar plattformens **M4** (återkommande hushållssysslor med
veckoschema). Ligger redan i `docs/plattform-familjehub-2026-07.md` — inget nytt här,
bara noterat att Cozi-pariteten och M4 möts där.

## Vad vi INTE bör kopiera
- **Reklam** — självklart aldrig (det är delvis poängen med att byta).
- **Överarbetad kategoristruktur** — bygg inte tre flikar för åtta listor.
- **Separat "Meals"** — vi har redan matsedeln; Cozis Meals är en sämre version av det vi byggt.

## Rekommenderad ordning
1. **L1 item-förhandsvisning** (liten insats, störst daglig vinst — gör översikten användbar)
2. **L2 snabbtillägg** (liten insats, hög frekvens)
3. **L3 ikon/färg** (medel, migration 006) — när L1+L2 känns bra
4. **L4 gruppering** bara om behovet kvarstår; **L5** som sista polish

L1+L2 tillsammans stänger ~80 % av upplevelsegapet mot Cozi och är ett litet,
avgränsat bygge. Föreslår att börja där.

## Öppna frågor till Joakim
1. Vill du börja med **L1+L2** (item-förhandsvisning + snabbtillägg) direkt?
2. Känns **gruppering (L4)** viktigt, eller räcker en lång scanbar lista med förhandsvisning?
3. **Migration av era Cozi-listor:** manuellt återskapa de ~7 listorna, eller vill du att
   jag förbereder en enkel import (klistra in listnamn + rader)?

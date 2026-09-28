# Ingrediens-audit — 2026-09-28

> Genererad av `scripts/audit-ingredients.mjs`. Källa: live Supabase (export via Management-API:t, Session 148).

## Sammanfattning

- **Recept:** 156
- **Ingrediensrader:** 2188
- **Rader med problem (P0–P2):** 387

| Severity | Antal | Innebörd |
|---|---|---|
| **P0** | 0 | Mängd uppenbart närvarande men tappad i parsning — bryter listan |
| **P1** | 13 | Riktig ingrediens utan definierbar mängd, eller flera ingredienser på en rad |
| **P2** | 374 | Ej pris-matchbart namn, brus eller kosmetiskt format |

## Per problemklass

| Klass | Antal rader |
|---|---|
| C1 okänt namn (ej canon) | 218 |
| C4 beskrivande brus | 175 |
| C2 saknad mängd | 10 |
| C3 flera ingredienser/rad | 4 |

## Pris-matchbarhet (canon-täckning)

- **Icke-canon-namn (unika):** 196 — matchar inga Willys-erbjudanden, slås ihop svagt.

### 40 vanligaste icke-canon-namnen (Fas 2-kandidater)

| Antal | Namn |
|---|---|
| 35× | salt och svartpeppar |
| 21× | vatten |
| 6× | chiliflakes |
| 6× | salt och peppar |
| 4× | olivolja, |
| 4× | salt & peppar |
| 3× | färska örter |
| 3× | grönsaksbuljongen |
| 3× | sockerärtor |
| 3× | fett |
| 2× | persilja, |
| 2× | belugalinser |
| 2× | pancetta |
| 2× | blekselleristjälkar |
| 2× | rapsolja, |
| 2× | apelsinskal |
| 2× | fänkålsknöl |
| 2× | chili-vitlökssås |
| 2× | osötad cashewmjölk |
| 2× | blomkålsbuketter |
| 2× | riven vit cheddar |
| 2× | marinerade kronärtskockshjärtan |
| 2× | blomkålshuvud |
| 2× | bbq-sås |
| 2× | kallt vatten |
| 2× | stjälkselleri |
| 2× | grönsaker , |
| 2× | färsk koriander, |
| 1× | ägg, |
| 1× | hp-sås |
| 1× | olja, |
| 1× | fänkål |
| 1× | saffran |
| 1× | frysta vitlöksbaguetter |
| 1× | blandade bönor |
| 1× | örtsalt |
| 1× | salladsblad, |
| 1× | soppasta |
| 1× | strimlad salladslök, |
| 1× | hackade nötter, |

## P0 + P1-rader per recept (åtgärdslista för Fas 3)


### #30 — Valnötshummus med ugnsrostade grönsaker

- `Ugnsrostade grönsaker: en plåt grönsaker/rotfrukter (t ex 400 g potatis, kålklyftor, morot, blomkål eller broccoli, 1 röd paprika, några jordärtskockor)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C1 okänt namn (ej canon))

### #31 — Pepprig pastasås med aubergine

- `pasta för 4 personer`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #43 — Sötpotatissallad med fetaost och hot honey-dressing

- `Hot honey-dressing: 1 dl blandade nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #49 — Senapsdressad pärlcouscous

- `pärlcouscous (för 4 portioner)`  — **P1** (C2 saknad mängd)

### #58 — Broccolipesto

- `1 dl nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #70 — Kryddiga laxbowls med avokadosås

- `basilika och koriander, blandat (0,6 dl)`  — **P1** (C3 flera ingredienser/rad)

### #265 — Snabbrimmad torsk med ägg och persilja

- `potatis för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #269 — Gräddig Cashew-Kyckling med Curry

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #270 — Brysselkålbonara

- `spagetti för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #271 — Tikka Masala

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #272 — Jordnöts- och kikärtsgryta med kokosris

- `Salta jordnötter (hackade)`  — **P1** (C2 saknad mängd)
- `Färsk koriander (hackad)`  — **P1** (C2 saknad mängd)
- `Chilikrisp (använd det här receptet för att göra din egen!)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

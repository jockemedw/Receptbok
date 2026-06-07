# Ingrediens-audit — 2026-06-07

> Genererad av `scripts/audit-ingredients.mjs`. Källa: fil: docs/qc-night/recipe-final-20260607.json.

## Sammanfattning

- **Recept:** 262
- **Ingrediensrader:** 3788
- **Rader med problem (P0–P2):** 673

| Severity | Antal | Innebörd |
|---|---|---|
| **P0** | 0 | Mängd uppenbart närvarande men tappad i parsning — bryter listan |
| **P1** | 12 | Riktig ingrediens utan definierbar mängd, eller flera ingredienser på en rad |
| **P2** | 661 | Ej pris-matchbart namn, brus eller kosmetiskt format |

## Per problemklass

| Klass | Antal rader |
|---|---|
| C1 okänt namn (ej canon) | 390 |
| C4 beskrivande brus | 312 |
| C2 saknad mängd | 8 |
| C3 flera ingredienser/rad | 7 |

## Pris-matchbarhet (canon-täckning)

- **Icke-canon-namn (unika):** 323 — matchar inga Willys-erbjudanden, slås ihop svagt.

### 40 vanligaste icke-canon-namnen (Fas 2-kandidater)

| Antal | Namn |
|---|---|
| 47× | salt och svartpeppar |
| 33× | vatten |
| 9× | chiliflakes |
| 7× | salt och peppar |
| 5× | grönsaksbuljongen |
| 4× | salt & peppar |
| 4× | poblano-peppar |
| 4× | osötad cashewmjölk |
| 4× | portobellosvamp |
| 3× | grönsaksbuljongtärningar |
| 3× | varmt vatten |
| 3× | bröd |
| 3× | oregano |
| 3× | färska örter |
| 3× | marinerade kronärtskockshjärtan |
| 3× | adobosås från chipotleburk |
| 3× | grovmalen svartpeppar |
| 3× | fett |
| 3× | grönsaker |
| 2× | matvete |
| 2× | belugalinser |
| 2× | fänkål |
| 2× | örtsalt |
| 2× | kyckling |
| 2× | ostronsås |
| 2× | pancetta |
| 2× | blekselleristjälkar |
| 2× | gochugaru |
| 2× | apelsinskal |
| 2× | radicchio |
| 2× | solrosfrön |
| 2× | lacinato-grönkål |
| 2× | fänkålsknöl |
| 2× | russin |
| 2× | buffalosås |
| 2× | kimchi |
| 2× | yukon gold-potatis |
| 2× | pintobönor |
| 2× | fresnochili |
| 2× | chili-vitlökssås |

## P0 + P1-rader per recept (åtgärdslista för Fas 3)


### #27 — Hummusbowl

- `2 dl oliver och hackade soltorkade tomater`  — **P1** (C3 flera ingredienser/rad)

### #30 — Valnötshummus med ugnsrostade grönsaker

- `Ugnsrostade grönsaker: en plåt grönsaker/rotfrukter (t ex 400 g potatis, kålklyftor, morot, blomkål eller broccoli, 1 röd paprika, några jordärtskockor)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C1 okänt namn (ej canon))

### #31 — Pepprig pastasås med aubergine

- `pasta för 4 personer`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #43 — Sötpotatissallad med fetaost och hot honey-dressing

- `Hot honey-dressing: 1 dl blandade nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #49 — Senapsdressad pärlcouscous

- `pärlcouscous (för 4 portioner)`  — **P1** (C2 saknad mängd)

### #58 — Broccolipesto

- `1 dl nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #70 — Kryddiga laxbowls med avokadosås

- `basilika och koriander, blandat (0,6 dl)`  — **P1** (C3 flera ingredienser/rad)

### #235 — Linsen- och svamptacos

- `rödkål (strimlad, blandad med strimlade morötter, skivad salladslök, äppelcidervinäger och salt)`  — **P1** (C2 saknad mängd)

### #265 — Snabbrimmad torsk med ägg och persilja

- `potatis för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #269 — Gräddig Cashew-Kyckling med Curry

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)

### #270 — Brysselkålbonara

- `spagetti för 4 pers`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #271 — Tikka Masala

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)

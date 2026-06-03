# Ingrediens-audit — 2026-06-03

> Genererad av `scripts/audit-ingredients.mjs`. Källa: fil: /tmp/recipes-supabase.json.

## Sammanfattning

- **Recept:** 262
- **Ingrediensrader:** 3791
- **Rader med problem (P0–P2):** 840

| Severity | Antal | Innebörd |
|---|---|---|
| **P0** | 0 | Mängd uppenbart närvarande men tappad i parsning — bryter listan |
| **P1** | 68 | Riktig ingrediens utan definierbar mängd, eller flera ingredienser på en rad |
| **P2** | 772 | Ej pris-matchbart namn, brus eller kosmetiskt format |

## Per problemklass

| Klass | Antal rader |
|---|---|
| C1 okänt namn (ej canon) | 519 |
| C4 beskrivande brus | 319 |
| C2 saknad mängd | 53 |
| C3 flera ingredienser/rad | 22 |

## Pris-matchbarhet (canon-täckning)

- **Icke-canon-namn (unika):** 401 — matchar inga Willys-erbjudanden, slås ihop svagt.

### 40 vanligaste icke-canon-namnen (Fas 2-kandidater)

| Antal | Namn |
|---|---|
| 47× | salt och svartpeppar |
| 33× | vatten |
| 29× | dijonsenap |
| 9× | chiliflakes |
| 7× | salt och peppar |
| 6× | grönsaksbuljongen |
| 4× | salt & peppar |
| 4× | poblano-peppar |
| 4× | osötad cashewmjölk |
| 4× | portobellosvamp |
| 3× | grönsaksbuljongtärningar |
| 3× | varmt vatten |
| 3× | bröd |
| 3× | sparris |
| 3× | färska örter |
| 3× | marinerade kronärtskockshjärtan |
| 3× | frysta gröna ärtor |
| 3× | adobosås från chipotleburk |
| 3× | grovmalen svartpeppar |
| 3× | fett |
| 3× | grönsaker |
| 2× | matvete |
| 2× | frysta ärter |
| 2× | senapsfrön |
| 2× | kardemumma |
| 2× | risoni |
| 2× | salladskål |
| 2× | belugalinser |
| 2× | fänkål |
| 2× | örtsalt |
| 2× | palsternacka |
| 2× | lagerblad |
| 2× | kyckling |
| 2× | ostronsås |
| 2× | pancetta |
| 2× | blekselleristjälkar |
| 2× | gröna ärtor |
| 2× | gochugaru |
| 2× | apelsinskal |
| 2× | couscous |

## P0 + P1-rader per recept (åtgärdslista för Fas 3)


### #2 — Matvetesallad med gröna ärter och krispig halloumi

- `Olivolja`  — **P1** (C2 saknad mängd)

### #10 — Ramen med salladskål och champinjoner

- `torrostade sesamfrön`  — **P1** (C2 saknad mängd)

### #17 — Soppa med vermicelli och rotfrukter

- `örtsalt (t ex Vegeta allkrydda)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #22 — Parmesanpotatis med kallrökt lax

- `salladsblad`  — **P1** (C2 saknad mängd)

### #27 — Hummusbowl

- `2 dl oliver och hackade soltorkade tomater`  — **P1** (C3 flera ingredienser/rad)
- `pressad citron`  — **P1** (C2 saknad mängd)
- `libabröd eller lantbröd`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #29 — Stekt curryris med färs och salladslök

- `rapsolja`  — **P1** (C2 saknad mängd)
- `6–8 dl kokt ris/bulgur/matvete`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon))
- `strimlad salladslök`  — **P1** (C2 saknad mängd)
- `hackade nötter`  — **P1** (C2 saknad mängd)

### #30 — Valnötshummus med ugnsrostade grönsaker

- `Ugnsrostade grönsaker: en plåt grönsaker/rotfrukter (t ex 400 g potatis, kålklyftor, morot, blomkål eller broccoli, 1 röd paprika, några jordärtskockor)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C1 okänt namn (ej canon))

### #31 — Pepprig pastasås med aubergine

- `olivolja`  — **P1** (C2 saknad mängd)
- `en näve körsbärstomater (kan uteslutas)`  — **P1** (C2 saknad mängd)
- `torkad oregano`  — **P1** (C2 saknad mängd)
- `pasta för 4 personer`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #32 — Breakfast burrito med kål och äggröra

- `rapsolja`  — **P1** (C2 saknad mängd)

### #33 — Krispiga ostquesadillas med grönkål och potatis med syrlig koriandersås

- `rapsolja`  — **P1** (C2 saknad mängd)

### #35 — Katsu sando med panerad tofu och kålsallad

- `Kålsallad: ½ huvud spetskål eller färsk vitkål`  — **P1** (C3 flera ingredienser/rad)

### #38 — Sommargryta med vitkål, zucchini och dill

- `rapsolja`  — **P1** (C2 saknad mängd)

### #42 — Pork ramen – nudelsoppa med chilistekt fläskfärs

- `Buljong: japansk soja`  — **P1** (C2 saknad mängd)

### #43 — Sötpotatissallad med fetaost och hot honey-dressing

- `Hot honey-dressing: 1 dl blandade nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #49 — Senapsdressad pärlcouscous

- `pärlcouscous (för 4 portioner)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #55 — Amandas laxbiffar

- `örtkryddor`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #56 — Pasta Rosso med champinjoner

- `oregano eller basilika`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #58 — Broccolipesto

- `1 dl nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #63 — Chopped sallad med krämig dressing

- `Rostade kikärtor`  — **P1** (C2 saknad mängd)
- `Tunna brödchips`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `Dressing`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `Sallad`  — **P1** (C2 saknad mängd)

### #64 — Färgstark grönsakswok

- `lite svartpeppar ur kvarn`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #70 — Kryddiga laxbowls med avokadosås

- `basilika och koriander, blandat (0,6 dl)`  — **P1** (C3 flera ingredienser/rad)

### #78 — Stekt vit fisk med harissa, fänkål och kapris

- `vit fisk utan skinn och ben, t.ex. hälleflundra eller torsk (450 g)`  — **P1** (C3 flera ingredienser/rad; C4 beskrivande brus)

### #84 — Tonfisksmältare med snabbsyrad fänkål

- `citronskal och saft (1 citron)`  — **P1** (C3 flera ingredienser/rad)

### #93 — Rökiga laxburgare med citron- och dillspread

- `färsk dill och gräslök, fint hackad (1–2 tsk av varje)`  — **P1** (C3 flera ingredienser/rad)

### #124 — Svampstekt ris med röd curry och jordnötssås

- `baby bella-svamp/creminisvamp, tunt skivad (225 g)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)

### #144 — Kycklingpasta Florentine

- `kycklingbröst utan ben och skinn, tärnad (450 g)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)

### #163 — Apelsin- och basilikakyckling med kokosnötris

- `kycklingbröst utan ben och skinn (450 g, tärnad i munsbitar)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)

### #186 — Sötpotatis- och linsallad med pistachiosalsa och tahinilime

- `limeskal och limejuice (2 msk juice totalt)`  — **P1** (C3 flera ingredienser/rad)

### #193 — Räkor scampi med spagettipumpa

- `pressad saft från en halv citron`  — **P1** (C2 saknad mängd)

### #206 — BBQ Ranch-skålar med kikärtor och quinoa

- `fryst/tinad ugnsrostad majs, värmad (1,8 dl)`  — **P1** (C3 flera ingredienser/rad)

### #211 — Tonfiskgratäng med nudlar

- `citronskal och saft (1 citron)`  — **P1** (C3 flera ingredienser/rad)

### #230 — Plåtbakad chili- och citronlax med vitlöksörtsås

- `rivet citronskal från 1 citron`  — **P1** (C2 saknad mängd)

### #235 — Linsen- och svamptacos

- `rödkål (strimlad, blandad med strimlade morötter, skivad salladslök, äppelcidervinäger och salt)`  — **P1** (C2 saknad mängd)

### #246 — Pasta alla vodka med pumpa

- `chilipulver (en nypa)`  — **P1** (C2 saknad mängd)

### #257 — Stekt öring med Old Bay-remoulad

- `stänk av het sås (t.ex. Tabasco)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #258 — Enkel puttanesca med kikärtor (en gryta)

- `chilipulver (en nypa)`  — **P1** (C2 saknad mängd)

### #263 — Örtig tortellinisoppa

- `Olivolja`  — **P1** (C2 saknad mängd)
- `Basilika eller oregano (torkad eller färsk)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `En nypa socker`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #264 — Väffeltoast med rökt kalkon, äpple och dijonkräm

- `plockgrönsaker (tillbehör)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `mjölk (tillbehör)`  — **P1** (C2 saknad mängd)

### #265 — Snabbrimmad torsk med ägg och persilja

- `potatis för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `grönsaker, t ex tomater och gröna ärtor`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `färsk persilja, gärna krusbladig`  — **P1** (C2 saknad mängd)

### #268 — Nudelwok med thai-basilika och ostronsås

- `hackade nötter, t ex cashew- eller jordnötter`  — **P1** (C2 saknad mängd)
- `salladslök`  — **P1** (C2 saknad mängd)
- `thaibasilika eller färsk koriander`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `något starkt att ringla över för den som vill, t ex srirachasås`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #269 — Gräddig Cashew-Kyckling med Curry

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)
- `kokosflingor, gärna snabbt rostade i torr stekpanna`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `grönsaker, t ex tomater och kikärtor`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `färsk koriander`  — **P1** (C2 saknad mängd)

### #270 — Brysselkålbonara

- `spagetti för 4 pers`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #271 — Tikka Masala

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)
- `färsk koriander`  — **P1** (C2 saknad mängd)
- `mangotärningar (tinade frysta är enklast)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `hackade jordnötter`  — **P1** (C2 saknad mängd)

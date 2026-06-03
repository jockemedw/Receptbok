# Ingrediens-audit — 2026-06-03

> Genererad av `scripts/audit-ingredients.mjs`. Källa: fil: /tmp/recipes-supabase.json.

## Sammanfattning

- **Recept:** 262
- **Ingrediensrader:** 3791
- **Rader med problem (P0–P2):** 1037

| Severity | Antal | Innebörd |
|---|---|---|
| **P0** | 0 | Mängd uppenbart närvarande men tappad i parsning — bryter listan |
| **P1** | 309 | Riktig ingrediens utan definierbar mängd, eller flera ingredienser på en rad |
| **P2** | 728 | Ej pris-matchbart namn, brus eller kosmetiskt format |

## Per problemklass

| Klass | Antal rader |
|---|---|
| C1 okänt namn (ej canon) | 517 |
| C4 beskrivande brus | 320 |
| C2 saknad mängd | 269 |
| C3 flera ingredienser/rad | 76 |

## Pris-matchbarhet (canon-täckning)

- **Icke-canon-namn (unika):** 404 — matchar inga Willys-erbjudanden, slås ihop svagt.

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
| 3× | grönsaksbuljongtärningar |
| 3× | varmt vatten |
| 3× | bröd |
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
| 2× | radicchio |
| 2× | solrosfrön |

## P0 + P1-rader per recept (åtgärdslista för Fas 3)


### #2 — Matvetesallad med gröna ärter och krispig halloumi

- `Olivolja`  — **P1** (C2 saknad mängd)

### #10 — Ramen med salladskål och champinjoner

- `torrostade sesamfrön`  — **P1** (C2 saknad mängd)

### #13 — Nudlar i röd curry

- `Valfritt: rostad lök och sesamfrön`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #17 — Soppa med vermicelli och rotfrukter

- `örtsalt (t ex Vegeta allkrydda)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #18 — Tuna melt-macka

- `smör eller olja till stekning`  — **P1** (C3 flera ingredienser/rad)

### #21 — Min bästa wok

- `Till servering: chiliflakes eller skivad färsk chili`  — **P1** (C3 flera ingredienser/rad)

### #22 — Parmesanpotatis med kallrökt lax

- `salladsblad`  — **P1** (C2 saknad mängd)

### #25 — Gazpacho

- `Tillbehör: bröd`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `Tillbehör: skalade räkor`  — **P1** (C2 saknad mängd)
- `Tillbehör: kokta linser, kikärtor eller bönor`  — **P1** (C2 saknad mängd)
- `Tillbehör: färsk koriander, hackad`  — **P1** (C2 saknad mängd)

### #27 — Hummusbowl

- `2 dl oliver och hackade soltorkade tomater`  — **P1** (C3 flera ingredienser/rad)
- `pressad citron`  — **P1** (C2 saknad mängd)
- `libabröd eller lantbröd`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #29 — Stekt curryris med färs och salladslök

- `rapsolja`  — **P1** (C2 saknad mängd)
- `6–8 dl kokt ris/bulgur/matvete`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon))
- `strimlad salladslök`  — **P1** (C2 saknad mängd)
- `hackade nötter`  — **P1** (C2 saknad mängd)
- `Gott till: srirachasås`  — **P1** (C2 saknad mängd)

### #30 — Valnötshummus med ugnsrostade grönsaker

- `Ugnsrostade grönsaker: en plåt grönsaker/rotfrukter (t ex 400 g potatis, kålklyftor, morot, blomkål eller broccoli, 1 röd paprika, några jordärtskockor)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C1 okänt namn (ej canon))
- `Valnötshummus: chilipulver, citronjuice och salt efter smak`  — **P1** (C2 saknad mängd)
- `Gott till: fetaost, oliver eller kapris, rökt tofu`  — **P1** (C2 saknad mängd)

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

- `zucchini (ca 400 g)`  — **P1** (C2 saknad mängd)
- `rapsolja`  — **P1** (C2 saknad mängd)
- `Till servering: baguette eller annat rustikt bröd`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)

### #42 — Pork ramen – nudelsoppa med chilistekt fläskfärs

- `Buljong: japansk soja`  — **P1** (C2 saknad mängd)

### #43 — Sötpotatissallad med fetaost och hot honey-dressing

- `Hot honey-dressing: 1 dl blandade nötter och frön`  — **P1** (C3 flera ingredienser/rad)
- `Topping: citronsaft`  — **P1** (C2 saknad mängd)

### #49 — Senapsdressad pärlcouscous

- `pärlcouscous (för 4 portioner)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #52 — Amandas pasta med morötter, lök & sweet chili

- `valfria grönsaker (t.ex. ärtor, vitkål, paprika)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `hackade nötter (valfritt)`  — **P1** (C2 saknad mängd)

### #55 — Amandas laxbiffar

- `örtkryddor`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #56 — Pasta Rosso med champinjoner

- `oregano eller basilika`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #58 — Broccolipesto

- `1 dl nötter och frön`  — **P1** (C3 flera ingredienser/rad)

### #62 — Rödbetsrisotto

- `Till servering: 2 dl rostade nötter/frön`  — **P1** (C3 flera ingredienser/rad)

### #63 — Chopped sallad med krämig dressing

- `Rostade kikärtor`  — **P1** (C2 saknad mängd)
- `Tunna brödchips`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `Dressing`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `Sallad`  — **P1** (C2 saknad mängd)

### #64 — Färgstark grönsakswok

- `grovt milt salt (ca 1 tsk)`  — **P1** (C2 saknad mängd)
- `lite svartpeppar ur kvarn`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #67 — Citrongrässoppa med kokosmjölk, tofu och nudlar

- `bruna risnudlar eller ris (till servering)`  — **P1** (C3 flera ingredienser/rad)

### #68 — Höstquinoabowl med apelsin- och timjanvinägrett

- `radicchio (1 litet huvud)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #70 — Kryddiga laxbowls med avokadosås

- `skivad avokado (valfritt)`  — **P1** (C2 saknad mängd)
- `basilika och koriander, blandat (0,6 dl)`  — **P1** (C3 flera ingredienser/rad)

### #72 — Honung- och sojaglaserad tofu med morot-ingefärssås

- `morötter, skurna i grova bitar (2,4 dl / ca 1 stor eller 2 små)`  — **P1** (C2 saknad mängd)
- `sesamfrön och salladslök till garnering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #74 — Linssallad med sötpotatis, grönkål och tahini

- `sötpotatis, skalad och tärnad (ca 300 g)`  — **P1** (C2 saknad mängd)
- `olivolja, extra virgin (2 msk + 2 tsk)`  — **P1** (C2 saknad mängd)
- `färsk persilja eller basilika (valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #77 — Teriyakibowl med apelsin och tempeh

- `färsk basilika och/eller koriander (valfritt, till garnering)`  — **P1** (C3 flera ingredienser/rad)

### #78 — Stekt vit fisk med harissa, fänkål och kapris

- `vit fisk utan skinn och ben, t.ex. hälleflundra eller torsk (450 g)`  — **P1** (C3 flera ingredienser/rad; C4 beskrivande brus)

### #80 — Rostade rotfrukter och getostpizza med chilihonungsglaze

- `färsk basilika (valfritt)`  — **P1** (C2 saknad mängd)

### #81 — Rökig kikärts- och linssoppa

- `osaltad grönsaksbuljong (ca 1 liter)`  — **P1** (C2 saknad mängd)
- `riven parmesan eller näringsjäst till servering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #82 — Vårlig primavera med grönsaksnudlar

- `sparris (5 tjocka stjälkar)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #84 — Tonfisksmältare med snabbsyrad fänkål

- `citronskal och saft (1 citron)`  — **P1** (C3 flera ingredienser/rad)

### #85 — Gurkmeje- och tempehcurry med kokosmjölk

- `kokt basmatirris (ca 10 dl)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `grekisk yoghurt (efter smak, valfritt)`  — **P1** (C2 saknad mängd)
- `cashewnötter eller jordnötter, hackade (valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `salladslök, fint hackad (valfritt)`  — **P1** (C2 saknad mängd)

### #86 — Orecchiette med solrosfrö-romesco

- `broccolibuketter (ca 6 dl)`  — **P1** (C2 saknad mängd)
- `riven parmesan eller näringsjäst till garnering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #88 — Buffalo-broccoli och kikärtspitas med tahinicaesar

- `röd lök, tunt skivad (valfritt)`  — **P1** (C2 saknad mängd)
- `avokado (valfritt)`  — **P1** (C2 saknad mängd)
- `romansallad, fint hackad (valfritt)`  — **P1** (C2 saknad mängd)
- `koriander (valfritt)`  — **P1** (C2 saknad mängd)

### #91 — Enkla lönnsirap- och dijonkotletter

- `lönnsirap (1 msk + 2 tsk)`  — **P1** (C2 saknad mängd)

### #93 — Rökiga laxburgare med citron- och dillspread

- `valfria tillbehör: sallad eller ruccola, avokado, rödlök tunt skivad`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `färsk dill och gräslök, fint hackad (1–2 tsk av varje)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #94 — Currylaxbiffar med citronyoghurt

- `kimchi, valfritt`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `avokado, skivad, valfritt`  — **P1** (C2 saknad mängd)
- `morötter, valfritt`  — **P1** (C2 saknad mängd)
- `mango, skivad, valfritt`  — **P1** (C2 saknad mängd)
- `färsk koriander, valfritt`  — **P1** (C2 saknad mängd)

### #97 — Grillad romansallad med buffalo-tofu och tahini ranch

- `fetaost, smulad (valfritt)`  — **P1** (C2 saknad mängd)
- `rödlök (valfritt)`  — **P1** (C2 saknad mängd)
- `färsk gräslök, finhackad (valfritt)`  — **P1** (C2 saknad mängd)

### #98 — Enchiladas med squash och quinoa

- `limeklyftor, valfritt (efter smak)`  — **P1** (C2 saknad mängd)
- `koriander, valfritt (efter smak)`  — **P1** (C2 saknad mängd)
- `avokado, skivad, valfritt (efter smak)`  — **P1** (C2 saknad mängd)
- `rädisa, tunt skivad, valfritt (efter smak)`  — **P1** (C2 saknad mängd)
- `jalapeño, skivad, valfritt (efter smak)`  — **P1** (C2 saknad mängd)

### #99 — Koreanska veggieburgerbowlar

- `strösocker (1 msk + 0,5 tsk, uppdelat)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #100 — Pasta med vegansk vodkasås

- `färsk basilika efter smak`  — **P1** (C2 saknad mängd)

### #101 — Currystekta smörrisotto med krispiga brysselkål

- `salladslök, tunt skivad (valfritt)`  — **P1** (C2 saknad mängd)

### #102 — Miso- och svamprisotto

- `ägg, pocherade eller löskokt (valfritt)`  — **P1** (C2 saknad mängd)
- `sesamfrön (valfritt)`  — **P1** (C2 saknad mängd)
- `microgreens (valfritt)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #107 — Medelhavslax med bulgur

- `grekisk yoghurt (valfritt, som tillbehör)`  — **P1** (C2 saknad mängd)
- `ruccola (valfritt, som tillbehör)`  — **P1** (C2 saknad mängd)
- `citronklyftor (valfritt, som tillbehör)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #108 — Currysallad med ris

- `naturell yoghurt, helfet (inte grekisk, 1,2 dl)`  — **P1** (C2 saknad mängd)

### #109 — Kokosnötscurry med kikärtor och mango

- `broccolibuketter (ca 5 dl, från 1 stort huvud)`  — **P1** (C2 saknad mängd)

### #110 — Pasta med rostad paprikasås och svamp

- `parmesan, riven (valfritt)`  — **P1** (C2 saknad mängd)
- `chilipulver (valfritt)`  — **P1** (C2 saknad mängd)

### #112 — Räkpasta Primavera med Zucchininudlar

- `färsk babyspenat (3 generösa nävar)`  — **P1** (C2 saknad mängd)

### #114 — Medelhavsbowl med röd paprikasås

- `färsk basilika och citronklyftor (valfritt), till servering`  — **P1** (C3 flera ingredienser/rad)

### #115 — Sesamtofu med sötpotatinudlar

- `sesamfrön (valfritt)`  — **P1** (C2 saknad mängd)
- `färsk basilika (valfritt)`  — **P1** (C2 saknad mängd)
- `hackade nötter (valfritt)`  — **P1** (C2 saknad mängd)

### #118 — Tomat- och currykokta ägg

- `cayennepeppar eller chilipulver för hetta (valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `gott bröd eller kokt vitt ris till servering`  — **P1** (C3 flera ingredienser/rad)

### #122 — Currysoppa med röda linser

- `kokosmjölksyoghurt (valfritt)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `koriander (valfritt)`  — **P1** (C2 saknad mängd)

### #124 — Svampstekt ris med röd curry och jordnötssås

- `baby bella-svamp/creminisvamp, tunt skivad (225 g)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)
- `hackade jordnötter och rostad sesamolja till garnering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #125 — Blomkåls- och potatissoppa med cheddar

- `blomkålsbuketter, små (ca 1,4 liter / 1 medelstor blomkål)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `grönsaksbuljong, lättsaltad (ca 1 liter)`  — **P1** (C2 saknad mängd)
- `vita bönor (navybönor), avrunna och sköljda (1 burk, ca 440 g)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `gräslök, fint hackad (efter smak, valfritt)`  — **P1** (C2 saknad mängd)

### #127 — Stekt Tofu-Smörgås med Coleslaw

- `sojasås med låg salthalt (2 msk + 2 tsk), uppdelat`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `vegetabilisk olja för stekning`  — **P1** (C2 saknad mängd)

### #130 — Chili-lime-spett med tofu och persika

- `olivolja eller avokadoolja (för grillning)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `limeskal (från 1 lime)`  — **P1** (C2 saknad mängd)
- `sojasås (1 msk + 1 tsk)`  — **P1** (C2 saknad mängd)

### #131 — Vegetarisk paella

- `olivolja, extra virgin (0,6 dl + 2 msk, uppdelat)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #132 — Gochujangtofu med ris och inlagda grönsaker

- `rädisa (daikon eller vattenmelon), strimlad (0,6 dl)`  — **P1** (C2 saknad mängd)

### #133 — Squash- och valnötsfritters med krämig vitlöks- och örtsås

- `citronskal (från 1 citron, spara saften till såsen)`  — **P1** (C2 saknad mängd)

### #134 — Veggie-quesadillas med chipotle-mangosås

- `olivolja (2 msk + 4 tsk)`  — **P1** (C2 saknad mängd)

### #135 — Citronsmörpasta med broccoli

- `osaltat smör (3 msk + 2 tsk)`  — **P1** (C2 saknad mängd)
- `broccolibuketter, små (ca 1,4 liter)`  — **P1** (C2 saknad mängd)

### #139 — BBQ-persika skillet-pizza

- `färsk basilika och/eller ruccola (efter smak)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #140 — Quinoa-fyllda paprikahalvor

- `Valfria tillbehör: grekisk yoghurt eller gräddfil, extra salsa, ost`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #141 — Citronsmörsrisotto med squash

- `grönsaksbuljongg (ca 1 liter)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `karamelliserade citronklyftor och färsk timjan eller basilika (valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #142 — Chili-soja-svampbullar med ingefärs- och salladslöksris

- `lägre-natriumsojasås eller tamari (0,8 dl + 2 tsk, uppdelat)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)

### #143 — Kokosnöts- och currysoppa med majs

- `färska majskorn, skurna från kolven (ca 9,5 dl, eller fryst/tinad eller konserverad majs)`  — **P1** (C2 saknad mängd)

### #144 — Kycklingpasta Florentine

- `kycklingbröst utan ben och skinn, tärnad (450 g)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)

### #145 — Thaiinspirerad pumpassoppa

- `rostade pumpafrön, koriander, salladslök och granatäppelkärnor (valfritt, som garnering)`  — **P1** (C2 saknad mängd)

### #146 — Quinoa- och grönsaksbowls

- `butternutpumpa, skalad och tärnad (ca 7 dl, från 1 liten pumpa)`  — **P1** (C2 saknad mängd)
- `lättsaltat grönsaks- eller kycklingbuljong (ca 5 dl)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `avokado, skivad, valfritt`  — **P1** (C2 saknad mängd)

### #148 — Spaghetti squash alfredo (vegansk)

- `matolja spray`  — **P1** (C2 saknad mängd)
- `valfritt tillbehör: stekt broccoli eller strimlad brysselkål, soltorkade tomater, vissnad spenat`  — **P1** (C3 flera ingredienser/rad)

### #149 — Laxsallad med grönkål, brysselkål och misoglaserad lax

- `laxfilé (4 x 170 g)`  — **P1** (C2 saknad mängd)

### #150 — Koreanska aubergine- och svamptacos med kimchikräm

- `rostade och saltade jordnötter eller cashewnötter, fint hackade (2 msk, valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #151 — Blomkålschilaquiles med salsa roja

- `blomkål, delad i små buketter (1 litet huvud)`  — **P1** (C2 saknad mängd)
- `avokado, tunt skivad (valfritt)`  — **P1** (C2 saknad mängd)
- `lime-crème fraîche: gräddfil blandad med pressad lime, en nypa salt och lite vatten för drizzling (valfritt)`  — **P1** (C2 saknad mängd)
- `färsk koriander, finhackad (valfritt)`  — **P1** (C2 saknad mängd)

### #152 — Broccoli- och svampfettuccine med misogräddssås

- `broccolibuketter, grovhackade (ca 4 dl)`  — **P1** (C2 saknad mängd)

### #153 — Veggie-enchiladas med rostad paprikasås

- `färsk babyspenat (3 generösa nävar)`  — **P1** (C2 saknad mängd)
- `färsk koriander, grovhackad, valfritt`  — **P1** (C2 saknad mängd)
- `avokado, skivad, valfritt`  — **P1** (C2 saknad mängd)

### #154 — Cobbsallad med jordgubbar, friterad fetaost och dragondressing

- `romansallat, riven i munsstora bitar (1 huvud eller 2 hjärtan)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #155 — Blomkålskorma

- `blomkål, delad i buketter (ca 8 dl, ungefär 1 hel blomkål)`  — **P1** (C2 saknad mängd)
- `basmatiris eller quinoa (till servering)`  — **P1** (C3 flera ingredienser/rad)

### #156 — Rostad blomkål- och potatissallad med dragon-tahini

- `blomkål, delad i buketter (ca 1,4 liter)`  — **P1** (C2 saknad mängd)

### #157 — Portobelloburgers med romescosås

- `microgreens eller ruccola (efter smak, valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `hummus eller majonnäs (valfritt, till topping)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #163 — Apelsin- och basilikakyckling med kokosnötris

- `kycklingbröst utan ben och skinn (450 g, tärnad i munsbitar)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)

### #164 — Ingefärs- och sojagläserade fläskkotletter med päronskåls

- `sesamfrön, valfritt`  — **P1** (C2 saknad mängd)
- `salladslök, tunt skivad, valfritt`  — **P1** (C2 saknad mängd)

### #165 — Miso- och tempehgryta

- `vit miso (shiro miso, 3 msk)`  — **P1** (C2 saknad mängd)

### #166 — Tofu-wok med jordnötssås

- `rödkål (0,5 litet huvud), hackad i 3 cm bitar (ca 7–9 dl)`  — **P1** (C2 saknad mängd)
- `rostade sesamfrön (valfritt)`  — **P1** (C2 saknad mängd)
- `basilika (valfritt)`  — **P1** (C2 saknad mängd)

### #167 — Ruccola- och getostsallad med farro och honingsenap

- `ruccola, packad (4 koppar / ca 4 dl)`  — **P1** (C2 saknad mängd)
- `brysselkål, riven eller tunt hyvlad (170 g / ca 7 dl)`  — **P1** (C2 saknad mängd)

### #168 — Buffalo-kikärtsbullar med yoghurtranch

- `smulad blåmögelost och hackad gräslök till garnering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #169 — Za'atar-marinerade tomater med stekt halloumi

- `hummus, naturell eller med rostad vitlök (efter smak)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `pitabröd eller naan, grillat eller uppvärmt (efter smak)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #171 — Misorostad aubergine med gurkmeje-tahinisås

- `rostade sesamfrön (efter smak, valfritt)`  — **P1** (C2 saknad mängd)

### #172 — Quinoasallad med persika, majs och korianderdressing

- `grillad majskärna (3,6 dl – från 2 kolvar, eller fryst/tinad ugnsrostad majs eller konservmajs)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `rostade och saltade pumpafrön (0,8 dl)`  — **P1** (C3 flera ingredienser/rad)

### #173 — Al Pastor-tacos med kikärtor

- `ananasbitar på burk i 100% ananasjuice (570 g / 1 burk)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)
- `färsk koriander (efter smak, garnering)`  — **P1** (C2 saknad mängd)
- `queso fresco eller avokado (valfritt, garnering)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `limejuice (efter smak, garnering)`  — **P1** (C2 saknad mängd)

### #175 — Grillad majs- och avokadosallad med harissa ranch

- `romansallad, grovhackad (ca 1 liter)`  — **P1** (C2 saknad mängd)

### #177 — BBQ-blomkålstacos med grön tahinisås

- `blomkålsbuketter (ca 700 g, från 1 mellanstor blomkålshuvud)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `rödkål, tunt strimlad (efter smak, valfritt)`  — **P1** (C2 saknad mängd)
- `avokado, skivad (valfritt)`  — **P1** (C2 saknad mängd)
- `koriander, färsk (valfritt)`  — **P1** (C2 saknad mängd)

### #178 — Thailändsk räknudelsallad

- `olivolja (0,6 dl + 2 msk, uppdelat)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #179 — Zesty Quinoa- och Svarta Bönor-tacos med Koriandersås

- `avokado, skivad, efter smak`  — **P1** (C2 saknad mängd)

### #180 — Krämig tomat- och basilikasoppa

- `olivolja (3 msk + 0,6 dl)`  — **P1** (C2 saknad mängd)
- `tomatpuré (110 g / ca 1,2 dl)`  — **P1** (C2 saknad mängd)

### #182 — Krispiga auberginesandwichar med tomat- och dragonrelish

- `matolja spray (efter behov)`  — **P1** (C2 saknad mängd)

### #183 — Butternutpumpa- och poblano-sallad med fetaost

- `butternutpumpa, skalad och tärnad i 2,5 cm kuber (ca 1,4 liter)`  — **P1** (C2 saknad mängd)

### #185 — Varm farrosallad med figendressing

- `färska fikon, tunt skivade – valfritt`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #186 — Sötpotatis- och linsallad med pistachiosalsa och tahinilime

- `olivolja (0,6 dl + 1 msk), uppdelat`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `limeskal och limejuice (2 msk juice totalt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #188 — Currystekta blomkåls- och sötpotatisbowls med kuminjoghurt

- `blomkål, delad i buketter (ca 1,4 liter)`  — **P1** (C2 saknad mängd)
- `sötpotatis, skalad och tärnad (ca 7,2 dl)`  — **P1** (C2 saknad mängd)

### #189 — Teriyaki-tofu med broccoli

- `broccolibuketter (ca 400 g, från 1 medelstor broccoli)`  — **P1** (C2 saknad mängd)
- `kokt ris eller risnudlar (till servering)`  — **P1** (C3 flera ingredienser/rad)

### #190 — Ugnsrostad blomkål med gurkmeja och vispad fetaost

- `blomkål, delad i buketter (ca 1,4 liter / 1 stort huvud)`  — **P1** (C2 saknad mängd)
- `ruccola eller späd grönkål (ca 4 dl, lätt packad)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #191 — Sobasallad med sesam- och cashewsås

- `strimlad kål (ca 9,5 dl, grön, röd, savojkål eller napakål)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `morot i tändsticksform (ca 4,8 dl)`  — **P1** (C2 saknad mängd)

### #192 — Jordnöttsnudlar med rostade svampar

- `färsk ingefära, skalad och grovhackad (2,5 cm bit)`  — **P1** (C2 saknad mängd)

### #193 — Räkor scampi med spagettipumpa

- `matolja på spray (efter behov)`  — **P1** (C2 saknad mängd)
- `pressad saft från en halv citron`  — **P1** (C2 saknad mängd)

### #194 — Ruccola- och kakisallad

- `rostade och skalade rödbetor, skivade i bitar (valfritt, 2)`  — **P1** (C2 saknad mängd)

### #195 — Jerk-blomkålsvingar med mojosås

- `blomkål, delad i buketter (1 mellanstor huvud)`  — **P1** (C2 saknad mängd)

### #197 — Apelsintofu med grönsaker

- `majsstärkelse (0,6 dl + 1 msk, uppdelat)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `broccolibuketter (ca 4 dl, små)`  — **P1** (C2 saknad mängd)

### #200 — Laxsallad med couscous och fetadressing

- `olivolja (1 msk + 2 tsk), uppdelat`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #202 — Sydvästsallad med quinoa och krämig chipotledressing

- `rostade och saltade pumpafrön (pepitas, 0,6 dl)`  — **P1** (C2 saknad mängd)

### #204 — Ultimata Vegetariska Burritos

- `olivolja (2 msk + 2 tsk), uppdelat`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #205 — Citronig vitbönssoppa

- `escarole, grovhackad (1 litet knippe, kan ersättas med grönkål eller mangold)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #206 — BBQ Ranch-skålar med kikärtor och quinoa

- `fryst/tinad ugnsrostad majs, värmad (1,8 dl)`  — **P1** (C3 flera ingredienser/rad)

### #208 — Vegetariska BBQ-köttbullesformar

- `cremini-svamp (champinjoner), fint hackad (225 g)`  — **P1** (C2 saknad mängd)
- `ströbröd (klassiskt eller panko, 1,2 dl)`  — **P1** (C2 saknad mängd)

### #211 — Tonfiskgratäng med nudlar

- `helmjölk (4,8 dl; eller osötad cashewmjölk)`  — **P1** (C2 saknad mängd)
- `citronskal och saft (1 citron)`  — **P1** (C3 flera ingredienser/rad)

### #212 — Buffalo-blomkål mac and cheese

- `blomkål, delad i små buketter (1 medelstor huvud, ca 1,4–1,7 liter)`  — **P1** (C2 saknad mängd)

### #213 — Miso- och lönnsirapslax

- `tunt skivad salladslök och rostade sesamfrön (till garnering)`  — **P1** (C3 flera ingredienser/rad)
- `färsk limejuice (valfritt)`  — **P1** (C2 saknad mängd)
- `jasminris och sauterade grönsaker t.ex. bok choy eller broccoli (valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #215 — Marockansk blomkålssallad med couscous

- `blomkål, delad i buketter (ca 6 generösa dl)`  — **P1** (C2 saknad mängd)

### #216 — Ostig pesto-broccoli och quinoagratäng

- `färsk basilika, grovhackad, valfritt`  — **P1** (C2 saknad mängd)

### #218 — Isbergssallad med krispiga kikärtor och avokadoranch

- `fetaost, smulad (valfritt)`  — **P1** (C2 saknad mängd)

### #219 — Tonfisk Niçoise-pastasallad

- `kapris och färsk dill, finthackad, efter smak`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #220 — Krämig blomkålspasta

- `blomkålshuvud, finhackad i små buketter, ca 1,2 liter totalt (1 litet till medel)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `parmesan, riven, valfritt (efter smak)`  — **P1** (C2 saknad mängd)

### #221 — Tofubowls med mandelsmörsås

- `broccoli (1 medelstor huvud, delad i buketter)`  — **P1** (C2 saknad mängd)
- `kokt jasminris eller soba-nudlar till servering`  — **P1** (C3 flera ingredienser/rad)

### #222 — Sesamlax i skål med miso-ingefärssås

- `lax (mittbit, skinnad, 560 g)`  — **P1** (C2 saknad mängd)
- `broccoli, delad i buketter (ca 6 dl)`  — **P1** (C2 saknad mängd)
- `kimchi och tunt skivad salladslök, till garnering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #223 — Chipotle-räkotacos med avokado- och mangosalsa

- `färsk jalapeño, kärnor och revben borttagna, fint tärnad (1 liten eller 0,5 stor)`  — **P1** (C2 saknad mängd)

### #224 — Grön currysoppa med blomkål

- `blomkål, delad i små buketter (1 medelstor huvud, ca 900 g)`  — **P1** (C2 saknad mängd)
- `krispiga kikärtor, hemgjorda eller köpta (efter smak)`  — **P1** (C2 saknad mängd)
- `färsk koriander eller basilika (efter smak)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #225 — Vegansk svampbolognese

- `färska basilikablad (efter smak)`  — **P1** (C2 saknad mängd)
- `pinjenötsparmesan, valfritt (efter smak)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #226 — Kryddig ramen

- `basilika eller koriander, valfritt (efter smak)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `böngroddar, valfritt (efter smak)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `mjukkokt ägg, valfritt (efter smak)`  — **P1** (C2 saknad mängd)

### #227 — Laxbowls med jordnötssås

- `vitkål, rödkål, napakål eller savojkål, fint riven (ca 5 dl)`  — **P1** (C2 saknad mängd)

### #229 — Naanpizza med vispad ricotta och blancherad broccoli

- `broccoli (1 stort huvud, delat i små buketter, ca 9–12 dl)`  — **P1** (C2 saknad mängd)
- `basilika (fint hackad, efter smak)`  — **P1** (C2 saknad mängd)
- `korv i skivor eller smulad, valfritt (kyckling-, fläsk- eller vegetarisk korv)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C1 okänt namn (ej canon))

### #230 — Plåtbakad chili- och citronlax med vitlöksörtsås

- `rivet citronskal från 1 citron`  — **P1** (C2 saknad mängd)

### #233 — Salladslöksnudlar med broccoli och vitlökssmör

- `stekta eller mjukokta ägg för servering (valfritt)`  — **P1** (C2 saknad mängd)
- `chiliolja för garnering (valfritt)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #234 — Krämig räkpasta med majs och soltorkade tomater

- `olivolja (1 msk + 2 tsk)`  — **P1** (C2 saknad mängd)
- `färsk babyspenat (4 dl / 2 nävar)`  — **P1** (C2 saknad mängd)

### #235 — Linsen- och svamptacos

- `gul lök (fint hackad, 2,4 dl)`  — **P1** (C2 saknad mängd)
- `rödkål (strimlad, blandad med strimlade morötter, skivad salladslök, äppelcidervinäger och salt)`  — **P1** (C2 saknad mängd)
- `skivad avokado (valfritt)`  — **P1** (C2 saknad mängd)

### #237 — Kokoscurry med räkor

- `kokt vitt ris eller risnudlar till servering`  — **P1** (C3 flera ingredienser/rad)

### #238 — Quinoabowls med rostade grönsaker

- `broccolibukett (ca 400 g)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `salladslök och sesamfrön (valfritt, till garnering)`  — **P1** (C3 flera ingredienser/rad)

### #239 — Räkor i gurkmeje- och limesås

- `surdegsbröd eller lantbröd (till servering)`  — **P1** (C3 flera ingredienser/rad; C1 okänt namn (ej canon))

### #240 — Tahinipasta med spruckna körsbärstomater

- `körsbärstomater (ca 600 g)`  — **P1** (C2 saknad mängd)

### #241 — Toscansk gnocchi med soltorkade tomater

- `chilipulver (en nypa, valfritt)`  — **P1** (C2 saknad mängd)

### #243 — Kryddiga linsburgare med tahinicoleslaw

- `kokta gröna linser (4,2 dl – från torkade eller 1 burk à 425 g, avrunna och sköljda)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)

### #244 — Krispiga chipotle-böntacos

- `tillbehör: grekisk yoghurt eller gräddfil, skivad avokado, inlagd rödlök och/eller extra koriander (valfritt)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #245 — Butternutpumpa- och äppelsoppa

- `pumpakärnor, hackade pekannötter, hackad färsk rosmarin, timjan eller salvia (valfritt, som topping)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #246 — Pasta alla vodka med pumpa

- `chilipulver (en nypa)`  — **P1** (C2 saknad mängd)
- `kokosmjölk (full fetthalt) eller vispgrädde (36%, 1,8 dl)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #249 — Ugnsrostad lax med miso-ingefärssås och butternutpumpa

- `tunt strimlad napakål eller savoykål (ca 4 dl)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C1 okänt namn (ej canon); C4 beskrivande brus)
- `salladslök, tunt skivad (efter smak, valfritt)`  — **P1** (C2 saknad mängd)

### #251 — Varm linssallad med balsamicosvamp

- `balsamvinäger (0,6 dl + 1 msk)`  — **P1** (C2 saknad mängd)
- `ruccola, spenat eller blandade grönsalladsblad (ca 4,8 dl)`  — **P1** (C2 saknad mängd)

### #252 — Shawarma-bowls med blomkål

- `blomkål, delad i buketter (1 stort huvud)`  — **P1** (C2 saknad mängd)
- `gurka, tunt skivad (valfritt)`  — **P1** (C2 saknad mängd)
- `körsbärstomater, halverade (valfritt)`  — **P1** (C2 saknad mängd)

### #255 — Ugnsrostad grönsakssallad med linser

- `butternutpumpa, skalad och tärnad (ca 1 liter)`  — **P1** (C2 saknad mängd)

### #257 — Stekt öring med Old Bay-remoulad

- `stänk av het sås (t.ex. Tabasco)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `regnbågsöring eller laxfilé med skinn (4 x 170 g)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `färsk persilja och färsk dill till garnering (valfritt)`  — **P1** (C3 flera ingredienser/rad)

### #258 — Enkel puttanesca med kikärtor (en gryta)

- `chilipulver (en nypa)`  — **P1** (C2 saknad mängd)

### #260 — General Tsos tofu

- `majsstärkelse (0,6 dl + 1 msk, uppdelat)`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `broccoli i buketter (ca 400 g, färsk)`  — **P1** (C2 saknad mängd)
- `rostade sesamfrön och salladslök (valfritt, till garnering)`  — **P1** (C3 flera ingredienser/rad)
- `kokt vitt eller brunt ris (till servering)`  — **P1** (C3 flera ingredienser/rad)

### #261 — Vegansk grönkålscaesar med rökt tempeh

- `tallkotts-parmesan: finhackade pinjenötter blandade med nutritionsjäst, valfritt (1 msk + 1 msk)`  — **P1** (C2 saknad mängd)

### #263 — Örtig tortellinisoppa

- `Olivolja`  — **P1** (C2 saknad mängd)
- `Basilika eller oregano (torkad eller färsk)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `En nypa socker`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `Parmesanost eller annan god riven ost (för servering)`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `Färska örter, t.ex. oregano (för servering)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))

### #264 — Väffeltoast med rökt kalkon, äpple och dijonkräm

- `fett till våffeljärnet`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `plockgrönsaker (tillbehör)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `mjölk (tillbehör)`  — **P1** (C2 saknad mängd)

### #265 — Snabbrimmad torsk med ägg och persilja

- `potatis för 4 pers`  — **P1** (C2 saknad mängd; C4 beskrivande brus)
- `grönsaker, t ex tomater och gröna ärtor`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `färsk persilja, gärna krusbladig`  — **P1** (C2 saknad mängd)

### #266 — Ugnspannkaka 50/50

- `rapsolja att steka i och smörja formen med`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)

### #267 — Örtiga minibiffar med potatismos

- `rapsolja (att steka i)`  — **P1** (C2 saknad mängd)

### #268 — Nudelwok med thai-basilika och ostronsås

- `rapsolja att woka i`  — **P1** (C2 saknad mängd)
- `hackade nötter, t ex cashew- eller jordnötter`  — **P1** (C2 saknad mängd)
- `salladslök`  — **P1** (C2 saknad mängd)
- `thaibasilika eller färsk koriander`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad)
- `något starkt att ringla över för den som vill, t ex srirachasås`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #269 — Gräddig Cashew-Kyckling med Curry

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)
- `rapsolja att steka i`  — **P1** (C2 saknad mängd)
- `kokosflingor, gärna snabbt rostade i torr stekpanna`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `grönsaker, t ex tomater och kikärtor`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `färsk koriander`  — **P1** (C2 saknad mängd)

### #270 — Brysselkålbonara

- `olja att steka i`  — **P1** (C2 saknad mängd)
- `spagetti för 4 pers`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon); C4 beskrivande brus)

### #271 — Tikka Masala

- `ris eller bulgur för 4 pers`  — **P1** (C2 saknad mängd; C3 flera ingredienser/rad; C4 beskrivande brus)
- `rapsolja att steka i`  — **P1** (C2 saknad mängd)
- `färsk koriander`  — **P1** (C2 saknad mängd)
- `mangotärningar (tinade frysta är enklast)`  — **P1** (C2 saknad mängd; C1 okänt namn (ej canon))
- `hackade jordnötter`  — **P1** (C2 saknad mängd)

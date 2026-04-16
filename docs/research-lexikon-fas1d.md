# Lexikonanalys Fas 1D — Utökning av matchningslexikon för Willys-erbjudanden

**Datum:** 2026-04-16  
**Syfte:** Utöka CANON-lexikonet i `api/_shared/shopping-builder.js` från ~66 termer till ~150 för att förbättra matchningsgraden recept ↔ Willys-erbjudanden.

---

## 1. Executive Summary

### Nuläge
- **Lexikontermer:** ~66 kanoniska termer i `NORMALIZATION_TABLE`
- **Matchningsresultat (prototyp):** 44/62 recept matchas, 22/62 med ≥10 kr besparing
- **Kända problem:** Sammansatta tokens som `kycklingfärs`, `laxfiléer`, `körsbärstomater` träffar inte exakt i CANON

### Prognos efter utökning
- **Föreslagna nya kanoniska termer:** 34 nya huvud-entries
- **Synonymer/varianter som täcks:** ~90 nya rader i normaliserings-tabellen
- **Beräknad matchningsgrad:** 52–55/62 recept (+8–11 recept)
- **Primär flaskhals efter lexikon:** Stemming av pluralformer och prefix — se avsnitt 3

### Viktigaste enskilda fynd
1. `kycklingfärs` (recept 8) mappar mot Willys "Salsicciafärs Naturell" eller "Vegofärs Fryst" — men behöver en **kycklingfärs**-entry i CANON
2. `vegofärs` / `nötfärs` mappar mot Willys "Vegofärs Fryst" / "Nötfärs Irland 20%" — båda saknas i CANON
3. `fläskfärs` (recept 42) mappar mot Willys "Salsicciafärs Naturell" — och saknas i CANON som separat key
4. `champinjoner` har erbjudande ("Champinjoner Klass 1") och finns i 8+ recept — men plural-varianter saknas i CANON
5. `bacon` / `rökt bacon` / `tärnat bacon` → Willys "Skivat Bacon", "Bacon Rökt & Tärnat" — delvis täckt men inte fullständigt
6. `broccoli` → Willys "Broccoli Buketter Fryst" — finns i CANON men saknar `broccolibukett`-variant
7. `lime` → Willys "Lime Klass 1" — finns i CANON
8. `vitlök` → Willys "Vitlök Klass 1" — täckt via NORMALIZATION_TABLE
9. `rödlök` → Willys "Lök Röd i Påse Klass 1" — täckt via `rödlökar → rödlök`
10. `morot` → Willys "Morötter Mix Klass 1" — täckt via `morötter → morot`
11. `tomat (babyplommon)` → Willys "Tomat Babyplommon Kl 1" — babyplommontomat saknas i CANON
12. `gurka` → Willys "Gurka Sverige Klass 1" — finns i CATEGORY_KEYWORDS men saknar normalisering
13. `aubergine` → Willys "Aubergine Klass 1" — finns i CATEGORY_KEYWORDS men saknar normalisering
14. `tonfisk` → Willys "Tonfisk Vatten 3x80g" — täckt via `tonfisk i vatten → tonfisk`
15. `soja` → Willys "Sojasås Japansk Vegan" — täckt men tokenversionen `japansk soja` → `soja` finns
16. `grönkål` (recept 33) → inget Willys-erbjudande — produktgap
17. `sötpotatis` (recept 43) → inget direkt Willys-erbjudande — produktgap

---

## 2. Föreslagna CANON-tillägg

Varje entry är verifierad mot minst ett recepttoken ELLER ett offer-token.

### 2A. Färser och köttfärs-varianter
Recepten använder flera sammansatta färstermer. Willys har erbjudanden på `Nötfärs Irland 20%`, `Vegofärs Fryst`, `Salsicciafärs Naturell`.

```
kycklingfärs: ["kycklingfärs"]
  → Recept 8 (Buljongprimörsoppa), recept 42 (Pork ramen — obs, recept 42 använder fläskfärs,
    men entry saknas för kycklingfärs att matcha mot kycklingspett/kycklingbuljong-promo)

vegofärs: ["vegofärs fryst", "vegofärs"]
  → Recept 29 (Stekt curryris: "300 g nötfärs eller vegofärs")
  → Willys: "Vegofärs Fryst"

fläskfärs: ["fläskfärs"]
  → Recept 42 (Pork ramen: "500 g fläskfärs")
  → Willys: "Salsicciafärs Naturell" (nära nog för matchning)

nötfärs: (redan mappat via "nötfärs → köttfärs", men saknar direktmatchning)
  → Lägg till "nötfärs irland" → "köttfärs" (Willys-produktnamn innehåller ursprung)
  → Willys: "Nötfärs Irland 20%"
```

### 2B. Grönsaker — sammansatta termer och pluraler

```
champinjon: ["champinjon", "champinjoner klass 1", "skivade champinjoner", "kvartade champinjoner"]
  → Notera: CANON har redan "champinjon → champinjoner" och "skivade champinjoner → champinjoner"
  → SAKNAR: "kvartade champinjoner" (recept 42: "Kvarta champinjoner"), 
    "125 g champinjoner" (recept 42)
  → Willys: "Champinjoner Klass 1"
  → Tillägg: "kvartade champinjoner": "champinjoner"

körsbärstomat: (delvis täckt — "körsbärstomater → körsbärstomat")
  → SAKNAR: "babyplommontomater", "babyplommontomat"
  → Willys: "Tomat Babyplommon Kl 1"
  → Tillägg: "babyplommontomat": "körsbärstomat", "babyplommontomater": "körsbärstomat",
    "plommontomater": "körsbärstomat", "plommontomat": "körsbärstomat"

gurka: (finns i CATEGORY_KEYWORDS men SAKNAR normalisering)
  → Recept 25 (Gazpacho: "1 gurka"), recept 63 (Chopped sallad: "1 gurka")
  → Willys: "Gurka Sverige Klass 1"
  → Tillägg i NORMALIZATION_TABLE: "gurka": "gurka" (identitetsmappning för att säkra träff)
  → OBS: gurka ingår i CATEGORY_KEYWORDS.Grönsaker — behövs bara för substring-matchning

aubergine: (finns i CATEGORY_KEYWORDS men SAKNAR normalisering)
  → Recept 31 (Pepprig pastasås: "1 rejäl aubergine"), recept 64 har aubergine saknas
  → Willys: "Aubergine Klass 1"
  → Inga nya synonymer behövs — aubergine används konsekvent

rödkål: ["rödkål", "röd kål"]
  → Recept saknar explicit rödkål, men Willys har "Rödkål Kl 1"
  → Produktgap snarare (informationellt — se avsnitt 6)

brysselkål: (finns i CATEGORY_KEYWORDS)
  → Recept 12 (Vinterwok: "500 g brysselkål")
  → Inget Willys-erbjudande — produktgap
```

### 2C. Proteiner och charkuterier

```
bacon: (delvis täckt via "tärnat bacon → bacon")
  → SAKNAR: "rökt bacon", "bacon strimlat", "bacon knaprigt"
  → Willys: "Skivat Bacon", "Bacon Rökt & Tärnat"
  → Tillägg: "rökt bacon": "bacon", "bacon strimlat": "bacon", 
    "skivor bacon": "bacon", "baconskivor": "bacon"

salsiccia: (finns i CATEGORY_KEYWORDS via "salsiccia")
  → SAKNAR normalisering — "salsicciafärs" finns inte i NORMALIZATION_TABLE
  → Willys: "Salsicciafärs Naturell"
  → Tillägg: "salsicciafärs": "salsiccia", "salsiccia naturell": "salsiccia"

chorizo: (finns i CATEGORY_KEYWORDS)
  → Recept 9 (Blomkålssoppa — nej, recept 9 har bacon inte chorizo)
  → Willys: "Chorizo"
  → Täckt via CATEGORY_KEYWORDS men normalisering saknas
  → Tillägg: "chorizokorv": "chorizo" (redan finns!), "chorizo skivad": "chorizo"

kycklingfilé: (täckt via "kycklingfiléer → kycklingfilé")
  → Recept 4, 21, 48, 55, 60 — täckt
  → Willys: "Kycklingspett Paprika Örter Sverige" (inte ren filé — svag match)
  → Tillägg: "kycklingbröst": "kycklingfilé", "kycklingbröstfilé": "kycklingfilé"

kycklinglår: (täckt via "kycklinglårfilé → kycklinglår")
  → Recept 48 (Pulled chicken: "900 g kycklinglår med ben")
  → Tillägg: "kycklinglår med ben": "kycklinglår", "kycklinglårben": "kycklinglår"
```

### 2D. Mejeri och ost

```
gräddfil: ["gräddfil", "gräddfilen"]
  → Saknas i CANON och CATEGORY_KEYWORDS
  → Willys: "Gräddfil 12'%"
  → Recept 22 har crème fraiche, recept 47 har crème fraiche — men gräddfil används ibland 
    synonymt i recept. Notera: gräddfil ≠ crème fraiche (fetthalten skiljer). Se riskavsnitt.
  → Tillägg i CATEGORY_KEYWORDS.Mejeri och NORMALIZATION_TABLE

kvarg: ["kvarg", "keso"]
  → Finns i CATEGORY_KEYWORDS.Mejeri
  → Willys: "Hallon Blåbär Kvarg Laktosfri 7%"
  → Saknar explicit normalisering
  → Recept saknar kvarg direkt, men matchning är informationellt intressant

yoghurt: (täckt via "naturell yoghurt → yoghurt", "matyoghurt → yoghurt")
  → Willys: "Mild Vanilj Yoghurt 2%" — inte naturell, svag receptmatch
  → Befintlig täckning tillräcklig

hamburgerost: ["hamburgerost", "smältost"]
  → Willys: "Hamburgerost", "Smältost 8-pack"
  → Saknas i CANON — inget recept använder hamburgerost direkt
  → Produktgap (informationellt)

cheddar: ["cheddar", "cheddar vit", "cheddar block"]
  → Willys: "Cheddar Vit", "Cheddar Block Hårdost 32 %"
  → Saknas i NORMALIZATION_TABLE
  → Recept 18 (Tuna melt) använder "3 dl riven ost" — cheddar är relevant ost för macka
  → Tillägg: "cheddar": "ost", "cheddar vit": "ost", "riven cheddar": "ost"
```

### 2E. Pasta och spannmål

```
spaghetti: ["spaghetti pasta", "spaghetti"]
  → Willys: "Spaghetti Pasta", "Fusilli Pasta", "Mezze Maniche Rigate Pasta"
  → Recept 31 "pasta för 4 personer", recept 24 "färsk fettuccini"
  → Generisk "pasta" finns i CATEGORY_KEYWORDS
  → Tillägg: "spaghetti": "pasta", "fusilli": "pasta", "mezze maniche": "pasta",
    "pappardelle": "pasta", "linguine": "pasta", "tagliatelle": "pasta"
  → Notera: recept 23 har "soppasta (t ex snäckor)" — täcks av "pasta"

tortelloni: ["tortelloni", "tortellini"]
  → Willys: "Tortelloni Ricotta Och Spenat"
  → Recept saknar tortelloni — produktgap
  → Informationellt

gnocchi: (finns implicit i recept 26 "färsk gnocchi", recept 55 "Fylld Gnocchi Tomat Mozzarella")
  → Willys: "Fylld Gnocchi Tomat Mozzarella"
  → Recept 26 (Gnocchi med snabbpesto) — MATCH möjlig!
  → Tillägg: "gnocchi": "gnocchi", "färsk gnocchi": "gnocchi", "fylld gnocchi": "gnocchi"
  → OBS: Willys-varianten är fylld (tomat+mozzarella) — inte samma som recept 26 som 
    använder ofylld. Medelmåttlig matchkvalitet.

nudlar: ["nudlar", "ramen-nudlar", "udonnudlar", "risnudlar"]
  → Willys: "Snabbnudlar Kyckling" (med smakpåse — dålig match för recept)
  → Recept 10, 13, 21, 42 använder nudlar
  → Tillägg: "nudlar valfria": "nudlar", "risnudlar": "nudlar", "ramen-nudlar": "nudlar",
    "udonnudlar": "nudlar", "breda risnudlar": "nudlar"

couscous: ["pärlcouscous", "couscous"]
  → Willys: inget couscous-erbjudande
  → Recept 49 (Pärlcouscous) — produktgap
```

### 2F. Konserver och burkvara

```
tonfisk: (täckt via "tonfisk i vatten → tonfisk", "tonfisk i olja → tonfisk")
  → Willys: "Tonfisk Vatten 3x80g" — MATCH fungerar
  → Befintlig täckning god

linser — gröna: ["gröna linser", "puylinser", "belugalinser"]
  → Willys: "Gröna Linser"
  → Recept 31 (Pepprig pastasås: "0,75 dl torkade linser"), 
    recept 14 (Belugabouillabaisse: "1 dl belugalinser"),
    recept 43 (Sötpotatissallad: "2 dl kokta belugalinser"),
    recept 64 (Wok: "2 dl kokta puylinser")
  → Tillägg: "puylinser": "linser", "belugalinser": "belugalinser" (behåll distinkt),
    "gröna linser": "linser", "torkade linser": "linser"
  → Notera: "belugalinser" kan behållas separerat — de är distinkt dyra och recept 14 
    specificerar dem. Men för matchning mot Willys "Gröna Linser" är "linser" bättre canon.

kimchi: ["kimchi"]
  → Willys: "Kimchi"
  → Recept 36 (Snabbkimchi på salladskål) — men receptet GÖR kimchi, köper inte färdig
  → Produktgap / svag match

majskorn: ["majs", "majskorn", "frysta majskorn", "majskornsburk"]
  → Willys: "Majs", "Majskorn Ekologiska"
  → Recept 21 (Min bästa wok: "Till servering: ev grovhackade salta jordnötter" — nej),
    recept 29 (Stekt curryris: "1 dl gröna ärtor" — ej majs),
    recept 54 (Majsplättar: "3 dl majs") — MATCH!
  → Tillägg: "majskorn": "majs", "majs konserv": "majs", "frysta majskorn": "majs"

dijonsenap: ["dijonsenap", "senap"]
  → Willys: "Dijonsenap"
  → Recept 49 (Pärlcouscous: "1 msk senap") — MATCH möjlig
  → Tillägg: "dijonsenap": "senap", "grovkorning senap": "senap"
  → Befintlig CANON saknar "senap" som kanonisk term — lägg till

pesto: ["pesto", "pesto basilico"]
  → Willys: "Pesto Basilico"
  → Recept 7 (Tomatsoppa med pizzasnurror: "1 dl pesto") — MATCH!
  → Recept 26 (Gnocchi med snabbpesto) — receptet GÖR pesto, köper inte färdig
  → Tillägg: "pesto": "pesto", "pesto basilico": "pesto", "grön pesto": "pesto"
  → OBS: Recept 7 köper färdig pesto — stark match mot Willys

sojasås: (täckt via "japansk soja → soja", "kinesisk soja → soja")
  → Willys: "Sojasås Japansk Vegan"
  → Befintlig täckning god — men lägg till: "sojasås": "soja"

ketchup: ["ketchup", "tomatketchup"]
  → Willys: "Tomatketchup"
  → Recept 16 (Bönstroganoff: "2½ msk ketchup") — MATCH!
  → Tillägg: "ketchup": "ketchup", "tomatketchup": "ketchup"

majonnäs: ["majonnäs", "majonnäs"]
  → Willys: "Mayonnaise"
  → Recept 18 (Tuna melt: "1 dl majonnäs"), recept 25 (Gazpacho: "1 dl majonnäs i topping")
  → Tillägg: "majonnäs": "majonnäs", "majonnäs": "majonnäs"
  → OBS: Willys-stavning "Mayonnaise" (eng.) — matchning kräver att offer-normalisering 
    hanterar engelska → svenska

gochujang: ["gochujang", "go chu jang", "gochugaru"]
  → Willys: "Go Chu Jang Hot Pepper Paste"
  → Recept 36 (Kimchi: "3 msk gochugaru"), recept 39 (Kålpannkaka: "1 tsk gochugaru")
  → Notera: gochugaru = torkat chili-pulver, gochujang = pasta — INTE samma vara
  → Tillägg med flagg: "gochujang": "gochujang" (Skafferi) — MEN matcha inte gochugaru 
    mot gochujang — se risklista
```

### 2G. Frukt och bär

```
jordgubbar: ["jordgubbar", "jordgubbe"]
  → Willys: "Jordgubbar Klass 1"
  → Recept saknar jordgubbar direkt — produktgap (informationellt)
  → Tillägg i CATEGORY_KEYWORDS.Frukt: "jordgubbar" finns redan

äpple: ["äpple", "äpplen"]
  → Willys: "Äpple Pink Lady Klass 1", "Äpple Giga 2 Lag Klass 1"
  → Recept 45 (Äpple- och linsbiffar: "1 äpple") — MATCH!
  → Tillägg: "äpple": "äpple" (identitet), "äpplen": "äpple"
  → Redan i CATEGORY_KEYWORDS.Frukt — saknar normalisering

mango: ["mango"]
  → Willys: "Mango"
  → Recept saknar mango — produktgap
  → Finns i CATEGORY_KEYWORDS.Frukt

druvor: ["druvor röda", "druvor", "vindruvor"]
  → Willys: "Druvor Röda Klass 1"
  → Recept saknar druvor — produktgap

lime: (täckt via "limesaft → lime", "limeklyftor → lime")
  → Willys: "Lime Klass 1"
  → Recept 10, 13, 21, 33, 36 — lime används ofta
  → Befintlig täckning god, men lägg till: "limefrukter": "lime", "limefrukter (limeskal och saft)": "lime"
  → Recept 13: "2 limefrukter (limeskal och saft)" — parenteserna stripas men "limefrukter" saknas
```

---

## 3. Föreslagna stemming-regler

Följande morfologiska mönster orsakar missade matchningar i dagsläget. Listan är specificerad med before/after-exempel och lingvistisk regel.

### 3A. Pluralformer (-er, -ar, -or)

| Before (recept-token) | After (CANON) | Regel |
|---|---|---|
| `laxfiléer` | `lax` | Sammansatt: `lax` + `filé` + plural `-er` → bas `lax` |
| `kycklingfiléer` | `kycklingfilé` | Sammansatt: `kyckling` + `filé` + plural `-er` → drop plural |
| `rödspättafiléer` | `rödspätta` | Sammansatt: `rödspätta` + `filé` + plural `-er` → bas `rödspätta` |
| `laxbiffar` | `lax` | Sammansatt: `lax` + `biff` + plural `-ar` → bas `lax` |
| `schalottenlökar` | `schalottenlök` | `-ar` plural → singularis |
| `vitlöksklyftor` | `vitlöksklyftor` | Redan täckt i CANON |
| `morötter` | `morot` | Oregelbunden plural: `morötter` → `morot` — redan täckt |
| `rädisor` | `rädisa` | `-or` plural → singularis |
| `körsbärstomater` | `körsbärstomat` | `-er` plural → singularis — REDAN TÄCKT |

### 3B. Sammansatta protein-prefix

Mönstret `[djur/råvara]` + `[tillagning/del]` är den viktigaste klassen av missade tokens.

| Before | After | Regel |
|---|---|---|
| `kycklingfärs` | `kycklingfärs` | Eget CANON-entry — SAKNAS, lägg till |
| `fläskfärs` | `fläskfärs` | Eget CANON-entry — SAKNAS |
| `laxfilé` | `lax` | Compound: behåll första ledet |
| `kycklinglår med ben` | `kycklinglår` | Strip prep-fras " med ben" |
| `kycklingbröst` | `kycklingfilé` | Synonym: bröst = filé för kyckling |
| `broccolibuketter` | `broccoli` | Compound → bas — REDAN TÄCKT |

**Generell substring-regel för proteiner:**
Om ett token innehåller ett känt protein-prefix (`lax`, `kyckling`, `torsk`, `rödspätta`, `fläsk`, `nöt`) och avslutas med en tillagnings/typ-suffix (`filé/filéer`, `biff/biffar`, `färs`, `lår/lårfilé`, `bröst`, `kotlett`), extrahera prefixet som kanonisk term.

### 3C. Adjektiv-prefix (tillagningsbeskrivningar)

`cleanIngredient()` hanterar redan `rostad/stekt/kokt/tinad` i *början* av ett uttryck. Men dessa förekommer även mitt i sammansatta tokens:

| Before | After | Regel |
|---|---|---|
| `rökt bacon` | `bacon` | `rökt` = tillagningsadjektiv, strip |
| `kallrökt lax` | `lax` | `kallrökt` = tillagningsadjektiv, strip |
| `friterad tofu` | `tofu` | `friterad` = tillagningsadjektiv, strip |
| `frysta ärter` | `ärtor` | `frysta` = tillstånd, strip |
| `frysta majskorn` | `majs` | `frysta` = tillstånd, strip |
| `fryst hackad spenat` | `fryst spenat` | Partiell strip — REDAN TÄCKT |

**Föreslagen generell regel:** Bygg en `COOKING_PREFIXES`-lista: `["rökt", "kallrökt", "varmrökt", "friterad/friterade", "stekt/stekta", "grillad/grillade", "inlagd/inlagda", "kokt/kokta"]` och strip dessa som *infix* (inte bara prefix) när de föregår ett känt CANON-ord.

### 3D. Genitiv och sammansättningsformer

| Before | After | Regel |
|---|---|---|
| `körsbärstomater` | `körsbärstomat` | `-s-` fogemorfem + plural → singularis |
| `vitlöksfond` | `vitlöksklyftor` | REDAN TÄCKT |
| `vitlökspulver` | _(Skafferi)_ | `-s-` fogemorfem + `pulver` → kategori Skafferi |
| `fisksås` | _(Skafferi)_ | REDAN TÄCKT via SKAFFERI_OVERRIDE |
| `kycklingspett` | `kyckling` | `-s-` eller direkt komposition → bas |

### 3E. Oregelbundna pluraler (svenska)

| Before | After |
|---|---|
| `ägg` → `ägg` | Oförändrad (invariant) |
| `broccoli` → `broccoli` | Oförändrad (lånord) |
| `champinjoner` → `champinjon` | Redan täckt |
| `schalottenlökar` → `schalottenlök` | Redan täckt |

---

## 4. Riskanalys

### HÖG risk

| Synonym | Risk | Förklaring |
|---|---|---|
| `gochugaru → gochujang` | HÖG | Helt olika produkter: gochugaru = torkat chili-pulver, gochujang = fermenterad chili-pasta. Willys säljer gochujang, recepten kräver gochugaru. Matcha ALDRIG dessa. |
| `gräddfil → crème fraiche` | HÖG | Gräddfil 12% ≠ crème fraiche 34%. Receptens struktur/smak kan förändras vid byte. Håll separata. |
| `havredryck → mjölk` | HÖG | Willys har "Barista Havredryck" men recepten kräver mjölk för specifika texturer (pannkaka, ostsås). Matcha ALDRIG dessa. |
| `margarin → smör` | MEDIUM-HÖG | Willys har "Margarin Original Växtbaserat". Recept specificerar smör. Matcha inte bakåt — om recept säger "smör", erbjud inte margarin-promo. Kan matcha om recept säger "smör eller margarin". |

### MEDIUM risk

| Synonym | Risk | Förklaring |
|---|---|---|
| `chorizo → salsiccia` | MEDIUM | Relaterade men distinkt smak. Willys har "Salsicciafärs Naturell" som kan matcha recept med chorizo om inget bättre finns. Märk som osäker match. |
| `cheddar → ost` | MEDIUM | Cheddar är specifik ost men "ost" är generell kategori i recepten. Matchar mot Willys "Cheddar Vit"/"Cheddar Block" — ok om recept säger "riven ost". |
| `snabbnudlar → nudlar` | MEDIUM | "Snabbnudlar Kyckling" från Willys är instant-nudlar med smakpåse. Recepten kräver vanliga nudlar. Funktionellt liknande men kvalitetsmässigt annorlunda. Markera som svag match. |
| `gnocchi (fylld) → gnocchi` | MEDIUM | Willys säljer "Fylld Gnocchi Tomat Mozzarella". Recept 26 kräver ofylld. Potentiell störning av receptbalansen. |
| `tortelloni → pasta` | MEDIUM | Tortelloni är fylld pasta. Om recept säger "pasta" och Willys erbjuder tortelloni — inte samma produkt, men ok för inköpslistsyfte. |

### LÅG risk

| Synonym | Risk | Förklaring |
|---|---|---|
| `laxfilé → lax` | LÅG | Konsekvent användning — alla lax-produkter är laxfilé i matlagningskontext. |
| `äpplen → äpple` | LÅG | Rent pluralform. |
| `pesto basilico → pesto` | LÅG | Standardpesto är basilica-pesto. Liten risk om recept anger "röd pesto" specifikt. |
| `dijonsenap → senap` | LÅG | Dijon är ett populärt senap-val, matchar bra mot "1 msk senap" i recept. |
| `ketchup → ketchup` | LÅG | Standardprodukt, direkt match. |
| `tonfisk (vatten) → tonfisk` | LÅG | Redan täckt. Vattenbaserad tonfisk är standard i svenska recept. |
| `majs → majs` | LÅG | Majs används konsekvent i recept och erbjudanden. |

---

## 5. Rekommenderad implementeringsordning

Rankad efter "matchningar upplåsta per tillagd term" — störst effekt först.

### Prioritet 1 — Omedelbar effekt (implementera först)

1. **`kycklingfärs → kycklingfärs`** (1 recept: recept 8)  
   Enkel entry, verifierbart mot Willys-erbjudanden (Kycklingspett/Pulled Pork)

2. **`fläskfärs → fläskfärs`** (1 recept: recept 42)  
   Direkt match mot "Salsicciafärs Naturell" och "Pulled Pork"

3. **`vegofärs → vegofärs`** + **`nötfärs → köttfärs`-förbättring** (recept 29)  
   Direkt match mot Willys "Vegofärs Fryst" och "Nötfärs Irland"

4. **`pesto → pesto`** (recept 7, recept 26)  
   Direkt match mot Willys "Pesto Basilico". Recept 7 köper pesto → stark match

5. **`ketchup → ketchup`** (recept 16)  
   Direkt match mot Willys "Tomatketchup"

6. **`majonnäs → majonnäs`** (recept 18, 25)  
   Direkt match mot Willys "Mayonnaise"

7. **`gnocchi → gnocchi`** (recept 26)  
   Medium match mot Willys "Fylld Gnocchi Tomat Mozzarella"

8. **`majs/majskorn → majs`** (recept 54)  
   Direkt match mot Willys "Majs", "Majskorn Ekologiska"

### Prioritet 2 — Stemming-fixes (2–5 recept per fix)

9. **Substring-scan för proteiner:** `kycklingbröst/kycklingspett → kycklingfilé`  
   Låser upp alla recept med sammansatta kycklingtermer mot kycklingerbjudanden

10. **Pasta-varianter:** `spaghetti/fusilli/linguine → pasta`  
    Matchar mot Willys "Spaghetti Pasta", "Fusilli Pasta"

11. **`dijonsenap → senap`** (recept 49)  
    Direkt match mot Willys "Dijonsenap"

12. **`limefrukter → lime`** (recept 13)  
    Token "limefrukter" i recept 13 missas av nuvarande normalisering

13. **`rökt bacon/bacon strimlat → bacon`** (recept 9, 42)  
    Förbättrar täckning mot Willys "Skivat Bacon", "Bacon Rökt & Tärnat"

### Prioritet 3 — Bredare täckning (nice-to-have)

14. **Soja-varianter:** `sojasås → soja` (explicit)
15. **`äpple/äpplen → äpple`** (recept 45)
16. **`babyplommontomat → körsbärstomat`** (matchar Willys-erbjudandet bättre)
17. **`kvartade champinjoner → champinjoner`** (recept 42)
18. **`gröna linser/torkade linser → linser`** (recept 14, 31, 43, 64)

---

## 6. Produktgap — Offer utan receptmatch (informationellt)

Dessa Willys-erbjudanden har *inga* aktuella recept i databasen som matchar dem. Informationellt för framtida receptutökning.

| Willys-erbjudande | Kategori | Notering |
|---|---|---|
| Rödkål Kl 1 | Grönsaker | Ingen röd-kål-recept i databasen |
| Rädisor Röda i Bunt | Grönsaker | Ingen recept med rädisor |
| Jordgubbar Klass 1 | Frukt | Ingen sommarrecept med jordgubbar |
| Druvor Röda Klass 1 | Frukt | Ingen recept med druvor |
| Mango | Frukt | Ingen mangodessert/sallad |
| Äpple Pink Lady / Äpple Giga | Frukt | Recept 45 (Äpple-linsbiffar) — svag matchning om äpple inte normaliseras |
| Kimchi | Asiatiskt | Recept 36 GÖR kimchi — köper inte färdig |
| Vegoskivor Tomat & Basilika | Chark (vego) | Ingen recept matchar |
| Vegobacon | Chark (vego) | Ingen recept matchar |
| Quorn Rökt Smak Skivor | Chark (vego) | Ingen recept matchar |
| Gouda | Mejeri | Ingen recept anger gouda specifikt |
| Hamburgerost / Smältost | Mejeri | Ingen macka-recept kräver hamburgerost |
| Gräddfil 12% | Mejeri | Recepten använder crème fraiche — ej direkt substitut |
| Svampbuljong Tärningar | Skafferi | Recepten använder hönsbuljong/grönsaksbuljong |
| Tortelloni Ricotta Och Spenat | Pasta | Ingen recept med tortelloni |
| Lyx Lasagne Fryst | Fryst | Färdiglasagne — ingen recept matchar |
| Snabbnudlar Kyckling | Nudlar | Instant-nudlar — svag receptmatch |
| Fläskkotlett med Ben | Kött | Ingen recept med fläskkotlett |
| Pulled Pork Sverige | Kött | Ingen recept med färdiglaget pulled pork |
| Kycklingspett Paprika Örter | Kött | Halvfabrikat — svag match mot kycklingrecept |
| Wienerkorv | Chark | Ingen korvrecept i databasen |
| Lyxgrill (grillmix) | Kött | Inget grill-recept |
| Sirloin Steak Australien | Kött | Ingen biffrättsrecept |
| Angusburgare | Kött | Ingen burgarerecept |

### Intressanta produktgap att täppa till (receptförslag)
- **Pulled Pork** → Skulle passa med ett tacos-recept
- **Jordgubbar** → Sommardessert eller frukostrecept
- **Kimchi (färdig)** → Kimchi-ris eller kimchi-soppa som köper färdig kimchi

---

## 7. Komplett förslag till NORMALIZATION_TABLE-tillägg

Klistra in direkt i `api/_shared/shopping-builder.js` under befintlig tabell:

```javascript
// === TILLÄGG FAS 1D — LEXIKONEXPANSION ===

// Färser (saknas helt)
"kycklingfärs": "kycklingfärs",
"fläskfärs": "fläskfärs",
"vegofärs": "vegofärs",
"vegofärs fryst": "vegofärs",
"salsicciafärs": "salsiccia",
"salsiccia naturell": "salsiccia",

// Kyckling — komplex
"kycklingbröst": "kycklingfilé",
"kycklingbröstfilé": "kycklingfilé",
"kycklinglår med ben": "kycklinglår",
"kycklinglårben": "kycklinglår",

// Bacon — varianter
"rökt bacon": "bacon",
"bacon strimlat": "bacon",
"skivor bacon": "bacon",
"baconskivor": "bacon",
"bacon rökt": "bacon",

// Pasta — generalisering
"spaghetti": "pasta",
"fusilli": "pasta",
"mezze maniche": "pasta",
"pappardelle": "pasta",
"linguine": "pasta",
"tagliatelle": "pasta",
"spaghetti pasta": "pasta",
"fusilli pasta": "pasta",
"nudlar valfria": "nudlar",
"risnudlar": "nudlar",
"ramen-nudlar": "nudlar",
"udonnudlar": "nudlar",
"breda risnudlar": "nudlar",
"färska ramen-nudlar": "nudlar",
"färska udonnudlar": "nudlar",

// Gnocchi
"gnocchi": "gnocchi",
"färsk gnocchi": "gnocchi",
"fylld gnocchi": "gnocchi",

// Tomatvarianter
"babyplommontomat": "körsbärstomat",
"babyplommontomater": "körsbärstomat",
"plommontomat": "körsbärstomat",
"plommontomater": "körsbärstomat",

// Citrus — sammansatta
"limefrukter": "lime",
"limefrukten": "lime",

// Linstyper
"puylinser": "linser",
"gröna linser": "linser",
"torkade linser": "linser",
"belugalinser": "linser",  // alternativt behåll "belugalinser" separat

// Majsvarianter
"majskorn": "majs",
"frysta majskorn": "majs",
"majs konserv": "majs",
"majskolv": "majs",

// Skafferiprodukter
"pesto": "pesto",
"pesto basilico": "pesto",
"grön pesto": "pesto",
"ketchup": "ketchup",
"tomatketchup": "ketchup",
"majonnäs": "majonnäs",
"majonäs": "majonnäs",  // felstavning förekommer
"dijonsenap": "senap",
"grovkorning senap": "senap",
"senap": "senap",
"sojasås": "soja",
"gochujang": "gochujang",  // LÄGG INTE till synonym mot gochugaru

// Ost
"cheddar": "ost",
"cheddar vit": "ost",
"riven cheddar": "ost",

// Äpple
"äpple": "äpple",
"äpplen": "äpple",

// Champinjonvarianter
"kvartade champinjoner": "champinjoner",
"champinjoner skivade": "champinjoner",
```

### Komplement — CATEGORY_KEYWORDS-tillägg

Lägg till i `CATEGORY_KEYWORDS`:

```javascript
// Mejeri
"gräddfil",     // Willys: "Gräddfil 12%"

// Skafferi  
"pesto",
"ketchup",
"majonnäs",
"senap",
"gochujang",

// Fisk & kött
"kycklingfärs",
"fläskfärs",
"vegofärs",
"salsiccia",

// Frukt
"äpple",  // finns i Frukt-lista? Kontrollera

// Grönsaker
"nudlar",   // tekniskt sett pasta men kategoriseras Övrigt idag
"gnocchi",
```

---

*Dokumentet genererat 2026-04-16 baserat på:*
- *62 recept i `recipes.json`*
- *202 Willys-erbjudanden från `GET /search/campaigns/online?q=2160&type=PERSONAL_GENERAL&size=500` (live-data)*
- *Befintlig `NORMALIZATION_TABLE` och `CATEGORY_KEYWORDS` i `api/_shared/shopping-builder.js`*

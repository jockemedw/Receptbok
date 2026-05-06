// ─── INGREDIENT PARSER — 5-stegspipeline ───────────────────────────────────

// Steg 3: Varianter → kanoniskt namn
export const NORMALIZATION_TABLE = {
  // Lök
  "gul lök": "lök", "gula lökar": "lök", "lökar": "lök",
  "hackad lök": "lök", "finhackad lök": "lök", "hackad gul lök": "lök",
  "grovhackad lök": "lök", "tunt skivad lök": "lök", "strimlad lök": "lök",
  "liten gul lök": "lök", "stor gul lök": "lök", "liten lök": "lök",
  "rödlökar": "rödlök", "röd lök": "rödlök", "tunt skivad rödlök": "rödlök",
  "finhackad rödlök": "rödlök", "strimlad rödlök": "rödlök",
  "purjo": "purjolök", "purjolökar": "purjolök", "strimlad purjolök": "purjolök",
  "finstrimlad purjolök": "purjolök",
  "schalottenlökar": "schalottenlök", "schalotten": "schalottenlök",
  "bananschalottenlök": "schalottenlök", "bananschalotten": "schalottenlök",
  "steklök": "schalottenlök",
  "salladslökar": "salladslök", "strimlad salladslök": "salladslök",
  "pärllök": "silverlök", "pickleslök": "silverlök",
  // Vitlök
  "vitlök": "vitlöksklyftor",
  "vitlöksklyfta": "vitlöksklyftor", "vitlöksklyftor": "vitlöksklyftor",
  "stor vitlöksklyfta": "vitlöksklyftor", "liten vitlöksklyfta": "vitlöksklyftor",
  "stor vitlök": "vitlöksklyftor", "liten vitlök": "vitlöksklyftor",
  "pressad vitlök": "vitlöksklyftor", "krossad vitlök": "vitlöksklyftor",
  "riven vitlök": "vitlöksklyftor", "rivna vitlöksklyftor": "vitlöksklyftor",
  "skivad vitlök": "vitlöksklyftor", "finhackad vitlök": "vitlöksklyftor",
  "hackad vitlök": "vitlöksklyftor", "vitlöksfond": "vitlöksklyftor",
  // Kyckling (plural)
  "kycklingfiléer": "kycklingfilé",
  // Morötter (plural matchar inte "morot" som substring)
  "morötter": "morot", "rivna morötter": "morot", "grovriven morot": "morot",
  "skivade morötter": "morot", "tärnade morötter": "morot",
  // Potatis
  "potatisen": "potatis", "kokt potatis": "potatis", "fast potatis": "potatis",
  "potatisbitar": "potatis", "tärnad potatis": "potatis", "klyftad potatis": "potatis",
  "sötpotatisen": "sötpotatis",
  // Grädde
  "vispgrädde": "grädde", "matlagningsgrädde": "matlagningsgrädde",
  "matgrädde": "matlagningsgrädde", "havregrädde": "havregrädde",
  "syrad grädde": "crème fraiche", "lätt crème fraiche": "crème fraiche",
  "crème fraîche": "crème fraiche", "creme fraiche": "crème fraiche", "fraiche": "crème fraiche",
  // Mjölk
  "mellanmjölk": "mjölk", "lättmjölk": "mjölk", "standardmjölk": "mjölk", "helmjölk": "mjölk",
  // Smör
  "rumstempererat smör": "smör", "klicka smör": "smör", "brynt smör": "smör",
  // Ost
  "parmesanost": "parmesan", "parmigiano reggiano": "parmesan",
  "riven parmesan": "parmesan", "finriven parmesan": "parmesan", "grana padano": "parmesan",
  "pecorinoost": "pecorino", "mozzarellaost": "mozzarella", "färsk mozzarella": "mozzarella",
  "smulad fetaost": "fetaost", "feta": "fetaost", "stekost": "halloumi",
  "getost": "chèvre", "riven ost": "ost", "gratängost": "ost",
  "lagrad ost": "ost", "smakrik ost": "ost", "hushållsost": "ost",
  // Yoghurt
  "naturell yoghurt": "yoghurt", "matyoghurt": "yoghurt", "grekisk yoghurt": "turkisk yoghurt",
  // Ägg
  "hela ägg": "ägg", "äggulor": "äggula", "äggvitor": "äggvita",
  // Tomat
  "körsbärstomater": "körsbärstomat", "cocktailtomater": "körsbärstomat",
  "cocktailtomat": "körsbärstomat", "mini tomater": "körsbärstomat",
  "tomater": "tomat", "tomatpure": "tomatpuré",
  // Örter (färsk = samma nyckel, torkad = separat)
  "färsk persilja": "persilja", "bladpersilja": "persilja", "finhackad persilja": "persilja",
  "torkad persilja": "torkad persilja",
  "färsk koriander": "koriander", "hackad koriander": "koriander",
  "malen koriander": "malen koriander", "torkad koriander": "malen koriander",
  "färsk timjan": "timjan", "torkad timjan": "torkad timjan",
  "timjankvist": "timjan", "timjankvister": "timjan",
  "färsk basilika": "basilika", "basilikablad": "basilika",
  "torkad basilika": "torkad basilika",
  "färsk dill": "dill", "torkad dill": "torkad dill",
  "färsk gräslök": "gräslök",
  "rosmarinkvist": "rosmarin", "torkad rosmarin": "torkad rosmarin",
  "torkad oregano": "torkad oregano",
  "färsk dragon": "dragon", "färsk mynta": "mynta", "torkad mynta": "torkad mynta",
  // Bönor & linser
  "kikärter": "kikärtor", "kokta kikärtor": "kikärtor",
  "vita bönor": "vita bönor", "stora vita bönor": "vita bönor", "cannellinibönor": "vita bönor",
  "kokta linser": "linser",
  // Olja
  "extra virgin olivolja": "olivolja", "neutral olja": "rapsolja", "olja": "rapsolja",
  // Buljong
  "kycklingbuljong": "hönsbuljong", "hönsbuljongtärning": "hönsbuljong",
  "kycklingbuljongtärning": "hönsbuljong", "kycklingfond": "hönsbuljong", "hönsfond": "hönsbuljong",
  "grönsaksbuljongtärning": "grönsaksbuljong", "grönsaksfond": "grönsaksbuljong",
  "köttbuljongtärning": "köttbuljong", "fiskbuljongtärning": "fiskbuljong",
  "umamibuljongtärning": "buljongtärning",
  // Pasta & ris
  "pennepasta": "penne", "lasagneplatta": "lasagneplattor",
  "arborio": "risotto-ris", "avorioris": "risotto-ris",
  // Kål
  "vitkålshuvud": "vitkål", "spetskålshuvud": "spetskål",
  "broccolibuketter": "broccoli", "pak choi": "pak choy",
  // Svamp
  "champinjon": "champinjoner", "skivade champinjoner": "champinjoner",
  "shiitakesvamp": "shiitake", "blandad svamp": "svamp",
  // Spenat
  "bladspenat": "spenat", "babyspenat": "spenat", "färsk spenat": "spenat",
  "fryst hackad spenat": "fryst spenat",
  // Citrus
  "citronsaft": "citron", "citronskal": "citron",
  "limesaft": "lime", "limeskal": "lime", "limeklyftor": "lime",
  "apelsinjuice": "apelsin",
  // Fisk & skaldjur
  "laxfilé": "lax", "laxfiléer": "lax",
  "rödspättafiléer": "rödspätta", "fiskfilé": "fisk",
  "skalade räkor": "räkor", "räkor i lag": "räkor",
  "tonfisk i vatten": "tonfisk", "tonfisk i olja": "tonfisk",
  "ansjovisfilé": "ansjovis", "kräftor i lag": "kräftor",
  // Kött
  "nötfärs": "köttfärs", "hushållsfärs": "köttfärs",
  "kycklinglårfilé": "kycklinglår", "kycklinginnerfilé": "kycklingfilé",
  "tärnat bacon": "bacon", "chorizokorv": "chorizo",
  // Rotfrukter
  "rotselleri": "selleri", "blekselleri": "selleri", "blekselleristjälk": "selleri",
  "jordärtskockor": "jordärtskocka", "rödbeta": "rödbetor",
  // Nötter & frön
  "naturella cashewnötter": "cashewnötter", "salta jordnötter": "jordnötter",
  "sötmandel": "mandel", "rostade sesamfrön": "sesamfrön", "torrostade sesamfrön": "sesamfrön",
  // Kryddor
  "flingsalt": "salt", "nymalen svartpeppar": "svartpeppar", "peppar": "svartpeppar",
  "malen spiskummin": "spiskummin", "hel spiskummin": "spiskummin",
  "malen ingefära": "ingefära", "ingefärspulver": "ingefära", "färsk ingefära": "ingefära",
  "gul currypulver": "curry", "currypulver": "curry",
  // Soja & asiatiska
  "japansk soja": "soja", "japansk sojasås": "soja",
  "ljus soja": "soja", "kinesisk soja": "soja",
  "sesamkräm": "tahini", "misopasta": "miso",
  // Mjöl & bakning
  "mjöl": "vetemjöl", "majsstärkelse": "maizena",
  "strösocker": "socker", "råsocker": "socker",
  "panko": "pankoströbröd",
  // Bröd
  "tortillabröd": "tortilla", "libabröd": "pitabröd",
  // Diverse
  "gröna oliver": "oliver", "svarta oliver": "oliver",
  "flytande honung": "honung", "sweet chilisås": "sweet chili",
  // Olja (sammansatta)
  "neutral jordnöts": "rapsolja", "neutral jordnötsolja": "rapsolja",
  // Nötter (tillagningsbeskrivningar)
  "hackade nötter": "nötter", "grovhackade nötter": "nötter",
  "rostade nötter/frön": "nötter",
  "hackade cashewnötter": "cashewnötter",
  // === Fas 1D Priority 1 — direktmatchande Willys-termer ===
  // Färser
  "kycklingfärs": "kycklingfärs",
  "fläskfärs": "fläskfärs",
  "vegofärs": "vegofärs", "vegofärs fryst": "vegofärs",
  // Skafferi-färdigprodukter
  "pesto": "pesto", "pesto basilico": "pesto", "grön pesto": "pesto",
  "ketchup": "ketchup", "tomatketchup": "ketchup",
  "majonnäs": "majonnäs", "majonäs": "majonnäs",
  // Gnocchi
  "gnocchi": "gnocchi", "färsk gnocchi": "gnocchi", "fylld gnocchi": "gnocchi",
  // Majs
  "majs": "majs", "majskorn": "majs", "frysta majskorn": "majs", "majs konserv": "majs",
  // Mejeri-self-canons (produkter utan vanliga aliaser)
  "kefir": "kefir", "kefir naturell": "kefir", "naturell kefir": "kefir",
  // === Session 34 lexikon-audit — nya self-canons för grönsaker ===
  "aubergine": "aubergine", "auberginer": "aubergine",
  "gurka": "gurka", "gurkor": "gurka", "inlagd gurka": "gurka",
  "zucchini": "zucchini", "zucchinis": "zucchini",
  "paprika": "paprika", "paprikor": "paprika",
  "chili": "chili", "röd chili": "chili", "grön chili": "chili",
  "sallad": "sallad", "salladsblad": "sallad",
  // Plural-mappings för sammansatta/böjda former som stemming ej fångar
  "tortillas": "tortilla",
  "potatisar": "potatis", "sötpotatisar": "sötpotatis",
  "citroner": "citron", "limefrukter": "lime", "lime frukter": "lime",
  "rödlökar": "rödlök",
  // Kål-varianter
  "lacinatokål": "grönkål",
  // Buljong plural
  "fiskbuljongtärningar": "fiskbuljong",
};

// Steg 5: Kategorinyckelord (utökade)
const CATEGORY_KEYWORDS = {
  Mejeri: [
    "grädde", "matlagningsgrädde", "havregrädde", "kokosmjölk", "kokosgrädde",
    "mjölk", "havremjölk", "mandelmjölk",
    "smör", "margarin",
    "ost", "parmesan", "pecorino", "mozzarella", "fetaost", "halloumi",
    "cheddar", "chèvre", "gruyère", "ricotta", "mascarpone", "kvarg", "keso",
    "crème fraiche", "yoghurt", "turkisk yoghurt", "filmjölk", "kefir",
    "ägg", "äggula", "äggvita",
  ],
  Grönsaker: [
    "lök", "rödlök", "purjolök", "salladslök", "schalottenlök", "silverlök", "vitlök",
    "morot", "morötter", "potatis", "sötpotatis",
    "blomkål", "broccoli", "brysselkål", "grönkål", "vitkål", "spetskål",
    "salladskål", "savojkål", "pak choy", "kålrabbi",
    "paprika", "chili", "jalapeño",
    "tomat", "körsbärstomat", "krossade tomater", "passerade tomater", "soltorkade tomater",
    "gurka", "inlagd gurka", "zucchini", "aubergine",
    "spenat", "fryst spenat", "mangold",
    "champinjoner", "svamp", "shiitake", "kantareller",
    "selleri", "palsternacka", "jordärtskocka", "fänkål", "rödbetor",
    "sparris", "majs", "ärtor", "ärter", "sockerärtor", "haricots verts",
    "bönor", "kikärtor", "linser", "belugalinser",
    "sallad", "salladsblad",
    "persilja", "koriander", "dill", "basilika", "timjan", "gräslök",
    "rosmarin", "oregano", "mynta", "dragon", "lagerblad",
  ],
  "Fisk & kött": [
    "lax", "torsk", "sej", "rödspätta", "fisk",
    "räkor", "kräftor", "tonfisk", "ansjovis", "sardeller", "skaldjur", "makrill",
    "kyckling", "kycklingfilé", "kycklinglår", "kycklingfärs",
    "köttfärs", "fläskfärs", "vegofärs",
    "fläskfilé", "fläsk", "stekfläsk",
    "bacon", "pancetta", "chorizo", "salsiccia", "korv",
    "biff", "oxfilé", "lamm", "tofu",
  ],
  Frukt: [
    "citron", "lime", "apelsin", "grapefrukt",
    "äpple", "päron", "banan", "mango", "ananas",
    "hallon", "jordgubbar", "lingon", "blåbär",
    "dadlar", "russin",
  ],
  Skafferi: [],
  Övrigt: [],
};

const SKAFFERI_OVERRIDE = new Set([
  "fiskbuljong", "fiskfond", "fisksås", "fisksas",
  "ostronsås", "ostronssas",
  "hönsbuljong", "grönsaksbuljong", "köttbuljong", "buljongtärning",
  "tomatpuré", "chiliflakes", "paprikapulver",
  "sweet chili",
]);

const SMALL_UNITS = new Set(["tsk", "krm", "msk", "nypa", "tumme", "näve", "nävar"]);

const PANTRY_ALWAYS_SKIP = new Set([
  "salt", "svartpeppar", "vitpeppar", "vatten", "salt & peppar", "salt och svartpeppar",
  "salt och peppar", "lite vatten", "valfria grönsaker",
]);

const SWEDISH_UNITS = [
  "förpackning", "förpackningar", "stycken",
  "dl", "cl", "ml", "kg", "msk", "tsk", "krm",
  "burk", "burkar", "frp", "förp", "pkt", "paket", "påsar", "påse",
  "krukor", "kruka", "knippe", "skivor", "klyftor", "bitar", "kvistar",
  "skiva", "klyfta", "kvist", "bit",
  "huvud", "huvuden", "näve", "nävar", "nypa", "tumme", "tummar", "st",
  "g", "liter", "l", "cm",
];

const UNIT_REGEX = new RegExp(
  `^(${SWEDISH_UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![a-zA-ZåäöÅÄÖ])`,
  "i"
);

function parseFraction(str) {
  const FRACS = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
  const s = str.trim();
  if (FRACS[s]) return FRACS[s];
  for (const [f, v] of Object.entries(FRACS)) {
    if (s.endsWith(f)) {
      const base = parseFloat(s.slice(0, -f.length));
      if (!isNaN(base)) return base + v;
    }
  }
  const range = s.replace(",", ".").match(/^[\d.]+\s*[–-]\s*([\d.]+)$/);
  if (range) return parseFloat(range[1]);
  return parseFloat(s.replace(",", ".")) || null;
}

function cleanIngredient(raw) {
  let s = raw.includes(":") ? raw.split(":")[1].trim() : raw.trim();
  s = s.replace(/\s*\(.*?\)\s*/g, " ").trim();
  s = s.replace(/^(ev\.?\s+|eventuellt\s+|ca\s+)/i, "");
  s = s.replace(/^(skal och saft av|saften av|skalet av|saft av)\s+/i, "");
  s = s.replace(/^(nykokt|nykokta|kokt|kokta|stekt|stekta|rostad|rostade|tinad|tinade)\s+/i, "");
  s = s.replace(/\s+till\s+\S+(\s+\S+)?$/i, "");
  s = s.replace(/\s*\+.*$/, "");
  // Strippa "à ca 170 g"-suffix och liknande storleksangivelser
  s = s.replace(/\s+à\s+.*$/i, "");
  // Strippa "efter smak"-suffix (förberedelseanvisning, inte en ingrediens)
  s = s.replace(/\s+efter\s+smak$/i, "");
  if (/^\d/.test(s) && s.includes(" eller ")) {
    const ADJEKTIV = new Set(["färsk", "tinad", "fryst", "varm", "kall", "riven", "hackad", "malen"]);
    const beforeEller = s.split(" eller ")[0].trim();
    const lastBeforeWord = beforeEller.split(/\s+/).pop().toLowerCase();
    if (ADJEKTIV.has(lastBeforeWord)) {
      const lastWord = s.replace(/,\s+.*$/, "").trim().split(/\s+/).pop().toLowerCase();
      s = beforeEller.replace(new RegExp("\\s+" + lastBeforeWord + "$", "i"), " " + lastWord).trim();
    } else if (lastBeforeWord.endsWith("-")) {
      // "grönsaks- eller kycklingbuljong" → extract base noun from afterEller
      const afterEller = s.split(" eller ").slice(1).join(" eller ").trim();
      const afterEllerBase = afterEller.split(/\s+/).pop();
      s = beforeEller.replace(/\s+\S+-$/, " " + afterEllerBase).trim();
    } else {
      s = beforeEller;
    }
  }
  return s;
}

export function parseIngredient(raw) {
  // Normalize slash fraction ranges like "1/4–1/2" (take max) before simple fractions
  raw = raw.replace(/(\d+)\/(\d+)\s*[–-]\s*(\d+)\/(\d+)/g, (_, an, ad, bn, bd) =>
    String(Math.round(Math.max(+an / +ad, +bn / +bd) * 100) / 100).replace('.', ','));
  // Normalize simple slash fractions: 3/4→¾, 1/2→½, 1/4→¼, 1/3→0,33, 2/3→0,67
  raw = raw.replace(/\b3\/4\b/g, '¾').replace(/\b1\/2\b/g, '½').replace(/\b1\/4\b/g, '¼')
           .replace(/\b2\/3\b/g, '0,67').replace(/\b1\/3\b/g, '0,33');

  // Handle doh-format: "ingredient name (qty[, prep notes])" → rearrange to "qty ingredient name"
  // Only when string doesn't start with a digit/fraction (old format always starts with qty)
  if (!/^[\d½¼¾]/.test(raw.trim())) {
    const parenM = raw.match(/^(.+?)\s*\(([^)]+)\)/);
    if (parenM) {
      // Split on ", " (not bare "," to preserve decimal commas like "0,5 tsk")
      // then strip any "à X g" size-notation suffix
      const qtyPart = parenM[2].split(/, /)[0].replace(/\s+à\s+.*/i, '').trim();
      // Only rearrange for simple "qty unit" patterns (≤2 words).
      // Multi-word content like "2 msk + 2 tsk", "1 litet huvud", "3 generösa nävar"
      // would produce garbage names after rearrangement — skip those.
      const wordCount = qtyPart.split(/\s+/).filter(Boolean).length;
      if (/^[\d½¼¾]/.test(qtyPart) && wordCount <= 2) {
        raw = qtyPart + ' ' + parenM[1].trim();
      }
    }
  }
  const cleaned = cleanIngredient(raw);
  let remaining = cleaned;
  const amountMatch = remaining.match(
    /^([\d]+[,.]?\d*(?:\s*[–-]\s*[\d]+[,.]?\d*)?(?:\s*[½¼¾])?|[½¼¾])\s*/
  );
  let amount = null;
  if (amountMatch) {
    amount = parseFraction(amountMatch[1]);
    remaining = remaining.slice(amountMatch[0].length);
  }
  const unitMatch = remaining.match(UNIT_REGEX);
  let unit = null;
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    remaining = remaining.slice(unitMatch[0].length).trim();
  }
  let name = remaining.replace(/,.*$/, "").trim().toLowerCase() || cleaned.toLowerCase();
  name = name.replace(/^(nykokt|nykokta|kokt|kokta)\s+/, "");
  return { amount, unit, name };
}

// === Session 34 — Kanonisk uppsättning (används av matchern för token-scan) ===
export const CANON_SET = new Set(Object.values(NORMALIZATION_TABLE));

// === Session 34 — Avvisningsmönster per canon ===
// När en canon extraheras från ett erbjudande men produkttexten indikerar
// att den funktionellt eller produktmässigt inte passar receptets
// canon-användning. Förhindrar t.ex. att "Spraygrädde Vispgrädde 35%" matchar
// matlagningsgrädde-recept (som skriver "grädde" i ingredienslistan).
export const CANON_REJECT_PATTERNS = {
  "grädde": /\b(spray|sprayvispgrädde|gräddfil|havregrädde|kokosgrädde|sojagrädde|växtgrädde)\b|\bvispgrädde\b(?!.*\bmatlagning)/i,
  "mjölk": /\b(havredryck|mandeldryck|sojadryck|kokosdryck|havremjölk|mandelmjölk|sojamjölk|gräddfil|syrad mjölk|kokosmjölk)\b/i,
  "smör": /\b(margarin|bregott|becel|flora|milda växtfett)\b/i,
  "fisk": /\b(fiskpinnar|fiskbullar|fiskbullar)\b/i,
};

// Adjektiv-prefix som strippas i fallback-stemming (Session 34).
// Skilt från cleanIngredient — denna lista är säker att applicera efter
// amount+unit redan strippats och direktlookup misslyckats.
const STEM_ADJ_PREFIX = /^(liten|små|smått|stor|stora|rejäl|rejäla|färsk|färska|fryst|frysta|torkad|torkade|skalad|skalade|riven|rivna|hackad|hackade|finhackad|finhackade|grovhackad|grovhackade|skivad|skivade|strimlad|strimlade|finstrimlad|tärnad|tärnade|krossad|krossade|pressad|pressade|passerad|passerade|inlagd|inlagda|salt|salta|söt|söta|naturell|naturella|smulad|smulade|blandad|blandade|tunt|tunn|tunna|grovt|grov|hel|hela|halv|halva|röd|röda|gul|gula|grön|gröna|vit|vita|några|lite|litet|mycket|ett|en|valfri|valfria|några)\s+/i;

// Token som aldrig får bli canon via last-word-fallback (fyllnadsord + pantry).
const TOKEN_BLOCKLIST = new Set([
  "i", "och", "eller", "till", "av", "à", "ca", "cm", "dl", "cl", "ml", "kg", "g", "l",
  "vatten", "salt", "peppar", "socker", "svartpeppar",
]);

export function normalizeName(name) {
  if (NORMALIZATION_TABLE[name]) return NORMALIZATION_TABLE[name];
  if (CANON_SET.has(name)) return name;

  // Fallback 1: strippa ett adjektiv-prefix
  const stripped = name.replace(STEM_ADJ_PREFIX, "").trim();
  if (stripped !== name && stripped) {
    if (NORMALIZATION_TABLE[stripped]) return NORMALIZATION_TABLE[stripped];
    if (CANON_SET.has(stripped)) return stripped;
  }

  // Fallback 2: skanna tokens baklänges efter första canon-träff
  // (t.ex. "burkar tonfisk i vatten" → tonfisk)
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (TOKEN_BLOCKLIST.has(t)) continue;
      if (NORMALIZATION_TABLE[t]) return NORMALIZATION_TABLE[t];
      if (CANON_SET.has(t)) return t;
    }
    // Fallback 3: n-gram sökning (2- och 3-gram) för compounds som
    // "tonfisk i vatten" eller "färsk mozzarella".
    for (let n = Math.min(3, tokens.length); n >= 2; n--) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const phrase = tokens.slice(i, i + n).join(" ");
        if (NORMALIZATION_TABLE[phrase]) return NORMALIZATION_TABLE[phrase];
        if (CANON_SET.has(phrase)) return phrase;
      }
    }
  }

  return name;
}

function categorize(name) {
  const low = name.toLowerCase()
    .replace(/^(rostad|rostade|stekt|stekta|tinad|tinade|nykokt|nykokta|kokt|kokta)\s+/, "");
  if (SKAFFERI_OVERRIDE.has(low)) return "Skafferi";
  if (/^(torkad|torkade|malen|mald)\s+/.test(low)) return "Skafferi";
  // Dela upp i ord för att undvika falskt-positiva substring-träffar:
  // "pankoströbröd" ska inte matcha "ost", "mangold" ska inte matcha "mango".
  // Enkelspalts-nyckelord kräver exakt ordmatch; flerspalts-nyckelord tillåter includes.
  const lowWords = new Set(low.split(/\s+/));
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === "Skafferi" || cat === "Övrigt") continue;
    if (keywords.some((kw) =>
      kw.includes(" ") ? (low === kw || low.includes(kw)) : lowWords.has(kw)
    )) return cat;
  }
  return "Skafferi";
}

function formatIngredient(amount, unit, name) {
  if (amount === null) return name;
  amount = Math.round(amount * 100) / 100;
  const FRAC_DISPLAY = { 0.5: "½", 0.25: "¼", 0.75: "¾", 1.5: "1½", 2.5: "2½" };
  const amtStr = FRAC_DISPLAY[amount] ?? (Number.isInteger(amount) ? String(amount) : String(amount).replace(".", ","));
  const qty = unit ? `${amtStr} ${unit}` : amtStr;
  return `${name} (${qty})`;
}

export function buildShoppingList(selectedIds, allRecipes) {
  const recipeMap = Object.fromEntries(allRecipes.map((r) => [r.id, r]));
  const categories = { Mejeri: [], Grönsaker: [], "Fisk & kött": [], Frukt: [], Skafferi: [], Övrigt: [] };

  const merged = new Map();
  const noAmount = new Map();

  for (const rid of selectedIds) {
    const recipe = recipeMap[rid];
    if (!recipe) continue;
    for (const rawIng of recipe.ingredients || []) {
      const { amount, unit, name } = parseIngredient(rawIng);
      const normalized = normalizeName(name);
      if (amount === null) {
        noAmount.set(normalized, normalized);
      } else {
        const key = `${normalized}||${unit ?? ""}`;
        if (merged.has(key)) {
          merged.get(key).amount += amount;
        } else {
          merged.set(key, { name: normalized, unit: unit ?? null, amount });
        }
      }
    }
  }

  for (const [key, item] of merged) {
    if (PANTRY_ALWAYS_SKIP.has(item.name)) { merged.delete(key); continue; }
    if (SMALL_UNITS.has(item.unit)) {
      merged.delete(key);
      const hasLargeUnit = [...merged.keys()].some(
        (k) => k.startsWith(item.name + "||") && !SMALL_UNITS.has(merged.get(k)?.unit)
      );
      if (!hasLargeUnit) noAmount.set(item.name, item.name);
    }
  }
  for (const [name] of noAmount) {
    if (PANTRY_ALWAYS_SKIP.has(name)) noAmount.delete(name);
    if (name.includes(" eller ")) noAmount.delete(name);
  }

  const keysByName = new Map();
  for (const [key, item] of merged) {
    if (!keysByName.has(item.name)) keysByName.set(item.name, []);
    keysByName.get(item.name).push(key);
  }
  for (const [name, keys] of keysByName) {
    if (keys.length > 1) {
      for (const k of keys) merged.delete(k);
      noAmount.set(name, name);
    }
  }

  for (const { name, unit, amount } of merged.values()) {
    categories[categorize(name)].push(formatIngredient(amount, unit, name));
  }
  for (const [normalized] of noAmount.entries()) {
    const alreadyCovered = [...merged.keys()].some((k) => k.startsWith(normalized + "||"));
    if (!alreadyCovered) categories[categorize(normalized)].push(normalized);
  }

  // Sortera på namnet (som är början på strängen i formatet "namn (qty)").
  // å/ä/ö mappas sist — localeCompare med sv-locale är opålitligt i Vercels serverless-miljö.
  const svKey = (s) =>
    s.trim().toLowerCase()
     .replace(/å/g, "z\u0001").replace(/ä/g, "z\u0002").replace(/ö/g, "z\u0003");
  for (const arr of Object.values(categories)) {
    arr.sort((a, b) => svKey(a).localeCompare(svKey(b)));
  }

  return categories;
}

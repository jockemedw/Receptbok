// ─── INGREDIENT PARSER — 5-stegspipeline ───────────────────────────────────

// Steg 3: Varianter → kanoniskt namn
const NORMALIZATION_TABLE = {
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
};

// Steg 5: Kategorinyckelord (utökade)
const CATEGORY_KEYWORDS = {
  Mejeri: [
    "grädde", "matlagningsgrädde", "havregrädde", "kokosmjölk", "kokosgrädde",
    "mjölk", "havremjölk", "mandelmjölk",
    "smör", "margarin",
    "ost", "parmesan", "pecorino", "mozzarella", "fetaost", "halloumi",
    "cheddar", "chèvre", "gruyère", "ricotta", "mascarpone", "kvarg", "keso",
    "crème fraiche", "yoghurt", "turkisk yoghurt", "filmjölk",
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
    "spenat", "fryst spenat",
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
]);

const SMALL_UNITS = new Set(["tsk", "krm", "msk", "nypa", "tumme"]);

const PANTRY_ALWAYS_SKIP = new Set([
  "salt", "svartpeppar", "vitpeppar", "vatten", "salt & peppar", "salt och svartpeppar",
  "salt och peppar", "lite vatten", "valfria grönsaker",
]);

const SWEDISH_UNITS = [
  "förpackning", "stycken",
  "dl", "cl", "ml", "kg", "msk", "tsk", "krm",
  "burk", "frp", "förp", "pkt", "paket", "påsar", "påse",
  "krukor", "kruka", "knippe", "skivor", "klyftor", "bitar", "kvistar",
  "skiva", "klyfta", "kvist", "bit",
  "huvud", "näve", "nypa", "tumme", "st",
  "g", "liter", "l",
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
  if (/^\d/.test(s) && s.includes(" eller ")) {
    const ADJEKTIV = new Set(["färsk", "tinad", "fryst", "varm", "kall", "riven", "hackad", "malen"]);
    const beforeEller = s.split(" eller ")[0].trim();
    const lastBeforeWord = beforeEller.split(/\s+/).pop().toLowerCase();
    if (ADJEKTIV.has(lastBeforeWord)) {
      const lastWord = s.replace(/,.*$/, "").trim().split(/\s+/).pop().toLowerCase();
      s = beforeEller.replace(new RegExp("\\s+" + lastBeforeWord + "$", "i"), " " + lastWord).trim();
    } else if (lastBeforeWord.endsWith("-")) {
      s = beforeEller.replace(/-$/, "").trim();
    } else {
      s = beforeEller;
    }
  }
  return s;
}

function parseIngredient(raw) {
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

function normalizeName(name) {
  return NORMALIZATION_TABLE[name] || name;
}

function categorize(name) {
  const low = name.toLowerCase()
    .replace(/^(rostad|rostade|stekt|stekta|tinad|tinade|nykokt|nykokta|kokt|kokta)\s+/, "");
  if (SKAFFERI_OVERRIDE.has(low)) return "Skafferi";
  if (/^(torkad|torkade|malen|mald)\s+/.test(low)) return "Skafferi";
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === "Skafferi" || cat === "Övrigt") continue;
    if (keywords.some((kw) => low === kw || low.includes(kw))) return cat;
  }
  return "Skafferi";
}

function formatIngredient(amount, unit, name) {
  if (amount === null) return name;
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

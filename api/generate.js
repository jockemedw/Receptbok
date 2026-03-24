import Anthropic from "@anthropic-ai/sdk";

const REPO_OWNER = "jockemedw";
const REPO_NAME = "Receptbok";
const BRANCH = "main";

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

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
  "vitlöksklyfta": "vitlök", "vitlöksklyftor": "vitlök",
  "pressad vitlök": "vitlök", "krossad vitlök": "vitlök",
  "riven vitlök": "vitlök", "rivna vitlöksklyftor": "vitlök",
  "skivad vitlök": "vitlök", "finhackad vitlök": "vitlök",
  "hackad vitlök": "vitlök", "vitlöksfond": "vitlök",
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
  // Nötter (tillagningsbeskrivningar)
  "hackade nötter": "nötter", "grovhackade nötter": "nötter",
  "rostade nötter/frön": "nötter",
};

// Steg 5: Kategorinyckelord (utökade)
const CATEGORY_KEYWORDS = {
  Mejeri: [
    "grädde", "matlagningsgrädde", "havregrädde", "kokosmjölk", "kokosgrädde",
    "mjölk", "havremjölk", "mandelmjölk",
    "smör", "margarin",
    "ost", "parmesan", "pecorino", "mozzarella", "fetaost", "halloumi",
    "cheddar", "chèvre", "gruyère", "ricotta", "mascarpone", "kvarg", "keso",
    "crème fraiche", "yoghurt", "turkisk yoghurt", "fil", "filmjölk",
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
    "ingefära",
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

// Enheter som inte är meningsfulla på en inköpslista — visa bara ingrediensnamnet
const SMALL_UNITS = new Set(["tsk", "krm", "msk", "nypa", "tumme"]);

// Ingredienser som aldrig ska visas på inköpslistan
const PANTRY_ALWAYS_SKIP = new Set([
  "salt", "svartpeppar", "vitpeppar", "vatten", "salt & peppar",
]);

// Svenska matlagningsenheter (längst först för regex-matchning)
const SWEDISH_UNITS = [
  "förpackning", "stycken",
  "dl", "cl", "ml", "kg", "msk", "tsk", "krm",
  "burk", "frp", "förp", "pkt", "paket", "påsar", "påse",
  "krukor", "kruka", "knippe", "skivor", "klyftor", "bitar", "kvistar",
  "skiva", "klyfta", "kvist", "bit",
  "huvud", "näve", "nypa", "tumme", "st",
  "g", "l",
];

// Förbyggd enhets-regex (en gång vid modulstart)
const UNIT_REGEX = new RegExp(
  `^(${SWEDISH_UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
);

// Steg 2: Parsa bråk och intervall till tal
function parseFraction(str) {
  const FRACS = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
  const s = str.trim();
  if (FRACS[s]) return FRACS[s];
  // "1½", "2¼" etc.
  for (const [f, v] of Object.entries(FRACS)) {
    if (s.endsWith(f)) {
      const base = parseFloat(s.slice(0, -f.length));
      if (!isNaN(base)) return base + v;
    }
  }
  // Intervall "1–2" eller "1-2" → ta max
  const range = s.replace(",", ".").match(/^[\d.]+\s*[–-]\s*([\d.]+)$/);
  if (range) return parseFloat(range[1]);
  return parseFloat(s.replace(",", ".")) || null;
}

// Steg 1: Rensa råsträng
function cleanIngredient(raw) {
  let s = raw.includes(":") ? raw.split(":")[1].trim() : raw.trim();
  s = s.replace(/\s*\(.*?\)\s*/g, " ").trim(); // strip parentes
  s = s.replace(/^(ev\.?\s+|eventuellt\s+|ca\s+)/i, ""); // strip prefix
  s = s.replace(/^(nykokt|nykokta|kokt|kokta|stekt|stekta|rostad|rostade|tinad|tinade)\s+/i, ""); // strip tillagningsbeskrivningar
  return s;
}

// Steg 2: Parsa mängd + enhet + namn
function parseIngredient(raw) {
  const cleaned = cleanIngredient(raw);
  let remaining = cleaned;

  // Mängd: siffra, bråk, intervall
  const amountMatch = remaining.match(
    /^([\d]+[,.]?\d*(?:\s*[–-]\s*[\d]+[,.]?\d*)?(?:\s*[½¼¾])?|[½¼¾])\s*/
  );
  let amount = null;
  if (amountMatch) {
    amount = parseFraction(amountMatch[1]);
    remaining = remaining.slice(amountMatch[0].length);
  }

  // Enhet
  const unitMatch = remaining.match(UNIT_REGEX);
  let unit = null;
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    remaining = remaining.slice(unitMatch[0].length).trim();
  }

  // Namn: strip tillagningsnot efter komma
  const name = remaining.replace(/,.*$/, "").trim().toLowerCase() || cleaned.toLowerCase();

  return { amount, unit, name };
}

// Steg 3: Normalisera namn
function normalizeName(name) {
  return NORMALIZATION_TABLE[name] || name;
}

// Steg 5: Kategorisera
function categorize(name) {
  const low = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === "Skafferi" || cat === "Övrigt") continue;
    if (keywords.some((kw) => low === kw || low.includes(kw))) return cat;
  }
  return "Skafferi";
}

// Formatera tillbaka till läsbar sträng
function formatIngredient(amount, unit, name) {
  if (amount === null) return name;
  const FRAC_DISPLAY = { 0.5: "½", 0.25: "¼", 0.75: "¾", 1.5: "1½", 2.5: "2½" };
  const amtStr = FRAC_DISPLAY[amount] ?? (Number.isInteger(amount) ? String(amount) : String(amount).replace(".", ","));
  return unit ? `${amtStr} ${unit} ${name}` : `${amtStr} ${name}`;
}

function buildDayList(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dow = current.getDay(); // 0=sun,1=mon...6=sat
    const weekday = dow === 0 ? 6 : dow - 1; // convert to mon=0..sun=6
    days.push({
      date: current.toISOString().slice(0, 10),
      day: DAY_NAMES[weekday],
      is_weekend: weekday >= 5,
    });
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function filterRecipes(recipes, constraints) {
  const allowed = new Set(constraints.allowed_proteins);
  const { untested_count, max_weekday_time, max_weekend_time } = constraints;

  return recipes.filter((r) => {
    if (!allowed.has(r.protein)) return false;
    if (!untested_count && !r.tested) return false;
    const t = r.time || 999;
    const tags = r.tags || [];
    const weekdayOk = tags.includes("vardag30") && t <= max_weekday_time;
    const weekendOk = tags.includes("helg60") && t <= max_weekend_time;
    return weekdayOk || weekendOk;
  });
}

function buildShoppingList(selectedIds, allRecipes) {
  const recipeMap = Object.fromEntries(allRecipes.map((r) => [r.id, r]));
  const categories = { Mejeri: [], Grönsaker: [], "Fisk & kött": [], Frukt: [], Skafferi: [], Övrigt: [] };

  // Steg 4: Merge — nyckel = "normaliseratNamn||enhet"
  const merged = new Map();   // med mängd
  const noAmount = new Map(); // utan mängd — deduplicera på namn

  for (const rid of selectedIds) {
    const recipe = recipeMap[rid];
    if (!recipe) continue;
    for (const rawIng of recipe.ingredients || []) {
      const { amount, unit, name } = parseIngredient(rawIng);
      const normalized = normalizeName(name);
      if (amount === null) {
        noAmount.set(normalized, normalized); // deduplicera, behåll ett
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

  // Steg 4.5: Filtrera bort basvaror och konvertera småenheter till bara namn
  for (const [key, item] of merged) {
    if (PANTRY_ALWAYS_SKIP.has(item.name)) {
      merged.delete(key);
      continue;
    }
    if (SMALL_UNITS.has(item.unit)) {
      merged.delete(key);
      // Lägg till som namn utan mängd, om inte en stor-enhetspost redan finns
      const hasLargeUnit = [...merged.keys()].some(
        (k) => k.startsWith(item.name + "||") && !SMALL_UNITS.has(merged.get(k)?.unit)
      );
      if (!hasLargeUnit) {
        noAmount.set(item.name, item.name);
      }
    }
  }
  for (const [name] of noAmount) {
    if (PANTRY_ALWAYS_SKIP.has(name)) noAmount.delete(name);
  }

  // Steg 5: Kategorisera och bygg listor
  for (const { name, unit, amount } of merged.values()) {
    categories[categorize(name)].push(formatIngredient(amount, unit, name));
  }
  for (const [normalized] of noAmount.entries()) {
    // Hoppa över om ingrediensen redan finns med mängd
    const alreadyCovered = [...merged.keys()].some((k) => k.startsWith(normalized + "||"));
    if (!alreadyCovered) {
      categories[categorize(normalized)].push(normalized);
    }
  }

  return categories;
}

async function fetchRecipes() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipes.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kunde inte hämta receptdatabasen — kontrollera att recipes.json finns i repot.");
  const data = await res.json();
  return data.recipes.map((r) => ({
    id: r.id,
    title: r.title,
    time: r.time,
    tags: r.tags || [],
    protein: r.protein,
    tested: r.tested || false,
    ingredients: r.ingredients || [],
  }));
}

async function fetchHistory() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/recipe-history.json`;
  const res = await fetch(url);
  if (!res.ok) return { history: [] };
  return res.json();
}

async function fetchShoppingList() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/shopping-list.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// Returns Set of recipe IDs used within the last `days` days
function recentlyUsedIds(history, days = 28) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const ids = new Set();
  for (const entry of history) {
    if (new Date(entry.date) >= cutoff) {
      for (const id of entry.recipeIds) ids.add(id);
    }
  }
  return ids;
}

function updateHistory(history, newIds, date) {
  const updated = [{ date, recipeIds: newIds }, ...history];
  // Keep max 8 entries (covers ~2 months)
  return updated.slice(0, 8);
}

async function writeFileToGitHub(path, content, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers = {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");
  const message = `Matsedel ${new Date().toISOString().slice(0, 10)} — autogenererad`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let sha;
    const getRes = await fetch(`${apiUrl}?t=${Date.now()}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (putRes.ok) return;
    if (putRes.status === 409 && attempt < 2) continue; // SHA conflict — retry with fresh SHA
    throw new Error(`Kunde inte spara ${path} — prova att generera igen.`);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function callClaude(recipes, dayList, constraints, instructions, recentIds = new Set()) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const slim = shuffle(recipes).map((r) => ({
    id: r.id, title: r.title, time: r.time,
    tags: r.tags, protein: r.protein, tested: r.tested,
  }));

  const daysText = dayList
    .map((d) => `- ${d.day} (${d.date}): ${d.is_weekend ? "helg60" : "vardag30"}`)
    .join("\n");

  const daysTemplate = JSON.stringify(
    dayList.map((d) => ({ date: d.date, day: d.day, recipe: "<exact title>", recipeId: 0 })),
    null, 2
  );

  const extraRules = [];
  if (!constraints.untested_count) {
    extraRules.push("6. ONLY select recipes where tested=true.");
  } else {
    extraRules.push(`6. At most ${constraints.untested_count} selected recipe(s) may have tested=false.`);
  }
  if (constraints.vegetarian_days > 0) {
    extraRules.push(
      `7. Exactly ${constraints.vegetarian_days} of the ${dayList.length} days must use a vegetarian recipe (protein='vegetarisk').`
    );
  }
  if (recentIds.size > 0) {
    const ruleNum = extraRules.length + 6;
    extraRules.push(`${ruleNum}. The following recipe IDs were used in the last 4 weeks — AVOID them if possible, only use as last resort: [${[...recentIds].join(", ")}]`);
  }
  if (instructions?.trim()) {
    const ruleNum = extraRules.length + 6;
    extraRules.push(`${ruleNum}. Additional family instructions: ${instructions.trim()}`);
  }

  const prompt = `You are a meal planner for a Swedish family. Select ${dayList.length} recipes from the recipe database below — one per day — for the period listed.

## Rules
1. Days tagged "vardag30" MUST use recipes tagged "vardag30" (max ${constraints.max_weekday_time} min).
2. Days tagged "helg60" MUST use recipes tagged "helg60" (max ${constraints.max_weekend_time} min).
3. Do not repeat the same recipe or the same protein type more than twice across all days.
4. Vary protein types across the days for nutritional balance.
5. Copy recipe titles and IDs EXACTLY as they appear in the database.
${extraRules.join("\n")}

## Days to plan
${daysText}

## Recipe database
${JSON.stringify(slim, null, 0)}

## Required output format
Return ONLY a JSON array — no other text outside the array:

${daysTemplate}`;

  const models = ["claude-haiku-4-5-20251001", "claude-haiku-4-5"];
  let lastError;
  for (const model of models) {
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      let raw = msg.content[0]?.text?.trim() || "";
      if (raw.startsWith("```")) {
        raw = raw.split("```")[1];
        if (raw.startsWith("json")) raw = raw.slice(4);
        raw = raw.trim().replace(/```$/, "").trim();
      }
      const days = JSON.parse(raw);
      if (!Array.isArray(days)) throw new Error("Svar är inte en array");
      return days;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GITHUB_PAT saknas i env" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY saknas i env" });

  const {
    start_date,
    end_date,
    instructions = "",
    allowed_proteins = "fisk,kyckling,kött,fläsk,vegetarisk",
    untested_count = 0,
    max_weekday_time = 30,
    max_weekend_time = 60,
    vegetarian_days = 0,
  } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: "start_date och end_date krävs" });
  }

  try {
    const constraints = {
      allowed_proteins: allowed_proteins.split(",").map((p) => p.trim()).filter(Boolean),
      untested_count: parseInt(untested_count) || 0,
      max_weekday_time: parseInt(max_weekday_time) || 30,
      max_weekend_time: parseInt(max_weekend_time) || 60,
      vegetarian_days: parseInt(vegetarian_days) || 0,
    };

    const [allRecipes, historyData, existingShop] = await Promise.all([fetchRecipes(), fetchHistory(), fetchShoppingList()]);
    const filtered = filterRecipes(allRecipes, constraints);

    if (filtered.length === 0) {
      return res.status(400).json({ error: "Inga recept kvar efter filtrering — justera inställningarna." });
    }

    // Pass recently used IDs to Claude so it avoids them
    const recentIds = recentlyUsedIds(historyData.history);

    const dayList = buildDayList(start_date, end_date);
    const days = await callClaude(filtered, dayList, constraints, instructions, recentIds);

    const selectedIds = days.map((d) => d.recipeId).filter(Boolean);
    const shoppingCategories = buildShoppingList(selectedIds, allRecipes);

    const today = new Date().toISOString().slice(0, 10);
    const weeklyPlan = { generated: today, startDate: start_date, endDate: end_date, days };
    const shoppingList = {
      generated: today, startDate: start_date, endDate: end_date,
      recipeItems: shoppingCategories,
      recipeItemsMovedAt: null,
      manualItems: existingShop?.manualItems || [],
    };
    const updatedHistory = { history: updateHistory(historyData.history, selectedIds, today) };

    await Promise.all([
      writeFileToGitHub("weekly-plan.json", weeklyPlan, pat),
      writeFileToGitHub("shopping-list.json", shoppingList, pat),
      writeFileToGitHub("recipe-history.json", updatedHistory, pat),
    ]);

    return res.status(200).json({ ok: true, days: days.length, weeklyPlan, shoppingList });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

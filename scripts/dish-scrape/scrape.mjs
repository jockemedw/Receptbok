#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------- env ----------
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...v] = trimmed.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
}
loadEnv();

// ---------- args ----------
function parseArgs(argv) {
  const args = { limit: null, resume: false, pilot: false, listOnly: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--resume') args.resume = true;
    else if (a === '--pilot') { args.pilot = true; args.limit = 5; }
    else if (a === '--list-only') args.listOnly = true;
    else if (a === '--help') { console.log('usage: scrape.mjs [--pilot|--limit N] [--resume] [--list-only]'); process.exit(0); }
  }
  return args;
}
const args = parseArgs(process.argv);

// ---------- logging ----------
const log = (level, ...rest) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${level.padEnd(5)}`, ...rest);
const logProgress = (idx, total, msg) => process.stdout.write(`\r[${idx.toString().padStart(3)}/${total}] ${msg.slice(0, 90).padEnd(90)}\n`);

// ---------- HTTP ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9', 'Accept-Language': 'en-US,en;q=0.9' };

async function httpGet(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
      if (!res.ok) {
        if (attempt < retries && (res.status >= 500 || res.status === 429)) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (e) {
      if (attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- sitemap ----------
function extractSitemapUrls(xml) {
  const out = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

async function fetchAllRecipeUrls() {
  log('FAS1', 'fetching sitemap_index.xml');
  const indexXml = await httpGet('https://dishingouthealth.com/sitemap_index.xml');
  const subSitemaps = extractSitemapUrls(indexXml).filter(u => /sitemap/.test(u) && /\.xml/.test(u));
  log('FAS1', `found ${subSitemaps.length} sub-sitemaps:`);
  for (const s of subSitemaps) log('FAS1', '  -', s);

  // Pick post-sitemaps (recipe posts live there in YOAST WP)
  const postSitemaps = subSitemaps.filter(u => /post-sitemap/.test(u));
  if (postSitemaps.length === 0) {
    log('FAS1', 'no post-sitemap found — falling back to all sub-sitemaps');
    postSitemaps.push(...subSitemaps);
  }

  const allUrls = new Set();
  for (const sm of postSitemaps) {
    log('FAS1', `fetching ${sm}`);
    const xml = await httpGet(sm);
    const urls = extractSitemapUrls(xml);
    urls.forEach(u => allUrls.add(u));
    log('FAS1', `  +${urls.length} urls (total ${allUrls.size})`);
    await sleep(500);
  }

  // Filter to recipe posts only — heuristic: not category/tag/author/page archives
  const skipPatterns = [
    /\/category\//, /\/tag\//, /\/author\//, /\/page\//,
    /^https:\/\/dishingouthealth\.com\/?$/,
    /\/about\/?$/, /\/contact\/?$/, /\/privacy\/?$/, /\/terms\/?$/, /\/disclaimer\/?$/,
    /\/recipe-index\/?$/, /\/cookbook\/?$/, /\/shop\/?$/, /\/work-with-me\/?$/, /\/start-here\/?$/,
    /\/subscribe\/?$/, /\/portfolio\/?$/,
  ];
  return [...allUrls].filter(u => !skipPatterns.some(re => re.test(u)));
}

// ---------- url filter ----------
const SKIP_SLUG_SUBSTRINGS = [
  'cookie', 'brownie', 'cake', 'frosting', 'cupcake', 'muffin', 'bread', 'biscotti', 'donut', 'doughnut', 'scone',
  'pie-crust', 'pastry', 'truffle', 'fudge', 'pudding', 'mousse',
  'smoothie', 'latte', 'cocktail', 'mocktail', '-drink-', 'drinks/',
  'granola', 'oatmeal', 'overnight-oats', 'steel-cut-oat', 'slowcookeroats', 'slow-cooker-oats', 'baked-oats',
  'pancake', 'waffle', 'parfait', 'crepe', 'french-toast', 'breakfast-bake',
  'energy-ball', 'energy-bite', 'protein-ball', 'snack-bar', 'protein-bar', 'granola-bar',
  'jam', 'preserves', 'syrup',
  'ice-cream', 'sorbet', 'popsicle', 'frozen-yogurt',
  // Roundup/listicle posts (not single recipes)
  '-recipes-for-', 'recipes-for-', 'easy-meals', 'minute-meals', 'minute-dinners', 'meal-prep-ideas',
  'recipe-roundup', 'best-of-', 'favorite-', 'meal-plan',
];
const SKIP_DRESSING_DIP = /\b(dressing|dip|salsa|pesto|hummus|tzatziki|chimichurri|aioli|mayo)s?\b/;

function filterUrls(urls) {
  const keep = [];
  const skip = [];
  for (const u of urls) {
    const slug = u.replace(/\/$/, '').split('/').pop().toLowerCase();
    const hit = SKIP_SLUG_SUBSTRINGS.find(s => slug.includes(s));
    if (hit) { skip.push({ url: u, reason: `slug-skip: ${hit}` }); continue; }
    if (SKIP_DRESSING_DIP.test(slug) && !/with-(chicken|salmon|beef|pork|tofu|shrimp)/.test(slug)) {
      skip.push({ url: u, reason: 'dressing/dip without protein' }); continue;
    }
    keep.push(u);
  }
  return { keep, skip };
}

// ---------- JSON-LD ----------
function extractJsonLdRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block[1].trim()); } catch { continue; }
    const found = findRecipeInLd(parsed);
    if (found) return found;
  }
  return null;
}
function findRecipeInLd(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findRecipeInLd(item);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const t = node['@type'];
  const isRecipe = (Array.isArray(t) ? t : [t]).some(x => typeof x === 'string' && x.toLowerCase() === 'recipe');
  if (isRecipe) return node;
  if (node['@graph']) return findRecipeInLd(node['@graph']);
  return null;
}

function parseISO8601Duration(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  return h * 60 + min;
}

function mapJsonLdToRaw(ld, sourceUrl) {
  const ingredients = (ld.recipeIngredient || []).map(s => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
  let instructions = ld.recipeInstructions || [];
  if (typeof instructions === 'string') instructions = [instructions];
  if (!Array.isArray(instructions)) instructions = [instructions];
  instructions = instructions.flatMap(node => {
    if (!node) return [];
    if (typeof node === 'string') return [node];
    if (node['@type'] === 'HowToSection' && Array.isArray(node.itemListElement)) {
      return node.itemListElement.map(s => typeof s === 'string' ? s : (s && s.text) || '').filter(Boolean);
    }
    if (typeof node.text === 'string') return [node.text];
    if (typeof node.name === 'string') return [node.name];
    return [];
  }).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const totalMin = parseISO8601Duration(ld.totalTime) || (parseISO8601Duration(ld.cookTime) || 0) + (parseISO8601Duration(ld.prepTime) || 0) || null;
  const yieldRaw = ld.recipeYield;
  let servings = null;
  if (yieldRaw) {
    const yStr = Array.isArray(yieldRaw) ? yieldRaw[0] : yieldRaw;
    const yMatch = String(yStr).match(/\d+/);
    if (yMatch) servings = parseInt(yMatch[0], 10);
  }

  let rating = null;
  let ratingCount = null;
  if (ld.aggregateRating) {
    const rv = ld.aggregateRating.ratingValue;
    const rc = ld.aggregateRating.ratingCount;
    if (rv != null) { const f = parseFloat(rv); if (!isNaN(f)) rating = f; }
    if (rc != null) { const n = parseInt(rc, 10); if (!isNaN(n)) ratingCount = n; }
  }

  return {
    title: ld.name || '',
    servings,
    time: totalMin,
    ingredients,
    instructions,
    description: ld.description || '',
    category: Array.isArray(ld.recipeCategory) ? ld.recipeCategory.join(', ') : (ld.recipeCategory || ''),
    rating,
    ratingCount,
    sourceUrl,
  };
}

const MIN_RATING = 4.5;

// ---------- Sonnet ----------
const SYSTEM_PROMPT = `Du är en svensk receptöversättare som konverterar amerikanska blogg-recept till en svensk familje-receptbok.

REGLER:
1. Översätt titel idiomatiskt — naturlig svensk receptstil, inte ord-för-ord. "Garlic Lemon Chicken" blir "Citron- och vitlökskyckling", inte "Vitlök-citron-kyckling".

2. Konvertera ALLA enheter till svensk receptkonvention:
   - 1 cup = 2,4 dl  ·  1/2 cup = 1,2 dl  ·  1/4 cup = 0,6 dl
   - 1 tbsp = 1 msk  ·  1 tsp = 1 tsk
   - 1 oz = 28 g  ·  1 lb = 450 g
   - 1 fl oz = 30 ml  ·  1 quart = 1 liter
   - °F till °C: avrunda till närmsta 5: 350°F=175°C, 375°F=190°C, 400°F=200°C, 425°F=220°C, 450°F=230°C
   - Använd komma som decimaltecken (svensk standard): 2,4 dl, inte 2.4 dl

3. Översätt ingredienser med svenska livsmedelsnamn:
   - heavy cream → vispgrädde (36%)
   - half-and-half → matlagningsgrädde
   - whipping cream → vispgrädde
   - sour cream → gräddfil  ·  Greek yogurt → grekisk yoghurt
   - baking soda → bikarbonat  ·  baking powder → bakpulver
   - cilantro → koriander  ·  parsley → persilja  ·  basil → basilika
   - scallions / green onions → salladslök
   - ground beef → köttfärs  ·  ground turkey → kalkonfärs  ·  ground chicken → kycklingfärs
   - skirt steak / flank steak → flankstek  ·  sirloin → entrecôte
   - bell pepper → paprika  ·  zucchini → squash  ·  eggplant → aubergine
   - chickpeas → kikärtor  ·  black beans → svarta bönor  ·  edamame → edamame
   - shrimp → räkor  ·  salmon → lax  ·  cod → torsk  ·  tilapia → tilapia
   - feta cheese → fetaost  ·  parmesan → parmesan  ·  cheddar → cheddar
   - tortilla → tortilla  ·  taco shell → tacoskal
   - quinoa → quinoa  ·  farro → farro  ·  couscous → couscous
   - sweet potato → sötpotatis  ·  butternut squash → butternutpumpa
   - kale → grönkål  ·  arugula → ruccola  ·  spinach → spenat
   - garlic clove → vitlöksklyfta  ·  garlic powder → vitlökspulver
   - olive oil → olivolja  ·  avocado oil → avokadoolja  ·  sesame oil → sesamolja
   - soy sauce → sojasås  ·  rice vinegar → risvinäger  ·  apple cider vinegar → äppelcidervinäger
   - red pepper flakes → chilipulver
   - kosher salt / sea salt → salt
   - vanilla extract → vaniljextrakt
   - all-purpose flour → vetemjöl  ·  whole wheat flour → fullkornsmjöl
   - rolled oats → havregryn

4. Strip prisannoteringar och kommentarer i parentes som ($0.17*), ($1.25), ($0.50/serving). Behåll annan info i parentes (storlekar, alternativ).

5. Format för ingredienser: "namn (mängd)" på svenska, t.ex. "vispgrädde (2 dl)", "kycklingfilé (600 g)", "vitlöksklyfta (3)".

5a. **Översätt även tillagningsmetoder** i ingredienslistan — INGA engelska ord ska finnas kvar:
   - thinly sliced → tunt skivad
   - thickly sliced → tjockt skivad
   - finely chopped → fint hackad
   - roughly chopped / coarsely chopped → grovhackad
   - minced → pressad (vitlök) / finhackad (övrigt)
   - diced → tärnad
   - julienned → strimlad
   - shredded → riven
   - crumbled → smulad
   - mashed → mosad
   - drained → avrunnen
   - rinsed → sköljd
   - peeled → skalad
   - cubed → tärnad
   - halved → halverad
   - quartered → delad i fjärdedelar
   - whisked → vispad
   - softened → mjuknad
   - melted → smält
   - room temperature → rumstempererad
   - divided → uppdelat
   - to taste → efter smak
   - optional → valfritt

5b. **Filtrera bort recept-card-rubriker** ur ingredienslistan. Ord som "Tillbehör:", "Garnering:", "För såsen:", "För kycklingen:", "Topping:", "Ingredients for X:" är inte ingredienser — UTELÄMNA dem helt. Bara faktiska livsmedel ska in i ingredients-arrayen.

6. protein: en av "fisk", "kyckling", "kött" (nötkött), "fläsk" (gris), "vegetarisk". Tofu/baljväxter/halloumi → "vegetarisk". Kalkon räknas som "kyckling".

7. tags (array av strings) — **får ENDAST innehålla** dessa värden:
   - "vardag30" om totaltid <= 30 min
   - "helg60" om totaltid 31–60 min
   - "veg" om protein === "vegetarisk"
   - Typ-tag (max EN): "soppa", "pasta", "wok", "ugn", "sallad", "gryta", "ramen", "curry"
   - **FÖRBJUDET som tag:** "vegetarisk", "fisk", "kyckling", "kött", "fläsk" — dessa hör hemma i protein-fältet, INTE i tags. Lägg ALDRIG protein-namnet i tags.
   - **FÖRBJUDET som tag:** engelska ord, recept-namn, ingredienser. Bara värdena ovan.

8. Om totaltiden > 60 minuter ELLER om receptet är dessert/baking/drinks/frukost (smoothies, pancakes, oatmeal, granola etc.) ELLER bara en sås/dressing utan måltid → returnera { "skip": true, "reason": "kort förklaring" }.

9. Om receptet inte är en middag/lunch (snack, breakfast bowl utan protein, side dish utan helhet) → skip.

10. notes-fältet: alltid "Källa: <originaltitel på engelska>, dishingouthealth.com"

OUTPUT: ENBART en JSON-rad, ingen markdown, inga \`\`\`-fences, ingen kommentar.

Format vid behåll:
{"title":"...","servings":4,"time":35,"timeNote":"","ingredients":["..."],"instructions":["..."],"tags":["helg60","kyckling","ugn"],"protein":"kyckling","notes":"Källa: ..., dishingouthealth.com"}

Format vid skip:
{"skip":true,"reason":"too long: 75 min"}`;

async function sonnetTranslate(client, raw) {
  const userMsg = JSON.stringify({
    title: raw.title,
    servings: raw.servings,
    time: raw.time,
    ingredients: raw.ingredients,
    instructions: raw.instructions,
    description: raw.description ? raw.description.slice(0, 500) : '',
    category: raw.category,
    sourceUrl: raw.sourceUrl,
  });
  const r = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = r.content.map(c => c.text || '').join('').trim();
  let cleaned = text;
  // Strip ```json fences if Sonnet ignored instruction
  cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  // Strip leading/trailing prose by extracting first { ... last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) { throw new Error(`Sonnet returned non-JSON: ${text.slice(0, 200)}`); }
  return { result: parsed, usage: r.usage };
}

// ---------- dedupe ----------
function normalizeTitle(t) {
  return (t || '').toLowerCase()
    .replace(/[^a-zåäö0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- file helpers ----------
function readJsonOr(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return fallback; }
}
function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

// ---------- progress ----------
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const URL_LIST_PATH = path.join(__dirname, 'recipe-urls.txt');
const URL_FILTERED_PATH = path.join(__dirname, 'recipe-urls-filtered.txt');
const STAGING_PATH = args.pilot
  ? path.join(__dirname, 'staging-pilot.json')
  : path.join(REPO_ROOT, 'recipes-import-pending.json');
const REPORT_PATH = args.pilot
  ? path.join(__dirname, 'staging-pilot-report.md')
  : path.join(REPO_ROOT, 'recipes-import-quality-report.md');

function loadProgress() {
  if (!args.resume) return { started: new Date().toISOString(), results: {} };
  return readJsonOr(PROGRESS_PATH, { started: new Date().toISOString(), results: {} });
}
function saveProgress(progress) { writeJson(PROGRESS_PATH, progress); }

// ---------- main ----------
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    log('ERROR', 'ANTHROPIC_API_KEY missing — set it in scripts/dish-scrape/.env');
    process.exit(1);
  }
  log('START', `mode: ${args.pilot ? 'PILOT (5)' : args.limit ? `LIMIT ${args.limit}` : 'FULL'}, resume=${args.resume}, listOnly=${args.listOnly}`);

  // FAS 1
  let urls;
  if (fs.existsSync(URL_LIST_PATH) && args.resume) {
    urls = fs.readFileSync(URL_LIST_PATH, 'utf-8').split('\n').filter(Boolean);
    log('FAS1', `loaded ${urls.length} cached urls (resume)`);
  } else {
    urls = await fetchAllRecipeUrls();
    fs.writeFileSync(URL_LIST_PATH, urls.join('\n'), 'utf-8');
    log('FAS1', `wrote ${urls.length} urls to ${URL_LIST_PATH}`);
  }

  // FAS 2
  const PILOT_URLS_PATH = path.join(__dirname, 'pilot-urls.txt');
  let keep, skip;
  if (args.pilot && fs.existsSync(PILOT_URLS_PATH)) {
    keep = fs.readFileSync(PILOT_URLS_PATH, 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);
    skip = [];
    log('FAS2', `using pilot-urls.txt (${keep.length} curated urls)`);
  } else {
    const filtered = filterUrls(urls);
    keep = filtered.keep; skip = filtered.skip;
    fs.writeFileSync(URL_FILTERED_PATH, keep.join('\n'), 'utf-8');
    log('FAS2', `kept ${keep.length}, skipped ${skip.length} via slug-filter`);
  }
  const skipReasons = {};
  for (const s of skip) skipReasons[s.reason] = (skipReasons[s.reason] || 0) + 1;
  if (skip.length) {
    for (const [reason, n] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) log('FAS2', `  ${n.toString().padStart(3)} × ${reason}`);
  }

  if (args.listOnly) {
    log('DONE', 'list-only mode — exiting before fetching individual recipes');
    return;
  }

  // FAS 3
  const targetUrls = args.limit ? keep.slice(0, args.limit) : keep;
  log('FAS3', `processing ${targetUrls.length} recipes (1 req/sec throttle)`);

  const progress = loadProgress();
  const client = new Anthropic();

  // Load existing recipes for dedupe
  const recipesJson = readJsonOr(path.join(REPO_ROOT, 'recipes.json'), { meta: { nextId: 1 }, recipes: [] });
  const existingTitles = new Set(recipesJson.recipes.map(r => normalizeTitle(r.title)));
  let nextId = recipesJson.meta.nextId || (recipesJson.recipes.reduce((m, r) => Math.max(m, r.id), 0) + 1);

  const imported = [];
  const errors = [];
  const skipped = [];
  let totalUsage = { input: 0, output: 0 };

  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i];
    const cached = progress.results[url];
    if (cached) {
      logProgress(i + 1, targetUrls.length, `(cache) ${cached.status}: ${url.slice(40)}`);
      if (cached.status === 'imported' && cached.recipe) imported.push(cached.recipe);
      else if (cached.status === 'skipped') skipped.push({ url, reason: cached.reason });
      else if (cached.status === 'error') errors.push({ url, error: cached.error });
      continue;
    }

    try {
      const html = await httpGet(url);
      const ld = extractJsonLdRecipe(html);
      if (!ld) {
        const reason = 'no JSON-LD Recipe found';
        progress.results[url] = { status: 'skipped', reason };
        skipped.push({ url, reason });
        logProgress(i + 1, targetUrls.length, `SKIP no-jsonld ${url.split('/').pop()}`);
      } else {
        const raw = mapJsonLdToRaw(ld, url);
        if (!raw.title || raw.ingredients.length === 0) {
          const reason = 'JSON-LD missing title or ingredients';
          progress.results[url] = { status: 'skipped', reason };
          skipped.push({ url, reason });
          logProgress(i + 1, targetUrls.length, `SKIP empty-ld ${raw.title || url.split('/').pop()}`);
        } else if (raw.rating != null && raw.rating < MIN_RATING) {
          const reason = `low rating: ${raw.rating} (${raw.ratingCount || 0} röster)`;
          progress.results[url] = { status: 'skipped', reason };
          skipped.push({ url, reason });
          logProgress(i + 1, targetUrls.length, `SKIP rating=${raw.rating} ${raw.title}`);
        } else {
          const { result, usage } = await sonnetTranslate(client, raw);
          totalUsage.input += usage.input_tokens || 0;
          totalUsage.output += usage.output_tokens || 0;

          if (result.skip) {
            progress.results[url] = { status: 'skipped', reason: result.reason };
            skipped.push({ url, reason: result.reason });
            logProgress(i + 1, targetUrls.length, `SKIP ${result.reason} (${raw.title})`);
          } else {
            const normTitle = normalizeTitle(result.title);
            if (existingTitles.has(normTitle)) {
              const reason = `dedupe: title "${result.title}" already exists`;
              progress.results[url] = { status: 'skipped', reason };
              skipped.push({ url, reason });
              logProgress(i + 1, targetUrls.length, `SKIP dupe ${result.title}`);
            } else {
              const recipe = {
                id: nextId++,
                title: result.title,
                tested: false,
                servings: result.servings || raw.servings || 4,
                time: result.time || raw.time || null,
                timeNote: result.timeNote || '',
                tags: result.tags || [],
                protein: result.protein || 'vegetarisk',
                ingredients: result.ingredients || [],
                instructions: result.instructions || [],
                notes: result.notes || `Källa: ${raw.title}, dishingouthealth.com`,
                _meta: { sourceUrl: url, originalTitle: raw.title, rating: raw.rating, ratingCount: raw.ratingCount },
              };
              existingTitles.add(normTitle);
              imported.push(recipe);
              progress.results[url] = { status: 'imported', recipeId: recipe.id, recipe };
              logProgress(i + 1, targetUrls.length, `OK  #${recipe.id} ${recipe.title}`);
            }
          }
        }
      }
    } catch (e) {
      const errMsg = e.message || String(e);
      progress.results[url] = { status: 'error', error: errMsg };
      errors.push({ url, error: errMsg });
      logProgress(i + 1, targetUrls.length, `ERR ${errMsg.slice(0, 60)} — ${url.split('/').pop()}`);
    }

    if ((i + 1) % 10 === 0) {
      saveProgress(progress);
      log('PROG', `saved progress at ${i + 1}/${targetUrls.length} (in=${totalUsage.input} out=${totalUsage.output} tokens)`);
    }
    await sleep(1000);
  }
  saveProgress(progress);

  // FAS 4
  log('FAS4', `imported ${imported.length}, skipped ${skipped.length}, errors ${errors.length}`);
  log('FAS4', `tokens used: input=${totalUsage.input}, output=${totalUsage.output}`);

  const stagingObj = {
    meta: {
      generated: new Date().toISOString(),
      source: 'dishingouthealth.com',
      total: imported.length,
      firstId: imported[0] ? imported[0].id : null,
      lastId: imported[imported.length - 1] ? imported[imported.length - 1].id : null,
      tokenUsage: totalUsage,
      mode: args.pilot ? 'pilot' : (args.limit ? `limit-${args.limit}` : 'full'),
    },
    recipes: imported,
  };
  writeJson(STAGING_PATH, stagingObj);
  log('FAS4', `wrote staging → ${STAGING_PATH}`);

  const report = buildQualityReport({
    imported,
    errors,
    skipped,
    sluggSkipped: skip,
    totalUrls: urls.length,
    keptUrls: keep.length,
    targetCount: targetUrls.length,
    totalUsage,
    mode: args.pilot ? 'pilot' : (args.limit ? `limit-${args.limit}` : 'full'),
  });
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  log('FAS4', `wrote quality-report → ${REPORT_PATH}`);

  log('DONE', `${imported.length} recipes ready for review. Run 'node promote.mjs' after reading the report to merge into recipes.json.`);
}

function buildQualityReport({ imported, errors, skipped, sluggSkipped, totalUrls, keptUrls, targetCount, totalUsage, mode }) {
  const lines = [];
  lines.push(`# Dishingouthealth-import — kvalitetsrapport`);
  lines.push('');
  lines.push(`Genererad: ${new Date().toISOString()}  ·  Mode: ${mode}`);
  lines.push('');
  lines.push(`## Sammanfattning`);
  lines.push('');
  lines.push(`| | Antal |`);
  lines.push(`|---|---|`);
  lines.push(`| URLer i sitemap | ${totalUrls} |`);
  lines.push(`| Slug-skippade (kategorifilter) | ${sluggSkipped.length} |`);
  lines.push(`| Kandidat-URLer kvar | ${keptUrls} |`);
  lines.push(`| Bearbetade i denna körning | ${targetCount} |`);
  lines.push(`| Importerade till staging | ${imported.length} |`);
  lines.push(`| Sonnet-skippade (för långa, dessert, etc) | ${skipped.length} |`);
  lines.push(`| Fel | ${errors.length} |`);
  lines.push(`| Tokens (input / output) | ${totalUsage.input} / ${totalUsage.output} |`);
  lines.push('');

  // Stickprov — 10 random
  const sampleSize = Math.min(10, imported.length);
  if (sampleSize > 0) {
    lines.push(`## ${sampleSize} stickprov (slumpmässigt)`);
    lines.push('');
    const indices = new Set();
    while (indices.size < sampleSize) indices.add(Math.floor(Math.random() * imported.length));
    let n = 1;
    for (const idx of [...indices].sort((a, b) => a - b)) {
      const r = imported[idx];
      lines.push(`### ${n++}. ${r.title} (id ${r.id})`);
      lines.push('');
      const ratingStr = r._meta?.rating != null ? `★ ${r._meta.rating} (${r._meta.ratingCount || 0} röster)` : 'utan betyg';
      lines.push(`- **Tid:** ${r.time} min · **Protein:** ${r.protein} · **Tags:** ${r.tags.join(', ')} · **Betyg:** ${ratingStr}`);
      lines.push(`- **Portioner:** ${r.servings}`);
      if (r.timeNote) lines.push(`- **Anteckning:** ${r.timeNote}`);
      lines.push('');
      lines.push('**Ingredienser:**');
      for (const ing of r.ingredients) lines.push(`- ${ing}`);
      lines.push('');
      lines.push('**Instruktioner:**');
      r.instructions.forEach((ins, i) => lines.push(`${i + 1}. ${ins}`));
      lines.push('');
      lines.push(`*Källa: ${r._meta?.originalTitle} — ${r._meta?.sourceUrl}*`);
      lines.push('');
    }
  }

  // Varningsflaggor
  lines.push(`## Varningsflaggor`);
  lines.push('');
  const longIngredients = imported.filter(r => r.ingredients.length > 15);
  const shortInstructions = imported.filter(r => r.instructions.length < 3);
  const weirdAmounts = imported.filter(r => r.ingredients.some(i => /\b(0 g|NaN|undefined|null)\b/i.test(i)));
  const englishLeak = imported.filter(r => /\b(the|with|and|of|for|cup|tbsp|tsp|ounce|lb|inch)\b/i.test(r.title));

  lines.push(`### Recept med >15 ingredienser (kanske dålig parse) — ${longIngredients.length}`);
  for (const r of longIngredients.slice(0, 20)) lines.push(`- #${r.id} ${r.title} (${r.ingredients.length} ing)`);
  lines.push('');
  lines.push(`### Recept med <3 instruktion-steg — ${shortInstructions.length}`);
  for (const r of shortInstructions.slice(0, 20)) lines.push(`- #${r.id} ${r.title} (${r.instructions.length} steg)`);
  lines.push('');
  lines.push(`### Konstiga mängder (0 g, NaN, undefined) — ${weirdAmounts.length}`);
  for (const r of weirdAmounts.slice(0, 20)) lines.push(`- #${r.id} ${r.title}`);
  lines.push('');
  lines.push(`### Möjliga engelska kvarlevor i titeln — ${englishLeak.length}`);
  for (const r of englishLeak.slice(0, 20)) lines.push(`- #${r.id} ${r.title}`);
  lines.push('');

  // Distribution
  const proteinDist = {};
  const tagDist = {};
  const timeDist = { 'vardag30 (≤30)': 0, 'helg60 (31-60)': 0 };
  for (const r of imported) {
    proteinDist[r.protein] = (proteinDist[r.protein] || 0) + 1;
    for (const t of r.tags) tagDist[t] = (tagDist[t] || 0) + 1;
    if (r.time && r.time <= 30) timeDist['vardag30 (≤30)']++;
    else if (r.time && r.time <= 60) timeDist['helg60 (31-60)']++;
  }
  lines.push(`## Kategori-distribution`);
  lines.push('');
  lines.push(`### Protein`);
  for (const [k, v] of Object.entries(proteinDist).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push(`### Tags`);
  for (const [k, v] of Object.entries(tagDist).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push(`### Tid`);
  for (const [k, v] of Object.entries(timeDist)) lines.push(`- ${k}: ${v}`);
  lines.push('');

  // Skip-analys
  if (skipped.length) {
    const skipReasons = {};
    for (const s of skipped) {
      const key = s.reason.replace(/\d+/g, '#').slice(0, 50);
      skipReasons[key] = (skipReasons[key] || 0) + 1;
    }
    lines.push(`## Sonnet-skippade — anledningar`);
    lines.push('');
    for (const [reason, n] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${n} × ${reason}`);
    }
    lines.push('');
  }

  // Errors
  if (errors.length) {
    lines.push(`## Fel — ${errors.length} st`);
    lines.push('');
    for (const e of errors.slice(0, 30)) lines.push(`- ${e.url} — ${e.error}`);
    lines.push('');
  }

  // Promotion-instruktion
  lines.push(`## Promotion`);
  lines.push('');
  lines.push(`Om kvalitetsrapporten ser bra ut, kör för att flytta recepten till \`recipes.json\`:`);
  lines.push('');
  lines.push('```bash');
  lines.push('cd scripts/dish-scrape && node promote.mjs');
  lines.push('```');
  lines.push('');
  lines.push(`Vill du **avstå** från importen, kör:`);
  lines.push('');
  lines.push('```bash');
  lines.push(`rm "${STAGING_PATH}" "${REPORT_PATH}"`);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });

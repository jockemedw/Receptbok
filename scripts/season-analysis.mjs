/**
 * Säsongsanalys av alla recept i recipes.json
 * Bygger säsongstabell, analyserar ingredienser, genererar docs/research-sasong.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// SÄSONGSTABELL — ~120 ingredienser med månadsvektorer [1-12]
// =============================================================================

// Hjälpfunktioner
const months = (start, end) => {
  const result = [];
  if (start <= end) {
    for (let m = start; m <= end; m++) result.push(m);
  } else {
    // Wrap around (e.g. Nov-Mar)
    for (let m = start; m <= 12; m++) result.push(m);
    for (let m = 1; m <= end; m++) result.push(m);
  }
  return result;
};
const ALL_YEAR = [1,2,3,4,5,6,7,8,9,10,11,12];

/**
 * Säsongstabell organiserad i kategorier.
 * Varje ingrediens → array av månader (1-12) då den är "i säsong" i svensk kontext.
 */
const SEASON_TABLE = {
  // ─── GRÖNSAKER (svenskodlat, strikt säsong) ───
  'sparris': months(5, 6),           // Maj-juni
  'rabarber': months(4, 6),          // April-juni
  'rädisa': months(5, 8),            // Maj-aug
  'nässla': months(4, 5),            // April-maj
  'ramslök': months(4, 5),           // April-maj
  'sallad': months(5, 9),            // Maj-sep (friland)
  'spenat': months(5, 9),            // Maj-sep (friland)
  'babyspenat': months(5, 9),
  'rucola': months(5, 9),
  'mangold': months(6, 9),
  'ärtor': months(6, 8),             // Juni-aug (färska)
  'sockerärtor': months(6, 8),
  'bönor': months(7, 9),             // Juli-sep (färska gröna bönor)
  'haricots verts': months(7, 9),
  'zucchini': months(7, 9),          // Juli-sep
  'gurka': months(6, 9),             // Juni-sep
  'tomat': months(7, 9),             // Juli-sep (svensk friland)
  'körsbärstomater': months(7, 9),
  'majs': months(8, 9),              // Aug-sep (färsk)
  'blomkål': months(7, 10),          // Juli-okt
  'broccoli': months(7, 10),         // Juli-okt
  'fänkål': months(8, 10),           // Aug-okt
  'selleri': months(8, 11),          // Aug-nov
  'blekselleri': months(8, 10),
  'pak choy': months(6, 9),          // Odlas juni-sep
  'spetskål': months(6, 9),
  'dill': months(6, 8),              // Juni-aug (färsk)
  'basilika': months(6, 9),          // Odlad juni-sep
  'persilja': months(5, 10),         // Maj-okt
  'koriander': months(6, 9),         // Odlad juni-sep
  'mynta': months(6, 9),

  // ─── HÖSTGRÖNSAKER (svenskodlat) ───
  'pumpa': months(9, 11),            // Sep-nov
  'squash': months(8, 11),           // Aug-nov (butternut etc)
  'butternut': months(9, 11),
  'kål': months(8, 12),              // Aug-dec
  'vitkål': months(8, 12),
  'rödkål': months(9, 12),
  'grönkål': months(9, 2),           // Sep-feb (tål frost)
  'brysselkål': months(10, 2),       // Okt-feb
  'purjolök': months(9, 3),          // Sep-mar (övervintrar)
  'kålrabbi': months(7, 10),
  'palsternacka': months(9, 3),      // Sep-mar (lagrad)
  'rotselleri': months(9, 3),
  'rödbeta': months(8, 12),          // Aug-dec (sen skörd + lager)
  'jordärtskocka': months(10, 3),    // Okt-mar
  'svamp': months(8, 10),            // Aug-okt (vild)
  'kantarell': months(7, 9),         // Juli-sep
  'karl-johan': months(8, 10),
  'champinjoner': ALL_YEAR,           // Odlas inomhus året runt
  'shiitake': ALL_YEAR,               // Odlas inomhus

  // ─── LAGRINGSGRÖDOR (svenskodlat, lagras året runt) ───
  'potatis': ALL_YEAR,
  'morot': ALL_YEAR,
  'lök': ALL_YEAR,
  'gul lök': ALL_YEAR,
  'rödlök': ALL_YEAR,
  'schalottenlök': ALL_YEAR,
  'salladslök': months(5, 9),        // Friland maj-sep
  'vitkål_lager': ALL_YEAR,          // Lagras (separat från färsk)
  'kålrot': ALL_YEAR,                // Lagras bra
  'vitlök': ALL_YEAR,                // Import men alltid tillgänglig

  // ─── FRUKT & BÄR (svenskodlat) ───
  'jordgubbar': months(6, 7),        // Juni-juli
  'hallon': months(7, 8),            // Juli-aug
  'blåbär': months(7, 8),            // Juli-aug
  'björnbär': months(8, 9),
  'krusbär': months(7, 8),
  'vinbär': months(7, 8),
  'äpple': months(8, 12),            // Aug-dec (lagras till feb)
  'päron': months(8, 10),            // Aug-okt
  'plommon': months(8, 9),           // Aug-sep

  // ─── IMPORT — SYDEUROPA/NORDAFRIKA (naturlig säsong, inte flygfrakt) ───
  'apelsin': months(11, 4),          // Nov-apr (Medelhavet)
  'citron': ALL_YEAR,                // Citroner finns året runt (import)
  'lime': ALL_YEAR,                  // Import året runt
  'clementin': months(11, 2),        // Nov-feb
  'grapefrukt': months(11, 4),
  'avokado': ALL_YEAR,               // Import året runt (Peru, Spanien, Israel)
  'aubergine': months(6, 10),        // Jun-okt (Sydeuropa)
  'paprika': months(6, 10),          // Jun-okt (Sydeuropa/Nederländerna)
  'sötpotatis': months(9, 3),        // Sep-mar (skörd + lager)
  'kronärtskocka': months(3, 6),     // Mar-jun (import)
  'tomat_import': months(5, 10),     // Maj-okt (Sydeuropa, tomatvarianter)
  'mango': months(3, 7),             // Mar-jul (Indien, Brasilien)
  'granatäpple': months(9, 1),       // Sep-jan

  // ─── PROTEIN (alltid tillgängliga, men med naturliga toppperioder) ───
  'lax': ALL_YEAR,                   // Odlad året runt (Norge)
  'torsk': months(1, 4),             // Jan-apr (Nordsjön/Barents)
  'sej': ALL_YEAR,
  'rödspätta': months(5, 9),         // Maj-sep
  'räkor': ALL_YEAR,
  'musslor': months(9, 4),           // Sep-apr (R-regel)
  'kyckling': ALL_YEAR,
  'nötkött': ALL_YEAR,
  'fläsk': ALL_YEAR,
  'lamm': months(5, 10),             // Maj-okt (svenskt lamm)
  'halloumi': ALL_YEAR,
  'ägg': ALL_YEAR,
  'tofu': ALL_YEAR,
  'tempeh': ALL_YEAR,
  'bönor_torkade': ALL_YEAR,
  'linser': ALL_YEAR,
  'kikärtor': ALL_YEAR,

  // ─── MEJERI ───
  'grädde': ALL_YEAR,
  'mjölk': ALL_YEAR,
  'smör': ALL_YEAR,
  'ost': ALL_YEAR,
  'fetaost': ALL_YEAR,
  'parmesan': ALL_YEAR,
  'mozzarella': ALL_YEAR,
  'crème fraiche': ALL_YEAR,
  'yoghurt': ALL_YEAR,
  'cream cheese': ALL_YEAR,

  // ─── SKAFFERI (alltid tillgängligt — utesluts från analys) ───
  // Dessa matchas men räknas INTE som säsongsgivande
};

// Ingredienser som ALLTID räknas bort (pantry/skafferi)
const PANTRY_WORDS = new Set([
  'olivolja', 'rapsolja', 'olja', 'sesamolja', 'kokosolja',
  'salt', 'peppar', 'svartpeppar', 'vitpeppar',
  'socker', 'strösocker', 'florsocker', 'muscovadosocker', 'kokossocker',
  'vetemjöl', 'mjöl', 'majsstärkelse', 'majsmjöl', 'bakpulver', 'bikarbonat', 'torrjäst',
  'ris', 'basmatiris', 'jasminris', 'risoni', 'arborio',
  'pasta', 'spaghetti', 'penne', 'fusilli', 'linguine', 'rigatoni', 'tagliatelle', 'lasagneplattor',
  'nudlar', 'risnudlar', 'äggnudlar', 'udonnudlar', 'glasnudlar', 'ramen',
  'couscous', 'bulgur', 'matvete', 'quinoa', 'polenta',
  'sojasås', 'fisksås', 'ostronsås', 'sriracha', 'tabasco', 'hoisinsås', 'sweet chili',
  'vinäger', 'vitvinsvinäger', 'risvinäger', 'balsamvinäger', 'rödvinsvinäger', 'äppelcidervinäger',
  'senap', 'dijonsenap', 'grovkornig senap',
  'tomatpuré', 'krossade tomater', 'passata', 'passerade tomater', 'soltorkade tomater',
  'buljong', 'hönsbuljongtärning', 'grönsaksbuljongtärning', 'fiskbuljong', 'grönsaksbuljong',
  'kokosmjölk', 'kokosgrädde',
  'honung', 'lönnsirap', 'agave',
  'tahini', 'jordnötssmör',
  'vatten',
  // Kryddor
  'spiskummin', 'gurkmeja', 'kanel', 'kardemumma', 'korianderpulver', 'paprikapulver',
  'rökt paprikapulver', 'chilipulver', 'chiliflakes', 'cayennepeppar', 'ingefära',
  'oregano', 'timjan', 'rosmarin', 'lagerblad', 'kummin', 'fänkålsfrö',
  'garam masala', 'currypulver', 'tikka masala', 'ras el hanout',
  'sambal oelek', 'misopasta',
  'kakao', 'vanilj',
  // Nötter/frön (importerade skaffervaror)
  'cashewnötter', 'valnötter', 'mandel', 'jordnötter', 'pinjenötter', 'sesamfrön',
  'solrosfrön', 'pumpakärnor', 'linfrö',
  // Torrvaror
  'torkade linser', 'röda linser', 'gröna linser', 'belugalinser',
  'kidneybönor', 'svarta bönor', 'vita bönor', 'kikärtor',
  'panko', 'ströbröd',
  // Övrigt
  'bröd', 'tortilla', 'pitabröd', 'naanbröd', 'baguette', 'pizzadeg',
  'kapris',
]);

// =============================================================================
// INGREDIENS-MATCHNING
// =============================================================================

/**
 * Matchar en ingrediensrad mot säsongstabellen.
 * Returnerar { ingredient, seasonMonths, weight } eller null om pantry/omatchbar.
 * weight: 1.0 för huvudingredienser, 0.5 för örter/garnering
 */
function matchIngredient(raw) {
  // Rensa prefix (Tillbehör:, Marinad:, Sås:, etc.)
  let s = raw.replace(/^[^:]+:\s*/, '');
  s = s.toLowerCase().trim();

  // Strippa unicode-kontrollkaraktärer (soft hyphen etc.)
  s = s.replace(/[­​‌‍﻿]/g, '');

  // Frysta ingredienser räknas som åretrunt-tillgängliga (importeras/lagras frysta)
  if (/frys(ta|t)|tinade?/i.test(s)) return null;

  // Konserverade/burkvaror = åretrunt
  if (/konserv|burk|på burk|i burk|torkade?|torkat/i.test(s)) return null;

  // Ta bort mängd och enhet
  s = s.replace(/^[\d\s,\/½¼¾⅓⅔\.–\-~]+/, '');
  s = s.replace(/^(g|kg|dl|l|cl|ml|msk|tsk|krm|st|frp|paket|burk|tub|förp|pkt|bit|kruka|knippe|näve|nävar|huvud|huvuden|liten|litet|liter|stor|stort|cm|rejäl|par)\s+/i, '');
  s = s.replace(/^ca\s+/i, '');
  s = s.trim();

  // Ta bort tillagning/form efter komma
  const nameOnly = s.replace(/,.*$/, '').replace(/\(.*?\)/g, '').trim();

  // Kolla pantry-listan
  for (const pw of PANTRY_WORDS) {
    if (nameOnly === pw || s.startsWith(pw)) return null;
  }

  // Extra pantry-filter via nyckelord
  if (/^(salt|peppar|olja|vinäger|socker|mjöl|buljong|krydda|fond)/i.test(nameOnly)) return null;
  if (/sojasås|fisksås|ostronsås|sriracha|tabasco|hoisin|teriyaki/i.test(nameOnly)) return null;
  if (/(tsk|krm|msk)\s/.test(raw.toLowerCase()) && !/stor/.test(raw.toLowerCase())) {
    if (!/smör|grädde|crème|yoghurt|tahini|honung|lönnsirap|tomatpuré|senap|majonnäs|cream cheese/.test(nameOnly)) {
      return null;
    }
  }

  // Matcha mot säsongstabellen
  const matchResult = findSeasonMatch(nameOnly, s);

  // Örter/garnering → halverad vikt (de säljs ofta färska året runt i kruka)
  if (matchResult && /persilja|koriander|basilika|mynta|dill/.test(matchResult.ingredient)) {
    matchResult.weight = 0.3;
  }

  return matchResult;
}

function findSeasonMatch(nameOnly, fullStr) {
  // Direkt träff
  if (SEASON_TABLE[nameOnly] !== undefined) {
    if (SEASON_TABLE[nameOnly] === ALL_YEAR) return null; // Åretrunt = ingen säsongsinfo
    return { ingredient: nameOnly, months: SEASON_TABLE[nameOnly] };
  }

  // Keyword-matching mot tabellen
  const keywords = [
    // Grönsaker
    ['sparris', 'sparris'],
    ['rabarber', 'rabarber'],
    ['rädisa', 'rädis'],
    ['ärtor', 'ärter|ärtor|sockerärtor'],
    ['bönor', 'gröna bönor|haricots|vaxbönor|bondbönor'],
    ['zucchini', 'zucchini'],
    ['gurka', 'gurka|slanggurka'],
    ['tomat', 'tomat(?!puré|ketchup|sås)|cherry|plommontomat|san marzano'],
    ['körsbärstomater', 'körsbärstomat'],
    ['blomkål', 'blomkål'],
    ['broccoli', 'broccoli'],
    ['grönkål', 'grönkål|lacinato|cavolo nero'],
    ['brysselkål', 'brysselkål'],
    ['purjolök', 'purjolök|purjo'],
    ['kålrabbi', 'kålrabb'],
    ['fänkål', 'fänkål'],
    ['selleri', 'selleri|rotselleri|blekselleri'],
    ['blekselleri', 'blekselleri|selleristjälk'],
    ['palsternacka', 'palsternack'],
    ['rödbeta', 'rödbet'],
    ['pumpa', 'pumpa|pumpapuré'],
    ['squash', 'squash|butternut'],
    ['pak choy', 'pak choy|bok choy'],
    ['spetskål', 'spetskål'],
    ['mangold', 'mangold'],
    ['aubergine', 'aubergine'],
    ['paprika', 'paprik(?:a|or)(?!pulver)'],
    ['sötpotatis', 'sötpotatis|söt potatis'],
    ['majs', 'majs(?!stärkelse|mjöl)'],
    ['jordärtskocka', 'jordärtskock'],
    ['svamp', 'svamp|champinjon|shiitake|portobello|cremini|karl-johan|trattkantarell'],
    ['kantarell', 'kantarell'],
    ['champinjoner', 'champinjon|cremini|portobello|shiitake'],

    // Lök-familjen (mest åretrunt via lager)
    ['salladslök', 'salladslök|salladslökar'],
    ['dill', '\\bdill\\b'],
    ['basilika', 'basilika'],
    ['persilja', 'persilja'],
    ['koriander', 'koriander(?!pulver|frö)'],
    ['mynta', 'mynta'],
    ['spenat', 'spenat|babyspenat'],
    ['rucola', 'rucola'],
    ['sallad', 'sallad(?!slök)|romansallad|isbergssallad|frisée'],

    // Frukt
    ['äpple', '\\bäpple|\\bäpplen'],
    ['päron', '\\bpäron'],
    ['jordgubbar', 'jordgubb'],
    ['citron', '\\bcitron(?!gräs|saft|skal)'],
    ['lime', '\\blime(?!juice|saft)'],
    ['apelsin', 'apelsin'],
    ['mango', '\\bmango(?!ld)'],
    ['granatäpple', 'granatäpple'],
    ['avokado', 'avokado'],

    // Protein
    ['torsk', '\\btorsk'],
    ['lax', '\\blax'],
    ['rödspätta', 'rödspätta'],
    ['räkor', 'räkor|räka|jätteräk'],
    ['musslor', 'mussla|musslor|blåmussla'],
    ['lamm', '\\blamm'],
    ['halloumi', 'halloumi'],
    ['tofu', '\\btofu'],
    ['tempeh', 'tempeh'],

    // Rotfrukter (åretrunt via lager — returnerar null)
    ['potatis', 'potatis'],
    ['morot', 'morot|morötter'],
    ['lök', '^lök$|gul lök|gullök'],
    ['rödlök', 'rödlök'],
    ['schalottenlök', 'schalotten'],
    ['vitlök', 'vitlök'],
  ];

  for (const [tableKey, pattern] of keywords) {
    const re = new RegExp(pattern, 'i');
    if (re.test(nameOnly) || re.test(fullStr)) {
      const m = SEASON_TABLE[tableKey];
      if (!m || m === ALL_YEAR) return null; // Åretrunt
      return { ingredient: tableKey, months: m };
    }
  }

  // Specifika fallbacks
  if (/kyckling|kycklingfilé|kycklinglår|kycklingklubba|kycklingbröst/.test(fullStr)) return null;
  if (/nötkött|högrev|entrecote|flankstek|biff|färs/.test(fullStr)) return null;
  if (/fläsk|bacon|kassler|kotlett|pancetta|chorizo/.test(fullStr)) return null;
  if (/ost|cheddar|gorgonzola|mozzarella|ricotta|mascarpone|cream cheese/.test(fullStr)) return null;
  if (/grädde|crème|yoghurt|mjölk|smör|ägg/.test(fullStr)) return null;

  // Ej matchad — returnera null (neutral)
  return null;
}

// =============================================================================
// RECEPTANALYS
// =============================================================================

function analyzeRecipe(recipe) {
  const seasonalIngredients = [];
  let totalVolumeIngredients = 0;

  for (const raw of recipe.ingredients) {
    const result = matchIngredient(raw);
    if (result === null) {
      const isPantry = isPantryIngredient(raw);
      if (!isPantry) {
        totalVolumeIngredients++;
      }
    } else {
      totalVolumeIngredients++;
      seasonalIngredients.push(result);
    }
  }

  // Beräkna säsongsmatchning per säsong
  // NYA ALGORITMEN: Av de ingredienser som HAR säsongsdata, hur stor andel är i säsong?
  // Recept utan säsongsingredienser → neutral (score 0.5, alla säsonger).
  const seasons = {
    vår: months(3, 5),
    sommar: months(6, 8),
    höst: months(9, 11),
    vinter: [12, 1, 2],
  };

  const result = {};
  for (const [seasonName, seasonMonths] of Object.entries(seasons)) {
    if (seasonalIngredients.length === 0) {
      // Inga säsongsingredienser = helt neutralt recept
      result[seasonName] = 0.5;
      continue;
    }

    let inSeasonWeight = 0;
    let totalWeight = 0;
    for (const si of seasonalIngredients) {
      const w = si.weight || 1.0;
      totalWeight += w;
      const match = si.months.some(m => seasonMonths.includes(m));
      if (match) inSeasonWeight += w;
    }

    result[seasonName] = totalWeight > 0 ? inSeasonWeight / totalWeight : 0.5;
  }

  return {
    id: recipe.id,
    title: recipe.title,
    seasonalIngredients,
    totalVolumeIngredients,
    scores: result,
  };
}

function isPantryIngredient(raw) {
  let s = raw.replace(/^[^:]+:\s*/, '').toLowerCase().trim();
  let nameOnly = s.replace(/^[\d\s,\/½¼¾⅓⅔\.–\-~]+/, '');
  nameOnly = nameOnly.replace(/^(g|kg|dl|l|cl|ml|msk|tsk|krm|st|frp|paket|burk|tub|förp|pkt|bit|kruka|knippe|näve|nävar|huvud|huvuden|liten|litet|liter|stor|stort|cm|rejäl|par)\s+/i, '');
  nameOnly = nameOnly.replace(/^ca\s+/i, '').trim();
  nameOnly = nameOnly.replace(/,.*$/, '').replace(/\(.*?\)/g, '').trim();

  for (const pw of PANTRY_WORDS) {
    if (nameOnly === pw || nameOnly.startsWith(pw)) return true;
  }

  if (/^(salt|peppar|olja|vinäger|socker|mjöl|buljong|krydda|fond)/i.test(nameOnly)) return true;
  if (/sojasås|fisksås|ostronsås|sriracha|tabasco|hoisin|teriyaki/i.test(nameOnly)) return true;
  if (/(tsk|krm|msk)\s/.test(raw.toLowerCase()) && !/stor/.test(raw.toLowerCase())) {
    if (!/smör|grädde|crème|yoghurt|tahini|honung|lönnsirap|tomatpuré|senap|majonnäs|cream cheese/.test(nameOnly)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// HUVUDPROGRAM
// =============================================================================

const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'recipes.json'), 'utf8')).recipes;

console.log(`Analyserar ${recipes.length} recept...`);

const analyses = recipes.map(r => analyzeRecipe(r));

// Tilldela säsonger (≥60% av volymingredienser i säsong)
const THRESHOLD = 0.60;

for (const a of analyses) {
  a.seasons = [];
  for (const [season, score] of Object.entries(a.scores)) {
    if (score >= THRESHOLD) {
      a.seasons.push(season);
    }
  }
  // Om alla säsonger matchar → "åretrunt"
  if (a.seasons.length === 4) {
    a.yearRound = true;
  } else {
    a.yearRound = false;
  }
}

// Statistik
const stats = {
  vår: analyses.filter(a => a.seasons.includes('vår')).length,
  sommar: analyses.filter(a => a.seasons.includes('sommar')).length,
  höst: analyses.filter(a => a.seasons.includes('höst')).length,
  vinter: analyses.filter(a => a.seasons.includes('vinter')).length,
  yearRound: analyses.filter(a => a.yearRound).length,
  noSeason: analyses.filter(a => a.seasons.length === 0).length,
};

console.log('\nStatistik:');
console.log(`  Vår: ${stats.vår} recept`);
console.log(`  Sommar: ${stats.sommar} recept`);
console.log(`  Höst: ${stats.höst} recept`);
console.log(`  Vinter: ${stats.vinter} recept`);
console.log(`  Åretrunt (alla 4): ${stats.yearRound} recept`);
console.log(`  Ingen specifik säsong (<60%): ${stats.noSeason} recept`);

// =============================================================================
// GENERERA MARKDOWN
// =============================================================================

function generateMarkdown() {
  let md = '';

  md += '# Säsongsanalys — Receptboken\n\n';
  md += '> Genererad 2026-05-10. Underlag för säsongsimporterad receptprioritering.\n\n';
  md += '## Sammanfattning\n\n';
  md += `- **${recipes.length} recept** analyserade\n`;
  md += `- **${stats.vår}** passar vår (mar–maj)\n`;
  md += `- **${stats.sommar}** passar sommar (jun–aug)\n`;
  md += `- **${stats.höst}** passar höst (sep–nov)\n`;
  md += `- **${stats.vinter}** passar vinter (dec–feb)\n`;
  md += `- **${stats.yearRound}** åretrunt (alla säsonger ≥60%)\n`;
  md += `- **${stats.noSeason}** utan tydlig säsong (<60% i alla)\n\n`;

  // ─── SÄSONGSTABELL ───
  md += '## 1. Säsongstabell\n\n';
  md += 'Ingredienser mappade till sina säsongsmånader i svensk kontext. ';
  md += 'Lagringsgrödor (potatis, morot, lök etc.) och importvaror med helårstillgänglighet ';
  md += 'räknas som neutrala och påverkar inte säsongspoängen.\n\n';

  const categories = {
    'Grönsaker — vår/sommar': ['sparris', 'rabarber', 'rädisa', 'nässla', 'ramslök', 'sallad', 'spenat', 'babyspenat', 'rucola', 'mangold', 'ärtor', 'sockerärtor', 'bönor', 'haricots verts', 'zucchini', 'gurka', 'tomat', 'körsbärstomater', 'majs', 'blomkål', 'broccoli', 'pak choy', 'spetskål', 'dill', 'basilika', 'persilja', 'koriander', 'mynta'],
    'Grönsaker — höst/vinter': ['pumpa', 'squash', 'butternut', 'kål', 'vitkål', 'rödkål', 'grönkål', 'brysselkål', 'purjolök', 'kålrabbi', 'palsternacka', 'rotselleri', 'rödbeta', 'jordärtskocka', 'fänkål', 'selleri', 'blekselleri', 'svamp', 'kantarell'],
    'Lagringsgrödor (åretrunt)': ['potatis', 'morot', 'lök', 'gul lök', 'rödlök', 'schalottenlök', 'vitlök', 'kålrot', 'champinjoner', 'shiitake'],
    'Frukt & bär': ['jordgubbar', 'hallon', 'blåbär', 'björnbär', 'krusbär', 'vinbär', 'äpple', 'päron', 'plommon'],
    'Import (naturlig säsong)': ['apelsin', 'clementin', 'grapefrukt', 'mango', 'granatäpple', 'aubergine', 'paprika', 'sötpotatis', 'kronärtskocka'],
    'Import (åretrunt)': ['citron', 'lime', 'avokado'],
    'Protein (åretrunt)': ['kyckling', 'nötkött', 'fläsk', 'lax', 'sej', 'räkor', 'halloumi', 'ägg', 'tofu', 'tempeh'],
    'Protein (säsong)': ['torsk', 'rödspätta', 'musslor', 'lamm'],
    'Örter (friland)': ['dill', 'basilika', 'persilja', 'koriander', 'mynta', 'salladslök'],
  };

  const monthNames = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

  for (const [catName, items] of Object.entries(categories)) {
    md += `### ${catName}\n\n`;
    md += '| Ingrediens | Jan | Feb | Mar | Apr | Maj | Jun | Jul | Aug | Sep | Okt | Nov | Dec |\n';
    md += '|------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|\n';

    const seen = new Set();
    for (const item of items) {
      if (seen.has(item)) continue;
      seen.add(item);
      const m = SEASON_TABLE[item];
      if (!m) continue;
      const row = monthNames.map((_, i) => {
        return m.includes(i + 1) ? ' ● ' : '   ';
      });
      md += `| ${item} | ${row.join('|')} |\n`;
    }
    md += '\n';
  }

  // ─── RECEPTANALYS ───
  md += '## 2. Receptanalys\n\n';
  md += 'Varje recept med säsongspoäng per kvartal. Säsonger med ≥60% av volymingredienser i säsong markeras.\n\n';
  md += '| ID | Titel | Vår | Sommar | Höst | Vinter | Säsong(er) |\n';
  md += '|---:|-------|:---:|:------:|:----:|:------:|:-----------|\n';

  for (const a of analyses) {
    const vår = Math.round(a.scores.vår * 100);
    const sommar = Math.round(a.scores.sommar * 100);
    const höst = Math.round(a.scores.höst * 100);
    const vinter = Math.round(a.scores.vinter * 100);
    const seasonStr = a.yearRound ? 'åretrunt' : (a.seasons.length > 0 ? a.seasons.join(', ') : '—');
    md += `| ${a.id} | ${a.title} | ${vår}% | ${sommar}% | ${höst}% | ${vinter}% | ${seasonStr} |\n`;
  }
  md += '\n';

  // ─── STATISTIK ───
  md += '## 3. Statistik\n\n';
  md += '### Fördelning per säsong\n\n';
  md += '| Säsong | Antal recept | Andel |\n';
  md += '|--------|-------------|-------|\n';
  md += `| Vår (mar–maj) | ${stats.vår} | ${Math.round(stats.vår/recipes.length*100)}% |\n`;
  md += `| Sommar (jun–aug) | ${stats.sommar} | ${Math.round(stats.sommar/recipes.length*100)}% |\n`;
  md += `| Höst (sep–nov) | ${stats.höst} | ${Math.round(stats.höst/recipes.length*100)}% |\n`;
  md += `| Vinter (dec–feb) | ${stats.vinter} | ${Math.round(stats.vinter/recipes.length*100)}% |\n`;
  md += `| Åretrunt | ${stats.yearRound} | ${Math.round(stats.yearRound/recipes.length*100)}% |\n`;
  md += `| Ingen säsong | ${stats.noSeason} | ${Math.round(stats.noSeason/recipes.length*100)}% |\n`;
  md += '\n';

  md += '### Säsongsspecifika recept (exklusivt eller nästan)\n\n';

  for (const season of ['vår', 'sommar', 'höst', 'vinter']) {
    const exclusive = analyses.filter(a =>
      a.seasons.includes(season) && !a.yearRound && a.seasons.length <= 2
    );
    if (exclusive.length > 0) {
      md += `**${season.charAt(0).toUpperCase() + season.slice(1)}-favoriter** (passar ${season} men inte alla säsonger):\n`;
      exclusive.slice(0, 15).forEach(a => {
        md += `- ${a.title} (${Math.round(a.scores[season]*100)}%)\n`;
      });
      md += '\n';
    }
  }

  // ─── IMPLEMENTATIONSFÖRSLAG ───
  md += '## 4. Implementationsförslag\n\n';
  md += '### Datastruktur\n\n';
  md += 'Lägg till ett `seasons`-fält i `recipes.json` per recept:\n\n';
  md += '```json\n';
  md += '{\n';
  md += '  "id": 7,\n';
  md += '  "title": "Grönkålssallad med rostade rödbetor",\n';
  md += '  "seasons": ["höst", "vinter"],\n';
  md += '  "tags": ["vardag30", "veg", "sallad"],\n';
  md += '  ...\n';
  md += '}\n';
  md += '```\n\n';
  md += 'Recept utan `seasons`-fält (eller med `seasons: []`) behandlas som neutrala.\n\n';

  md += '### Integration i `selectRecipes()`\n\n';
  md += 'Ny parameter i constraints:\n\n';
  md += '```javascript\n';
  md += '// api/generate.js — inuti selectRecipes()\n';
  md += 'const { season_weight = false } = constraints;\n';
  md += '\n';
  md += '// Bestäm aktuell säsong från startDate\n';
  md += 'function getCurrentSeason(dateStr) {\n';
  md += '  const month = new Date(dateStr).getMonth() + 1; // 1-12\n';
  md += '  if (month >= 3 && month <= 5) return "vår";\n';
  md += '  if (month >= 6 && month <= 8) return "sommar";\n';
  md += '  if (month >= 9 && month <= 11) return "höst";\n';
  md += '  return "vinter";\n';
  md += '}\n';
  md += '\n';
  md += '// I pick()-funktionen, efter filtrering men före slumpmässigt val:\n';
  md += 'function weightedPick(pool, currentSeason, seasonWeight) {\n';
  md += '  if (!seasonWeight) {\n';
  md += '    // Ingen säsongsviktning — slumpmässigt som idag\n';
  md += '    return pool[Math.floor(Math.random() * pool.length)];\n';
  md += '  }\n';
  md += '\n';
  md += '  // Bygg viktat urval\n';
  md += '  const weighted = pool.map(recipe => {\n';
  md += '    const seasons = recipe.seasons || [];\n';
  md += '    if (seasons.length === 0) return { recipe, weight: 1 };\n';
  md += '    if (seasons.includes(currentSeason)) return { recipe, weight: 2 };\n';
  md += '    return { recipe, weight: 0.5 }; // Ur säsong = halverad chans\n';
  md += '  });\n';
  md += '\n';
  md += '  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);\n';
  md += '  let rand = Math.random() * totalWeight;\n';
  md += '  for (const { recipe, weight } of weighted) {\n';
  md += '    rand -= weight;\n';
  md += '    if (rand <= 0) return recipe;\n';
  md += '  }\n';
  md += '  return pool[pool.length - 1]; // Fallback\n';
  md += '}\n';
  md += '```\n\n';

  md += '### Vikter\n\n';
  md += '| Receptstatus | Vikt |\n';
  md += '|-------------|------|\n';
  md += '| Matchar aktuell säsong | 2.0x |\n';
  md += '| Ingen säsongstagning (neutral) | 1.0x |\n';
  md += '| Ur säsong (har tags men inte aktuell) | 0.5x |\n\n';

  md += '### UI (opt-in toggle)\n\n';
  md += '```html\n';
  md += '<!-- I inställningspanelen -->\n';
  md += '<label class="toggle-row">\n';
  md += '  <span>Säsongsanpassning</span>\n';
  md += '  <input type="checkbox" id="seasonWeight" />\n';
  md += '</label>\n';
  md += '```\n\n';
  md += 'Toggle skickas som `season_weight: true/false` i `POST /api/generate`-bodyn.\n\n';

  md += '### Beteende\n\n';
  md += '- **Ingen hård filtrering** — säsongsrecept får dubbel vikt, men ingenting blockeras\n';
  md += '- **Neutral = 1x** — recept utan säsongsdata påverkas inte\n';
  md += '- **Ur säsong = 0.5x** — halverad chans, men kan fortfarande väljas\n';
  md += '- **Sparar inte som preferens** — skickas per anrop (default av)\n';
  md += '- **Interagerar med prisoptimering** — om ett rearecept ÄR i säsong, multiplikativt: 2x × rea-boost\n';
  md += '- **Gränsfall**: Recept taggade "åretrunt" (alla 4 säsonger) → behandlas som neutral (1x)\n\n';

  md += '### Migrering\n\n';
  md += 'Kör `scripts/season-analysis.mjs` och använd output för att lägga till `seasons`-fält.\n';
  md += 'Alternativt: lagra säsongstabellen i koden och beräkna dynamiskt vid varje anrop\n';
  md += '(fördel: inga nya fält i recipes.json, nackdel: ~50ms extra per anrop).\n\n';
  md += '**Rekommendation:** Statisk taggning i `recipes.json` — enkel, deterministisk, gratis.\n';

  // ─── APPENDIX: Säsongsdata per recept (maskinläsbart) ───
  md += '\n## 5. Appendix — Säsongstaggar per recept (maskinläsbart)\n\n';
  md += 'Kopiera till `recipes.json` som `"seasons"`-fält:\n\n';
  md += '```json\n';
  const tagMap = {};
  for (const a of analyses) {
    if (!a.yearRound && a.seasons.length > 0) {
      tagMap[a.id] = a.seasons;
    }
  }
  md += JSON.stringify(tagMap, null, 2);
  md += '\n```\n';

  return md;
}

const markdown = generateMarkdown();
const outPath = path.join(ROOT, 'docs', 'research-sasong.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown, 'utf8');
console.log(`\nSkrivet till: ${outPath}`);
console.log(`Filstorlek: ${Math.round(markdown.length / 1024)} KB`);

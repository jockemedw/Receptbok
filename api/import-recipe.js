import { createHandler } from "./_shared/handler.js";
import { lookup } from "node:dns/promises";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_SCHEMA_PROMPT = `Du är en expert på matlagning och dataextraktion. Extrahera receptet och returnera BARA ett JSON-objekt (ingen annan text, ingen markdown) med exakt dessa fält:
{
  "title": "string — på svenska om möjligt",
  "protein": "en av: fisk, kyckling, kött, fläsk, vegetarisk",
  "time": "integer (total tid i minuter) eller null",
  "servings": "integer (portioner, default 4)",
  "tags": ["array med tillämpliga: vardag30, helg60, fisk, kyckling, kött, fläsk, vegetarisk, soppa, pasta, wok, ugn, sallad, gryta"],
  "ingredients": ["array av strings, en ingrediens per element, t.ex. '200 g smör'"],
  "instructions": ["array av strings, ett steg per element"],
  "notes": "string med tips/varianter eller null",
  "seasons": ["array (optionell) med tillämpliga säsonger: vår, sommar, höst, vinter — lämna tom om receptet passar hela året"]
}

VIKTIGT — konvertera alltid till svenska metriska enheter:
- cups → dl (1 cup = 2,4 dl), tbsp/Tbsp → msk, tsp → tsk
- oz → g (multiplicera med 28, avrunda till närmaste 5), lb → g (multiplicera med 454, avrunda till närmaste 10)
- 1 stick of butter = 113 g smör
- Temperaturer i °F → °C (350°F=175°C, 400°F=205°C, 425°F=220°C — konvertera i instruktionstext)
- heavy cream/heavy whipping cream → vispgrädde, all-purpose flour → vetemjöl, bread flour → vetemjöl special
- baking soda/bicarbonate of soda → bikarbonat (INTE bakpulver), baking powder → bakpulver (INTE bikarbonat)
- cilantro → koriander, arugula → rucola, scallion/green onion → salladslök, sour cream → gräddfil
- Strippa prisannoteringar som ($0.17*) ur ingredienssträngar`;

const CONVERSION_PROMPT = `Konvertera nedanstående recepts ingredienser och instruktioner till svenska med metriska enheter.

Konverteringsregler:
- cups → dl (1 cup=2,4 dl, ½ cup=1,2 dl, ¼ cup=0,6 dl)
- tbsp/tablespoon → msk, tsp/teaspoon → tsk
- oz → g (×28, avrunda till närmaste 5), lb → g (×454, avrunda till närmaste 10)
- 1 stick of butter = 113 g smör
- Temperaturer i °F → °C (350°F=175°C, 400°F=205°C, 425°F=220°C — konvertera i hela instruktionstexten)
- Strippa prisannoteringar som ($0.17*) ur ingredienssträngar

Viktiga ingrediensöversättningar:
- heavy cream / heavy whipping cream → vispgrädde
- all-purpose flour → vetemjöl (INTE vetemjöl special)
- bread flour → vetemjöl special
- baking soda / bicarbonate of soda → bikarbonat (INTE bakpulver)
- baking powder → bakpulver (INTE bikarbonat)
- cilantro → koriander, arugula → rucola, scallion/green onion → salladslök
- sour cream → gräddfil, half-and-half → lättmjölk (10%)
- buttermilk → fil, whole milk → standardmjölk (3%)
- cornstarch / cornflour → majsstärkelse, cornmeal → grovt majsmjöl

Returnera BARA ett JSON-objekt med exakt dessa fält:
{"title": "...", "ingredients": ["..."], "instructions": ["..."]}

Recept att konvertera:`;

// ── Handler ─────────────────────────────────────────────────────────────────

export default createHandler(async (req, res) => {
  const { type, url, imageBase64, mimeType } = req.body || {};

  if (type === "url") return await handleUrl(url, res);
  if (type === "photo") return await handlePhoto(imageBase64, mimeType, res);
  return res.status(400).json({ error: "Ange type: 'url' eller 'photo'." });
});

// ── URL-import ──────────────────────────────────────────────────────────────

export function isPrivateIp(ip) {
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  // IPv6
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA
  if (low.startsWith("fe80")) return true; // link-local
  return false;
}

function isForeignUrl(parsedUrl) {
  return !parsedUrl.hostname.endsWith(".se");
}

async function handleUrl(url, res) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Ange en giltig webbadress." });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Ange en giltig webbadress." });
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  // Följ omdirigeringar manuellt och IP-validera VARJE hopp. Med default
  // redirect:"follow" kontrolleras bara den första värden — en publik sida kan då
  // 302:a till t.ex. http://169.254.169.254/ (molnets metadata) och läcka internt
  // innehåll tillbaka som "recept" (SSRF).
  const MAX_REDIRECTS = 5;
  let current = parsed;
  let html;
  try {
    let response;
    for (let hop = 0; ; hop++) {
      const { address } = await lookup(current.hostname);
      if (isPrivateIp(address)) {
        return res.status(400).json({ error: "Den här adressen stöds inte — prova en annan receptsajt." });
      }
      response = await fetch(current.href, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });

      const location = response.status >= 300 && response.status < 400
        ? response.headers.get("location")
        : null;
      if (!location) break;

      if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return res.status(400).json({ error: "Den här adressen stöds inte — prova en annan receptsajt." });
      }
      current = next;
    }
    if (!response.ok) throw new Error();
    html = await response.text();
  } catch {
    return res.status(400).json({ error: "Kunde inte nå sidan — kontrollera adressen." });
  }

  // Försök 1: JSON-LD + eventuell enhetskonvertering för icke-svenska sajter
  const recipe = extractJsonLd(html);
  if (recipe) {
    if (isForeignUrl(parsed) && apiKey) {
      const converted = await postProcessForeignRecipe(recipe, apiKey);
      return res.status(200).json({ recipe: converted });
    }
    return res.status(200).json({ recipe });
  }

  // Försök 2: Gemini-fallback om nyckel finns
  if (!apiKey) {
    return res.status(422).json({
      error: "Den här sajten stöds inte — prova en annan receptsajt eller lägg in receptet manuellt.",
    });
  }

  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{3,}/g, "\n")
    .trim()
    .slice(0, 15000);

  const geminiRecipe = await callGemini(
    [{ text: `${GEMINI_SCHEMA_PROMPT}\n\nWebbsidans text:\n${cleanText}` }],
    apiKey
  );
  if (!geminiRecipe) {
    return res.status(422).json({
      error: "Kunde inte tolka receptet — sajten verkar inte innehålla något recept.",
    });
  }
  return res.status(200).json({ recipe: geminiRecipe });
}

function extractJsonLd(html) {
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1]);
      if (Array.isArray(data)) data = data.find((d) => d["@type"] === "Recipe");
      if (data?.["@graph"]) data = data["@graph"].find((d) => d["@type"] === "Recipe");
      if (!data || data["@type"] !== "Recipe") continue;
      return mapJsonLdToRecipe(data);
    } catch {
      continue;
    }
  }
  return null;
}

function mapJsonLdToRecipe(data) {
  const title = data.name || "Importerat recept";
  const time  = parseDuration(data.totalTime || data.cookTime || data.prepTime);

  const ingredients = (data.recipeIngredient || [])
    .map((s) =>
      String(s)
        .trim()
        .replace(/,?\s*\$[\d.]+\*?/g, "")  // strip price annotations like $0.17*
        .replace(/\(\s*\)/g, "")            // remove empty parens left behind
        .trim()
    )
    .filter(Boolean);

  let instructions = [];
  if (Array.isArray(data.recipeInstructions)) {
    for (const step of data.recipeInstructions) {
      if (typeof step === "string") instructions.push(step.trim());
      else if (step.text) instructions.push(step.text.trim());
      else if (Array.isArray(step.itemListElement)) {
        for (const sub of step.itemListElement) {
          if (sub.text) instructions.push(sub.text.trim());
        }
      }
    }
  } else if (typeof data.recipeInstructions === "string") {
    instructions = data.recipeInstructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }

  const servingsRaw = data.recipeYield;
  let servings = 4;
  if (servingsRaw) {
    const n = parseInt(Array.isArray(servingsRaw) ? servingsRaw[0] : servingsRaw);
    if (!isNaN(n) && n > 0) servings = n;
  }

  const protein = guessProtein(title, ingredients);
  const tags    = buildTags(time, protein);
  const notes   = data.description ? truncate(String(data.description), 200) : null;

  return { title, tested: false, servings, time, timeNote: null, tags, protein, ingredients, instructions: instructions.filter(Boolean), notes, seasons: [] };
}

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const mins = (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
  return mins > 0 ? mins : null;
}

// ── Post-processing för utländska recept ────────────────────────────────────

async function postProcessForeignRecipe(recipe, apiKey) {
  const payload = JSON.stringify({
    title: recipe.title,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
  });

  let result;
  try {
    result = await callGeminiRaw(
      [{ text: `${CONVERSION_PROMPT}\n${payload}` }],
      apiKey
    );
  } catch {
    return recipe; // returnera originalet om konverteringen misslyckas
  }

  if (!result) return recipe;

  return {
    ...recipe,
    title: typeof result.title === "string" && result.title ? result.title : recipe.title,
    ingredients: Array.isArray(result.ingredients) && result.ingredients.length
      ? result.ingredients
      : recipe.ingredients,
    instructions: Array.isArray(result.instructions) && result.instructions.length
      ? result.instructions
      : recipe.instructions,
  };
}

// ── Foto-import ─────────────────────────────────────────────────────────────

async function handlePhoto(imageBase64, mimeType, res) {
  if (!imageBase64) return res.status(400).json({ error: "Ingen bild skickades." });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Fotoimport är inte konfigurerat — GOOGLE_API_KEY saknas i Vercel." });
  }

  const recipe = await callGemini(
    [
      { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
      { text: `${GEMINI_SCHEMA_PROMPT}\n\nExtrahera receptet från bilden ovan.` },
    ],
    apiKey
  );

  if (!recipe) {
    return res.status(422).json({ error: "Kunde inte tolka receptet — prova med en klarare bild eller bättre ljus." });
  }
  return res.status(200).json({ recipe });
}

// ── Gemini-anrop ────────────────────────────────────────────────────────────

async function callGeminiRaw(parts, apiKey) {
  let geminiRes;
  let lastError = "";

  for (const model of GEMINI_MODELS) {
    try {
      geminiRes = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      lastError = "Kunde inte nå Google — prova igen om en stund.";
      continue;
    }

    if (geminiRes.status === 429 || geminiRes.status === 503) {
      lastError = `${model} har hög belastning`;
      continue;
    }

    if (!geminiRes.ok) {
      let detail = "";
      try { detail = (await geminiRes.json())?.error?.message || ""; } catch {}
      throw new Error(detail || `Gemini svarade ${geminiRes.status} — prova igen.`);
    }

    break;
  }

  if (!geminiRes || !geminiRes.ok) {
    throw new Error(lastError || "Alla modeller har hög belastning — prova igen om en stund.");
  }

  const data = await geminiRes.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function callGemini(parts, apiKey) {
  const recipe = await callGeminiRaw(parts, apiKey);
  if (!recipe) return null;

  recipe.tested   = false;
  recipe.timeNote = recipe.timeNote || null;
  recipe.notes    = recipe.notes    || null;
  recipe.seasons  = recipe.seasons  || [];
  recipe.servings = recipe.servings || 4;
  recipe.tags     = recipe.tags     || buildTags(recipe.time, recipe.protein);
  recipe.protein  = recipe.protein  || guessProtein(recipe.title || "", recipe.ingredients || []);
  return recipe;
}

// ── Hjälpfunktioner ─────────────────────────────────────────────────────────

function guessProtein(title, ingredients) {
  const text = (title + " " + ingredients.join(" ")).toLowerCase();
  if (/lax|torsk|fisk|räk|sej|tonfisk|laxfilé|fiskfilé|fiskpinnar/.test(text)) return "fisk";
  if (/kyckling|kycklingfilé|kycklingbröst/.test(text)) return "kyckling";
  if (/fläsk|bacon|skinka|kotlett|revbensspjäll|sidfläsk/.test(text)) return "fläsk";
  if (/nötkött|biff|köttfärs|köttbullar|lamm|hjort|entrecôte/.test(text)) return "kött";
  return "vegetarisk";
}

function buildTags(time, protein) {
  const tags = [];
  if (protein && protein !== "vegetarisk") tags.push(protein);
  if (protein === "vegetarisk") tags.push("vegetarisk");
  if (time !== null && time !== undefined) {
    if (time <= 30) tags.push("vardag30");
    else if (time <= 60) tags.push("helg60");
  }
  return tags;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

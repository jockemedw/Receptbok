const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const GEMINI_SCHEMA_PROMPT = `Du är en expert på matlagning och dataextraktion. Extrahera receptet och returnera BARA ett JSON-objekt (ingen annan text, ingen markdown) med exakt dessa fält:
{
  "title": "string",
  "protein": "en av: fisk, kyckling, kött, fläsk, vegetarisk",
  "time": "integer (total tid i minuter) eller null",
  "servings": "integer (portioner, default 4)",
  "tags": ["array med tillämpliga: vardag30, helg60, fisk, kyckling, kött, fläsk, vegetarisk, soppa, pasta, wok, ugn, sallad, gryta"],
  "ingredients": ["array av strings, en ingrediens per element, t.ex. '200 g smör'"],
  "instructions": ["array av strings, ett steg per element"],
  "notes": "string med tips/varianter eller null"
}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, url, imageBase64, mimeType } = req.body || {};

  try {
    if (type === "url") return await handleUrl(url, res);
    if (type === "photo") return await handlePhoto(imageBase64, mimeType, res);
    return res.status(400).json({ error: "Ange type: 'url' eller 'photo'." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Något gick fel." });
  }
}

// ── URL-import ──────────────────────────────────────────────────────────────

async function handleUrl(url, res) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Ange en giltig webbadress." });
  }

  let html;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error();
    html = await response.text();
  } catch {
    return res.status(400).json({ error: "Kunde inte nå sidan — kontrollera adressen." });
  }

  // Försök 1: JSON-LD
  const recipe = extractJsonLd(html);
  if (recipe) return res.status(200).json({ recipe });

  // Försök 2: Gemini-fallback om nyckel finns
  const apiKey = process.env.GOOGLE_API_KEY;
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
    .slice(0, 15000); // begränsa tokens

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

  const ingredients = (data.recipeIngredient || []).map((s) => String(s).trim()).filter(Boolean);

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

  return { title, tested: false, servings, time, timeNote: null, tags, protein, ingredients, instructions: instructions.filter(Boolean), notes };
}

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const mins = (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
  return mins > 0 ? mins : null;
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

// ── Gemini-anrop ─────────────────────────────────────────────────────────────

async function callGemini(parts, apiKey) {
  let geminiRes;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new Error("Kunde inte nå Google — prova igen om en stund.");
  }

  if (!geminiRes.ok) throw new Error("Tolkningsfel — prova igen.");

  const data = await geminiRes.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const recipe = JSON.parse(jsonMatch[0]);
    // Normalisera
    recipe.tested   = false;
    recipe.timeNote = recipe.timeNote || null;
    recipe.notes    = recipe.notes    || null;
    recipe.servings = recipe.servings || 4;
    recipe.tags     = recipe.tags     || buildTags(recipe.time, recipe.protein);
    recipe.protein  = recipe.protein  || guessProtein(recipe.title || "", recipe.ingredients || []);
    return recipe;
  } catch {
    return null;
  }
}

// ── Hjälpfunktioner ──────────────────────────────────────────────────────────

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

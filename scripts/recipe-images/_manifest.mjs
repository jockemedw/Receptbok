// Delat av generate-images.mjs (Gemini) och generate-local.mjs (ComfyUI/FLUX):
// provenienslogg för AI-bilder (ai-generated.json) + skrivning av manifestet
// js/recipe-images.js med både alla bild-id:n och AI-delmängden.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const IMG_DIR = path.join(ROOT, 'images', 'recipes');
export const AI_JSON = path.join(__dirname, 'ai-generated.json');
export const MANIFEST = path.join(ROOT, 'js', 'recipe-images.js');
export const THUMB_DIR = path.join(IMG_DIR, 'thumbs');
export const THUMB_SIZE = 192;   // 56–72 css-px i listorna × 3 (retina) → 192 räcker

// Kort innehållshash → cache-brytare (?v=) i appen; samma hash för fullbild och miniatyr.
export function imageHash(id) {
  return createHash('sha1').update(readFileSync(path.join(IMG_DIR, `r${id}.webp`))).digest('hex').slice(0, 8);
}

// Miniatyrer (images/recipes/thumbs/r<id>.webp). Körs av bildskripten efter varje
// ny/omgjord bild och av make-thumbs.mjs för hela mängden.
export async function writeThumbs(ids) {
  const { default: sharp } = await import('sharp');
  mkdirSync(THUMB_DIR, { recursive: true });
  for (const id of ids) {
    await sharp(path.join(IMG_DIR, `r${id}.webp`)).resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(THUMB_DIR, `r${id}.webp`));
  }
}

export function existingImageIds() {
  if (!existsSync(IMG_DIR)) return new Set();
  return new Set(readdirSync(IMG_DIR).map((f) => /^r(\d+)\.webp$/.exec(f)?.[1]).filter(Boolean).map(Number));
}

export function loadAi() {
  return existsSync(AI_JSON)
    ? JSON.parse(readFileSync(AI_JSON, 'utf8'))
    : { _: 'AI-genererade receptbilder (serveringsförslag) — id, modell, datum, prompt. Läses när manifestet skrivs (RECIPE_IMAGE_AI_IDS → bildtexten "AI-genererad bild · serveringsförslag" i appen).', images: [] };
}

export function saveAi(ai) {
  ai.images.sort((a, b) => a.id - b.id);
  writeFileSync(AI_JSON, JSON.stringify(ai, null, 2) + '\n');
}

export function writeManifest(ids, aiIds) {
  const sorted = [...ids].sort((a, b) => a - b);
  const ai = [...aiIds].filter((id) => ids.has(id)).sort((a, b) => a - b);
  writeFileSync(MANIFEST, `// GENERERAD av scripts/recipe-images/*.mjs — redigera inte för hand.
// Recept-id:n som har en bild i images/recipes/r<id>.webp (640×640 webp). Appen
// läser mängderna i js/utils.js (recipeImage) så listan aldrig ritar trasiga bilder.
export const RECIPE_IMAGE_IDS = new Set([
${sorted.map((id) => `  ${id},`).join('\n')}
]);
// Delmängd som är AI-genererade serveringsförslag (scripts/recipe-images/ai-generated.json)
// — visas med bildtexten "AI-genererad bild · serveringsförslag".
export const RECIPE_IMAGE_AI_IDS = new Set([
${ai.map((id) => `  ${id},`).join('\n')}
]);
// Innehållshash per bild → cache-brytare (?v=) så bilderna kan ligga ett år i
// cache (vercel.json) och ändå bytas när en bild görs om. Miniatyrer i thumbs/.
export const RECIPE_IMAGE_HASH = {
${sorted.map((id) => `  ${id}: '${imageHash(id)}',`).join('\n')}
};
`);
}

// Ingrediensnamn utan mängder — ger bildmodellen rätt råvaror.
export function ingredientNames(list, max = 12) {
  return list
    .map((l) => String(l).replace(/^[^:]{1,20}:\s*/, '').replace(/\(.*?\)/g, '').replace(/^[\d½¼¾,.\-–\s]+(kg|hg|g|l|dl|cl|ml|msk|tsk|krm|st|burk(ar)?|påse|pkt|förp\.?|klyft(a|or)|kruk(a|or)|skiv(a|or)|bit(ar)?)?\b\.?\s*/i, '').trim())
    .filter((s) => s && !/^(salt|peppar|svartpeppar|salt och (svart)?peppar|vatten|olja|rapsolja|olivolja|smör|smör eller olja|efter smak)/i.test(s))
    .slice(0, max);
}

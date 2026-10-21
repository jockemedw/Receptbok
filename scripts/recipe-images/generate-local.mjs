#!/usr/bin/env node
// Genererar AI-serveringsförslag LOKALT och gratis med FLUX i Joakims ComfyUI
// (C:\Users\joaki\ComfyUI_windows_portable, API på 127.0.0.1:8188) — samma
// idé som hans flux2.py men med FLUX.1 Krea dev (fotorealistisk, ryms på 3060:n)
// och utdata rakt in i receptbokens bildkonvention.
//
//   node scripts/recipe-images/generate-local.mjs --from=scripts/.cache/recipes-live.json --only=55,42
//   node scripts/recipe-images/generate-local.mjs --from=… --all-missing [--steps=20] [--size=768] [--seed=7] [--out=<dir>] [--force]
//
// Kräver att ComfyUI-servern är igång (run_nvidia_gpu.bat eller main.py --disable-auto-launch).
// Skriver images/recipes/r<id>.webp (640×640), ai-generated.json och manifestet.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, IMG_DIR, existingImageIds, loadAi, saveAi, writeManifest, ingredientNames } from './_manifest.mjs';

const API = process.env.COMFY_API || 'http://127.0.0.1:8188';
const COMFY_OUT = process.env.COMFY_OUT || 'C:/Users/joaki/ComfyUI_windows_portable/ComfyUI/output';
const UNET = 'flux1-krea-dev-Q5_K_S.gguf';
const CLIP_L = 'clip_l.safetensors';
const T5 = 't5xxl_fp8_e4m3fn.safetensors';
const VAE = 'flux_ae.safetensors';

const args = new Map(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const FROM = args.get('from');
const ONLY = args.has('only') ? new Set(args.get('only').split(',').map(Number)) : null;
const ALL_MISSING = args.get('all-missing') === 'true';
const STEPS = Number(args.get('steps') || 20);
const SIZE = Number(args.get('size') || 768);
const SEED0 = Number(args.get('seed') || 7);
const FORCE = args.get('force') === 'true';
const DRY = args.get('dry-run') === 'true';
const OUT_DIR = args.get('out') ? path.resolve(ROOT, args.get('out')) : IMG_DIR;
if (!FROM || (!ONLY && !ALL_MISSING)) { console.error('Ange --from=<recept.json> och --only=id,… eller --all-missing'); process.exit(2); }

const raw = JSON.parse(readFileSync(path.resolve(ROOT, FROM), 'utf8'));
const recipes = (Array.isArray(raw) ? raw : raw.recipes || []).map((r) => ({ id: Number(r.id), title: r.title, protein: r.protein, tags: r.tags || [], ingredients: r.ingredients || [], notes: r.notes || '' }));
const haveImg = existingImageIds();
const targets = recipes.filter((r) => ONLY ? ONLY.has(r.id) : (!haveImg.has(r.id) && !/dishingouthealth/i.test(r.notes)));

// Engelska promptar — FLUX förstår engelska bäst; rättens svenska namn följer med som kontext.
const PROTEIN_EN = { fisk: 'fish', kyckling: 'chicken', 'kött': 'beef', 'fläsk': 'pork', vegetarisk: 'vegetarian' };
// Rättens TYP på engelska ur den svenska titeln — annars ritar modellen t.ex. en laxfilé
// i stället för laxbiffar. Första träffen i titeln vinner; flera kan gälla (t.ex. soppa + nudlar).
const DISH_EN = [
  [/biffar|biff|frikadeller|bollar|järpar/i, 'pan-fried patties / meatballs'], [/soppa|chowder|bouillabaisse|minestrone|ramen/i, 'soup in a bowl'],
  [/gryta|stroganoff|curry|masala|bolognese/i, 'stew served with rice or potatoes'], [/pannkaka|plättar/i, 'oven pancake / small pancakes'],
  [/sallad|bowl/i, 'salad bowl'], [/wok|nudlar|nudel/i, 'stir-fried noodles'], [/pasta|spaghetti|risoni|tortellini|makaroni|lasagne|carbonara|bonara/i, 'pasta dish'],
  [/risotto|ris|biryani|couscous|bulgur|quinoa/i, 'grain dish'], [/gratäng|låda/i, 'oven gratin in a baking dish'], [/wrap|burrito|quesadilla|taco|manti/i, 'wraps / filled flatbread'],
  [/macka|toast|sando|smörgås/i, 'sandwich'], [/pesto|hummus|sås|dressing|dipp/i, 'sauce or spread in a small bowl'], [/kyckling/i, 'roasted chicken pieces'],
];
function dishHint(title) {
  const hits = DISH_EN.filter(([re]) => re.test(title)).map(([, en]) => en);
  return hits.length ? hits.slice(0, 2).join(', ') : 'home-cooked main course';
}

// Handskrivna promptar (prompts.json) går före den automatiska mallen — de är skrivna
// efter läsning av varje recept (Joakim 2026-10-21: 'läs varje recept i detalj').
const PROMPTS_PATH = new URL('./prompts.json', import.meta.url);
const HAND = existsSync(PROMPTS_PATH) ? JSON.parse(readFileSync(PROMPTS_PATH, 'utf8')) : { style: '', prompts: {} };
export function promptFor(r) {
  const hand = HAND.prompts[String(r.id)];
  if (hand) return hand.prompt + ' ' + HAND.style;
  return autoPromptFor(r);
}
function autoPromptFor(r) {
  const ings = ingredientNames(r.ingredients).join(', ');
  const kind = PROTEIN_EN[r.protein] || '';
  return `Overhead food photograph of a Swedish homemade ${kind} dinner: ${dishHint(r.title)} (Swedish name "${r.title}"), made with ${ings} (the ingredients are cooked into the dish, not shown separately). ` +
    'Served on a simple ceramic plate or bowl on a light linen tablecloth, soft natural daylight from a window, ' +
    'everyday home cooking, appetizing, realistic, slightly rustic, shot straight from above with a 50mm lens, ' +
    'no hands, no people, no text, no logos, no cutlery covering the food.';
}

function workflow(prompt, seed, prefix) {
  return {
    unet: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: UNET } },
    clip: { class_type: 'DualCLIPLoader', inputs: { clip_name1: T5, clip_name2: CLIP_L, type: 'flux' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: VAE } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: prompt } },
    guide: { class_type: 'FluxGuidance', inputs: { conditioning: ['pos', 0], guidance: 3.5 } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } },
    latent: { class_type: 'EmptySD3LatentImage', inputs: { width: SIZE, height: SIZE, batch_size: 1 } },
    sampler: { class_type: 'KSampler', inputs: { model: ['unet', 0], positive: ['guide', 0], negative: ['neg', 0], latent_image: ['latent', 0], seed, steps: STEPS, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: prefix } },
  };
}

async function post(p, body) { const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`); return r.json(); }
async function get(p) { const r = await fetch(API + p); return r.json(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pid, timeoutMs = 20 * 60 * 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const h = await get(`/history/${pid}`);
    if (h[pid]) {
      const st = h[pid].status || {};
      if (st.status_str === 'error') throw new Error('ComfyUI: ' + JSON.stringify(st.messages || st).slice(0, 400));
      const imgs = h[pid].outputs?.save?.images || [];
      if (imgs.length) return { files: imgs.map((i) => i.filename), secs: Math.round((Date.now() - t0) / 1000) };
    }
    await sleep(3000);
  }
  throw new Error('timeout');
}

console.log(`${targets.length} recept (${UNET}, ${STEPS} steg, ${SIZE}px)${DRY ? ' — torrkörning' : ''}${OUT_DIR !== IMG_DIR ? ' → ' + OUT_DIR : ''}`);
if (!DRY) {
  try { await get('/system_stats'); } catch { console.error(`ComfyUI svarar inte på ${API} — starta servern först.`); process.exit(1); }
}
const { default: sharp } = DRY ? { default: null } : await import('sharp');
if (!DRY) mkdirSync(OUT_DIR, { recursive: true });
const ai = loadAi();
let done = 0, failed = 0;
for (const r of targets) {
  const prompt = promptFor(r);
  if (DRY) { console.log(`  ${r.id} ${r.title}\n     ${prompt}`); continue; }
  if (haveImg.has(r.id) && !FORCE && OUT_DIR === IMG_DIR) { console.log(`  = ${r.id} finns redan`); continue; }
  const seed = SEED0 + r.id;
  const prefix = `rb_r${r.id}_s${seed}`;
  try {
    const { prompt_id } = await post('/prompt', { prompt: workflow(prompt, seed, prefix) });
    const { files, secs } = await waitFor(prompt_id);
    const src = path.join(COMFY_OUT, files[0]);
    const out = path.join(OUT_DIR, `r${r.id}.webp`);
    await sharp(src).resize(640, 640, { fit: 'cover' }).webp({ quality: 80 }).toFile(out);
    if (OUT_DIR === IMG_DIR) {
      ai.images = ai.images.filter((x) => x.id !== r.id);
      ai.images.push({ id: r.id, title: r.title, model: `comfyui/${UNET}`, steps: STEPS, seed, date: new Date().toISOString().slice(0, 10), prompt });
      haveImg.add(r.id);
    }
    done++;
    console.log(`  ✓ r${r.id}.webp  ${r.title}  (${secs}s)`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${r.id} ${r.title}: ${String(e.message || e).slice(0, 300)}`);
    if (/svarar inte|ECONNREFUSED/.test(String(e.message))) break;
  }
}
if (!DRY && OUT_DIR === IMG_DIR && done) {
  saveAi(ai);
  writeManifest(haveImg, new Set(ai.images.map((x) => x.id)));
}
console.log(`klart: ${done} genererade · ${failed} misslyckade`);

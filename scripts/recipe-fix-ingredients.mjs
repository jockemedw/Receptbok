#!/usr/bin/env node
// Fixar ingrediens-format som orsakar parsningsproblem.
// Kör: node scripts/recipe-fix-ingredients.mjs

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const data = JSON.parse(readFileSync(join(ROOT, "recipes.json"), "utf-8"));

let fixes = 0;
const log = [];

function fix(id, msg) {
  fixes++;
  log.push(`#${id}: ${msg}`);
}

for (const r of data.recipes) {
  for (let i = 0; i < (r.ingredients || []).length; i++) {
    let ing = r.ingredients[i];
    const original = ing;

    // Pattern 1: "juice av 1 lime" → "1 lime"
    // "skal och juice av 1 citron" → "1 citron"
    // "saft av en hel citron" → "1 citron"
    // "rivet skal av 1 lime" → "1 lime"
    ing = ing.replace(/^(juice|saft|skal|zest)\s+(och\s+(juice|saft|skal|zest)\s+)?av\s+/i, "");
    ing = ing.replace(/^(rivet?\s+)?(skal|zest)\s+(och\s+(juice|saft)\s+)?av\s+/i, "");
    // "en hel citron" → "1 citron"
    ing = ing.replace(/^en\s+hel\s+/i, "1 ");
    // "en skvätt ..." → skip (doesn't need amount)

    // Pattern 2: "limejuice (från 1 lime)" → "1 lime"
    const limeCitrus = ing.match(/^(lime|citron)(juice|saft)\s*\(från\s+(.+?)\)/i);
    if (limeCitrus) {
      ing = limeCitrus[3];
    }

    // Pattern 3: "apelsinsaft (från 1 hel apelsin)" → "1 apelsin"
    const fruitJuice = ing.match(/^(apelsin|citron|lime)(juice|saft)\s*\(från\s+(.+?)\)/i);
    if (fruitJuice) {
      ing = fruitJuice[3].replace(/^en\s+hel\s+/i, "1 ");
    }

    // Pattern 4: "citronsaft (från ½ citron)" → "½ citron"
    const juiceFrom = ing.match(/^(citronsaft|citronjuice|limejuice|limesaft|apelsinjuice)\s*\(från\s+(.+?)\)/i);
    if (juiceFrom) {
      ing = juiceFrom[2];
    }

    if (ing !== original) {
      r.ingredients[i] = ing;
      fix(r.id, `"${original}" → "${ing}"`);
    }
  }
}

// Pattern 5: "matchstick-morötter" → "morötter"
for (const r of data.recipes) {
  for (let i = 0; i < (r.ingredients || []).length; i++) {
    let ing = r.ingredients[i];
    const original = ing;
    ing = ing.replace(/\bmatchstick-morötter\b/gi, "morötter");
    if (ing !== original) {
      r.ingredients[i] = ing;
      fix(r.id, `"${original}" → "${ing}"`);
    }
  }
}

writeFileSync(join(ROOT, "recipes.json"), JSON.stringify(data, null, 2) + "\n", "utf-8");

console.log(`\n=== Ingrediensfix klar ===`);
console.log(`${fixes} ändringar\n`);
for (const l of log) console.log(`  ${l}`);

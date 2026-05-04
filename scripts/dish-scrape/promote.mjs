#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const STAGING_PATH = path.join(REPO_ROOT, 'recipes-import-pending.json');
const REPORT_PATH = path.join(REPO_ROOT, 'recipes-import-quality-report.md');
const RECIPES_PATH = path.join(REPO_ROOT, 'recipes.json');

function readJson(p) {
  if (!fs.existsSync(p)) { console.error(`Missing: ${p}`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (!fs.existsSync(STAGING_PATH)) {
    console.error(`Staging-fil saknas: ${STAGING_PATH}`);
    console.error('Kör först: node scrape.mjs');
    process.exit(1);
  }

  const staging = readJson(STAGING_PATH);
  const recipes = readJson(RECIPES_PATH);

  const existingIds = new Set(recipes.recipes.map(r => r.id));
  const existingTitles = new Set(recipes.recipes.map(r => r.title.toLowerCase()));

  const accepted = [];
  const rejected = [];

  let nextId = recipes.meta.nextId || (recipes.recipes.reduce((m, r) => Math.max(m, r.id), 0) + 1);

  for (const r of staging.recipes) {
    // ID-kollision (om recipes.json hann växa under granskning)
    if (existingIds.has(r.id)) {
      r.id = nextId++;
    } else if (r.id >= nextId) {
      nextId = r.id + 1;
    }
    if (existingTitles.has(r.title.toLowerCase())) {
      rejected.push({ recipe: r, reason: `dedupe: titel finns redan` });
      continue;
    }
    // Strip _meta-fältet — det användes bara för rapportering
    const clean = { ...r };
    delete clean._meta;
    accepted.push(clean);
    existingTitles.add(r.title.toLowerCase());
    existingIds.add(clean.id);
  }

  console.log(`Staging: ${staging.recipes.length} recept`);
  console.log(`Accepterade: ${accepted.length}`);
  console.log(`Avvisade (dedupe): ${rejected.length}`);
  for (const r of rejected) console.log(`  - "${r.recipe.title}" — ${r.reason}`);

  if (accepted.length === 0) {
    console.log('Inget att importera. Avbryter.');
    process.exit(0);
  }

  const updated = {
    meta: {
      version: recipes.meta.version || '1.0',
      lastUpdated: new Date().toISOString().slice(0, 10),
      totalRecipes: recipes.recipes.length + accepted.length,
      nextId,
    },
    recipes: [...recipes.recipes, ...accepted],
  };

  if (dryRun) {
    console.log('\n[DRY RUN] Ingen fil skrevs.');
    console.log(`Skulle uppdatera: ${RECIPES_PATH}`);
    console.log(`  totalRecipes: ${recipes.recipes.length} → ${updated.meta.totalRecipes}`);
    console.log(`  nextId: ${recipes.meta.nextId} → ${updated.meta.nextId}`);
    return;
  }

  fs.writeFileSync(RECIPES_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  console.log(`\n✓ Skrev ${RECIPES_PATH}`);
  console.log(`  totalRecipes: ${recipes.recipes.length} → ${updated.meta.totalRecipes}`);
  console.log(`  nextId: ${recipes.meta.nextId} → ${updated.meta.nextId}`);

  // Rensa staging-filer
  fs.unlinkSync(STAGING_PATH);
  console.log(`✓ Tog bort ${STAGING_PATH}`);
  if (fs.existsSync(REPORT_PATH)) {
    fs.unlinkSync(REPORT_PATH);
    console.log(`✓ Tog bort ${REPORT_PATH}`);
  }

  console.log('\nNästa steg:');
  console.log('  git add recipes.json');
  console.log(`  git commit -m "Importera ${accepted.length} recept från dishingouthealth.com"`);
  console.log('  git push');
}

main();

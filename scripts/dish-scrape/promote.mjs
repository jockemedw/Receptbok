#!/usr/bin/env node
// Promotar granskade recept från staging till Supabase (Fas 8.4 — recipes.json retirerad).
// Dedupe på titel mot live-datan, tilldelar löpande id. --dry-run skriver inget.
//
// Kör:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/dish-scrape/promote.mjs [--dry-run]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRecipes, getHouseholdId, insertRecipes } from '../_lib/recipes-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const STAGING_PATH = path.join(REPO_ROOT, 'recipes-import-pending.json');
const REPORT_PATH = path.join(REPO_ROOT, 'recipes-import-quality-report.md');

function readJson(p) {
  if (!fs.existsSync(p)) { console.error(`Missing: ${p}`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!fs.existsSync(STAGING_PATH)) {
    console.error(`Staging-fil saknas: ${STAGING_PATH}`);
    console.error('Kör först: node scrape.mjs');
    process.exit(1);
  }

  const staging = readJson(STAGING_PATH);
  const { meta, recipes: existing } = await loadRecipes();

  const existingTitles = new Set(existing.map(r => r.title.toLowerCase()));
  let nextId = meta.nextId;

  const accepted = [];
  const rejected = [];
  for (const r of staging.recipes) {
    if (existingTitles.has(r.title.toLowerCase())) {
      rejected.push({ recipe: r, reason: 'dedupe: titel finns redan' });
      continue;
    }
    const clean = { ...r, id: nextId++ };
    delete clean._meta;
    accepted.push(clean);
    existingTitles.add(r.title.toLowerCase());
  }

  console.log(`Staging: ${staging.recipes.length} recept`);
  console.log(`Accepterade: ${accepted.length}`);
  console.log(`Avvisade (dedupe): ${rejected.length}`);
  for (const r of rejected) console.log(`  - "${r.recipe.title}" — ${r.reason}`);

  if (accepted.length === 0) {
    console.log('Inget att importera. Avbryter.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Inget skrevs till Supabase.');
    console.log(`  Skulle infoga ${accepted.length} recept (id ${accepted[0].id}–${accepted[accepted.length - 1].id})`);
    return;
  }

  const householdId = await getHouseholdId();
  const inserted = await insertRecipes(accepted, householdId);
  console.log(`\n✓ Infogade ${inserted.length} recept i Supabase`);

  fs.unlinkSync(STAGING_PATH);
  console.log(`✓ Tog bort ${STAGING_PATH}`);
  if (fs.existsSync(REPORT_PATH)) {
    fs.unlinkSync(REPORT_PATH);
    console.log(`✓ Tog bort ${REPORT_PATH}`);
  }
  console.log('\nKlart — recepten är live. Ingen git-commit behövs (data ligger i Supabase).');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

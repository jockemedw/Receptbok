#!/usr/bin/env node
// Exporterar alla recept från Supabase till den gitignorerade cachen
// scripts/.cache/recipes.json. Synkrona dev-skript och generate_weekly_plan.py
// läser denna cache. recipes.json (repo-roten) är retirerad (Fas 8.4).
//
// Kör:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/export-recipes.mjs

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { loadRecipes, CACHE_PATH } from "./_lib/recipes-source.mjs";

const data = await loadRecipes();
mkdirSync(dirname(CACHE_PATH), { recursive: true });
writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(`Exporterade ${data.recipes.length} recept → ${CACHE_PATH} (nextId=${data.meta.nextId})`);

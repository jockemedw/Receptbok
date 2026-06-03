// ─── Delad receptkälla för dev-skript (Fas 8.4) ────────────────────────────
// Sanningskällan är Supabase `recipes`-tabellen. `recipes.json` är retirerad.
//
// Beroendefritt (plain fetch mot PostgREST). Kräver miljövariabler:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (eller SUPABASE_ANON_KEY för read-only)
//
// Synkrona/Python-skript läser istället den gitignorerade cachen
// `scripts/.cache/recipes.json` som skapas av `node scripts/export-recipes.mjs`.

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { recipeFromRow, recipeToRow } from "../../js/data-mapper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CACHE_PATH = join(__dirname, "..", ".cache", "recipes.json");

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function requireCreds() {
  if (!URL || !KEY) {
    throw new Error(
      "Saknar Supabase-credentials. Sätt SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY " +
      "(eller SUPABASE_ANON_KEY för läsning) i miljön."
    );
  }
}

async function rest(path, opts = {}) {
  requireCreds();
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${res.status} ${path}: ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// Hämta alla recept live från Supabase i appens recept-format.
export async function loadRecipes() {
  const rows = await rest("recipes?select=*&order=id");
  const recipes = rows.map(recipeFromRow);
  const nextId = recipes.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return { meta: { totalRecipes: recipes.length, nextId }, recipes };
}

export async function getHouseholdId() {
  const rows = await rest("household_members?select=household_id&limit=1");
  return rows[0]?.household_id ?? null;
}

// Infogar nya recept (array i appens format). Tilldelar id = max+1 löpande om saknas.
export async function insertRecipes(recipes, householdId) {
  if (!householdId) householdId = await getHouseholdId();
  if (!householdId) throw new Error("Hittade ingen household_id att koppla recepten till.");
  const { meta } = await loadRecipes();
  let nextId = meta.nextId;
  const rows = recipes.map((r) => recipeToRow({ ...r, id: r.id ?? nextId++ }, householdId));
  return rest("recipes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
}

// Synkron läsning av cachen (för skript som inte vill vara async).
export function loadRecipesFromCache() {
  if (!existsSync(CACHE_PATH)) {
    throw new Error(
      `Cachen saknas: ${CACHE_PATH}\nKör först:  node scripts/export-recipes.mjs`
    );
  }
  return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
}

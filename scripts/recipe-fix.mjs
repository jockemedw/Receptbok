#!/usr/bin/env node
// Receptkvalitetsfix — applicerar alla korrigeringar från auditen.
// Kör: node scripts/recipe-fix.mjs

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

function getRecipe(id) {
  return data.recipes.find(r => r.id === id);
}

// ─── Fix 1: Saknade time-fält ─────────────────────────────────────────────
const timeFixes = {
  64: 25,   // Grönsakswok
  268: 25,  // Nudelwok
  269: 30,  // Cashew-kyckling curry
  270: 25,  // Brysselkålbonara
  271: 35,  // Tikka Masala
};

for (const [id, time] of Object.entries(timeFixes)) {
  const r = getRecipe(Number(id));
  if (r && (r.time === null || r.time === undefined)) {
    r.time = time;
    fix(id, `Satte time=${time}`);
  }
}

// ─── Fix 2: Saknade vardag30/helg60-taggar (huvudrätter) ──────────────────
// Recept som är huvudrätter och saknar båda taggarna.
const addVardag30 = [32, 37, 39, 41, 43, 44, 45, 52, 64, 267];
const addHelg60 = [33, 34, 35, 38, 42];

for (const id of addVardag30) {
  const r = getRecipe(id);
  if (r && !r.tags.includes("vardag30")) {
    r.tags.push("vardag30");
    fix(id, `La till vardag30-tagg`);
  }
}

for (const id of addHelg60) {
  const r = getRecipe(id);
  if (r && !r.tags.includes("helg60")) {
    r.tags.push("helg60");
    fix(id, `La till helg60-tagg`);
  }
}

// #52 har "snabb30" istället för "vardag30" — byt ut
{
  const r = getRecipe(52);
  if (r) {
    const idx = r.tags.indexOf("snabb30");
    if (idx !== -1) {
      r.tags[idx] = "vardag30";
      fix(52, `Bytte snabb30 → vardag30`);
    }
  }
}

// ─── Fix 3: vardag30 på recept med time > 30 → byt till helg60 ───────────
for (const r of data.recipes) {
  if (r.time && r.time > 30 && r.tags.includes("vardag30")) {
    r.tags = r.tags.filter(t => t !== "vardag30");
    if (!r.tags.includes("helg60")) {
      r.tags.push("helg60");
    }
    fix(r.id, `Bytte vardag30 → helg60 (time=${r.time})`);
  }
}

// ─── Fix 4: Felaktigt protein-fält ────────────────────────────────────────
// #258 Puttanesca — har ansjovis som huvudingrediens, inte vegetarisk
{
  const r = getRecipe(258);
  if (r && r.protein === "vegetarisk") {
    r.protein = "fisk";
    r.tags = r.tags.filter(t => t !== "veg");
    fix(258, `Ändrade protein vegetarisk → fisk (har ansjovis), tog bort veg-tagg`);
  }
}

// #9 Blomkålssoppa — har bacon, bör vara fläsk (inte kött)
{
  const r = getRecipe(9);
  if (r && r.protein === "kött") {
    r.protein = "fläsk";
    fix(9, `Ändrade protein kött → fläsk (har bacon)`);
  }
}

// #23 Minestrone — har pancetta, bör vara fläsk
{
  const r = getRecipe(23);
  if (r && r.protein === "kött") {
    r.protein = "fläsk";
    fix(23, `Ändrade protein kött → fläsk (har pancetta)`);
  }
}

// ─── Fix 5: Motstridiga taggar ────────────────────────────────────────────
// #264 har både "kött" och "vegetarisk" i tags — rökt kalkon är primärt protein
{
  const r = getRecipe(264);
  if (r && r.tags.includes("kött") && r.tags.includes("vegetarisk")) {
    r.tags = r.tags.filter(t => t !== "vegetarisk");
    fix(264, `Tog bort "vegetarisk"-tagg (har rökt kalkon som primärt protein)`);
  }
}

// #269 har "kyckling" och "vegetarisk" i tags — kyckling är primärt
{
  const r = getRecipe(269);
  if (r && r.tags.includes("kyckling") && r.tags.includes("vegetarisk")) {
    r.tags = r.tags.filter(t => t !== "vegetarisk");
    fix(269, `Tog bort "vegetarisk"-tagg (protein=kyckling)`);
  }
}

// #271 har "kyckling" och "vegetarisk" i tags
{
  const r = getRecipe(271);
  if (r && r.tags.includes("kyckling") && r.tags.includes("vegetarisk")) {
    r.tags = r.tags.filter(t => t !== "vegetarisk");
    fix(271, `Tog bort "vegetarisk"-tagg (protein=kyckling)`);
  }
}

// #268 har "vegetarisk" i tags men nämner kyckling/biff som alternativ + ostronsås
{
  const r = getRecipe(268);
  if (r && r.tags.includes("vegetarisk")) {
    r.tags = r.tags.filter(t => t !== "vegetarisk");
    fix(268, `Tog bort "vegetarisk"-tagg (listar kyckling/biff som alternativ + ostronsås)`);
  }
}

// ─── Fix 6: VERSALER i titel ──────────────────────────────────────────────
{
  const r = getRecipe(64);
  if (r && r.title === r.title.toUpperCase()) {
    r.title = r.title.charAt(0) + r.title.slice(1).toLowerCase();
    fix(64, `Normaliserade ALL CAPS-titel → "${r.title}"`);
  }
}

// ─── Fix 7: Dubbla parenteser i doh-ingredienser ─────────────────────────
// Mönster: "ingrediens (qty) (prep)" → "ingrediens (qty, prep)"
for (const r of data.recipes) {
  if (!(r.tags || []).includes("doh")) continue;
  for (let i = 0; i < (r.ingredients || []).length; i++) {
    const ing = r.ingredients[i];
    // Match: "name (qty) (prep)" → "name (qty, prep)"
    const m = ing.match(/^(.+?)\s*\(([^)]+)\)\s*\(([^)]+)\)$/);
    if (m) {
      const fixed = `${m[1].trim()} (${m[2].trim()}, ${m[3].trim()})`;
      r.ingredients[i] = fixed;
      fix(r.id, `Dubbla parenteser fixat: "${ing}" → "${fixed}"`);
    }
  }
}

// ─── Fix 8: "medium" → "mellanstor" i ingredienser ───────────────────────
for (const r of data.recipes) {
  for (let i = 0; i < (r.ingredients || []).length; i++) {
    if (/\bmedium\b/i.test(r.ingredients[i])) {
      r.ingredients[i] = r.ingredients[i].replace(/\bmedium\b/gi, "mellanstor");
      fix(r.id, `Bytte "medium" → "mellanstor" i ingrediens`);
    }
  }
}

// ─── Fix 9: Uppdatera meta ───────────────────────────────────────────────
data.meta.lastUpdated = new Date().toISOString().slice(0, 10);
data.meta.totalRecipes = data.recipes.length;

// ─── Skriv tillbaka ──────────────────────────────────────────────────────
writeFileSync(join(ROOT, "recipes.json"), JSON.stringify(data, null, 2) + "\n", "utf-8");

console.log(`\n=== Receptfix klar ===`);
console.log(`${fixes} ändringar i ${data.recipes.length} recept\n`);
for (const l of log) console.log(`  ${l}`);
console.log(`\nrecipes.json uppdaterad.`);

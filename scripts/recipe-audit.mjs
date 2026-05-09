#!/usr/bin/env node
// Receptkvalitetsrevision — analyserar recipes.json och rapporterar problem.
// Kör: node scripts/recipe-audit.mjs

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const data = JSON.parse(readFileSync(join(ROOT, "recipes.json"), "utf-8"));
const recipes = data.recipes;

// ─── Import shopping-builder functions ────────────────────────────────────
// We can't directly import ESM from api/_shared because it uses bare exports.
// Instead, inline the critical functions for consistent testing.
import {
  parseIngredient,
  normalizeName,
  NORMALIZATION_TABLE,
  CANON_SET,
} from "../api/_shared/shopping-builder.js";

// ─── Constants ────────────────────────────────────────────────────────────
const VALID_PROTEINS = new Set(["fisk", "kyckling", "kött", "fläsk", "vegetarisk"]);
const REQUIRED_FIELDS = ["id", "title", "protein", "tags", "ingredients", "instructions", "servings", "time"];

const PROTEIN_KEYWORDS = {
  fisk: ["torsk", "lax", "sej", "rödspätta", "fisk", "räk", "tonfisk", "ansjovis", "makrill", "sardell", "skaldjur", "kräft"],
  kyckling: ["kyckling", "höns"],
  kött: ["köttfärs", "nötfärs", "biff", "oxfilé", "lamm", "högrev", "entrecote", "bog", "grytbitar"],
  fläsk: ["fläsk", "bacon", "pancetta", "chorizo", "salsiccia", "skinka", "kassler"],
  vegetarisk: ["tofu", "halloumi", "linser", "bönor", "kikärt", "tempeh", "quorn", "vegofärs"],
};

const PANTRY_ALWAYS_SKIP = new Set([
  "salt", "svartpeppar", "vitpeppar", "vatten", "salt & peppar", "salt och svartpeppar",
  "salt och peppar", "lite vatten", "valfria grönsaker",
]);

const SMALL_UNITS = new Set(["tsk", "krm", "msk", "nypa", "tumme", "näve", "nävar"]);

// ─── Checks ───────────────────────────────────────────────────────────────
const issues = {
  structural: [],
  tags: [],
  ingredients: [],
  protein: [],
  cookability: [],
  doh: [],
};

function addIssue(category, severity, recipeId, title, message) {
  issues[category].push({ severity, recipeId, title, message });
}

// Check 1: Structural
const seenIds = new Map();
for (const r of recipes) {
  // Duplicate IDs
  if (seenIds.has(r.id)) {
    addIssue("structural", "🔴", r.id, r.title, `Duplicerat id=${r.id} (också använt av "${seenIds.get(r.id)}")`);
  }
  seenIds.set(r.id, r.title);

  // Missing fields
  for (const field of REQUIRED_FIELDS) {
    if (r[field] === undefined || r[field] === null) {
      addIssue("structural", "🔴", r.id, r.title, `Saknar fält: ${field}`);
    }
  }

  // Wrong types
  if (r.tags && !Array.isArray(r.tags)) {
    addIssue("structural", "🔴", r.id, r.title, `tags är inte en array: ${typeof r.tags}`);
  }
  if (r.ingredients && !Array.isArray(r.ingredients)) {
    addIssue("structural", "🔴", r.id, r.title, `ingredients är inte en array: ${typeof r.ingredients}`);
  }
  if (r.instructions && !Array.isArray(r.instructions)) {
    addIssue("structural", "🔴", r.id, r.title, `instructions är inte en array: ${typeof r.instructions}`);
  }
  if (r.time !== null && r.time !== undefined && typeof r.time !== "number") {
    addIssue("structural", "🔴", r.id, r.title, `time är inte ett nummer: ${typeof r.time} (${r.time})`);
  }
  if (r.servings !== null && r.servings !== undefined && typeof r.servings !== "number") {
    addIssue("structural", "🔴", r.id, r.title, `servings är inte ett nummer: ${typeof r.servings} (${r.servings})`);
  }

  // Invalid protein value
  if (r.protein && !VALID_PROTEINS.has(r.protein)) {
    addIssue("structural", "🔴", r.id, r.title, `Ogiltigt protein-värde: "${r.protein}"`);
  }
}

// Check 2: Tag consistency
for (const r of recipes) {
  const tags = r.tags || [];
  const hasVardag = tags.includes("vardag30");
  const hasHelg = tags.includes("helg60");

  if (!hasVardag && !hasHelg) {
    const isSideDish = tags.some(t => ["tillbehör", "sås", "tillbehor"].includes(t.toLowerCase()))
      || /^(tillbehör|sås|pesto|dressing|kimchi|citronisås)/i.test(r.title)
      || tags.some(t => t.toLowerCase() === "frukost" || t.toLowerCase() === "brunch");
    const severity = isSideDish ? "🟡" : "🔴";
    const note = isSideDish ? " (tillbehör/sås — avsiktligt exkluderat)" : "";
    addIssue("tags", severity, r.id, r.title, `Saknar både vardag30 och helg60 → filtreras bort av filterRecipes()${note}`);
  }

  if (r.time && r.time <= 30 && !hasVardag) {
    addIssue("tags", "🟡", r.id, r.title, `time=${r.time} men saknar vardag30-tagg`);
  }
  if (r.time && r.time <= 60 && !hasHelg && !hasVardag) {
    addIssue("tags", "🟡", r.id, r.title, `time=${r.time} men saknar helg60-tagg`);
  }
  if (r.time && r.time > 30 && hasVardag) {
    addIssue("tags", "🟡", r.id, r.title, `time=${r.time} men har vardag30-tagg (missvisande)`);
  }
  if (r.time && r.time > 60 && hasHelg && !hasVardag) {
    addIssue("tags", "🟡", r.id, r.title, `time=${r.time} men har helg60-tagg (överskrider 60 min)`);
  }

  // Protein tag vs protein field mismatch
  const proteinTags = tags.filter(t => VALID_PROTEINS.has(t));
  if (proteinTags.length > 0 && r.protein && !proteinTags.includes(r.protein)) {
    addIssue("tags", "🟡", r.id, r.title, `Protein-tagg [${proteinTags}] matchar inte protein-fältet "${r.protein}"`);
  }
}

// Check 3: Ingredient parsing problems
for (const r of recipes) {
  const ingNames = [];
  for (let i = 0; i < (r.ingredients || []).length; i++) {
    const raw = r.ingredients[i];

    // Empty or whitespace-only
    if (!raw || !raw.trim()) {
      addIssue("ingredients", "🔴", r.id, r.title, `Tom ingrediens på position ${i}`);
      continue;
    }

    // Try parsing
    let parsed;
    try {
      parsed = parseIngredient(raw);
    } catch (e) {
      addIssue("ingredients", "🔴", r.id, r.title, `parseIngredient kraschade på "${raw}": ${e.message}`);
      continue;
    }

    const { amount, unit, name } = parsed;
    const normalized = normalizeName(name);

    // No amount and not a pantry skip item
    if (amount === null && !PANTRY_ALWAYS_SKIP.has(normalized) && !SMALL_UNITS.has(unit)) {
      // Check if it's a "Tillbehör:" or similar prefix-item — those are OK without amount
      if (!/^(tillbehör|servering|topping|garnering)/i.test(raw)) {
        // Only flag if it seems like a real ingredient (not just "olivolja" which is fine without amount)
        const isBulkIngredient = ["olivolja", "rapsolja", "olja", "smör", "socker", "mjöl", "vetemjöl"].includes(normalized);
        if (!isBulkIngredient) {
          addIssue("ingredients", "🟡", r.id, r.title, `Ingen mängd: "${raw}" → parsed name="${name}", normalized="${normalized}"`);
        }
      }
    }

    // Name is suspiciously long (likely unparsed garbage)
    if (name.length > 60) {
      addIssue("ingredients", "🟡", r.id, r.title, `Långt ingrediensnamn (${name.length} tecken): "${name.substring(0, 80)}..."`);
    }

    // Name contains digits (likely failed parse)
    if (/\d/.test(name) && !/\d+%/.test(name)) {
      addIssue("ingredients", "🟡", r.id, r.title, `Siffror i ingrediensnamn: "${raw}" → name="${name}"`);
    }

    // English units (cups, oz, tablespoon, teaspoon)
    if (/\b(cups?|oz|ounces?|tablespoons?|teaspoons?|tbsp|pounds?|lbs?|inch|inches)\b/i.test(raw)) {
      addIssue("ingredients", "🟡", r.id, r.title, `Engelsk enhet: "${raw}"`);
    }

    // Track names for duplicate check
    ingNames.push(normalized);
  }

  // Duplicate ingredients within same recipe
  const counts = {};
  for (const n of ingNames) {
    counts[n] = (counts[n] || 0) + 1;
  }
  for (const [n, c] of Object.entries(counts)) {
    if (c > 1 && !PANTRY_ALWAYS_SKIP.has(n)) {
      addIssue("ingredients", "🟢", r.id, r.title, `Dubblett-ingrediens: "${n}" förekommer ${c} gånger`);
    }
  }
}

// Check 4: Protein field correctness
for (const r of recipes) {
  const ings = (r.ingredients || []).join(" ").toLowerCase();
  const declaredProtein = r.protein;

  if (declaredProtein === "vegetarisk") {
    // Check for meat/fish keywords in vegetarian recipes
    const meatFish = [...PROTEIN_KEYWORDS.fisk, ...PROTEIN_KEYWORDS.kyckling, ...PROTEIN_KEYWORDS.kött, ...PROTEIN_KEYWORDS.fläsk];
    const found = meatFish.filter(kw => {
      const regex = new RegExp(`\\b${kw}`, "i");
      return regex.test(ings);
    });
    // Filter out false positives — also ignore keywords inside "eller"/"alternativ"/"valfritt" contexts
    const filtered = found.filter(f => {
      if (f === "fisk" && /fisksås|fisksas|fiskbuljong|fiskfond/i.test(ings)) return false;
      if (f === "höns" && /hönsbuljong|hönsfond/i.test(ings)) return false;
      if (f === "kyckling" && /kycklingbuljong|kycklingfond/i.test(ings)) return false;
      // Check if the keyword only appears in optional/alternative contexts
      const kwRegex = new RegExp(`\\b${f}`, "gi");
      const allInOptional = (r.ingredients || []).every(ing => {
        if (!kwRegex.test(ing.toLowerCase())) return true; // keyword not in this ingredient
        return /\b(eller|alternativ|valfritt|tillbehör)\b/i.test(ing);
      });
      if (allInOptional) return false;
      return true;
    });
    if (filtered.length > 0) {
      addIssue("protein", "🔴", r.id, r.title, `protein=vegetarisk men ingredienser innehåller: ${filtered.join(", ")}`);
    }
  }

  if (declaredProtein && declaredProtein !== "vegetarisk") {
    // Check if declared protein is actually in the ingredients
    const keywords = PROTEIN_KEYWORDS[declaredProtein] || [];
    const hasAny = keywords.some(kw => {
      const regex = new RegExp(`\\b${kw}`, "i");
      return regex.test(ings);
    });
    if (!hasAny) {
      addIssue("protein", "🟡", r.id, r.title, `protein="${declaredProtein}" men inga matchande ingredienser hittades`);
    }
  }
}

// Check 5: Cookability
for (const r of recipes) {
  if (!r.instructions || r.instructions.length === 0) {
    addIssue("cookability", "🔴", r.id, r.title, `Inga instruktioner`);
  }
  if (!r.ingredients || r.ingredients.length === 0) {
    addIssue("cookability", "🔴", r.id, r.title, `Inga ingredienser`);
  }
  if (r.ingredients && r.ingredients.length < 2) {
    addIssue("cookability", "🟡", r.id, r.title, `Bara ${r.ingredients.length} ingrediens(er) — verkar ofullständigt`);
  }
  if (r.servings !== undefined && r.servings !== null && (r.servings < 1 || r.servings > 12)) {
    addIssue("cookability", "🟡", r.id, r.title, `Ovanligt servings-värde: ${r.servings}`);
  }
  if (r.time === 0) {
    addIssue("cookability", "🟡", r.id, r.title, `time=0 (borde vara null eller ett positivt värde)`);
  }

  // Instructions that are very short (likely incomplete)
  if (r.instructions && r.instructions.length > 0) {
    const totalLen = r.instructions.join(" ").length;
    if (totalLen < 30) {
      addIssue("cookability", "🟡", r.id, r.title, `Mycket korta instruktioner (${totalLen} tecken totalt)`);
    }
  }
}

// Check 6: DOH-specific issues
for (const r of recipes) {
  const isDoh = (r.tags || []).includes("doh");
  if (!isDoh) continue;

  // Check for English ingredient names
  // Exclude words that are identical in Swedish and English (salt, pepper → peppar already excluded)
  const englishPatterns = /\b(chicken|beef|pork|fish|salmon|shrimp|garlic|onion|sugar|flour|butter|cream|cheese|milk|egg|water|fresh|dried|chopped|minced|sliced|diced|grated|crushed|to taste|optional|boneless|skinless)\b/i;
  for (const ing of r.ingredients || []) {
    if (englishPatterns.test(ing)) {
      addIssue("doh", "🟡", r.id, r.title, `Möjligt engelskt ord i ingrediens: "${ing}"`);
    }
  }

  // Double parentheses
  for (const ing of r.ingredients || []) {
    const parenCount = (ing.match(/\(/g) || []).length;
    if (parenCount > 1) {
      addIssue("doh", "🟡", r.id, r.title, `Dubbla parenteser i ingrediens: "${ing}"`);
    }
  }

  // Missing time tag that should have been added
  if (r.time && r.time <= 30 && !(r.tags || []).includes("vardag30")) {
    addIssue("doh", "🟡", r.id, r.title, `doh-recept med time=${r.time} saknar vardag30`);
  }
}

// ─── Generate report ──────────────────────────────────────────────────────
const categoryNames = {
  structural: "1. Strukturella fel",
  tags: "2. Tagg-inkonsekvenser",
  ingredients: "3. Ingrediens-parsningsproblem",
  protein: "4. Protein-korrekthet",
  cookability: "5. Kokbarhetsproblem",
  doh: "6. DOH-specifika problem",
};

const severityOrder = { "🔴": 0, "🟡": 1, "🟢": 2 };

let report = `# Receptkvalitetsrevision — ${new Date().toISOString().slice(0, 10)}

**Totalt antal recept:** ${recipes.length}
**Genererat:** ${new Date().toISOString().slice(0, 19).replace("T", " ")}

## Sammanfattning

| Kategori | 🔴 Kritisk | 🟡 Varning | 🟢 Info | Totalt |
|----------|-----------|-----------|---------|--------|
`;

let totalAll = 0;
for (const [cat, name] of Object.entries(categoryNames)) {
  const items = issues[cat];
  const red = items.filter(i => i.severity === "🔴").length;
  const yellow = items.filter(i => i.severity === "🟡").length;
  const green = items.filter(i => i.severity === "🟢").length;
  const total = items.length;
  totalAll += total;
  report += `| ${name} | ${red} | ${yellow} | ${green} | ${total} |\n`;
}
report += `| **Totalt** | ${Object.values(issues).flat().filter(i => i.severity === "🔴").length} | ${Object.values(issues).flat().filter(i => i.severity === "🟡").length} | ${Object.values(issues).flat().filter(i => i.severity === "🟢").length} | ${totalAll} |\n`;

report += `\n---\n\n`;

for (const [cat, name] of Object.entries(categoryNames)) {
  const items = issues[cat].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  report += `## ${name}\n\n`;
  if (items.length === 0) {
    report += `Inga problem hittade.\n\n`;
  } else {
    for (const item of items) {
      report += `- ${item.severity} **#${item.recipeId}** ${item.title} — ${item.message}\n`;
    }
    report += `\n`;
  }
}

// Write report
mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(join(ROOT, "docs", "recipe-quality-audit.md"), report, "utf-8");

// Console summary
console.log(`\n=== Receptkvalitetsrevision klar ===`);
console.log(`Totalt: ${totalAll} problem i ${recipes.length} recept`);
for (const [cat, name] of Object.entries(categoryNames)) {
  const count = issues[cat].length;
  if (count > 0) console.log(`  ${name}: ${count}`);
}
console.log(`\nRapport skriven till docs/recipe-quality-audit.md`);

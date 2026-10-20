// Mappar mellan Supabase-rader (snake_case) och appens recept-format (camelCase).
// Kanonisk källa för fältnamn: scripts/migrate-to-supabase.mjs (buildRecipesRows).
// Hook: tests/data-mapper.test.js körs av PostToolUse-hooken vid Edit av denna fil.
//
// Rena funktioner — inga sidoeffekter, inga imports, kan köras i både Node och browser.

export function recipeFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    title: row.title,
    tested: row.tested === true,
    servings: row.servings ?? null,
    time: row.time ?? null,
    timeNote: row.time_note ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    protein: row.protein ?? null,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
    notes: row.notes ?? null,
    seasons: Array.isArray(row.seasons) ? row.seasons : [],
    // Källänk (migration 014). Saknas kolumnen i raden → null, precis som tomt.
    sourceUrl: row.source_url ?? null,
  };
}

export function recipeToRow(recipe, householdId) {
  if (!recipe || typeof recipe !== 'object') return null;
  return {
    id: recipe.id,
    household_id: householdId,
    title: recipe.title,
    tested: recipe.tested === true,
    servings: recipe.servings ?? null,
    time: recipe.time ?? null,
    time_note: recipe.timeNote ?? null,
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    protein: recipe.protein ?? null,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    notes: recipe.notes ?? null,
    seasons: Array.isArray(recipe.seasons) ? recipe.seasons : [],
    // source_url skrivs BARA när ett värde finns: innan migration 014 körts
    // saknas kolumnen, och PostgREST avvisar hela skrivningen för en okänd
    // kolumn — editorns spara får inte gå sönder av en null.
    ...(recipe.sourceUrl ? { source_url: recipe.sourceUrl } : {}),
  };
}

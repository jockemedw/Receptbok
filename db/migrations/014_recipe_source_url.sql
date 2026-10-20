-- 014: källänk på recept (ny design 2026-10, docs/design/HANDOFF-ny-design.md).
--
-- Importerade recept har hittills bara burit källan som fritext i `notes`
-- ("Källa: <originaltitel>, dishingouthealth.com"). Receptdetaljen länkar nu
-- till originalet, och bildhämtningen (scripts/recipe-images/fetch-images.mjs)
-- utgår från samma länk. Bilderna själva ligger INTE i databasen utan som
-- webp-kopior i repot (images/recipes/r<id>.webp, manifest js/recipe-images.js).
--
-- Idempotent: kan köras flera gånger. Appen läser kolumnen om den finns och
-- skriver den bara när ett värde faktiskt finns (js/data-mapper.js), så koden
-- fungerar både före och efter körningen.
--
-- Del A: kolumnen.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS source_url text;
COMMENT ON COLUMN public.recipes.source_url IS 'Länk till receptets original (t.ex. dishingouthealth.com). Null = eget/okänt ursprung.';

-- Del B: återfyllnad för dishingouthealth-recepten. Genereras av
-- `node scripts/recipe-images/fetch-images.mjs` (skriver om allt under markören).
-- Villkoret på titel skyddar mot id som återanvänts för ett annat recept.
-- >>> BACKFILL:START (genererat — redigera inte för hand)
-- (ännu inte genererat)
-- <<< BACKFILL:END

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
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/matvetesallad-med-grona-arter-och-krispig-halloumi/' WHERE id = 2 AND title = 'Matvetesallad med gröna ärter och krispig halloumi' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/matvetesallad-med-grona-arter-och-krispig-halloumi/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/stekta-rodspattafileer-med-stuvade-morotter/' WHERE id = 3 AND title = 'Stekta rödspättafiléer med stuvade morötter' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/stekta-rodspattafileer-med-stuvade-morotter/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/marinerad-kyckling-med-curry-cashewnotssas/' WHERE id = 4 AND title = 'Marinerad kyckling med curry-cashewnötssås' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/marinerad-kyckling-med-curry-cashewnotssas/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/buljongsoppa-med-shiitakesvamp-och-pocherat-agg/' WHERE id = 5 AND title = 'Buljongsoppa med shiitakesvamp och pocherat ägg' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/buljongsoppa-med-shiitakesvamp-och-pocherat-agg/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/tomatsoppa-med-pizzasnurror/' WHERE id = 7 AND title = 'Tomatsoppa med pizzasnurror' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/tomatsoppa-med-pizzasnurror/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/buljongprimorsoppa-med-kycklingfrikadeller/' WHERE id = 8 AND title = 'Buljongprimörsoppa med kycklingfrikadeller' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/buljongprimorsoppa-med-kycklingfrikadeller/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/blomkalssoppa-med-bacontopping/' WHERE id = 9 AND title = 'Blomkålssoppa med bacontopping' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/blomkalssoppa-med-bacontopping/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/ramen-med-salladskal-och-champinjoner/' WHERE id = 10 AND title = 'Ramen med salladskål och champinjoner' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/ramen-med-salladskal-och-champinjoner/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/quinoabollar/' WHERE id = 11 AND title = 'Quinoabollar' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/quinoabollar/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/vinterwok-med-brysselkal-svamp-och-jordartskocka/' WHERE id = 12 AND title = 'Vinterwok med brysselkål, svamp och jordärtskocka' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/vinterwok-med-brysselkal-svamp-och-jordartskocka/';
UPDATE public.recipes SET source_url = 'https://www.koket.se/belugabouillabaisse' WHERE id = 14 AND title = 'Belugabouillabaisse' AND source_url IS DISTINCT FROM 'https://www.koket.se/belugabouillabaisse';
UPDATE public.recipes SET source_url = 'https://www.koket.se/masala-med-kikartor' WHERE id = 15 AND title = 'Tikka masala med kikärtor och vitlöksnaan' AND source_url IS DISTINCT FROM 'https://www.koket.se/masala-med-kikartor';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/pepprig-auberginepasta/' WHERE id = 31 AND title = 'Pepprig pastasås med aubergine' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/pepprig-auberginepasta/';
UPDATE public.recipes SET source_url = 'https://www.koket.se/sotpotatissallad-med-fetaost-och-hot-honey-dressing' WHERE id = 43 AND title = 'Sötpotatissallad med fetaost och hot honey-dressing' AND source_url IS DISTINCT FROM 'https://www.koket.se/sotpotatissallad-med-fetaost-och-hot-honey-dressing';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/skaldjurslasagne/' WHERE id = 47 AND title = 'Skaldjurslasagne' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/skaldjurslasagne/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/pulled-chicken/' WHERE id = 48 AND title = 'Pulled chicken' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/pulled-chicken/';
UPDATE public.recipes SET source_url = 'https://www.coop.se/recept/pasta-rosso-med-vitloksfrasta-champinjoner/' WHERE id = 56 AND title = 'Pasta Rosso med champinjoner' AND source_url IS DISTINCT FROM 'https://www.coop.se/recept/pasta-rosso-med-vitloksfrasta-champinjoner/';
UPDATE public.recipes SET source_url = 'https://www.koket.se/chopped-sallad-med-kramig-dressing' WHERE id = 63 AND title = 'Chopped sallad med krämig dressing' AND source_url IS DISTINCT FROM 'https://www.koket.se/chopped-sallad-med-kramig-dressing';
-- <<< BACKFILL:END

#!/usr/bin/env node
// Skriver miniatyrer (images/recipes/thumbs/r<id>.webp) för ALLA receptbilder och
// skriver om manifestet (id:n, AI-mängd, innehållshash). Bildskripten gör detta
// själva för de bilder de skriver — det här är för hela mängden, t.ex. efter en
// manuellt inlagd bild.
//
//   node scripts/recipe-images/make-thumbs.mjs
import { THUMB_SIZE, existingImageIds, loadAi, writeManifest, writeThumbs } from './_manifest.mjs';

const ids = existingImageIds();
await writeThumbs(ids);
writeManifest(ids, new Set(loadAi().images.map((x) => x.id)));
console.log(`${ids.size} miniatyrer à ${THUMB_SIZE}px + manifest`);

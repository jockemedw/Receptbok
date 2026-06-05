// ─── KORPUS-REGRESSION: Willys produktnamn → förväntad matchning ───────────
// Data-driven korpus med VERKLIGA produktnamnsmönster grupperade i klasser
// (drycker, smaksatt/dessert, färdigrätt, barnmat, djurmat, snacks, nötsmör,
// konserv-i-olja, växt-alternativ). Speglar samma beslutslogik som
// willys-search.js: en sökträff är en giltig match om den INTE avvisas och
// antingen har exakt canon eller är relevant.
//
// Syfte: låsa fast reject-härdningen (Session 80–81) klassvis och fånga
// regressioner där en grundingrediens-sökning råkar välja fel produkttyp.
//
// Kör: node tests/match-corpus.test.js   (inga deps)

import { rejectsMatch, extractOfferCanon, relevantToCanon } from "../api/_shared/willys-matcher.js";

let passed = 0, failed = 0;
const failures = [];

// Replikerar willys-search.js: giltig match = ej avvisad OCH (exakt canon ELLER relevant).
function isMatch(canon, name, brandLine = "") {
  const offer = { name, brandLine };
  if (rejectsMatch(canon, offer)) return false;
  if (extractOfferCanon(offer) === canon) return true;
  return relevantToCanon(canon, `${name} ${brandLine}`);
}

// corpus: [canon, produktnamn, brandLine, förväntad: true=ska matcha / false=ska INTE]
const CORPUS = [
  // ── Positiva: vanliga rätt-träffar ska fortsätta matcha ──
  ["mjölk", "Mellanmjölk 1,5%", "Arla", true],
  ["grädde", "Grädde 36%", "Arla", true],
  ["yoghurt", "Yoghurt Naturell 3%", "Arla", true],
  ["citron", "Citron Klass 1", "", true],
  ["lime", "Lime Klass 1", "", true],
  ["apelsin", "Apelsin Navel Klass 1", "", true],
  ["apelsin", "Apelsinjuice Färskpressad", "Bravo", true], // juice är OK
  ["sallad", "Sallad Blandad Klass 1", "", true],
  ["smör", "Normalsaltat Smör 500g", "Arla", true],
  ["köttfärs", "Nötfärs 12%", "Garant", true],
  ["sparris", "Färsk Grön Sparris", "", true],
  ["havregryn", "Havregryn", "AXA", true],

  // ── Drycker / läsk ──
  ["citron", "Citron Kolsyrat Vatten", "Loka", false],
  ["lime", "Lime Läsk Sockerfri", "Zingo", false],
  ["apelsin", "Apelsin Läsk", "Fanta", false],

  // ── Smaksatt / dessert (mejeri) ──
  ["yoghurt", "Samoa Original Yoghurt", "", false],
  ["yoghurt", "Yoghurt Jordgubb", "Yoggi", false],
  ["yoghurt", "Körsbär Yoghurt", "", false],
  ["mjölk", "Kondenserad Mjölk Sötad", "Nestlé", false],
  ["grädde", "Spraygrädde Vispgrädde 35%", "", false],
  ["grädde", "Vispgrädde 36%", "Arla", false], // befintligt designval: bar vispgrädde matchar ej generisk "grädde" (bedömningsfall, se rapport)
  ["smör", "Jordnötssmör Crunchy", "", false],
  ["smör", "Mikropopcorn Smör", "Garant", false],

  // ── Färdigrätter / sammansatta rätter (globalt) ──
  ["ost", "Mac & Cheese Färdigrätt", "Anamma", false],
  ["köttfärs", "Köttbullar Färdigrätt", "Dafgård", false],
  ["fisk", "Panerad Torskfilé", "Findus", false],
  ["potatis", "Potatisgratäng Färdigrätt Micro", "Felix", false],

  // ── Barnmat ──
  ["kyckling", "Barnmat Kyckling & Ris 6 mån", "Semper", false],
  ["banan", "Klämmis Banan Äpple", "BabyFood", false],

  // ── Djurmat ──
  ["lax", "Kattmat Lax i Gelé", "Whiskas", false],
  ["kyckling", "Hundmat Kyckling", "Pedigree", false],

  // ── Snacks ──
  ["ost", "Ostbågar 150g", "OLW", false],

  // ── Bittra specialsallader ──
  ["sallad", "Salad Endive Frisé", "", false],

  // ── Vitlök-fällan (4E-rekon) ──
  ["vitlöksklyftor", "Lök Vit Stor Klass 1", "", false],
  ["vitlöksklyftor", "Vitlök Klass 1", "", true],
];

for (const [canon, name, brandLine, expected] of CORPUS) {
  const got = isMatch(canon, name, brandLine);
  if (got === expected) passed++;
  else {
    failed++;
    failures.push(`  ❌ [${canon}] "${name}" (${brandLine || "—"}) → fick ${got}, väntade ${expected}`);
  }
}

console.log(`\nKorpus: ${passed} passerade, ${failed} failade (${CORPUS.length} fall).`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("✓ Alla korpus-fall godkända.");

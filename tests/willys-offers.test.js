// Regressiontester för normalizeOffers (api/willys-offers.js).
// Körs med `node tests/willys-offers.test.js` — inga externa deps.
//
// Bevakar (Willys Plus-utforskning 2026-06-16):
//   1. LOYALTY-erbjudanden (Willys Plus) får loyalty:true, GENERAL får false
//   2. SubtotalOrderPromotion med threshold 0/null släpps in (klubbpriser:
//      kött/frukt som tidigare föll bort)
//   3. SubtotalOrderPromotion med threshold > 0 (villkorad ordersumma) skippas
//   4. MixMatch-beteendet är oförändrat (priser/saving)

import { normalizeOffers, isBulkVolume } from "../api/willys-offers.js";

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(actual, expected, desc) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`  ❌ ${desc}\n     förväntad: ${JSON.stringify(expected)}\n     faktisk:   ${JSON.stringify(actual)}`);
  }
}

// Representativa råobjekt från willys.se PERSONAL_GENERAL (2026-06-16).
const RAW = [
  // LOYALTY MixMatch — fångades redan tidigare, ska nu märkas Willys Plus.
  {
    code: "100379305_ST", name: "Brie 33%", productLine2: "KOLIBRIE, 500g",
    priceValue: 64.26, savingsAmount: 14.36, comparePrice: "128,52 kr", priceUnit: "kr/st",
    potentialPromotions: [{
      promotionType: "MixMatchPricePromotion", campaignType: "LOYALTY",
      price: { value: 49.9 }, threshold: null, qualifyingCount: 1,
      realMixAndMatch: false, conditionLabel: "Spara 14,36 kr/st", validUntil: 1782079199000,
    }],
  },
  // LOYALTY SubtotalOrderPromotion, threshold 0 — föll bort förut, ska nu med.
  {
    code: "100966616_KG", name: "Oxfilé Hel Brasilien", productLine2: "NATURKÖTT, ca: 1.8kg",
    priceValue: 369.0, savingsAmount: 100.0, comparePrice: "369,00 kr", priceUnit: "kr/kg",
    potentialPromotions: [{
      promotionType: "SubtotalOrderPromotion", campaignType: "LOYALTY",
      price: { value: 269.0 }, threshold: 0.0, qualifyingCount: null,
      realMixAndMatch: false, conditionLabel: "Spara 100,00 kr/kg", validUntil: 1782079199000,
    }],
  },
  // GENERAL MixMatch — vanlig rea, loyalty:false.
  {
    code: "200000001_ST", name: "Pasta Penne", productLine2: "BARILLA, 500g",
    priceValue: 22.0, savingsAmount: 7.0, comparePrice: "30,00 kr", priceUnit: "kr/st",
    potentialPromotions: [{
      promotionType: "MixMatchPricePromotion", campaignType: "GENERAL",
      price: { value: 15.0 }, threshold: null, qualifyingCount: 1,
      realMixAndMatch: false, conditionLabel: "Spara 7,00 kr/st", validUntil: 1785707999000,
    }],
  },
  // SubtotalOrderPromotion MED threshold > 0 — villkorad av ordersumma, ska skippas.
  {
    code: "300000002_ST", name: "Kaffe Bryggmalet", productLine2: "GEVALIA, 450g",
    priceValue: 49.0, savingsAmount: 10.0, comparePrice: "...", priceUnit: "kr/st",
    potentialPromotions: [{
      promotionType: "SubtotalOrderPromotion", campaignType: "LOYALTY",
      price: { value: 39.0 }, threshold: 200.0, qualifyingCount: null,
      realMixAndMatch: false, conditionLabel: "Vid köp över 200 kr", validUntil: 1782079199000,
    }],
  },
  // Promo-typ vi inte hanterar alls — ska skippas (oförändrat beteende).
  {
    code: "400000003_ST", name: "Något Annat", productLine2: null,
    priceValue: 10.0, savingsAmount: 2.0,
    potentialPromotions: [{
      promotionType: "OkändPromoTyp", campaignType: "GENERAL",
      price: { value: 8.0 }, threshold: null,
    }],
  },
];

const offers = normalizeOffers(RAW);
const byCode = Object.fromEntries(offers.map((o) => [o.code, o]));

// 1. Rätt antal erbjudanden kommer igenom (Brie, Oxfilé, Pasta = 3).
assertEq(offers.length, 3, "normalizeOffers släpper igenom exakt de matchbara (3 st)");

// 2. LOYALTY-flaggan sätts korrekt.
assertEq(byCode["100379305_ST"]?.loyalty, true, "Brie (LOYALTY) → loyalty:true");
assertEq(byCode["100966616_KG"]?.loyalty, true, "Oxfilé (LOYALTY) → loyalty:true");
assertEq(byCode["200000001_ST"]?.loyalty, false, "Pasta (GENERAL) → loyalty:false");

// 3. SubtotalOrderPromotion med threshold 0 kommer in med rätt priser/saving.
assertEq(byCode["100966616_KG"]?.regularPrice, 369.0, "Oxfilé regularPrice = 369");
assertEq(byCode["100966616_KG"]?.promoPrice, 269.0, "Oxfilé promoPrice = 269");
assertEq(byCode["100966616_KG"]?.savingPerUnit, 100.0, "Oxfilé savingPerUnit = 100");

// 4. SubtotalOrderPromotion med threshold > 0 skippas (villkorad ordersumma).
assertEq(byCode["300000002_ST"], undefined, "Kaffe (threshold 200) skippas");

// 5. Okänd promo-typ skippas fortfarande.
assertEq(byCode["400000003_ST"], undefined, "Okänd promo-typ skippas");

// 6. MixMatch-beteendet oförändrat (Brie-priser intakta).
assertEq(byCode["100379305_ST"]?.promoPrice, 49.9, "Brie promoPrice = 49.9 (oförändrat)");
assertEq(byCode["100379305_ST"]?.savingPerUnit, 14.36, "Brie savingPerUnit = 14.36 (oförändrat)");

// 7. Storpack-flagga (isBulkVolume): ≥1 kg/1 l = bulk.
assertEq(isBulkVolume("2kg"), true, "2kg = storpack");
assertEq(isBulkVolume("1,5l"), true, "1,5l = storpack");
assertEq(isBulkVolume("ca: 1.8kg"), true, "ca 1.8kg = storpack");
assertEq(isBulkVolume("500g"), false, "500g = ej storpack");
assertEq(isBulkVolume("830g"), false, "830g = ej storpack");
assertEq(isBulkVolume("10p"), false, "10p (antal) = ej storpack");
assertEq(isBulkVolume(""), false, "tom volym = ej storpack");
assertEq(isBulkVolume(null), false, "null volym = ej storpack");

console.log(`\nwillys-offers.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}

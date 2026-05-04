#!/usr/bin/env node
// Konservativ kök-klassificerare baserad på signaturord i titel + ingredienser.
// Default: dry-run (rapport). Med --apply skriver tillbaka recipes.json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RECIPES_PATH = path.join(REPO_ROOT, 'recipes.json');

// Befintliga + nya kök
const ALL_KOK = ['asiatiskt','indiskt','japanskt','koreanskt','kinesiskt','thailändskt','vietnamesiskt','italienskt','mexikanskt','medelhavet','mellanöstern','franskt'];

// Signaturord — väldigt distinkta för köket. Träff i titel = 95%+ konfidens.
const TITLE_SIGNATURES = {
  italienskt:    [/\blasagn/i, /\brisotto\b/i, /\bcarbonara\b/i, /\bbolognese\b/i, /\bgnocchi\b/i, /\bravioli\b/i, /\bfrittat/i, /\bbruschett/i, /\bpolenta\b/i, /\bcaprese\b/i, /\bminestrone\b/i, /\bpiccata\b/i, /\bparmigian/i, /\bcacio e pep/i, /\bortolana\b/i, /\bpest[oa]\b/i, /\baglio e olio\b/i, /\bcalzone\b/i, /\bfocaccia\b/i, /\bpanzanell/i, /\barrabbiat/i, /\bal limone\b/i, /\bal forno\b/i],
  mexikanskt:    [/\btaco/i, /\benchilad/i, /\bquesadill/i, /\bfajit/i, /\bburrito/i, /\btostad/i, /\bchilaquil/i, /\bmexikansk/i, /\bchipotle\b/i, /\bguacamole\b/i, /\bsalsa verde\b/i, /\bmole\b/i, /\bcarnitas\b/i, /\belote\b/i, /\bpico de gallo\b/i, /\bnachos\b/i],
  japanskt:      [/\bramen\b/i, /\bsushi\b/i, /\bteriyaki\b/i, /\btempura\b/i, /\bgyoza\b/i, /\budon\b/i, /\bsoba\b/i, /\bdonburi\b/i, /\btonkatsu\b/i, /\bkatsu\b/i, /\byakitori\b/i, /\bonigiri\b/i, /\bjapansk/i, /\boyakodon\b/i, /\bmiso(soppa)?\b/i],
  koreanskt:     [/\bkimchi\b/i, /\bbulgogi\b/i, /\bbibimbap\b/i, /\bgochujang\b/i, /\bjapchae\b/i, /\btteok/i, /\bkoreansk/i, /\bbanchan\b/i],
  indiskt:       [/\bcurry\b/i, /\bmasala\b/i, /\btikka\b/i, /\bbiryani\b/i, /\bnaan\b/i, /\bsamosa\b/i, /\bkorma\b/i, /\bvindaloo\b/i, /\bpalak\b/i, /\btandoori\b/i, /\bindisk/i, /\bdal\b/i, /\bchana\b/i, /\bsaag\b/i, /\bpaneer\b/i],
  thailändskt:   [/\bpad thai\b/i, /\btom yum\b/i, /\btom kha\b/i, /\bpanang\b/i, /\bmassaman\b/i, /\blarb\b/i, /\bthailändsk/i, /\bthai-/i, /\bthai\s/i, /\bsom tam\b/i],
  vietnamesiskt: [/\bpho\b/i, /\bbanh mi\b/i, /\bvietname/i, /\bbun cha\b/i, /\bgoi cuon\b/i, /\bvarmrullar\b/i],
  kinesiskt:     [/\bchow mein\b/i, /\blo mein\b/i, /\bkung pao\b/i, /\bmapo\b/i, /\bdim sum\b/i, /\bkines/i, /\bsweet and sour\b/i, /\bgeneral tso/i, /\bhoisin/i, /\bschezuan\b/i, /\bsichuan\b/i],
  medelhavet:    [/\bgrekisk/i, /\btzatziki\b/i, /\bgyros\b/i, /\bsouvlaki\b/i, /\bspanakopita\b/i, /\bdolma\b/i, /\bmoussaka\b/i, /\bhummus\b/i, /\btabbouleh\b/i, /\bfalafel\b/i, /\bbaba ghanoush\b/i, /\bshakshuka\b/i, /\bmedelhav/i, /\bgazpacho\b/i, /\bpaella\b/i, /\bromesco\b/i, /\bmuhammara\b/i, /\borzo(sallad)?\b/i, /\bsigaler/i],
  'mellanöstern':[/\bharissa\b/i, /\bmarockansk/i, /\bza'atar\b/i, /\bzaatar\b/i, /\bsumak\b/i, /\bshawarma\b/i, /\bkebab\b/i, /\btagine\b/i, /\bkofta\b/i, /\bras el hanout\b/i, /\bpersisk/i, /\blibanesisk/i, /\bturk(isk)?(a)?\b/i, /\bbaharat\b/i],
  franskt:       [/\bratatouille\b/i, /\bcoq au vin\b/i, /\bcassoulet\b/i, /\bni[cç]oise\b/i, /\bquiche\b/i, /\bcrépes?\b/i, /\bbeurre blanc\b/i, /\bbouillabaisse\b/i, /\bbeluga(bouillabaisse)?\b/i, /\btartiflette\b/i, /\bblanquette\b/i],
};

// Ingrediens-signaturer — mycket distinkta. ≥2 träffar = stark indikator.
const INGREDIENT_SIGNATURES = {
  italienskt:   [/parmesan/i, /pecorino/i, /mozzarella/i, /ricotta/i, /pancetta/i, /prosciutto/i, /balsamvinäger/i, /balsamico/i, /\bpest[oa]\b/i, /\bgremolata\b/i, /\boregano\b/i, /färsk.*basilika/i, /soltorkad.*tomat/i, /pinjenöt/i, /\barborioris\b/i, /tagliatelle|spaghetti|penne|rigatoni|orecchiette|pappardelle|fettuccine|fusilli|farfalle|linguine|tortellini|cannelloni/i],
  mexikanskt:   [/\btortilla/i, /chipotle/i, /adobosås/i, /\bcotija\b/i, /\btomatill/i, /\bjalape[nñ]o/i, /majsmjöl.*tortilla/i, /majstortilla/i, /vetetortilla/i, /svarta\s+bönor/i, /pinto.*bön/i, /spiskumm.*koriander/i, /lime.*koriander/i, /poblano/i],
  japanskt:     [/miso(pasta)?/i, /\bmirin\b/i, /\bdashi\b/i, /\bnori\b/i, /\bsake\b/i, /\bpanko\b/i, /\bedamame\b/i, /shiitake/i, /\bwasabi\b/i, /\bteriyaki\b/i, /\bsoba\b/i, /\budon\b/i, /\briksvinäger/i, /sushiris/i, /rostat\s+sesam/i],
  koreanskt:    [/\bkimchi\b/i, /gochujang/i, /\bgochugaru\b/i, /koreansk.*chili/i, /sesamolj.*sojasås.*ingefära/i],
  indiskt:      [/garam masala/i, /\bgurkmeja\b/i, /\bkardemumma\b/i, /\bkurry/i, /\bcurrybl/i, /\bghee\b/i, /\bpaneer\b/i, /basmatiris/i, /\bpapadum\b/i, /tikka.*mas/i, /chana masala/i, /\btamarind/i, /spiskummin.*koriander.*gurkmeja/i, /\bsenapsfrön\b/i, /\bsvartpeppar.*kardemumma\b/i, /röda?\s+linser/i, /chana(\s+dal)?/i],
  thailändskt:  [/fisksås/i, /citrongräs/i, /galangal/i, /thai.*basilika/i, /thaibasilika/i, /kaffirlim/i, /palmsocker/i, /röd.*curry.*pasta/i, /grön.*curry.*pasta/i, /\btom yum/i, /thai.*chili/i, /jasminris/i, /sriracha.*lime/i, /kokosmjölk.*citrongräs/i],
  vietnamesiskt:[/risnudl/i, /vietnam/i, /\brispappers?(blad|rullar)/i, /sriracha.*koriander.*lime/i],
  kinesiskt:    [/hoisin/i, /ostronsås/i, /shaoxing/i, /sichuan/i, /femkrydd/i, /kinesisk.*kål/i, /pak\s*choi/i, /bok\s*choy/i],
  medelhavet:   [/\bfeta\b/i, /kalamataoliv/i, /tahini/i, /tzatziki/i, /\bkikärt/i, /halloumi/i, /\bfilo\b/i, /\bfilodeg\b/i, /färsk.*mynta/i, /färsk.*persilja/i, /citron.*olivolja/i, /\bbulgur\b/i, /\borzo\b/i, /\bfreekeh\b/i, /\bfarro\b/i, /\bpita(bröd)?\b/i],
  'mellanöstern':[/\bharissa\b/i, /za'atar/i, /zaatar/i, /\bsumak\b/i, /ras el hanout/i, /\bberber/i, /\bdukkah\b/i, /granatäppel(kärnor|sirap)/i, /preserverad.*citron/i, /aleppopepp/i, /baharat/i, /russin.*mandel/i, /spiskumm.*kanel.*allspice/i, /pärlec?ouscous/i, /\bcouscous\b/i],
  franskt:      [/dijonsenap/i, /herbes de provence/i, /vit.*vin.*cognac/i, /\bbeurre\b/i, /\bgruyère\b/i, /\bcr[eè]me fra[iî]che\b/i, /shall?ottenlök.*vit\s+vinäger/i, /\bestrag/i, /\bquatre épices\b/i],
  asiatiskt:    [/sojasås/i, /sesamolja/i, /risvinäger/i, /sambal oelek/i, /\bingefära\b/i, /\briksvin\b/i, /\bvattenkastanj/i, /\btofu\b/i, /\btempeh\b/i],
};

function hasExistingKok(recipe) {
  return recipe.tags.some(t => ALL_KOK.includes(t));
}

function classify(recipe) {
  const titleScore  = {};
  const ingrScore   = {};

  // Titel-träffar (mycket stark signal)
  for (const [kok, patterns] of Object.entries(TITLE_SIGNATURES)) {
    for (const p of patterns) {
      if (p.test(recipe.title)) {
        titleScore[kok] = (titleScore[kok] || 0) + 1;
      }
    }
  }

  // Specialfall: "röd curry" och "grön curry" är thailändskt, inte indiskt
  if (/röd\s+curry|grön\s+curry/i.test(recipe.title)) {
    if (titleScore.indiskt) {
      titleScore.indiskt--;
      if (titleScore.indiskt === 0) delete titleScore.indiskt;
    }
    titleScore.thailändskt = (titleScore.thailändskt || 0) + 1;
  }

  // Ingrediens-träffar
  const ingText = recipe.ingredients.join('\n');
  for (const [kok, patterns] of Object.entries(INGREDIENT_SIGNATURES)) {
    for (const p of patterns) {
      if (p.test(ingText)) {
        ingrScore[kok] = (ingrScore[kok] || 0) + 1;
      }
    }
  }

  // Beräkna konfidens per kök
  const candidates = {};
  const allKok = new Set([...Object.keys(titleScore), ...Object.keys(ingrScore)]);
  for (const kok of allKok) {
    const t = titleScore[kok] || 0;
    const i = ingrScore[kok] || 0;
    candidates[kok] = { titleHits: t, ingrHits: i, score: t * 10 + i };
  }

  // Sortera, högst först
  const sorted = Object.entries(candidates).sort((a, b) => b[1].score - a[1].score);

  if (sorted.length === 0) return null;
  const [topKok, topData] = sorted[0];
  const second = sorted[1];

  // ~80% regler:
  //   A) Titel-signatur (≥1 titel-träff) — distinkt namnord
  //   B) ELLER ≥2 ingrediens-träffar i samma kök
  //   C) Plus: andraplatsen ska ha lägre score (≥5 marginal)
  const isTitleHit = topData.titleHits >= 1;
  const isIngHit   = topData.ingrHits >= 2;
  const margin = topData.score - (second?.[1].score || 0);
  const dominant = margin >= 5;

  if ((isTitleHit || isIngHit) && dominant) {
    return { kok: topKok, score: topData, margin, runnerUp: second };
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(RECIPES_PATH, 'utf-8'));
const apply = process.argv.includes('--apply');

const proposals = [];
const skipped = [];

for (const r of data.recipes) {
  if (hasExistingKok(r)) continue;
  const result = classify(r);
  if (result) {
    proposals.push({ id: r.id, title: r.title, kok: result.kok, score: result.score, margin: result.margin });
  } else {
    skipped.push({ id: r.id, title: r.title });
  }
}

// Rapport
const byKok = {};
for (const p of proposals) {
  byKok[p.kok] = (byKok[p.kok] || []);
  byKok[p.kok].push(p);
}

console.log(`\n=== KÖK-KLASSIFICERING (${apply ? 'APPLY-LÄGE' : 'TORR-KÖRNING'}) ===\n`);
console.log(`Recept utan kök: ${data.recipes.filter(r => !hasExistingKok(r)).length}`);
console.log(`Förslag: ${proposals.length}`);
console.log(`Skippade (för osäkra): ${skipped.length}\n`);

for (const [kok, items] of Object.entries(byKok).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`### ${kok} — ${items.length} st`);
  for (const it of items) {
    console.log(`  ${it.id}: ${it.title}  [titel:${it.score.titleHits} ingr:${it.score.ingrHits} margin:${it.margin}]`);
  }
  console.log();
}

if (!apply) {
  console.log('--- DRY RUN: kör med --apply för att skriva ändringar.');
} else {
  // Applicera
  for (const p of proposals) {
    const r = data.recipes.find(x => x.id === p.id);
    if (r && !r.tags.includes(p.kok)) {
      r.tags.push(p.kok);
    }
  }
  data.meta.lastUpdated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(RECIPES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`✓ Skrev ${RECIPES_PATH} — ${proposals.length} recept fick kök-tag.`);
}

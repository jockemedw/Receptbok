// Willys cart-API PoC — Session 36
//
// Syfte: verifiera att vi kan (1) hämta CSRF-token, (2) POSTa addProducts,
// (3) verifiera att varan hamnade i korgen. Ingen production-kod — rent experiment.
//
// Använd:
//   1. Skapa filen scripts/.willys-cookies.local med raw cookie-strängen
//      (copy-paste "Cookie:"-headern från Chrome devtools, utan "Cookie: "-prefixet)
//   2. node scripts/willys-cart-poc.mjs
//
// Testprodukt hårdkodad (Naturell Kefir 2,5% — 101684762_ST, från rekon).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '.willys-cookies.local');
const TEST_PRODUCT = '101684762_ST';
const BASE = 'https://www.willys.se';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

function loadCookies() {
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error(`✗ Saknas: ${COOKIES_FILE}`);
    console.error(`  Skapa den med cookies-strängen från din browser (Chrome devtools → Application → Cookies, eller copy as cURL och extrahera -b-värdet).`);
    process.exit(1);
  }
  const raw = fs.readFileSync(COOKIES_FILE, 'utf8').trim();
  if (!raw) { console.error('✗ Tom cookies-fil.'); process.exit(1); }
  // Snabbkoll — kritiska cookies för auth
  const hasSession = /JSESSIONID=/.test(raw);
  const hasRemember = /axfoodRememberMe=/.test(raw);
  if (!hasSession) console.warn('⚠ Ingen JSESSIONID i cookies — sessionen kan vara utgången.');
  if (!hasRemember) console.warn('⚠ Ingen axfoodRememberMe i cookies — vi har ingen backup om sessionen gått ut.');
  return raw;
}

async function tryFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'user-agent': UA,
      'accept': '*/*',
      'accept-language': 'sv-SE,sv;q=0.9',
      ...opts.headers,
    },
  });
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text };
}

// --- Steg 1: hitta CSRF-token ---
// Willys sätter troligen token som HTML-meta på sidladdning, eller har dedikerad endpoint.
// Vi provar flera strategier i ordning.
function logCsrfHeaders(label, headers) {
  const hits = Object.entries(headers).filter(([k, v]) =>
    /csrf|x-csrf|token/i.test(k) || /csrf/i.test(String(v || ''))
  );
  if (hits.length) {
    console.log(`   ${label}: response-headers med csrf/token:`);
    hits.forEach(([k, v]) => console.log(`     ${k}: ${String(v).slice(0, 100)}`));
  }
}

async function findCsrfToken(cookies) {
  console.log('→ Steg 1: letar CSRF-token...');

  // Strategi A: dedikerad endpoint (Hybris + Axfood-varianter)
  const candidates = [
    '/axfood/rest/csrf',
    '/axfood/rest/csrfToken',
    '/axfood/rest/session/csrf',
    '/axfood/rest/user/csrf',
    '/rest/v2/csrf',
    '/authorizationserver/csrf',
  ];
  for (const candidate of candidates) {
    const r = await tryFetch(BASE + candidate, { headers: { cookie: cookies } });
    console.log(`   A: GET ${candidate} → ${r.status} (body: ${r.text.slice(0, 80).replace(/\s+/g, ' ')})`);
    logCsrfHeaders('A', r.headers);
    if (r.status === 200) {
      const trimmed = r.text.trim();
      if (/^[0-9a-f-]{30,}$/.test(trimmed)) {
        console.log(`   ✓ CSRF via ${candidate} (plaintext): ${trimmed.slice(0, 12)}...`);
        return trimmed;
      }
      try {
        const j = JSON.parse(trimmed);
        const tok = j.token || j.csrfToken || j.value;
        if (tok) {
          console.log(`   ✓ CSRF via ${candidate} (JSON): ${String(tok).slice(0, 12)}...`);
          return tok;
        }
      } catch {}
    }
  }

  // Strategi B: skrapa homepage för inbäddad token
  console.log('   B: skrapar homepage HTML + response-headers...');
  const home = await tryFetch(BASE + '/', { headers: { cookie: cookies } });
  console.log(`   B: GET / → ${home.status} (${home.text.length} bytes)`);
  logCsrfHeaders('B', home.headers);
  if (home.status === 200) {
    const patterns = [
      /name=["']_csrf["']\s+content=["']([^"']+)["']/i,
      /name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
      /csrfToken["']?\s*[:=]\s*["']([a-f0-9-]{30,})["']/i,
      /CSRF[_-]?TOKEN["']?\s*[:=]\s*["']([a-f0-9-]{30,})["']/i,
      /"csrf"\s*:\s*"([a-f0-9-]{30,})"/i,
      /"_csrf"\s*:\s*"([a-f0-9-]{30,})"/i,
      /x-csrf-token["']?\s*[:=]\s*["']([a-f0-9-]{30,})["']/i,
    ];
    for (const re of patterns) {
      const m = home.text.match(re);
      if (m) {
        console.log(`   ✓ CSRF via HTML-skrapning (${re.source.slice(0, 20)}...): ${m[1].slice(0, 12)}...`);
        return m[1];
      }
    }
    const csrfMentions = home.text.match(/.{0,40}csrf.{0,120}/gi);
    if (csrfMentions) {
      console.log('   B: "csrf"-omnämnanden (första 8):');
      csrfMentions.slice(0, 8).forEach(m => console.log('     ', m.replace(/\s+/g, ' ')));
    } else {
      console.log('   B: ingen "csrf"-sträng i HTML.');
    }
    // Sök UUIDs (även utan csrf-ordet) för inspektion
    const uuids = [...new Set(home.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || [])];
    if (uuids.length) {
      console.log(`   B: hittade ${uuids.length} UUID(s) i HTML (första 5):`);
      uuids.slice(0, 5).forEach(u => {
        const ctx = home.text.match(new RegExp('.{0,50}' + u + '.{0,50}'));
        console.log(`     ${u}  ←  ${ctx ? ctx[0].replace(/\s+/g, ' ').slice(0, 150) : ''}`);
      });
    }
  }

  // Strategi C: cart-GET kan returnera CSRF i response-header
  console.log('   C: GET /axfood/rest/cart (kollar response-headers)...');
  const cart = await tryFetch(BASE + '/axfood/rest/cart', { headers: { cookie: cookies } });
  console.log(`   C: GET /axfood/rest/cart → ${cart.status}`);
  logCsrfHeaders('C', cart.headers);
  for (const [k, v] of Object.entries(cart.headers)) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(v))) {
      console.log(`   ✓ UUID i header ${k}: ${v}`);
      return v;
    }
  }

  return null;
}

// --- Steg 2: POST addProducts ---
async function addToCart(cookies, csrf, productId) {
  console.log(`\n→ Steg 2: POST /axfood/rest/cart/addProducts med ${productId}...`);
  const body = JSON.stringify({
    products: [{
      productCodePost: productId,
      qty: 1,
      pickUnit: 'pieces',
      hideDiscountToolTip: false,
      noReplacementFlag: false,
    }],
  });
  const r = await tryFetch(BASE + '/axfood/rest/cart/addProducts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE,
      'referer': BASE + '/',
      'cookie': cookies,
      'x-csrf-token': csrf || '',
    },
    body,
  });
  console.log(`   status: ${r.status}`);
  console.log(`   body (första 500 tecken): ${r.text.slice(0, 500)}`);
  return r;
}

// --- Steg 3: verifiera att varan kom in ---
async function readCart(cookies) {
  console.log('\n→ Steg 3: GET /axfood/rest/cart för verifiering...');
  for (const url of ['/axfood/rest/cart', '/axfood/rest/cart/']) {
    const r = await tryFetch(BASE + url, { headers: { cookie: cookies } });
    console.log(`   GET ${url} → ${r.status}`);
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.text);
        const entries = j.entries || j.products || [];
        console.log(`   ✓ Cart innehåller ${entries.length} entries.`);
        console.log(`   Första 3:`, entries.slice(0, 3).map(e => ({
          code: e.product?.code || e.productCode || e.code,
          qty: e.quantity || e.qty,
          name: e.product?.name || e.name,
        })));
        return j;
      } catch (e) {
        console.log(`   body (första 500 tecken): ${r.text.slice(0, 500)}`);
      }
    }
  }
  return null;
}

(async () => {
  console.log('═'.repeat(60));
  console.log('Willys cart-API PoC');
  console.log('═'.repeat(60));

  const cookies = loadCookies();
  console.log(`✓ Cookies laddade (${cookies.length} tecken).\n`);

  const forcedCsrf = process.argv[2];
  let csrf;
  if (forcedCsrf) {
    console.log(`→ CSRF-token från argv: ${forcedCsrf.slice(0, 12)}... (hoppar över auto-detect)\n`);
    csrf = forcedCsrf;
  } else {
    csrf = await findCsrfToken(cookies);
    if (!csrf) {
      console.log('\n✗ Kunde inte hitta CSRF-token. Provar ändå utan — kommer misslyckas med 401.');
    }
  }

  const postResult = await addToCart(cookies, csrf, TEST_PRODUCT);

  if (postResult.status === 200 || postResult.status === 201) {
    console.log('\n🎉 addProducts svarade OK.');
  } else if (postResult.status === 403) {
    console.log('\n⚠ 403 Forbidden — CSRF-token saknas/felaktig eller session utgången.');
  } else if (postResult.status === 401) {
    console.log('\n⚠ 401 Unauthorized — sessionen utgången, fräscha cookies behövs.');
  } else {
    console.log(`\n⚠ Oväntat statusläge: ${postResult.status}.`);
  }

  await readCart(cookies);

  console.log('\n' + '═'.repeat(60));
  console.log('Klart. Kolla även i browsern att varan finns i korgen.');
})().catch(e => {
  console.error('\n✗ Oväntat fel:', e);
  process.exit(1);
});

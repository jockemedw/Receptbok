// Tester för api/import-recipe.js: SSRF-skyddet isPrivateIp(), redirect-hämtningen,
// protein-/tagg-ifyllnaden av Gemini-utkast och felsvaren.
// Kör med `node tests/import-recipe.test.js` — beroendefritt.
//
// isPrivateIp avgör om en URL-imports uppslagna IP pekar mot ett internt/privat
// nät (SSRF). Felklassning här = säkerhetshål, så vi låser beteendet med tester.

import importHandler, {
  isPrivateIp, guessProtein, normalizeGeminiRecipe, fetchFollowingRedirects, isForeignUrl, handlePhoto,
} from "../api/import-recipe.js";

let passed = 0, failed = 0;
const failures = [];
function check(ip, expected, desc) {
  const actual = isPrivateIp(ip);
  if (actual === expected) passed++;
  else { failed++; failures.push(`  FAIL ${desc} (${ip}) → fick ${actual}, väntade ${expected}`); }
}

// ─── Privata/interna IPv4 — ska BLOCKERAS (true) ─────────────────────────────
check("127.0.0.1", true, "loopback");
check("127.255.255.255", true, "loopback-range");
check("10.0.0.1", true, "privat 10/8");
check("10.255.255.255", true, "privat 10/8 övre");
check("172.16.0.1", true, "privat 172.16/12 nedre");
check("172.31.255.255", true, "privat 172.16/12 övre");
check("192.168.1.1", true, "privat 192.168/16");
check("169.254.169.254", true, "link-local / cloud-metadata (AWS/GCP)");
check("0.0.0.0", true, "0.0.0.0");
check("224.0.0.1", true, "multicast");
check("255.255.255.255", true, "broadcast/reserverat");

// ─── Publika IPv4 — ska TILLÅTAS (false) ─────────────────────────────────────
check("8.8.8.8", false, "publik Google DNS");
check("1.1.1.1", false, "publik Cloudflare DNS");
check("172.15.255.255", false, "172.15 är publik (precis under privat range)");
check("172.32.0.1", false, "172.32 är publik (precis över privat range)");
check("192.167.0.1", false, "192.167 är publik");
check("11.0.0.1", false, "11/8 är publik");
check("93.184.216.34", false, "publik (example.com-typ)");

// ─── IPv6 ────────────────────────────────────────────────────────────────────
check("::1", true, "IPv6 loopback");
check("::", true, "IPv6 ospecificerad");
check("fc00::1", true, "IPv6 ULA fc00::/7");
check("fd12:3456::1", true, "IPv6 ULA fd");
check("fe80::1", true, "IPv6 link-local");
check("2606:4700:4700::1111", false, "publik IPv6 (Cloudflare)");
check("2001:4860:4860::8888", false, "publik IPv6 (Google)");

// ─── guessProtein — R11: engelska nyckelord ska inte tystas ned till "vegetarisk" ─
function checkProtein(title, ingredients, expected, desc) {
  const actual = guessProtein(title, ingredients);
  if (actual === expected) passed++;
  else { failed++; failures.push(`  FAIL ${desc} → fick "${actual}", väntade "${expected}"`); }
}

checkProtein("Chicken Alfredo", ["2 chicken breasts", "200 g pasta"], "kyckling", "engelsk titel/ingrediens (kyckling)");
checkProtein("Salmon teriyaki", ["400 g salmon", "2 dl teriyakisås"], "fisk", "engelsk titel/ingrediens (fisk)");
checkProtein("Ugnsbakad lax med citron", ["600 g lax", "1 citron"], "fisk", "svenskt recept oförändrat (fisk)");
checkProtein("Köttfärssås", ["500 g köttfärs", "1 burk krossade tomater"], "kött", "svenskt recept oförändrat (kött)");
// Engelska ord som DELSTRÄNGAR får inte träffa svenska ord (granskningsfynd Session 144)
checkProtein("Krämig svamppasta", ["250 g champinjoner", "2 dl grädde"], "vegetarisk", "\"ham\" i champinjoner får inte ge fläsk");
checkProtein("Hamburgare", ["500 g nötfärs", "4 hamburgerbröd"], "kött", "\"ham\" i hamburgare får inte ge fläsk");
checkProtein("Avokadosallad", ["2 avocado", "1 lime"], "vegetarisk", "\"cod\" i avocado får inte ge fisk");
checkProtein("Pulled pork", ["1.5 kg pork shoulder"], "fläsk", "engelskt helord pork → fläsk");
// Buljong/sås/delsträngs-ord ska inte styra protein
checkProtein("Thai kyckling", ["500 g kycklingfilé", "1 msk fisksås"], "kyckling", "fisksås ger inte fisk");
checkProtein("Currygryta", ["400 g kikärtor", "1 kycklingbuljongtärning"], "vegetarisk", "kycklingbuljong ger inte kyckling");
checkProtein("Havregrynsgröt", ["2 msk flaxfrö", "2 dl havregryn"], "vegetarisk", "flaxfrö ger inte fisk");
checkProtein("Smörgås", ["1 skiva bröd", "2 msk räkost"], "vegetarisk", "räkost ger inte fisk");
checkProtein("Fiskgratäng", ["600 g torsk"], "fisk", "fisk i titel fortfarande fisk");
checkProtein("Kycklinggryta", ["600 g kycklingfilé"], "kyckling", "kycklingfilé fortfarande kyckling");

// ─── generella hjälpare för resterande tester ────────────────────────────────
function ok(cond, desc) {
  if (cond) passed++;
  else { failed++; failures.push(`  FAIL ${desc}`); }
}
function fakeRes() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}

// ─── 5a: importen kräver inte GITHUB_PAT — oinloggad → 401, inte 500 ─────────
{
  const saved = { pat: process.env.GITHUB_PAT, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.GITHUB_PAT;
  process.env.SUPABASE_URL = "https://dummy.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy";
  const res = fakeRes();
  await importHandler({ method: "POST", headers: {}, body: { type: "url", url: "https://www.koket.se/x" } }, res);
  ok(res.statusCode === 401, `5a: utan GITHUB_PAT och utan token → 401 (fick ${res.statusCode})`);
  ok(!/GITHUB_PAT/.test(res.body?.error || ""), "5a: felsvaret nämner inte GITHUB_PAT");
  for (const [k, v] of [["GITHUB_PAT", saved.pat], ["SUPABASE_URL", saved.url], ["SUPABASE_SERVICE_ROLE_KEY", saved.key]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

// ─── 5b: Gemini-utkast — protein före taggar, taggar = Geminis ∪ beräknade ────
{
  const r1 = normalizeGeminiRecipe({ title: "Middag", time: 25, ingredients: ["400 g kycklingfilé"] });
  ok(r1.protein === "kyckling", `5b: saknat protein gissas (fick ${r1.protein})`);
  ok(r1.tags.includes("kyckling") && r1.tags.includes("vardag30"), `5b: saknade taggar byggs med protein + tid (fick ${r1.tags})`);

  const r2 = normalizeGeminiRecipe({ title: "Pastagratäng", protein: "vegetarisk", time: 45, tags: ["pasta"], ingredients: ["400 g pasta"] });
  ok(r2.tags.includes("pasta") && r2.tags.includes("helg60"), `5b: Geminis taggar behålls och helg60 läggs till (fick ${r2.tags})`);

  const r3 = normalizeGeminiRecipe({ title: "Middag", protein: "chicken", time: 20, tags: [], ingredients: ["400 g kycklingfilé"] });
  ok(r3.protein === "kyckling", `5b: ogiltigt protein ersätts via guessProtein (fick ${r3.protein})`);
  ok(r3.tags.includes("vardag30"), `5b: tom tags-array får tidstagg (fick ${r3.tags})`);

  const r4 = normalizeGeminiRecipe({ title: "Lax", protein: "Fisk", time: 30, tags: ["fisk", "vardag30", 7, ""], ingredients: ["600 g lax"] });
  ok(r4.protein === "fisk", "5b: protein med versal normaliseras");
  ok(r4.tags.filter((t) => t === "fisk").length === 1 && r4.tags.every((t) => typeof t === "string" && t), `5b: inga dubbletter/icke-strängar (fick ${JSON.stringify(r4.tags)})`);
}

// ─── 5c: redirect-hämtning med injicerad fetch/lookup ────────────────────────
function fakeResponse({ status = 200, location = null, body = "" } = {}) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (h) => (h.toLowerCase() === "location" ? location : null) },
    text: async () => body,
  };
}
const fakeLookup = (map) => async (host) => {
  if (!(host in map)) throw new Error("ENOTFOUND");
  return { address: map[host] };
};
{
  // Kortlänk → koket.se: slutadressen avgör "utländsk", inte kortlänken.
  const pages = {
    "https://bit.ly/abc": fakeResponse({ status: 302, location: "https://www.koket.se/kycklinggryta" }),
    "https://www.koket.se/kycklinggryta": fakeResponse({ body: "<html>recept</html>" }),
  };
  const out = await fetchFollowingRedirects(new URL("https://bit.ly/abc"), {
    fetchImpl: async (href) => pages[href],
    lookupImpl: fakeLookup({ "bit.ly": "67.199.248.10", "www.koket.se": "93.184.216.34" }),
  });
  ok(out.html === "<html>recept</html>", "5c: följer redirect och returnerar slutsidans html");
  ok(out.finalUrl?.hostname === "www.koket.se", `5c: finalUrl är slutadressen (fick ${out.finalUrl?.hostname})`);
  ok(isForeignUrl(new URL("https://bit.ly/abc")) && !isForeignUrl(out.finalUrl), "5c: kortlänk utländsk men slutadress svensk");
}
{
  // SSRF: redirect till molnets metadata-IP blockeras per hopp.
  let fetched = [];
  const out = await fetchFollowingRedirects(new URL("https://evil.example/r"), {
    fetchImpl: async (href) => { fetched.push(href); return fakeResponse({ status: 302, location: "http://metadata.internal/" }); },
    lookupImpl: fakeLookup({ "evil.example": "93.184.216.34", "metadata.internal": "169.254.169.254" }),
  });
  ok(out.blocked === true, "5c: redirect till privat IP → blocked");
  ok(fetched.length === 1, `5c: privat adress hämtas aldrig (hämtade ${fetched.length})`);
}
{
  const out = await fetchFollowingRedirects(new URL("https://a.example/"), {
    fetchImpl: async () => fakeResponse({ status: 302, location: "file:///etc/passwd" }),
    lookupImpl: fakeLookup({ "a.example": "93.184.216.34" }),
  });
  ok(out.blocked === true, "5c: redirect till icke-http-protokoll → blocked");
}
{
  let threw = false;
  try {
    await fetchFollowingRedirects(new URL("https://loop.example/"), {
      fetchImpl: async () => fakeResponse({ status: 302, location: "https://loop.example/" }),
      lookupImpl: fakeLookup({ "loop.example": "93.184.216.34" }),
    });
  } catch { threw = true; }
  ok(threw, "5c: för många redirects kastar");
}
{
  let threw = false;
  try {
    await fetchFollowingRedirects(new URL("https://gone.example/"), {
      fetchImpl: async () => fakeResponse({ status: 404 }),
      lookupImpl: fakeLookup({ "gone.example": "93.184.216.34" }),
    });
  } catch { threw = true; }
  ok(threw, "5c: icke-ok slutsvar kastar");
}

// ─── 5d: fotoimport utan nyckel — inget env-namn i felsvaret ─────────────────
{
  const saved = { g: process.env.GOOGLE_API_KEY };
  delete process.env.GOOGLE_API_KEY;
  // Foto-grenen direkt — wrappern kräver ett giltigt inloggningstoken.
  const origErr = console.error; console.error = () => {};
  const res = fakeRes();
  try { await handlePhoto("aGVq", "image/jpeg", res); } finally { console.error = origErr; }
  ok(res.statusCode === 422, `5d: saknad nyckel → 422 (fick ${res.statusCode})`);
  ok(res.body?.error && !/[A-Z_]{6,}/.test(res.body.error), `5d: inget env-namn i felsvaret (fick "${res.body?.error}")`);
  if (saved.g !== undefined) process.env.GOOGLE_API_KEY = saved.g;
}

const total = passed + failed;
console.log(`\nPASS ${passed}/${total}${failed ? ` — ${failed} FAIL` : ""}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("Alla import-recipe-tester (SSRF, protein, redirects, felsvar) godkända.");

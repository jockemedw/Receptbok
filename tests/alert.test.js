// Tester för notifyAlert() i api/_shared/alert.js.
// Kör med `node tests/alert.test.js` — beroendefritt (stubbar global.fetch).
//
// Viktigast: helt INERT utan ALERT_WEBHOOK (säkert att anropa överallt) och
// sväljer alla fel (ett larm får aldrig fälla anropet det larmar om).

import { notifyAlert } from "../api/_shared/alert.js";

let passed = 0, failed = 0;
const failures = [];
function assertEq(actual, expected, desc) {
  if (actual === expected) passed++;
  else { failed++; failures.push(`  FAIL ${desc} → fick ${JSON.stringify(actual)}, väntade ${JSON.stringify(expected)}`); }
}

const realFetch = global.fetch;
const realUrl = process.env.ALERT_WEBHOOK;

// 1. Utan env → inert: returnerar false, anropar ALDRIG fetch
{
  delete process.env.ALERT_WEBHOOK;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true }; };
  const r = await notifyAlert("test");
  assertEq(r, false, "utan ALERT_WEBHOOK: returnerar false");
  assertEq(called, false, "utan ALERT_WEBHOOK: fetch anropas inte");
}

// 2. Med env → postar och returnerar true
{
  process.env.ALERT_WEBHOOK = "https://ntfy.sh/receptbok-test";
  let seen = null;
  global.fetch = async (url, opts) => { seen = { url, method: opts.method, body: opts.body }; return { ok: true }; };
  const r = await notifyAlert("hej larm");
  assertEq(r, true, "med ALERT_WEBHOOK: returnerar true");
  assertEq(seen?.url, "https://ntfy.sh/receptbok-test", "postar till webhook-URL");
  assertEq(seen?.method, "POST", "använder POST");
  assertEq(seen?.body, "hej larm", "skickar meddelandet som body");
}

// 3. Fetch kastar → sväljs, returnerar false (fäller inte anroparen)
{
  process.env.ALERT_WEBHOOK = "https://ntfy.sh/receptbok-test";
  global.fetch = async () => { throw new Error("nätfel"); };
  let threw = false;
  let r;
  try { r = await notifyAlert("x"); } catch { threw = true; }
  assertEq(threw, false, "fetch-fel: notifyAlert kastar inte");
  assertEq(r, false, "fetch-fel: returnerar false");
}

// Återställ globalt tillstånd
global.fetch = realFetch;
if (realUrl === undefined) delete process.env.ALERT_WEBHOOK;
else process.env.ALERT_WEBHOOK = realUrl;

const total = passed + failed;
console.log(`\nPASS ${passed}/${total}${failed ? ` — ${failed} FAIL` : ""}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("Alla notifyAlert-tester godkända.");

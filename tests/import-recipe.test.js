// Tester för SSRF-skyddet isPrivateIp() i api/import-recipe.js.
// Kör med `node tests/import-recipe.test.js` — beroendefritt.
//
// isPrivateIp avgör om en URL-imports uppslagna IP pekar mot ett internt/privat
// nät (SSRF). Felklassning här = säkerhetshål, så vi låser beteendet med tester.

import { isPrivateIp } from "../api/import-recipe.js";

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

const total = passed + failed;
console.log(`\nPASS ${passed}/${total}${failed ? ` — ${failed} FAIL` : ""}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("Alla isPrivateIp (SSRF) -tester godkända.");

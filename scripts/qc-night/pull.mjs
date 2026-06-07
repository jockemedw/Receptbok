#!/usr/bin/env node
// Hämtar recept-exporten ur qc_export-bryggan via PostgREST med den publika
// anon-nyckeln (samma som frontend) och skriver den till disk. Ingen
// hand-transkribering → perfekt fidelitet. Bryggan droppas efteråt via MCP.
//
// Kör:  node scripts/qc-night/pull.mjs <utfil.json>

import { writeFileSync } from "fs";

const URL = "https://zqeznveicagqwblltvsa.supabase.co";
const ANON = "sb_publishable_aB6kIJA9j4fyGZ7Df_GEZQ_rDeHjZ5x";

const out = process.argv[2];
if (!out) { console.error("Användning: node pull.mjs <utfil.json>"); process.exit(2); }

const res = await fetch(`${URL}/rest/v1/qc_export?id=eq.1&select=payload`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
if (!res.ok) { console.error(`REST ${res.status}: ${await res.text()}`); process.exit(1); }
const rows = await res.json();
if (!rows.length) { console.error("Ingen export-rad hittad"); process.exit(1); }
const recipes = rows[0].payload;

const doc = { generated: new Date().toISOString(), count: recipes.length, recipes };
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n", "utf-8");
console.log(`Skrev ${recipes.length} recept till ${out}`);

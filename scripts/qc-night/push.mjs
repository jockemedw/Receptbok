#!/usr/bin/env node
// Skriv-brygga: POSTar validerade ändringsrader till qc_import via PostgREST med
// anon-nyckeln. MCP applicerar sedan (update recipes from qc_import) och tömmer.
// Eliminerar manuell SQL-kopiering → ingen transkriberingsrisk på prod-data.
//
// Kör:  node scripts/qc-night/push.mjs <batchTag.push.json>

import { readFileSync } from "fs";

const URL = "https://zqeznveicagqwblltvsa.supabase.co";
const ANON = "sb_publishable_aB6kIJA9j4fyGZ7Df_GEZQ_rDeHjZ5x";

const path = process.argv[2];
if (!path) { console.error("Användning: push.mjs <push.json>"); process.exit(2); }
const rows = JSON.parse(readFileSync(path, "utf-8"));
if (!rows.length) { console.log("Inga rader att pusha."); process.exit(0); }

const res = await fetch(`${URL}/rest/v1/qc_import`, {
  method: "POST",
  headers: {
    apikey: ANON, Authorization: `Bearer ${ANON}`,
    "Content-Type": "application/json", Prefer: "return=minimal",
  },
  body: JSON.stringify(rows),
});
if (!res.ok) { console.error(`REST ${res.status}: ${await res.text()}`); process.exit(1); }
console.log(`Pushade ${rows.length} rader (ids: ${rows.map((r) => r.id).join(",")}) till qc_import.`);

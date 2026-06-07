# Receptkvalitet — backlogg (hantera senare)

Öppna punkter från nattjobbet 2026-06-07 (Session 83). Full kontext: `report-2026-06-07.md`.

## 1. Manuell uppdelning — parentes döljer varor (kräver mängdbeslut)
- **#27 Hummusbowl** `[7]` — `2 dl oliver och hackade soltorkade tomater`: parsern listar bara tomat, oliver tappas. Dela i två rader med mängd vardera.
- **#235 Linsen- och svamptacos** `[13]` — `rödkål (strimlad, blandad med strimlade morötter, skivad salladslök, äppelcidervinäger och salt)`: morötter + salladslök + vinäger hamnar inte på inköpslistan. Dela ut som egna rader.

## 2. Canon-tillägg i koden (höjer pris-matchning) — EJ tillämpat, väntar på OK
Ändring i `NORMALIZATION_TABLE` (`api/_shared/shopping-builder.js`), test-gatat (match + shopping). Säkra:
- **Plural-buljongtärningar:** `grönsaksbuljongtärningar`→grönsaksbuljong, `hönsbuljongtärningar`→hönsbuljong, `buljongtärningar`→buljongtärning, `umamibuljongtärningar`→buljongtärning.
- **Self-canons / synonymer:** `matvete`, `torsk`, `sej`, `pizzadeg`, `nori`/`nori-ark`, `citrongräs`, `portobellosvamp`→champinjoner, `baby bella-svamp`→champinjoner, `färdiggrillad kyckling`, `HP-sås`.

## 3. Avsiktligt vaga rader — beslut: lämna eller kvantifiera?
"för 4 pers"-kolhydrater: #31, #49, #265, #269, #270, #271. Nöt/frö-mixar: #43, #58, #70.
(Lämnade oförändrade i nattjobbet — genuin författar-vaghet, inte fel.)

## 4. Städning
- **Droppa backup-tabellen** `recipes_qc_backup_20260607` i Supabase när allt känns bra (revert-källa tills dess).
- Återstående P2-audit (~660) domineras av ofarliga `uppdelat`/`på burk`-beskrivningar som redan parsas rätt — ingen åtgärd krävs, men kan filtreras bort ur audit-heuristiken om siffran stör.

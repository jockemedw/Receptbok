# Claude Code — arbetsarkitektur för Receptboken

Hur vi kör Claude Code på det här projektet: **vilken modell** som gör vad, **när** vi
orkestrerar (subagenter/workflows), och hur vi **månatligen omvärderar** valen när nya
modeller släpps. Detta rör utvecklingsmetoden — inte appens drift-stack (Vercel/Supabase/Gemini,
som har sin egen radar i `docs/status.md`).

> Modell-id:n och priser är färska per **2026-06**. Verifieras månatligen (se sista sektionen) —
> lita inte på minnet, kolla `/claude-api` eller Models-API:t.

## Modellpanel (juni 2026)

| Modell | Id | Kontext | Pris in/ut /Mtok | Roll i projektet |
|---|---|---|---|---|
| **Opus 4.8** | `claude-opus-4-8` | 1M | $5 / $25 | **Standarddrivaren** (kör nu). Arkitekturbeslut, de tyst-felande fundamenten (Willys-feed, plan-aktivering), säkerhet (auth/RLS, secrets, Fas 5 multi-user), klurig debugging, syntes/dom i utredningar. |
| **Sonnet 5** | `claude-sonnet-5` | 1M | $3 / $15 (intropris **$2 / $10 t.o.m. 2026-08-31**) | **Arbetshästen** för rutin-slice-arbete: feature-edits i en `js/`-modul, CSS-städning, testskrivning, shopping/matcher-justeringar (testhookarna grindar). Nära-Opus kodkvalitet till ~⅗ priset. |
| **Haiku 4.5** | `claude-haiku-4-5` | 200K | $1 / $5 | **Billig parallell fan-out**: finder/mapper-subagenter i utredningar, grep-svep över korpus, ingrediens-audit-batchar, syntax/lint-koll, dok-omformatering. |
| **Fable 5** | `claude-fable-5` | 1M | $10 / $50 | **Reserv för det svåraste**: långa autonoma körningar (Supabase multi-tenant-refaktor, Hemköp parallell dispatch). Inte ett standardval — bara när problemet ligger högst i svårighetsspannet. |

## Routning — vilken modell till vilken uppgift

- **Stabil kontext + grindar gör tiering säker här.** VSA-strukturen (en feature = 1–2 filer),
  test-gating-hookarna och den bantade CLAUDE.md + `docs/status.md`-digesten ger varje agent samma
  grund oavsett tier — så billigare modeller kan göra mer utan att tappa kvalitet.
- **Default:** Opus 4.8 i huvudloopen (säkrast för ett projekt med tyst-felande fundament + hård
  "förstör aldrig veckoplanen"-regel).
- **Flytta NER till Sonnet 5** för det mesta rutinarbetet — det är billigare och nära lika bra på kod.
- **Flytta NER till Haiku 4.5** för mekanisk/parallell fan-out, alltid som **subagenter**.
- **Byt aldrig modell mitt i huvudloopen** — det invaliderar prompt-cachen. Vill du köra en billigare
  modell på en deluppgift: spawna en **subagent** på den modellen (huvudloopen behåller sin cache).

## Orkestreringsmönster matchade mot repot

1. **En slice → en agent, ingen orkestrering.** Featuren bor i 1–2 filer; redigera på Sonnet 5,
   PostToolUse-hookarna kör testerna. Inga subagenter behövs.
2. **Utredande vända (som Session 102 / denna) → parallella finder-subagenter (Haiku/Sonnet) + Opus-syntes.**
   Huvudloopen på Opus, billiga subagenter fan-out:ar (cache-bevarande). Detta är mönstret bakom den
   här arkitekturen.
3. **Granskning → `/code-review`-skillen med adversariell verifiering.** Hitta → låt oberoende
   skeptiker försöka motbevisa varje fynd innan det litas på (verify/dom på Opus).
4. **Stora migreringar (multi-tenant, Hemköp) → en Workflow** (deterministisk fan-out: hitta ställen →
   transformera var och en i worktree-isolering → verifiera). Kräver explicit opt-in ("använd en workflow"
   / ultracode) — föreslås, körs inte oombedd.
5. **Kontexthygien (redan byggd) ÄR del av arkitekturen:** lean CLAUDE.md + `docs/status.md`-digest +
   test-gating-hookar håller per-session-kostnaden nere och ger alla agenter samma grund.

## Extern AI som grindvakt + nattpass (Session 151, 2026-10-03)

Verktyget bor i ett eget, projektoberoende repo: **`jockemedw/ai-collab`** (lokalt `../ai-collab`
bredvid Receptboken). Receptboken äger bara sin config och sin checklista i repo-roten:
`ai-gate.config.json` + `ai-gate-checklist.json`. Plan och öppna beslut: `PLAN.md` i ai-collab.

- **Vad en grind är:** något deterministiskt (exit-kod / JSON som ett skript läser) som stoppar flödet.
  En modells utlåtande som Claude "väger in" är inte en grind.
- **Granskare:** Codex CLI, headless och skrivskyddad, inloggad med ChatGPT-prenumeration — **finns bara
  på Joakims dator** (skrivbordsappen, inte på PATH). Gemini CLI är inte installerad.
- **Granskaren får primärkällan:** uppgiften, planen i klartext, faktisk diff, fullständig testlogg —
  aldrig Claudes sammanfattning. Checklistan är ja/nej mot invarianterna i CLAUDE.md.
- **Köra grinden i en vanlig session:**
  `node ../ai-collab/bin/ai-gate.mjs diff --base origin/main --head HEAD` (exit 0 ja · 1 nej · 2 gick inte att köra).
- **Köra ett nattpass manuellt:** `node ../ai-collab/bin/nattpass.mjs "uppgift" --no-pr`
  → eget worktree + gren → plan → plan-grind → bygg → låst kandidat-commit → tester (UTC) → diff-grind
  → (utan `--no-pr`) push av grenen + utkast-PR. Loggar i `.nattpass/<id>/`.
- **Nattpass-regler:** aldrig DDL/migrationer autonomt, aldrig push till main (alltid PR), aldrig plan-läge,
  mobilverifiering kan inte automatiseras → listas i PR:en och förs till verifieringskön i `docs/status.md`.
- **Ändra reglerna:** redigera `ai-gate-checklist.json` (en ja/nej-fråga per regel; `"only": "diff"|"plan"`).
  12-filsgränsen i `api/` räknas deterministiskt via `maxFiles` i configen.
- **Öppet (Joakims beslut):** (1) isolering av byggaren — den får köra `node` och kan därmed i princip
  runda förbuden mot push; alternativ: grenskydd på main, isolerad miljö, eller accepterad risk lokalt.
  (2) Schemaläggning lokalt eller i molnet (Codex-inloggningen finns inte i molnet). (3) PR-steget är
  aldrig kört. (4) Roadmapen är inte märkt med vilka punkter som lämpar sig för autonomt arbete.

## Månatlig omvärdering (tech-radar för modeller & orkestrering)

Kör månadsvis (eller vid lämpligare intervall). Kolla det som faktiskt ändras över tid:

- [ ] **Modell-lineup** — nya/uppdaterade Opus/Sonnet/Haiku/Fable-versioner? Ändrade modell-id:n?
      (Verifiera mot `/claude-api` eller `client.models.list()` — gissa inte.)
- [ ] **Priser** — särskilt: Sonnet 5:s **intropris ($2/$10) upphör 2026-08-31** → tillbaka till $3/$15.
      Räkna om routningens kostnadslogik om något skiftar.
- [ ] **Kontextfönster / max-output** — påverkar om stora migreringar ryms i en körning.
- [ ] **Claude Code-orkestrering** — nya subagent-/workflow-/skill-funktioner som ändrar mönstren ovan?
- [ ] **Uppdatera routning-tabellen** i den här filen om något av ovan flyttar en uppgift mellan tiers.

*Senast omvärderad: 2026-06-30 (Session 104).*

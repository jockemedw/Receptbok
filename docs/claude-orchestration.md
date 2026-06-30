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

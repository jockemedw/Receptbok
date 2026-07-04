# Plattformsförslag 2026-07 — Receptboken blir "Familjehubben"

**Status:** strategidokument, beslutat riktningsval — inget i den skarpa appen är ändrat än.
**Beslut (Joakim, 2026-07-04):** bygg ut befintlig app till plattform (inte separata appar),
börja med gemensamma listor (Cozi-ersättare), kalender/agenda och anteckningar. Öppet för fler modulförslag.

---

## Vision & designtes

Receptboken svarar idag på familjens största vardagsfråga: *"vad blir det ikväll?"*
Nästa steg är att den svarar på hela dagens fråga: *"vad gäller idag?"* — middagen,
dagens händelser, listorna som är igång, lapparna man behöver komma ihåg.

Tänk på det som att huset byggs ut med fler rum i stället för att bygga nya stugor
på tomten: allt delar samma grund (inloggning, databas, design och deploy), och man
går aldrig ut för att byta verktyg. Cozi och liknande appar ersätts inte av en till
app — de ersätts av att *den app familjen redan öppnar varje dag* får rummen de saknar.

**Designtes:** Idag-fliken växer från "matens dag" till "familjens dag". Nya moduler
är inte nya appar utan nya sektioner och flikar i samma hus.

## Arkitekturbeslut: en app, en grund

**Valet:** samma repo, samma Vercel-deploy, samma Supabase-projekt, samma inloggning.
Alternativet (separata appar + en portalsida) förkastades — det dubblerar auth-koppling
och underhåll, och Supabase gratis-tier tillåter bara två projekt.

Allt som behövs finns redan bevisat i drift:

| Byggsten | Finns redan som | Återanvänds till |
|---|---|---|
| Live-synk mellan enheter | `supabase.channel(...).on('postgres_changes', ...)` i `js/shopping/shopping-list.js` | Gemensamma listor som uppdateras direkt på bådas telefoner |
| Familje-avgränsad data | RLS-mönstret "household members read/insert/…" i `db/migrations/002_pantry_items.sql` | Exakt samma policy-mall för varje ny tabell |
| Bockning + eko-dämpning | Inköpslistans UX (`shopping-list.js`) | Bocklistor i alla fria listor |
| Modul-per-fil (VSA) | `js/shopping/`, `js/today/`, `js/weekly-plan/` | Nya slices: `js/lists/`, `js/calendar/` |
| Fliknavigering | `switchTab()` i `js/ui/navigation.js` + header/bottom-nav i `index.html` | En femte flik utan ny infrastruktur |
| Migrationsdisciplin | Idempotenta filer i `db/migrations/`, körs av Joakim på klartecken | `005_family_lists.sql` osv. |

**Kostnad:** 0 kr. Listor och anteckningar är text — försumbart mot Supabase-gratistierns
500 MB. Realtime ingår redan. **Bonus:** fler dagliga användningsområden = Supabase
pausas aldrig (dämpar backlog #11 på köpet).

**Navigering (förslag):** bottom-nav går från 4 till 5 flikar —
**Idag · Matsedel · Inköp · Listor · Recept** ("Inköpslista" kortas till "Inköp" så
etiketterna får plats). Den nya **Listor**-fliken rymmer både fria listor (M1) och
anteckningar (M2) — en flik täcker två moduler, och Inköpslistan behåller sin
specialiserade flik (den har rea-matchning, kategorier och Willys-dispatch som fria
listor inte ska belastas med). Kalendern (M3) får ingen egen flik — den bor som
agenda-rad på Idag.

## Modulkarta

### M1 — Gemensamma listor (Cozi-ersättaren) · *bygg först*

Fria delade listor: packlistor, ärenden, presentidéer, "att fixa i lägenheten".
Skapa lista → lägg rader → bocka av → allt synkas live mellan telefonerna
(samma Realtime-mönster som inköpslistan). Cozi-flytten är manuell — familjen har
en handfull listor, ingen importör behövs.

Schema-skiss (körs INTE nu — blir `db/migrations/005_family_lists.sql` när bygget startar):

```sql
create table if not exists family_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title        text not null,
  kind         text not null default 'list',   -- 'list' | 'note' (M2 bor i samma tabell)
  body         text,                            -- fritext för anteckningar
  pinned       boolean not null default false,  -- pinnad → syns på Idag
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists family_list_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references family_lists(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  text         text not null,
  checked      boolean not null default false,
  sort_order   int,
  created_at   timestamptz not null default now()
);
-- RLS: kopiera policy-mallen rakt av från 002_pantry_items.sql (read/insert/update/delete
-- via household_members-lookup). household_id dubbleras på items just för enkel RLS.
```

Frontend: ny slice `js/lists/` (`lists-view.js` + ev. `list-editor.js`), skrivningar
direkt mot Supabase från klienten (RLS skyddar — som skafferimarkeringarna), ingen ny
API-endpoint behövs. Bockning, "lägg till rad"-fält och eko-dämpning lånas från
`shopping-list.js`-mönstren.

### M2 — Anteckningar & familjelogg · *billigaste vinsten*

Delade lappar: barnets skostorlek, wifi-lösenordet till stugan, "bra barnvakt-nummer".
Tekniskt är en anteckning en lista utan rader (`kind:'note'`, text i `body`) — därför
ingen egen tabell och nästan ingen egen kod. Bor i Listor-fliken under en egen rubrik;
**pinnade** anteckningar visas som diskreta kort på Idag.

### M3 — Familjekalender/agenda · *läs, bygg inte*

Rekommendation: **bygg ingen egen kalender.** Familjen har redan en (Google Kalender) —
att bygga en till skapar exakt det dubbelbokförings-problem en hubb ska lösa.
I stället läser appen familjens befintliga kalender via dess **privata iCal-adress**
(ICS-prenumerationslänk från Google Kalender-inställningarna — gratis, read-only,
ingen OAuth-dans).

- En liten serverless-endpoint `api/calendar.js` hämtar och tolkar ICS-flödet
  (webbläsaren får inte hämta den direkt — Googles kalenderserver tillåter inte
  anrop från andra sajter, s.k. CORS — så vår backend agerar bud). Cachea ~15 min.
- ICS-länken lagras som hemlighet i Vercel env (`FAMILY_CALENDAR_ICS`) — den ger
  läsaccess till kalendern och ska inte ligga i databasen eller repot.
- Idag-fliken får en **"Idag"-agendarad** (2–3 närmaste händelser); ev. "denna vecka"
  i dag-sheeten senare.
- Egen event-tabell (skapa händelser i appen) är medvetet **fas 2** — börja med att
  spegla, utvärdera behovet sedan.

### Fler modulförslag (Joakim bad om dem — insats/värde-bedömda)

| Modul | Vad | Insats | Värde | När |
|---|---|---|---|---|
| **M4 Rutiner & sysslor** | Återkommande hushållsuppgifter (tvätt, städ, dammsugning) med veckoschema och avbockning — "vems vecka är det?" | Medel (recurrence-logik) | Hög för småbarnsfamilj | Efter M1–M3, om behovet känns |
| **M5 Viktiga datum** | Födelsedagar/årsdagar i en egen tabell → "Farmor fyller år om 5 dagar" på Idag | Låg | Medel | Bra kvällsjobb; kan även läsas ur ICS-flödet (M3) om de ligger i kalendern |
| **M6 Middagsbetyg** | Familjen betygsätter kvällens middag med ett tryck på Idag-fliken → data till Fas 2 (familjelärande receptval) | Låg (UI) | Hög på sikt — ger Fas 2 riktig data | Knyts till befintlig roadmap Fas 2, inte ett eget spår |

Medvetet **inte** föreslaget: budget/ekonomi (känslig data, appen ska inte bli bank),
foto-delning (lagringskostnad, familjen har redan delade album), platsdelning (integritetsfråga,
finns i telefonen).

## Idag-fliken som hubb

Dagens `js/today/today-view.js` har redan sektionsstruktur (datumrad → Ikväll-hero →
I morgon → Kommande veckan → Snabbt till listan). Modulerna adderar sektioner — inget
befintligt flyttas:

```
Idag
├── Datumrad + ev. larmbanner            (finns)
├── 📅 Idag i kalendern (M3)             ← 2–3 händelser, "förskolan stänger 16"
├── Ikväll-hero: middagen                (finns)
├── ⭐ Hur var middagen? (M6)            ← en rad med 👍/👌/👎, syns efter middagstid
├── I morgon-rad                         (finns)
├── Kommande veckan (färgstaplar)        (finns)
├── 📋 Aktiva listor (M1)                ← "Packning fjällen — 4 kvar", tryck → Listor-fliken
├── 📌 Pinnade lappar (M2)               ← max 2–3, diskreta kort
└── Snabbt till listan                   (finns)
```

Princip: sektioner utan innehåll renderas inte alls (ingen tom-brus) — samma mönster
som dagens tomlägen.

## Vad som INTE ändras

Designprinciperna gäller plattformen precis som Receptboken: **gratis** (allt ovan
ryms i befintliga gratis-tiers) · **ingen AI i runtime** · **ingen automatisk
generering** · **delad data, aldrig localStorage** · **mobilen först**. Receptval,
matsedel, inköpslista och deras datamodeller rörs inte. Recept-strukturen är helig
som vanligt. Varje införandesteg lämnar appen fullt fungerande.

## Roadmap (inkrementell — appen funkar efter varje steg)

1. **P1 — Listor-fliken + M1 gemensamma listor.** Migration 005, `js/lists/`,
   femte fliken, Realtime-synk, bockning. *Klart = Cozi kan avinstalleras.*
2. **P2 — M2 anteckningar.** `kind:'note'` + rubrik i Listor-fliken + pinnade kort
   på Idag. Litet steg ovanpå P1.
3. **P3 — M3 kalenderagenda.** `api/calendar.js` (ICS-proxy) + agendarad på Idag.
   Kräver ICS-länken av Joakim.
4. **P4 — M5 viktiga datum** och/eller **M6 middagsbetyg** (öppnar Fas 2-spåret).
5. **P5 — M4 rutiner & sysslor**, om behovet kvarstår när P1–P3 använts ett tag.

Varje P-steg är en egen session med egen mobil-verifiering, samma arbetssätt som
designinförandet (Session 108–109).

## Öppna frågor till Joakim (inför P1/P3)

1. **Fliketikett:** känns "Listor" rätt för femte fliken (med "Inköp" som kortnamn på
   inköpslistan)? Alternativ: "Familj", "Mer".
2. **P3:** hämta ut den privata iCal-adressen från familjens Google Kalender
   (Inställningar → [kalendern] → Integrera kalender → *Hemlig adress i iCal-format*)
   och lägg som `FAMILY_CALENDAR_ICS` i Vercel — eller be Claude guida när det är dags.
3. **Första listorna:** vilka Cozi-listor är i bruk idag? (Styr vilka listtyper som
   testas först i P1.)

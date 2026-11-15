// Tester för js/today/next-step.js — Idag-flikens "Nästa steg" (ren funktion, ingen DOM).
// Körs med `node tests/next-step.test.js`.
import { computeNextStep } from '../js/today/next-step.js';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
}

const TODAY = '2026-11-10';
const day = (date, dayShort, kind, extra = {}) => ({ date, day: dayShort, dayShort, kind, shoppedAt: null, onList: false, ...extra });
const week = (over = {}) => [
  day('2026-11-09', 'Mån', 'recipe', { shoppedAt: 'x' }),
  day('2026-11-10', 'Tis', 'recipe', { onList: true }),
  day('2026-11-11', 'Ons', 'recipe', { onList: true }),
  day('2026-11-12', 'Tor', 'own', over.tor || {}),
];

// a) förslag vinner över allt
let r = computeNextStep({ todayIso: TODAY, days: [day('2026-11-12', 'Tor', null)], proposal: { count: 5, startDate: '2026-11-09' }, itemsLeft: 3 });
eq('a stage', r.stage, 1);
eq('a title', r.title, 'Du har ett förslag för 5 dagar');
eq('a action', r.action, { kind: 'proposal', label: 'Visa förslaget', arg: '2026-11-09' });
eq('a singular', computeNextStep({ todayIso: TODAY, proposal: { count: 1 } }).title, 'Du har ett förslag för 1 dag');

// b) tomma dagar (bara från idag och framåt — passerade tomma räknas inte)
r = computeNextStep({ todayIso: TODAY, days: [day('2026-11-09', 'Mån', null), day('2026-11-12', 'Tor', null), day('2026-11-13', 'Fre', null)], itemsLeft: 2 });
eq('b title', r.title, '2 dagar saknar middag');
eq('b text', r.text, 'tor, fre');
eq('b action', r.action.kind, 'propose-empty');
eq('b singular', computeNextStep({ todayIso: TODAY, days: [day('2026-11-12', 'Tor', null)] }).title, '1 dag saknar middag');

// c) receptdagar varken handlade eller på listan (egna dagar utan recept och passerade räknas inte)
r = computeNextStep({ todayIso: TODAY, days: [day('2026-11-09', 'Mån', 'recipe'), day('2026-11-11', 'Ons', 'recipe'), day('2026-11-12', 'Tor', 'own'), day('2026-11-13', 'Fre', 'recipe', { onList: true })], itemsLeft: 4 });
eq('c stage', r.stage, 2);
eq('c title', r.title, '1 middag är inte handlad');
eq('c action', r.action.kind, 'day-picker');
eq('c plural', computeNextStep({ todayIso: TODAY, days: [day('2026-11-11', 'Ons', 'recipe'), day('2026-11-12', 'Tor', 'recipe')] }).title, '2 middagar är inte handlade');

// d) obockade varor
r = computeNextStep({ todayIso: TODAY, days: week(), itemsLeft: 12 });
eq('d stage', r.stage, 3);
eq('d title', r.title, '12 varor kvar att handla');
eq('d action', r.action.kind, 'shop');

// e) klart — och fri dag räknas inte som tom
r = computeNextStep({ todayIso: TODAY, days: [...week(), day('2026-11-13', 'Fre', 'free')], itemsLeft: 0 });
eq('e stage', r.stage, 4);
eq('e action', r.action, null);

// tomt tillstånd kraschar inte
eq('empty', computeNextStep().stage, 4);

if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log('next-step: alla tester gröna');

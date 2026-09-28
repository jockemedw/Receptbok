// Test: svCompare och fmtShort i js/utils.js (Paket 7 — cachad Collator och
// DateTimeFormat). Utdatan ska vara byte-identisk med de gamla anropen
// localeCompare(…, 'sv') resp. toLocaleDateString('sv-SE', …).
import assert from 'assert';
// utils.js exponerar sina hjälpare på window.* — ge den en attrapp i node.
globalThis.window = globalThis.window || {};
const { svCompare, fmtShort } = await import('../js/utils.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✓', name); }

test('svCompare sorterar som localeCompare(…, "sv") — å/ä/ö efter z', () => {
  const words = ['öl', 'äpple', 'Zucchini', 'åkerbär', 'apelsin', 'Ärtor', 'banan', 'ost', 'Ost', 'grädde', 'Övrigt', 'Mejeri'];
  const oldSort = words.slice().sort((a, b) => a.localeCompare(b, 'sv'));
  assert.deepStrictEqual(words.slice().sort(svCompare), oldSort);
  assert.ok(svCompare('zucchini', 'åkerbär') < 0);
});

test('svCompare är fristående (kan skickas direkt till sort)', () => {
  assert.deepStrictEqual(['b', 'a'].sort(svCompare), ['a', 'b']);
});

test('fmtShort ger samma sträng som toLocaleDateString för ett helt år', () => {
  for (let i = 0; i < 366; i++) {
    const d = new Date(2026, 0, 1 + i, 12);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const old = new Date(iso + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    assert.strictEqual(fmtShort(iso), old, iso);
  }
});

test('fmtShort tom sträng för saknat datum', () => {
  assert.strictEqual(fmtShort(''), '');
  assert.strictEqual(fmtShort(null), '');
});

console.log(`\n${passed} tester gröna`);

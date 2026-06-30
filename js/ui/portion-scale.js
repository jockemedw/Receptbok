// Portionsskalning för matlagningsläget — räknar om mängderna i en
// ingrediensrad med en faktor (×0.5 / ×1 / ×2). Ren textfunktion: behåller
// radens text och multiplicerar bara de numeriska mängderna. Skalar de två
// kanoniska formaten (CLAUDE.md, Fas 8):
//   • ledande mängd:        "600 g torsk"      → "1200 g torsk"
//   • doh-format i parentes: "zucchini (400 g)" → "zucchini (800 g)"
// Mängder mitt i ett namn (utan ledande position eller parentes) rörs INTE —
// det håller skalningen förutsägbar och undviker att t.ex. namnsiffror skalas.

const FRACS = {
  '½': 0.5, '¼': 0.25, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

const NUM = '\\d+(?:[.,]\\d+)?';
const FRAC = '[½¼¾⅓⅔⅛⅜⅝⅞]';
// Ett mängd-token: "1½" / "1 ½" / "2,5" / "400" / "¾"
const QTY = `(?:${NUM}\\s*${FRAC}|${NUM}|${FRAC})`;
// Mängd-token, ev. som intervall ("4–6", "2-3")
const QTY_RANGE_G = new RegExp(`(${QTY})(\\s*[–-]\\s*)(${QTY})|(${QTY})`, 'g');
const LEAD_RE = new RegExp(`^\\s*${QTY}(?:\\s*[–-]\\s*${QTY})?`);

function toNum(tok) {
  const s = tok.trim();
  if (FRACS[s] != null) return FRACS[s];
  const last = s.slice(-1);
  if (FRACS[last] != null) {
    const base = parseFloat(s.slice(0, -1).replace(',', '.'));
    return (isNaN(base) ? 0 : base) + FRACS[last];
  }
  return parseFloat(s.replace(',', '.'));
}

// Formatera ett tal snyggt: heltal som heltal, vanliga bråk som ½/¼/¾/⅓/⅔,
// annars decimal med komma (max 2 decimaler, inga släpnollor).
export function fmtNum(n) {
  if (!isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  const whole = Math.floor(rounded + 1e-9);
  const frac = rounded - whole;
  if (Math.abs(frac) < 0.02) return String(whole);
  const NICE = [[0.5, '½'], [0.25, '¼'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
  for (const [v, glyph] of NICE) {
    if (Math.abs(frac - v) < 0.02) return (whole ? whole : '') + glyph;
  }
  return String(rounded).replace('.', ',');
}

// Skala alla mängd-token (inkl. intervall) i en textbit.
function scaleFragment(text, factor) {
  return text.replace(QTY_RANGE_G, (m, a, sep, b, single) => {
    if (single != null) return fmtNum(toNum(single) * factor);
    return fmtNum(toNum(a) * factor) + sep + fmtNum(toNum(b) * factor);
  });
}

// Skala bara den ledande mängden i en textbit (lämnar resten orört).
function scaleLeading(frag, factor) {
  const m = frag.match(LEAD_RE);
  return m ? scaleFragment(m[0], factor) + frag.slice(m[0].length) : frag;
}

export function scaleIngredient(raw, factor) {
  if (!raw || !isFinite(factor) || factor === 1) return raw;
  let s = raw;
  // Gruppetikett ("Sås: 2 dl grädde") — skala mängden efter kolonet.
  const colon = s.indexOf(':');
  if (colon !== -1 && s.slice(colon + 1).trim()) {
    s = s.slice(0, colon + 1) + ' ' + scaleLeading(s.slice(colon + 1).trimStart(), factor);
  } else {
    s = scaleLeading(s, factor);
  }
  // Doh-format: skala mängder inuti varje parentes.
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => '(' + scaleFragment(inner, factor) + ')');
  return s;
}

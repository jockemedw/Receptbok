// "Nästa steg" på Idag-fliken — ren beslutsfunktion (ingen DOM, inga window.*).
// Tillstånd in → { stage, title, text, action } ut. Render-only: läser bara det
// som Idag redan har i minnet; själva handlingarna kopplas i today-view.js.
//
// Veckans loop i fyra steg: 1 planera · 2 lägg på listan · 3 handla · 4 klart.
//
// Indata (alla fält valfria):
//   todayIso      'YYYY-MM-DD'
//   days          innevarande veckas dagar [{ date, day, dayShort, kind, shoppedAt, onList }]
//                 kind: 'recipe' (receptdag) | 'own' | 'free' | null (tom)
//   proposal      { count, startDate } | null — obekräftat matsedelsförslag
//   itemsLeft     antal obockade varor på inköpslistan (utan skafferivaror)
//
// action.kind: 'proposal' | 'propose-empty' | 'day-picker' | 'shop' | null

export const STAGES = ['Planera', 'Lägg på listan', 'Handla', 'Klart'];

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

export function computeNextStep({ todayIso, days = [], proposal = null, itemsLeft = 0 } = {}) {
  const upcoming = days.filter(d => d && d.date >= todayIso);

  // a) Obekräftat förslag
  if (proposal && proposal.count > 0) {
    return {
      stage: 1,
      title: `Du har ett förslag för ${plural(proposal.count, 'dag', 'dagar')}`,
      text: 'Titta igenom förslaget och byt det som inte passar innan du använder det.',
      action: { kind: 'proposal', label: 'Visa förslaget', arg: proposal.startDate || null },
    };
  }

  // b) Tomma dagar
  const empties = upcoming.filter(d => !d.kind);
  if (empties.length) {
    const names = empties.map(d => (d.dayShort || d.day || '').toLowerCase()).join(', ');
    return {
      stage: 1,
      title: `${plural(empties.length, 'dag saknar', 'dagar saknar')} middag`,
      text: names,
      action: { kind: 'propose-empty', label: 'Föreslå middagar' },
    };
  }

  // c) Receptdagar som varken är handlade eller ligger på inköpslistan
  const unlisted = upcoming.filter(d => d.kind === 'recipe' && !d.shoppedAt && !d.onList);
  if (unlisted.length) {
    return {
      stage: 2,
      title: unlisted.length === 1 ? '1 middag är inte handlad' : `${unlisted.length} middagar är inte handlade`,
      text: 'Välj vilka dagars varor som ska med på inköpslistan.',
      action: { kind: 'day-picker', label: 'Lägg varorna på inköpslistan' },
    };
  }

  // d) Obockade varor kvar
  if (itemsLeft > 0) {
    return {
      stage: 3,
      title: `${plural(itemsLeft, 'vara', 'varor')} kvar att handla`,
      text: 'Bocka av dem på listan medan du handlar.',
      action: { kind: 'shop', label: 'Öppna inköpslistan' },
    };
  }

  // e) Klart
  return {
    stage: 4,
    title: 'Veckan är klar — allt är planerat och handlat',
    text: '',
    action: null,
  };
}

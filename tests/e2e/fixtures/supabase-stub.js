// Stub för @supabase/supabase-js — används BARA av tests/e2e/perf-smoke.mjs.
//
// Harnessen serverar den här modulen i stället för jsdelivr-bygget, så mätningen
// blir offline och deterministisk (ingen CDN, ingen riktig databas, inget
// testkonto — beslut B4 i docs/prestanda-plan-2026-09.md).
//
// Efterliknar bara den yta appen faktiskt använder. Ytan kartlagd med grep över
// js/ (from/select/eq/is/in/match/order/limit/single/maybeSingle/update/insert/
// upsert/delete, auth.getSession/onAuthStateChange/…, channel/on/subscribe).
//
// LATENS: varje fråga svarar efter window.__stubLatency ms (default 120). Det är
// avsiktligt — utan latens syns inte att boot-kedjan är seriell, och då kan
// harnessen inte bevisa att Batch A:s parallellisering hjälper.

const LATENCY = () => (typeof window.__stubLatency === 'number' ? window.__stubLatency : 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HH = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-0000000000aa';

// ── Statistik som harnessen läser av ─────────────────────────────────────────
const stats = { queries: [], byTable: {}, channels: [] };
window.__stub = stats;

function note(table, op) {
  stats.queries.push({ table, op, t: Math.round(performance.now()) });
  stats.byTable[table] = (stats.byTable[table] || 0) + 1;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Datum är relativa till idag (samma tidsbombs-lärdom som
// tests/plan-orchestration.test.js: hårdkodade datum ruttnar).

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const TODAY = new Date();
const MONDAY = addDays(TODAY, -((TODAY.getDay() + 6) % 7));

const PROTEINS = ['fisk', 'kyckling', 'kött', 'fläsk', 'vegetarisk'];
const TYPES = ['soppa', 'pasta', 'wok', 'ugn', 'sallad', 'gryta', 'ramen'];
const CUISINES = ['italienskt', 'asiatiskt', 'mexikanskt', 'medelhavet', 'indiskt'];

// 260 recept i realistisk storlek — payloadens vikt vid boot ska vara verklig.
const RECIPES = Array.from({ length: 260 }, (_, i) => {
  const n = i + 1;
  return {
    id: n,
    household_id: HH,
    title: `Testrecept ${n} med ${PROTEINS[n % 5]} och rotfrukter`,
    tested: n % 3 !== 0,
    servings: 4,
    time: n % 2 ? 30 : 55,
    time_note: n % 7 === 0 ? 'ugn 175°' : null,
    tags: [n % 2 ? 'vardag30' : 'helg60', TYPES[n % TYPES.length], CUISINES[n % CUISINES.length]],
    protein: PROTEINS[n % 5],
    ingredients: Array.from({ length: 10 }, (_, k) => `${(k + 1) * 50} g ingrediens ${k + 1} till rätt ${n}`),
    instructions: Array.from({ length: 6 }, (_, k) => `Steg ${k + 1}: gör i ordning ingredienserna och tillaga enligt anvisning för recept ${n}.`),
    notes: 'Tips: funkar även med rester nästa dag.',
    seasons: ['höst', 'vinter'],
  };
});

const PLAN_ID = 'plan-0001';
const LIST_ID = 'list-0001';

const WEEKLY_PLANS = [{
  id: PLAN_ID,
  household_id: HH,
  is_active: true,
  generated_at: new Date().toISOString(),
  start_date: iso(MONDAY),
  end_date: iso(addDays(MONDAY, 6)),
  confirmed_at: null,
}];

// Sju plandagar (plan_id satt) + två egna dagar (plan_id null — invariant #1:
// de ska alltid finnas kvar).
const MEAL_DAYS = [
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `md-${i}`,
    household_id: HH,
    plan_id: PLAN_ID,
    date: iso(addDays(MONDAY, i)),
    recipe_id: RECIPES[i * 3].id,
    recipe_title_snapshot: RECIPES[i * 3].title,
    saving: i % 3 === 0 ? 24 : null,
    saving_matches: null,
    locked: false,
    blocked: false,
    shopped_at: i < 2 ? new Date().toISOString() : null,
    shopping_list_id: i < 2 ? LIST_ID : null,
    custom_note: null,
  })),
  {
    id: 'md-custom-1', household_id: HH, plan_id: null,
    date: iso(addDays(MONDAY, 8)), recipe_id: null, recipe_title_snapshot: null,
    custom_note: 'Pizza hos farmor', saving: null, saving_matches: null,
    locked: false, blocked: false, shopped_at: null, shopping_list_id: null,
  },
  {
    id: 'md-custom-2', household_id: HH, plan_id: null,
    date: iso(addDays(MONDAY, 9)), recipe_id: RECIPES[42].id,
    recipe_title_snapshot: RECIPES[42].title, custom_note: null,
    saving: null, saving_matches: null, locked: false, blocked: false,
    shopped_at: null, shopping_list_id: null,
  },
];

const SHOPPING_LISTS = [{
  id: LIST_ID,
  household_id: HH,
  is_active: true,
  recipe_items_moved_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}];

const CATEGORIES = ['Mejeri', 'Grönsaker', 'Fisk & kött', 'Frukt', 'Skafferi', 'Övrigt'];
const SHOPPING_ITEMS = Array.from({ length: 46 }, (_, i) => ({
  id: `it-${i}`,
  list_id: LIST_ID,
  household_id: HH,
  name: `vara ${i + 1} (${(i + 1) * 100} g)`,
  category: CATEGORIES[i % CATEGORIES.length],
  position: i,
  checked: i % 5 === 0,
  source: i < 40 ? 'recipe' : 'manual',
}));

const PLAN_ARCHIVES = Array.from({ length: 3 }, (_, i) => ({
  id: `arch-${i}`,
  household_id: HH,
  start_date: iso(addDays(MONDAY, -7 * (i + 1))),
  end_date: iso(addDays(MONDAY, -7 * (i + 1) + 6)),
  archived_at: new Date(Date.now() - (i + 1) * 7 * 86400000).toISOString(),
  days: Array.from({ length: 7 }, (_, k) => ({
    date: iso(addDays(MONDAY, -7 * (i + 1) + k)),
    recipe: RECIPES[(i * 7 + k) % RECIPES.length].title,
    recipeId: RECIPES[(i * 7 + k) % RECIPES.length].id,
  })),
}));

const FAMILY_LISTS = Array.from({ length: 5 }, (_, i) => ({
  id: `fl-${i}`,
  household_id: HH,
  title: i < 3 ? `Lista ${i + 1}` : `Anteckning ${i - 2}`,
  kind: i < 3 ? 'list' : 'note',
  body: i < 3 ? null : 'Kom ihåg att boka tid för bilen och betala avgiften.',
  archived: false,
  pinned: i === 3,
  position: i,
  color: null,
  icon: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

const FAMILY_LIST_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  id: `fli-${i}`,
  list_id: `fl-${i % 3}`,
  household_id: HH,
  text: `rad ${i + 1}`,
  checked: i % 4 === 0,
  position: i,
  created_at: new Date().toISOString(),
}));

const TABLES = {
  recipes: RECIPES,
  households: [{ id: HH, target_servings: 4 }],
  household_members: [{ household_id: HH, user_id: USER }],
  weekly_plans: WEEKLY_PLANS,
  meal_days: MEAL_DAYS,
  shopping_lists: SHOPPING_LISTS,
  shopping_items: SHOPPING_ITEMS,
  plan_archives: PLAN_ARCHIVES,
  pantry_items: [{ id: 'p-1', household_id: HH, name: 'salt' }],
  pricing_status: [{ household_id: HH, degraded: false, last_success_at: new Date().toISOString() }],
  family_lists: FAMILY_LISTS,
  family_list_items: FAMILY_LIST_ITEMS,
  recipe_history: [],
};

// ── Frågebyggare (thenable, som PostgREST) ───────────────────────────────────

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.sort = null;
    this._limit = null;
    this._single = null;
    this._write = null;
  }
  select() { return this; }
  eq(col, val) { this.filters.push([col, 'eq', val]); return this; }
  neq(col, val) { this.filters.push([col, 'neq', val]); return this; }
  is(col, val) { this.filters.push([col, 'is', val]); return this; }
  in(col, vals) { this.filters.push([col, 'in', vals]); return this; }
  gt(col, v) { this.filters.push([col, 'gt', v]); return this; }
  gte(col, v) { this.filters.push([col, 'gte', v]); return this; }
  lt(col, v) { this.filters.push([col, 'lt', v]); return this; }
  lte(col, v) { this.filters.push([col, 'lte', v]); return this; }
  match(obj) { for (const k of Object.keys(obj)) this.filters.push([k, 'eq', obj[k]]); return this; }
  order(col, opts) { this.sort = { col, asc: opts?.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  maybeSingle() { this._single = 'maybe'; return this; }
  single() { this._single = 'one'; return this; }
  update(patch) { this._write = { op: 'update', patch }; return this; }
  insert(rows) { this._write = { op: 'insert', rows }; return this; }
  upsert(rows) { this._write = { op: 'upsert', rows }; return this; }
  delete() { this._write = { op: 'delete' }; return this; }

  then(onOk, onErr) { return this._run().then(onOk, onErr); }
  catch(onErr) { return this._run().catch(onErr); }
  finally(fn) { return this._run().finally(fn); }

  matches(row) {
    return this.filters.every(([col, op, val]) => {
      const v = row[col];
      switch (op) {
        case 'eq':  return v === val;
        case 'neq': return v !== val;
        case 'is':  return val === null ? (v === null || v === undefined) : v === val;
        case 'in':  return Array.isArray(val) && val.includes(v);
        case 'gt':  return v > val;
        case 'gte': return v >= val;
        case 'lt':  return v < val;
        case 'lte': return v <= val;
        default:    return true;
      }
    });
  }

  async _run() {
    note(this.table, this._write ? this._write.op : 'select');
    await sleep(LATENCY());
    const all = TABLES[this.table] || [];

    if (this._write) {
      // Skrivningar behövs bara för att inte krascha; harnessen är läsbaserad.
      const hit = all.filter((r) => this.matches(r));
      if (this._write.op === 'update') hit.forEach((r) => Object.assign(r, this._write.patch));
      if (this._write.op === 'delete') {
        for (const r of hit) { const i = all.indexOf(r); if (i >= 0) all.splice(i, 1); }
      }
      if (this._write.op === 'insert' || this._write.op === 'upsert') {
        const rows = Array.isArray(this._write.rows) ? this._write.rows : [this._write.rows];
        rows.forEach((r, i) => all.push({ id: `new-${this.table}-${all.length + i}`, ...r }));
      }
      const data = this._single ? (hit[0] ?? null) : hit;
      return { data, error: null, count: hit.length };
    }

    let rows = all.filter((r) => this.matches(r));
    if (this.sort) {
      const { col, asc } = this.sort;
      rows = [...rows].sort((a, b) => {
        const x = a[col], y = b[col];
        if (x === y) return 0;
        return (x > y ? 1 : -1) * (asc ? 1 : -1);
      });
    }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    if (this._single) {
      if (this._single === 'one' && rows.length !== 1) {
        return { data: null, error: { message: 'no rows', code: 'PGRST116' } };
      }
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
}

// ── Realtime-kanaler (ingen websocket — bara ytan) ───────────────────────────

function makeChannel(name) {
  stats.channels.push(name);
  const ch = {
    name,
    on() { return ch; },
    subscribe(cb) { if (typeof cb === 'function') setTimeout(() => cb('SUBSCRIBED'), 0); return ch; },
    unsubscribe() { return Promise.resolve('ok'); },
  };
  return ch;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

const SESSION = {
  access_token: 'stub-token',
  user: { id: USER, email: 'stub@example.test' },
};

const auth = {
  async getSession() { return { data: { session: SESSION }, error: null }; },
  async getUser() { return { data: { user: SESSION.user }, error: null }; },
  async signInWithPassword() { return { data: { session: SESSION }, error: null }; },
  async signOut() { return { error: null }; },
  async updateUser() { return { data: { user: SESSION.user }, error: null }; },
  async resetPasswordForEmail() { return { data: {}, error: null }; },
  onAuthStateChange(cb) {
    // INITIAL_SESSION direkt så requireAuth() släpper igenom utan inloggnings-UI.
    if (typeof cb === 'function') setTimeout(() => cb('INITIAL_SESSION', SESSION), 0);
    return { data: { subscription: { unsubscribe() {} } } };
  },
};

export function createClient() {
  return {
    auth,
    from(table) { return new Query(table); },
    channel(name) { return makeChannel(name); },
    removeChannel() { return Promise.resolve('ok'); },
    rpc() { return new Query('rpc'); },
  };
}

export default { createClient };

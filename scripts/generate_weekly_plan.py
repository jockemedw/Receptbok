import os
import json
import datetime
import anthropic

DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"]

# ── INGREDIENT CATEGORIZATION ──────────────────────────────────────────────────
CATEGORY_KEYWORDS = {
    "Mejeri": [
        "grädde", "mjölk", "smör", "ost", "halloumi", "fetaost",
        "crème fraiche", "yoghurt", "kvarg", "mozzarella", "parmesan",
        "kokosmjölk", "gruyère", "ricotta", "mascarpone",
    ],
    "Grönsaker": [
        "lök", "vitlök", "morot", "purjolök", "blomkål", "broccoli",
        "paprika", "tomat", "gurka", "sallad", "spenat", "zucchini",
        "aubergine", "selleri", "salladslök", "ingefära", "kål",
        "potatis", "svamp", "champinjon", "shiitake", "kantarell",
        "palsternacka", "rättika", "squash", "majs", "ärter",
        "rödlök", "gul lök", "chili", "pak choi", "brysselkål",
    ],
    "Fisk & kött": [
        "torsk", "lax", "räkor", "tonfisk", "kyckling", "fläsk",
        "köttfärs", "nötkött", "bacon", "pancetta", "chorizo", "biff",
        "skaldjur", "tofu", "rödspätta", "sej", "pollock", "makrill",
        "sardiner", "fisk", "kycklingfilé", "kycklinglår",
    ],
    "Frukt": [
        "citron", "lime", "äpple", "banan", "apelsin", "mango",
        "vindruvor", "päron", "persika", "plommon",
    ],
}


def clean_ingredient(ing):
    """Tar bort gruppprefix som 'Marinad: ', 'Sås: ', 'Tillbehör: ' etc."""
    if ":" in ing:
        return ing.split(":", 1)[1].strip()
    return ing.strip()


def categorize(ingredient):
    low = ingredient.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in low for kw in keywords):
            return cat
    return "Skafferi"


def build_shopping_list(selected_ids, all_recipes):
    """Bygger inköpslista exakt från receptdatan — inga hallucinationer möjliga."""
    recipe_map = {r["id"]: r for r in all_recipes}
    categories = {
        "Mejeri": [], "Grönsaker": [], "Fisk & kött": [],
        "Frukt": [], "Skafferi": [], "Övrigt": [],
    }
    seen = set()

    for rid in selected_ids:
        recipe = recipe_map.get(rid)
        if not recipe:
            print(f"      [VARNING] Recept-ID {rid} hittades inte i recipes.json")
            continue
        for raw_ing in recipe.get("ingredients", []):
            ing = clean_ingredient(raw_ing)
            key = ing.lower()
            if key in seen:
                continue
            seen.add(key)
            cat = categorize(ing)
            categories[cat].append(ing)

    return categories


# ── DATE HELPERS ───────────────────────────────────────────────────────────────

def get_date_range():
    today = datetime.date.today()
    start_str = os.environ.get("START_DATE", "").strip()
    end_str   = os.environ.get("END_DATE", "").strip()

    try:
        start = datetime.date.fromisoformat(start_str) if start_str else today
    except ValueError:
        print(f"[VARNING] Ogiltigt START_DATE '{start_str}' — använder idag")
        start = today

    try:
        end = datetime.date.fromisoformat(end_str) if end_str else start + datetime.timedelta(days=6)
    except ValueError:
        print(f"[VARNING] Ogiltigt END_DATE '{end_str}' — använder +6 dagar")
        end = start + datetime.timedelta(days=6)

    if end < start:
        print(f"[VARNING] Slutdatum {end} är före startdatum {start} — justerar till +6 dagar")
        end = start + datetime.timedelta(days=6)

    max_days = 14
    if (end - start).days + 1 > max_days:
        end = start + datetime.timedelta(days=max_days - 1)
        print(f"[VARNING] Max {max_days} dagar — justerade slutdatum till {end}")

    return start, end


def build_day_list(start, end):
    days = []
    current = start
    while current <= end:
        days.append({
            "date": current.isoformat(),
            "day": DAY_NAMES[current.weekday()],
            "is_weekend": current.weekday() >= 5,
        })
        current += datetime.timedelta(days=1)
    return days


# ── CONSTRAINTS ────────────────────────────────────────────────────────────────

def load_constraints():
    """Läser filtreringsinställningar från miljövariabler."""
    def env_int(name, default):
        try:
            return max(0, int(os.environ.get(name, str(default)).strip()))
        except ValueError:
            return default

    proteins_raw = os.environ.get(
        "ALLOWED_PROTEINS", "fisk,kyckling,kött,fläsk,vegetarisk"
    ).strip()
    allowed_proteins = [p.strip() for p in proteins_raw.split(",") if p.strip()]
    if not allowed_proteins:
        allowed_proteins = ["fisk", "kyckling", "kött", "fläsk", "vegetarisk"]

    return {
        "untested_count":  env_int("UNTESTED_COUNT", 0),
        "max_weekday_time": env_int("MAX_WEEKDAY_TIME", 30),
        "max_weekend_time": env_int("MAX_WEEKEND_TIME", 60),
        "vegetarian_days": env_int("VEGETARIAN_DAYS", 0),
        "allowed_proteins": allowed_proteins,
    }


def filter_recipes(recipes, constraints):
    """Förfiltrerar recept baserat på hårda begränsningar (protein, provat, tid)."""
    allowed = set(constraints["allowed_proteins"])
    untested_ok = constraints["untested_count"] > 0
    max_wd = constraints["max_weekday_time"]
    max_we = constraints["max_weekend_time"]

    filtered = []
    for r in recipes:
        # Proteinfilter
        if r["protein"] not in allowed:
            continue
        # Provat-filter
        if not untested_ok and not r.get("tested", False):
            continue
        # Tidsfilter: receptet måste passa minst en dagtyp
        t = r["time"] or 999
        tags = r["tags"]
        is_weekday_ok = "vardag30" in tags and t <= max_wd
        is_weekend_ok = "helg60" in tags and t <= max_we
        if not is_weekday_ok and not is_weekend_ok:
            continue
        filtered.append(r)

    return filtered


# ── RECIPES ────────────────────────────────────────────────────────────────────

def load_recipes():
    with open("recipes.json", encoding="utf-8") as f:
        data = json.load(f)

    recipes = []
    for r in data["recipes"]:
        recipes.append({
            "id": r["id"],
            "title": r["title"],
            "time": r.get("time"),
            "tags": r.get("tags", []),
            "protein": r.get("protein"),
            "tested": r.get("tested", False),
            "ingredients": r.get("ingredients", []),
        })
    return recipes


# ── PROMPT ─────────────────────────────────────────────────────────────────────

def build_prompt(recipes, day_list, constraints):
    slim = [
        {"id": r["id"], "title": r["title"], "time": r["time"],
         "tags": r["tags"], "protein": r["protein"], "tested": r["tested"]}
        for r in recipes
    ]
    recipes_json = json.dumps(slim, ensure_ascii=False)
    n = len(day_list)

    days_text = "\n".join(
        f"- {d['day']} ({d['date']}): {'helg60' if d['is_weekend'] else 'vardag30'}"
        for d in day_list
    )

    days_template = json.dumps(
        [{"date": d["date"], "day": d["day"], "recipe": "<exact title>", "recipeId": 0}
         for d in day_list],
        ensure_ascii=False, indent=2
    )

    max_wd = constraints["max_weekday_time"]
    max_we = constraints["max_weekend_time"]
    untested = constraints["untested_count"]
    veg_days = constraints["vegetarian_days"]

    extra_rules = []
    rule_num = 6
    if untested == 0:
        extra_rules.append(f"{rule_num}. ONLY select recipes where tested=true.")
    else:
        extra_rules.append(f"{rule_num}. At most {untested} selected recipe(s) may have tested=false.")
    rule_num += 1

    if veg_days > 0:
        extra_rules.append(
            f"{rule_num}. Exactly {veg_days} of the {n} days must use a vegetarian recipe (protein='vegetarisk')."
        )

    extra_rules_text = "\n".join(extra_rules)

    return f"""
You are a meal planner for a Swedish family. Select {n} recipes from the recipe
database below — one per day — for the period listed.

## Rules
1. Days tagged "vardag30" MUST use recipes tagged "vardag30" (max {max_wd} min).
2. Days tagged "helg60" MUST use recipes tagged "helg60" (max {max_we} min).
3. Do not repeat the same recipe or the same protein type more than twice across all days.
4. Vary protein types across the days for nutritional balance.
5. Copy recipe titles and IDs EXACTLY as they appear in the database.
{extra_rules_text}

## Days to plan
{days_text}

## Recipe database
{recipes_json}

## Required output format
Return ONLY a JSON array — no other text outside the array:

{days_template}
""".strip()


# ── CLAUDE API ─────────────────────────────────────────────────────────────────

def call_claude(recipes, day_list, constraints):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = build_prompt(recipes, day_list, constraints)

    models_to_try = ["claude-haiku-4-5-20251001", "claude-haiku-4-5"]
    last_error = None

    for model in models_to_try:
        try:
            print(f"      Provar modell: {model}")
            message = client.messages.create(
                model=model,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            print(f"      stop_reason: {message.stop_reason}")
            raw = message.content[0].text.strip() if message.content else ""
            print(f"      Svar (första 200 tecken): {raw[:200]}")

            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip().rstrip("```").strip()

            if not raw:
                raise ValueError("Tom respons från modellen")

            days = json.loads(raw)
            if not isinstance(days, list):
                raise ValueError(f"Förväntade en array, fick: {type(days)}")
            return days

        except Exception as e:
            print(f"      Modell {model} misslyckades: {e}")
            last_error = e

    raise last_error


# ── OUTPUT ─────────────────────────────────────────────────────────────────────

def write_outputs(days, shopping_categories, start, end):
    today = datetime.date.today().isoformat()

    with open("weekly-plan.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated": today,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "days": days,
        }, f, ensure_ascii=False, indent=2)

    with open("shopping-list.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated": today,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "categories": shopping_categories,
        }, f, ensure_ascii=False, indent=2)


# ── MAIN ───────────────────────────────────────────────────────────────────────

def main():
    print("[1/5] Beräknar datumintervall...")
    start, end = get_date_range()
    day_list = build_day_list(start, end)
    print(f"      {start} – {end} ({len(day_list)} dagar)")

    print("[2/5] Läser inställningar...")
    constraints = load_constraints()
    print(f"      Proteiner: {', '.join(constraints['allowed_proteins'])}")
    print(f"      Oprövade max: {constraints['untested_count']}, Vegetariska: {constraints['vegetarian_days']}")
    print(f"      Max tid vardag: {constraints['max_weekday_time']} min, helg: {constraints['max_weekend_time']} min")

    print("[3/5] Läser och filtrerar recipes.json...")
    all_recipes = load_recipes()
    recipes = filter_recipes(all_recipes, constraints)
    print(f"      {len(all_recipes)} recept laddade, {len(recipes)} efter filtrering.")
    if not recipes:
        raise RuntimeError("Inga recept kvar efter filtrering — justera inställningarna.")

    print("[4/5] Anropar Claude API (väljer recept)...")
    days = call_claude(recipes, day_list, constraints)
    print(f"      {len(days)} dagar planerade.")

    print("[4.5/5] Bygger inköpslista från receptdata...")
    selected_ids = [d.get("recipeId") for d in days if d.get("recipeId")]
    shopping_categories = build_shopping_list(selected_ids, all_recipes)
    total_items = sum(len(v) for v in shopping_categories.values())
    print(f"      {total_items} varor i {len([c for c in shopping_categories.values() if c])} kategorier.")

    print("[5/5] Skriver JSON-filer...")
    write_outputs(days, shopping_categories, start, end)
    print("      Klart. Filer skrivna: weekly-plan.json, shopping-list.json")


if __name__ == "__main__":
    main()

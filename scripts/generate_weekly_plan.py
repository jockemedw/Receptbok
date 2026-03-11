import os
import sys
import json
import datetime
import requests
import anthropic

WILLYS_URL = (
    "https://www.willys.se/search/campaigns/offline"
    "?q=*&type=PRICE_REDUCTION&size=50&page=0&store=c371GA"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.willys.se/",
    "Origin": "https://www.willys.se",
    "Connection": "keep-alive",
    "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24"',
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"]


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


def fetch_willys_offers():
    try:
        response = requests.get(WILLYS_URL, headers=HEADERS, timeout=15)
        response.raise_for_status()
        data = response.json()

        docs = data.get("results", {}).get("docs", [])
        offers = []
        for doc in docs:
            name = doc.get("displayName") or doc.get("name", "")
            promotions = doc.get("potentialPromotions", [{}])
            offer_price = promotions[0].get("price", {}).get("value") if promotions else None
            normal_price = doc.get("price", {}).get("value")
            unit = doc.get("comparePrice", "") or doc.get("priceUnit", "")

            if name and offer_price:
                offers.append({
                    "name": name,
                    "normalPrice": normal_price,
                    "offerPrice": float(offer_price),
                    "unit": unit,
                })
        return offers

    except Exception as e:
        print(f"[WILLYS] Kunde inte hämta erbjudanden: {e}")
        return []


def load_recipes():
    with open("recipes.json", encoding="utf-8") as f:
        data = json.load(f)

    slim = []
    for r in data["recipes"]:
        slim.append({
            "id": r["id"],
            "title": r["title"],
            "time": r.get("time"),
            "tags": r.get("tags", []),
            "protein": r.get("protein"),
            "ingredients": r.get("ingredients", []),
        })
    return slim


def build_prompt(recipes, offers, day_list):
    recipes_json = json.dumps(recipes, ensure_ascii=False)
    offers_json  = json.dumps(offers, ensure_ascii=False)
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

    return f"""
You are a meal planner for a Swedish family. Select {n} recipes from the recipe
database below — one per day — for the period listed.

## Rules
1. Days tagged "vardag30" MUST use recipes tagged "vardag30" (quick weekday meals, ≤30 min).
2. Days tagged "helg60" MUST use recipes tagged "helg60" (weekend meals, up to 60 min).
3. Do not repeat the same recipe or the same protein type more than twice across all days.
4. PREFER recipes whose main protein or key ingredients are on sale at Willys (see offers).
   This is a preference, not a hard requirement.
5. Vary protein types across the days for nutritional balance.
6. All recipe titles in the output MUST be copied exactly as they appear in the database.

## Days to plan
{days_text}

## Recipe database
{recipes_json}

## Current Willys offers
{offers_json}

## Required output format
Return a single JSON object with exactly this structure:

{{
  "days": {days_template},
  "shoppingList": {{
    "Mejeri":      ["<item>", ...],
    "Grönsaker":   ["<item>", ...],
    "Fisk & kött": ["<item>", ...],
    "Skafferi":    ["<item>", ...],
    "Frukt":       ["<item>", ...],
    "Övrigt":      ["<item>", ...]
  }}
}}

The shoppingList must consolidate all ingredients from all {n} selected recipes,
merged and deduplicated where possible (e.g. "3 dl grädde" + "1 dl grädde" → "4 dl grädde").
Quantities in Swedish units (dl, g, msk, tsk, st).
Each category may be an empty array [] if no items belong there.
Do not include any text outside the JSON object.
""".strip()


def call_claude(recipes, offers, day_list):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = build_prompt(recipes, offers, day_list)

    models_to_try = ["claude-haiku-4-5-20251001", "claude-haiku-4-5"]
    last_error = None

    for model in models_to_try:
        try:
            print(f"      Provar modell: {model}")
            message = client.messages.create(
                model=model,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            return json.loads(message.content[0].text)
        except Exception as e:
            print(f"      Modell {model} misslyckades: {e}")
            last_error = e

    raise last_error


def write_outputs(plan_data, offers, start, end):
    today = datetime.date.today().isoformat()

    with open("offers.json", "w", encoding="utf-8") as f:
        json.dump({
            "fetched": today,
            "source": "willys",
            "offers": offers,
        }, f, ensure_ascii=False, indent=2)

    with open("weekly-plan.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated": today,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "days": plan_data["days"],
        }, f, ensure_ascii=False, indent=2)

    with open("shopping-list.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated": today,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "categories": plan_data["shoppingList"],
        }, f, ensure_ascii=False, indent=2)


def main():
    print("[1/5] Beräknar datumintervall...")
    start, end = get_date_range()
    day_list = build_day_list(start, end)
    print(f"      {start} – {end} ({len(day_list)} dagar)")

    print("[2/5] Hämtar Willys-erbjudanden...")
    offers = fetch_willys_offers()
    print(f"      Hittade {len(offers)} erbjudanden.")

    print("[3/5] Läser recipes.json...")
    recipes = load_recipes()
    print(f"      {len(recipes)} recept laddade.")

    print("[4/5] Anropar Claude API...")
    plan_data = call_claude(recipes, offers, day_list)
    print("      Svar mottaget.")

    print("[5/5] Skriver JSON-filer...")
    write_outputs(plan_data, offers, start, end)
    print("      Klart. Filer skrivna: offers.json, weekly-plan.json, shopping-list.json")


if __name__ == "__main__":
    main()

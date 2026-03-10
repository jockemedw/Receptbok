import os
import json
import datetime
import requests
from google import genai
from google.genai import types

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
    "Accept": "application/json",
}


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


def build_prompt(recipes, offers):
    recipes_json = json.dumps(recipes, ensure_ascii=False)
    offers_json = json.dumps(offers, ensure_ascii=False)

    return f"""
You are a meal planner for a Swedish family. Your job is to select 7 recipes from
the recipe database below and create a weekly dinner plan for Monday through Sunday.

## Rules
1. Monday–Friday must use recipes tagged "vardag30" (quick weekday meals, ≤30 min).
2. Saturday–Sunday must use recipes tagged "helg60" (weekend meals, up to 60 min).
3. Do not repeat the same recipe or the same protein type more than twice in the week.
4. PREFER recipes whose main protein or key ingredients are currently on sale at Willys
   (see offers list below). This is a preference, not a hard requirement.
5. Vary the protein types across the week for nutritional balance.
6. All recipe titles and ingredient strings in the output MUST be copied exactly as
   they appear in the recipe database — do not translate or rewrite them.

## Day mapping
- Måndag    → weekday (vardag30)
- Tisdag    → weekday (vardag30)
- Onsdag    → weekday (vardag30)
- Torsdag   → weekday (vardag30)
- Fredag    → weekday (vardag30)
- Lördag    → weekend (helg60)
- Söndag    → weekend (helg60)

## Recipe database
{recipes_json}

## Current Willys offers
{offers_json}

## Required output format
Return a single JSON object with exactly this structure:

{{
  "days": [
    {{"day": "Måndag",  "recipe": "<exact title from database>", "recipeId": <integer>}},
    {{"day": "Tisdag",  "recipe": "<exact title from database>", "recipeId": <integer>}},
    {{"day": "Onsdag",  "recipe": "<exact title from database>", "recipeId": <integer>}},
    {{"day": "Torsdag", "recipe": "<exact title from database>", "recipeId": <integer>}},
    {{"day": "Fredag",  "recipe": "<exact title from database>", "recipeId": <integer>}},
    {{"day": "Lördag",  "recipe": "<exact title from database>", "recipeId": <integer>}},
    {{"day": "Söndag",  "recipe": "<exact title from database>", "recipeId": <integer>}}
  ],
  "shoppingList": {{
    "Mejeri":      ["<item>", ...],
    "Grönsaker":   ["<item>", ...],
    "Fisk & kött": ["<item>", ...],
    "Skafferi":    ["<item>", ...],
    "Frukt":       ["<item>", ...],
    "Övrigt":      ["<item>", ...]
  }}
}}

The shoppingList must consolidate all ingredients from all 7 selected recipes,
merged and deduplicated where possible (e.g. "3 dl grädde" + "1 dl grädde" → "4 dl grädde").
Quantities should be in Swedish units (dl, g, msk, tsk, st).
Each category may be an empty array [] if no items belong there.
Do not include any text outside the JSON object.
""".strip()


def call_gemini(recipes, offers):
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    prompt = build_prompt(recipes, offers)
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )
    return json.loads(response.text)


def write_outputs(plan_data, offers):
    today = datetime.date.today().isoformat()
    week_num = datetime.date.today().isocalendar()[1]

    with open("offers.json", "w", encoding="utf-8") as f:
        json.dump({
            "fetched": today,
            "source": "willys",
            "offers": offers,
        }, f, ensure_ascii=False, indent=2)

    with open("weekly-plan.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated": today,
            "week": week_num,
            "days": plan_data["days"],
        }, f, ensure_ascii=False, indent=2)

    with open("shopping-list.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated": today,
            "categories": plan_data["shoppingList"],
        }, f, ensure_ascii=False, indent=2)


def main():
    print("[1/4] Hämtar Willys-erbjudanden...")
    offers = fetch_willys_offers()
    print(f"      Hittade {len(offers)} erbjudanden.")

    print("[2/4] Läser recipes.json...")
    recipes = load_recipes()
    print(f"      {len(recipes)} recept laddade.")

    print("[3/4] Anropar Gemini API...")
    plan_data = call_gemini(recipes, offers)
    print("      Svar mottaget.")

    print("[4/4] Skriver JSON-filer...")
    write_outputs(plan_data, offers)
    print("      Klart. Filer skrivna: offers.json, weekly-plan.json, shopping-list.json")


if __name__ == "__main__":
    main()

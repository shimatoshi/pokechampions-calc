#!/usr/bin/env python3
"""Scrape Champions-specific learnsets from Serebii."""
import re, json, time, sys, os
from urllib.request import Request, urlopen
from html.parser import HTMLParser

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
BASE = "https://www.serebii.net/pokedex-champions"

def fetch(url):
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

def get_pokemon_list():
    html = fetch("https://www.serebii.net/pokemonchampions/pokemon.shtml")
    names = re.findall(r'href="/pokedex-champions/([^/]+)/"', html)
    return sorted(set(names))

def parse_moves(html):
    """Extract move names from the Standard Moves table."""
    moves = []
    # Find all move links in attackdex-champions
    for m in re.finditer(r'href="/attackdex-champions/([^."]+)\.shtml"[^>]*>([^<]+)</a>', html):
        slug, name = m.group(1), m.group(2).strip()
        if name and name not in moves:
            moves.append(name)
    return moves

def main():
    out_file = "/home/pokechampions-calc/static/data/champions_learnsets.json"

    # Resume support
    if os.path.exists(out_file):
        with open(out_file) as f:
            result = json.load(f)
        print(f"Resuming: {len(result)} already done")
    else:
        result = {}

    pokemon_list = get_pokemon_list()
    print(f"Total Champions pokemon: {len(pokemon_list)}")

    for i, name in enumerate(pokemon_list):
        if name in result:
            continue
        url = f"{BASE}/{name}/"
        try:
            html = fetch(url)
            moves = parse_moves(html)
            result[name] = moves
            print(f"[{i+1}/{len(pokemon_list)}] {name}: {len(moves)} moves")
            # Save after each fetch
            with open(out_file, "w") as f:
                json.dump(result, f, ensure_ascii=False)
            time.sleep(0.5)  # polite delay
        except Exception as e:
            print(f"[{i+1}/{len(pokemon_list)}] {name}: ERROR {e}", file=sys.stderr)
            time.sleep(2)

    print(f"\nDone! {len(result)} pokemon saved to {out_file}")

if __name__ == "__main__":
    main()

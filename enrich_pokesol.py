#!/usr/bin/env python3
"""champions_sample_teams.json の各チームについて、出典が pokesol.app のものは
記事ペイロードをデコードして 特性/性格/努力値(SP)/技/持ち物 を取得し、
並び順(同一)で各メンバーに上書きする。"""
import re, json, os, sys, time, html as H
from urllib.request import Request, urlopen
import pokesol_decode as pdc

ROOT = os.path.dirname(__file__)
DATA = os.path.join(ROOT, "static", "data")
TEAMS = os.path.join(ROOT, "champions_sample_teams.json")
CACHE = os.path.join(ROOT, ".article_cache")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
os.makedirs(CACHE, exist_ok=True)

def L(f): return json.load(open(os.path.join(DATA, f), encoding="utf-8"))
MJ = L("names_moves_ja.json"); ABJ = L("names_abilities_ja.json")
ja2move = {v: k for k, v in MJ.items()}
ja2ability = {v: k for k, v in ABJ.items()}
ja2item_app = {v: k for k, v in L("names_items_ja.json").items()}

EV_KEYS = {"hp": "hp", "attack": "at", "defense": "df",
           "specialAttack": "sa", "specialDefense": "sd", "speed": "sp"}

unmapped_move, unmapped_ab, unmapped_item = {}, {}, {}

def nat_pm(n):
    plus = minus = ""
    for jk, ak in [("attack", "at"), ("defense", "df"), ("specialAttack", "sa"),
                   ("specialDefense", "sd"), ("speed", "sp")]:
        if n.get(jk) == 1.1: plus = ak
        if n.get(jk) == 0.9: minus = ak
    return plus, minus

def fetch(url):
    key = re.sub(r'[^a-zA-Z0-9]', '_', url)[-120:] + ".html"
    fp = os.path.join(CACHE, key)
    if os.path.exists(fp):
        return open(fp, encoding="utf-8", errors="replace").read()
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        doc = r.read().decode("utf-8", errors="replace")
    open(fp, "w", encoding="utf-8").write(doc)
    time.sleep(0.8)
    return doc

MASTER = None  # {moves:{id:rec}, items:..., natures:..., abilities:...}

def get_master(doc):
    global MASTER
    if MASTER is None:
        MASTER = pdc.build_master(doc)
    return MASTER

def extract_sets(doc):
    """return list of dicts: {item, ability, plus, minus, sp, moves}"""
    md = get_master(doc)
    if not md:
        return None
    M, I, N, AB = md["moves"], md["items"], md["natures"], md["abilities"]
    body = pdc.get_article_body(doc)
    if body is None:
        return None
    sets = []
    for c in re.findall(r'<div ([^>]*data-type="pokemon-card"[^>]*)>', body):
        at = dict(re.findall(r'(data-[a-z-]+)="([^"]*)"', c))
        # 持ち物なし等で一部属性が欠ける個体があるため、必須はpokemon-idのみ。
        # 他は欠損を許容(なし=0/空)してカードを落とさない。
        if "data-pokemon-id" not in at:
            continue
        try:
            nid = int(at.get("data-nature-id") or 0)
            iid = int(at.get("data-item-id") or 0)
            abids = json.loads(at.get("data-ability-ids") or "[]")
            mids = json.loads(at.get("data-move-ids") or "[]")
            evs = json.loads(H.unescape(at.get("data-evs") or "{}"))
        except Exception:
            continue
        plus, minus = nat_pm(N.get(nid, {}))
        item_ja = I.get(iid, {}).get("name", "")
        ab_ja = AB.get(abids[0], {}).get("name", "") if abids else ""
        moves_ja = [M.get(x, {}).get("name", "") for x in mids]
        sets.append({"item_ja": item_ja, "ab_ja": ab_ja, "plus": plus, "minus": minus,
                     "evs": evs, "moves_ja": moves_ja})
    return sets

def main():
    data = json.load(open(TEAMS, encoding="utf-8"))
    teams = data["teams"]
    enriched = 0; skipped = 0; errors = 0
    for t in teams:
        m = re.search(r'出典:\s*(\S+)', t["notes"])
        url = m.group(1) if m else ""
        if "pokesol.app" not in url:
            continue
        try:
            doc = fetch(url)
            sets = extract_sets(doc)
        except Exception as e:
            errors += 1
            print(f"ERR {url}: {e}", file=sys.stderr)
            continue
        if not sets or len(sets) != len(t["members"]):
            skipped += 1
            continue
        for mem, s in zip(t["members"], sets):
            # 特性
            ab = ja2ability.get(s["ab_ja"])
            if ab: mem["ability"] = ab
            elif s["ab_ja"]: unmapped_ab[s["ab_ja"]] = unmapped_ab.get(s["ab_ja"], 0) + 1
            # 性格
            mem["natureMods"] = {"plus": s["plus"], "minus": s["minus"]}
            # 努力値(SP)
            mem["sp"] = {EV_KEYS[k]: int(v) for k, v in s["evs"].items() if k in EV_KEYS}
            for ak in ["hp", "at", "df", "sa", "sd", "sp"]:
                mem["sp"].setdefault(ak, 0)
            # 技
            mv = []
            for mj in s["moves_ja"]:
                en = ja2move.get(mj)
                if en: mv.append(en)
                elif mj: unmapped_move[mj] = unmapped_move.get(mj, 0) + 1
            mem["moves"] = (mv + ["", "", "", ""])[:4]
            # 持ち物 (pokesol優先)
            it = ja2item_app.get(s["item_ja"])
            if it: mem["item"] = it
            elif s["item_ja"]: unmapped_item[s["item_ja"]] = unmapped_item.get(s["item_ja"], 0) + 1
        t["enriched"] = "pokesol"
        enriched += 1

    json.dump(data, open(TEAMS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nenriched={enriched} skipped(count-mismatch)={skipped} errors={errors}")
    for label, d in [("move", unmapped_move), ("ability", unmapped_ab), ("item", unmapped_item)]:
        if d:
            print(f"\n== unmapped {label} ==")
            for k, v in sorted(d.items(), key=lambda x: -x[1])[:30]:
                print(f"  {k}: {v}")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""pokesol出典で「カード数不一致」によりスキップされたチームを救済する。

通常の enrich_pokesol.py は記事本文のカードを出現順にzipするが、記事によっては
本文中に対戦相手例や別案カードが混在し、カード数がメンバー数と一致せず丸ごと
スキップされる。ここでは:
  1. 既にenrich成功した(=順序一致が保証された)チームから
     「pokesonのpokemon-id -> メンバー英語名」を実データで学習する。
  2. 学習した対応で、スキップ済みチームのカードをメンバーへ名前照合し、
     一意に割り当てられた個体だけを上書きする(曖昧・該当なしは触らない=安全)。
"""
import re, json, os, sys, html as H
from collections import Counter, defaultdict
import pokesol_decode as pdc

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "static", "data")
TEAMS = os.path.join(ROOT, "champions_sample_teams.json")
CACHE = os.path.join(ROOT, ".article_cache")

def L(f): return json.load(open(os.path.join(DATA, f), encoding="utf-8"))
ja2move = {v: k for k, v in L("names_moves_ja.json").items()}
ja2ability = {v: k for k, v in L("names_abilities_ja.json").items()}
ja2item = {v: k for k, v in L("names_items_ja.json").items()}

EV_KEYS = {"hp": "hp", "attack": "at", "defense": "df",
           "specialAttack": "sa", "specialDefense": "sd", "speed": "sp"}

def cache_path(url):
    return os.path.join(CACHE, re.sub(r'[^a-zA-Z0-9]', '_', url)[-120:] + ".html")

def nat_pm(n):
    plus = minus = ""
    for jk, ak in [("attack", "at"), ("defense", "df"), ("specialAttack", "sa"),
                   ("specialDefense", "sd"), ("speed", "sp")]:
        if n.get(jk) == 1.1: plus = ak
        if n.get(jk) == 0.9: minus = ak
    return plus, minus

def cards_of(doc):
    """記事本文のカードを (pid, set) のリストで返す"""
    md = pdc.build_master(doc)
    body = pdc.get_article_body(doc) if md else None
    if not md or not body:
        return None, None
    M, I, N, AB = md["moves"], md["items"], md["natures"], md["abilities"]
    out = []
    for c in re.findall(r'<div ([^>]*data-type="pokemon-card"[^>]*)>', body):
        at = dict(re.findall(r'(data-[a-z-]+)="([^"]*)"', c))
        if "data-pokemon-id" not in at:
            continue
        try:
            pid = int(at["data-pokemon-id"])
            nid = int(at.get("data-nature-id") or 0)
            iid = int(at.get("data-item-id") or 0)
            abids = json.loads(at.get("data-ability-ids") or "[]")
            mids = json.loads(at.get("data-move-ids") or "[]")
            evs = json.loads(H.unescape(at.get("data-evs") or "{}"))
        except Exception:
            continue
        plus, minus = nat_pm(N.get(nid, {}))
        s = {"ab_ja": AB.get(abids[0], {}).get("name", "") if abids else "",
             "item_ja": I.get(iid, {}).get("name", ""),
             "plus": plus, "minus": minus, "evs": evs,
             "moves_ja": [M.get(x, {}).get("name", "") for x in mids]}
        out.append((pid, s))
    return md, out

def apply(mem, s):
    ab = ja2ability.get(s["ab_ja"])
    if ab: mem["ability"] = ab
    mem["natureMods"] = {"plus": s["plus"], "minus": s["minus"]}
    mem["sp"] = {EV_KEYS[k]: int(v) for k, v in s["evs"].items() if k in EV_KEYS}
    for ak in ("hp", "at", "df", "sa", "sd", "sp"):
        mem["sp"].setdefault(ak, 0)
    mv = [ja2move[mj] for mj in s["moves_ja"] if mj in ja2move]
    mem["moves"] = (mv + ["", "", "", ""])[:4]
    it = ja2item.get(s["item_ja"])
    if it: mem["item"] = it

def main():
    data = json.load(open(TEAMS, encoding="utf-8"))
    teams = data["teams"]

    # --- 1. 成功済みpokesolチームから pid -> 英語名 を学習 ---
    pid2name = defaultdict(Counter)
    for t in teams:
        if t.get("enriched") != "pokesol":
            continue
        m = re.search(r'出典:\s*(\S+)', t.get("notes", ""))
        if not m or "pokesol.app" not in m.group(1):
            continue
        fp = cache_path(m.group(1))
        if not os.path.exists(fp):
            continue
        _, cards = cards_of(open(fp, encoding="utf-8", errors="replace").read())
        if not cards or len(cards) != len(t["members"]):
            continue
        for (pid, _), mem in zip(cards, t["members"]):
            pid2name[pid][mem["name"]] += 1
    pid_name = {pid: c.most_common(1)[0][0] for pid, c in pid2name.items()}
    print(f"学習: pid->英語名 {len(pid_name)}種")

    # --- 2. スキップ済みpokesolチームを名前照合で救済 ---
    rescued = partial = stillskip = 0
    for t in teams:
        if t.get("enriched"):
            continue
        m = re.search(r'出典:\s*(\S+)', t.get("notes", ""))
        url = m.group(1) if m else ""
        if "pokesol.app" not in url:
            continue
        fp = cache_path(url)
        if not os.path.exists(fp):
            stillskip += 1; continue
        _, cards = cards_of(open(fp, encoding="utf-8", errors="replace").read())
        if not cards:
            stillskip += 1; continue
        # pid -> [set,...] (重複カードは候補として保持)
        by_name = defaultdict(list)
        for pid, s in cards:
            nm = pid_name.get(pid)
            if nm:
                by_name[nm].append(s)
        applied = 0
        for mem in t["members"]:
            cand = by_name.get(mem["name"])
            # 一意に決まる個体のみ適用(同名複数候補が別内容なら曖昧→触らない)
            if cand and len({json.dumps(x, sort_keys=True) for x in cand}) == 1:
                apply(mem, cand[0]); applied += 1
        if applied == len(t["members"]):
            t["enriched"] = "pokesol"; rescued += 1
        elif applied:
            t["enriched"] = "pokesol-partial"; partial += 1
        else:
            stillskip += 1

    json.dump(data, open(TEAMS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"救済(全員一致)={rescued} 部分={partial} なお不可={stillskip}")

if __name__ == "__main__":
    main()

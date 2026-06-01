#!/usr/bin/env python3
"""champs.pokedb.tokyo の構築記事一覧をスクレイプして
pokechampions-calc のインポート用 JSON ({teams:[...]}) を生成する。

各カードから取得できるのは「並び(6匹)+持ち物+順位/レート/記事タイトル/外部URL」。
技・特性・努力値は外部ブログ側のため、ここでは並び+持ち物のみをサンプル化する。
メガ表記は formes 逆引きで基本形+メガストーンに変換する。
"""
import re, json, time, sys, os, uuid, unicodedata, difflib
from urllib.request import Request, urlopen

BASE = "https://champs.pokedb.tokyo/article/search"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
DATA_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
OUT = os.path.join(os.path.dirname(__file__), "champions_sample_teams.json")
MAX_PAGES = 40

def load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)

# JA -> EN 逆引きマップ
PJ = load("names_pokemon_ja.json")   # EN -> JA
IJ = load("names_items_ja.json")     # EN -> JA
POKE = load("data_pokemon.json")
def norm(s):
    return unicodedata.normalize("NFKC", s).strip()

ja2poke = {v: k for k, v in PJ.items()}
ja2poke.update({norm(v): k for k, v in PJ.items()})
ja2item = {v: k for k, v in IJ.items()}
ja2item.update({norm(v): k for k, v in IJ.items()})

REGION_PREFIX = {"ヒスイ": "ヒスイ", "アローラ": "アローラ", "ガラル": "ガラル", "パルデア": "パルデア"}

def poke_candidates(ja):
    ja = ja.strip()
    cands = [ja, norm(ja)]
    # コロン区切りフォルム (例: フラエッテ:永遠, ケンタロス:炎)
    if ":" in ja or "：" in ja:
        base = re.split(r'[:：]', ja)[0].strip()
        cands += [base, norm(base)]
    m = re.match(r'^(.+?)\s*[（(]\s*(.+?)\s*[）)]\s*$', ja)
    if m:
        base, reg = m.group(1).strip(), norm(m.group(2).strip())
        if reg in REGION_PREFIX:
            cands.append(REGION_PREFIX[reg] + base)
        if reg in ("オス", "♂"):
            cands.append(base)
        if reg in ("メス", "♀"):
            cands += [base + "(♀)", norm(base + "(♀)")]
        cands.append(base)
    return cands

# メガストーン等(◯◯ナイト)はpokedbが長音/ンを省く表記ゆれがあるため近似マッチ
NITE_JA = [v for v in IJ.values() if v.endswith("ナイト")]
POKE_JA = list(PJ.values())
SKIP_POKE = {"不明", "?", ""}
SKIP_ITEM = {"持ち物なし", "不明", "", "ひかりのこな"}  # ひかりのこなはアプリ未対応
# メガ等 -> 基本形 (formes から逆引き)
forme2base = {}
for base, d in POKE.items():
    for f in (d.get("formes") or []):
        if f != base and ("Mega" in f or f.startswith("Mega ")):
            forme2base[f] = base

def fetch(url):
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

CARD_RE = re.compile(r'<article class="card article-card">(.*?)</article>', re.S)
RANK_RE = re.compile(r'<span>(\d+)位</span>')
RATE_RE = re.compile(r'rating-integer">(\d+)</span><span class="rating-decimal">(\.?\d+)?')
SEASON_RE = re.compile(r'tag is-primary marginless">([^<]+)</span>')
TRAINER_RE = re.compile(r'<p class="title is-6 has-text-weight-normal">([^<]*)</p>')
FOOTER_RE = re.compile(r'<footer class="card-footer">\s*<a href="([^"]+)"[^>]*>\s*<span>([^<]*)</span>', re.S)
POKESTART_RE = re.compile(r'<div class="article-card-pokemon">')
POKETITLE_RE = re.compile(r'poke-icon[^>]*?title="([^"]+)"', re.S)
DEX_RE = re.compile(r'dex-(\d{4})-(\d{2})-96')
ITEMTITLE_RE = re.compile(r'item-icon[^>]*?title="([^"]+)"', re.S)

unmapped_poke, unmapped_item = {}, {}

def map_poke(ja):
    if ja.strip() in SKIP_POKE:
        return None
    en = None
    for c in poke_candidates(ja):
        if c in ja2poke:
            en = ja2poke[c]
            break
    if not en:  # 最終手段: 表記ゆれを近似マッチ
        close = difflib.get_close_matches(norm(ja), [norm(v) for v in POKE_JA], n=1, cutoff=0.72)
        if close:
            for v in POKE_JA:
                if norm(v) == close[0]:
                    en = ja2poke[v]
                    break
    if not en:
        unmapped_poke[ja] = unmapped_poke.get(ja, 0) + 1
        return None
    base = forme2base.get(en, en)
    return base

def map_item(ja):
    if not ja or ja.strip() in SKIP_ITEM:
        return ""
    en = ja2item.get(ja) or ja2item.get(norm(ja))
    if not en and ja.endswith("ナイト"):
        close = difflib.get_close_matches(ja, NITE_JA, n=1, cutoff=0.6)
        if close:
            en = ja2item[close[0]]
    if not en:
        unmapped_item[ja] = unmapped_item.get(ja, 0) + 1
        return ""
    return en

def first_ability(en):
    ab = (POKE.get(en, {}).get("abilities") or [])
    return ab[0] if ab else ""

def make_member(poke_en, item_en):
    return {
        "uid": str(uuid.uuid4()),
        "name": poke_en,
        "natureMods": {"plus": "", "minus": ""},
        "sp": {"hp": 0, "at": 0, "df": 0, "sa": 0, "sd": 0, "sp": 0},
        "boosts": {"at": 0, "df": 0, "sa": 0, "sd": 0, "sp": 0},
        "item": item_en,
        "ability": first_ability(poke_en),
        "status": "",
        "moves": ["", "", "", ""],
        "currentHP": None,
        "disguiseIntact": False,
        "hpDist": None,
        "chainHits": 0,
    }

def parse_card(html):
    rank = RANK_RE.search(html)
    rate = RATE_RE.search(html)
    season = SEASON_RE.search(html)
    trainer = TRAINER_RE.search(html)
    footer = FOOTER_RE.search(html)
    members = []
    starts = [m.start() for m in POKESTART_RE.finditer(html)]
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else len(html)
        blk = html[s:e]
        pt = POKETITLE_RE.search(blk)
        if not pt:
            continue
        poke_en = map_poke(pt.group(1).strip())
        if not poke_en:
            continue
        it = ITEMTITLE_RE.search(blk)
        item_en = map_item(it.group(1).strip() if it else "")
        members.append(make_member(poke_en, item_en))
    if not members:
        return None
    rank_s = rank.group(1) if rank else "?"
    season_s = season.group(1).strip() if season else ""
    title_s = (footer.group(2).strip() if footer else "") or "無題"
    trainer_s = trainer.group(1).strip() if trainer else ""
    url_s = footer.group(1) if footer else ""
    rate_s = (rate.group(1) + (rate.group(2) or "")) if rate else ""
    tag = " ".join(x for x in [season_s, (rank_s + "位") if rank_s.isdigit() else ""] if x)
    name = (f"[{tag}] " if tag else "") + title_s
    if trainer_s:
        name += f" / {trainer_s}"
    notes = f"順位:{rank_s}位 レート:{rate_s} シーズン:{season_s}\n出典: {url_s}"
    return {"name": name[:120], "members": members, "notes": notes,
            "updatedAt": int(time.time() * 1000),
            "_rank": int(rank_s) if rank_s.isdigit() else 9999,
            "_season": season_s, "_url": url_s}

def main():
    teams = []
    seen_urls = set()
    for page in range(1, MAX_PAGES + 1):
        url = f"{BASE}?page={page}"
        try:
            html = fetch(url)
        except Exception as e:
            print(f"page {page}: ERROR {e}", file=sys.stderr)
            break
        cards = CARD_RE.findall(html)
        if not cards:
            print(f"page {page}: no cards -> stop")
            break
        added = 0
        for c in cards:
            t = parse_card(c)
            if not t:
                continue
            key = t["_url"] or t["name"]
            if key in seen_urls:
                continue
            seen_urls.add(key)
            teams.append(t)
            added += 1
        print(f"page {page}: {len(cards)} cards, +{added} teams (total {len(teams)})")
        time.sleep(0.6)

    # sort by season then rank
    teams.sort(key=lambda t: (t["_season"], t["_rank"]))
    for t in teams:
        t.pop("_rank", None); t.pop("_season", None); t.pop("_url", None)

    out = {"teams": teams, "version": 1, "source": "champs.pokedb.tokyo",
           "generatedAt": int(time.time() * 1000)}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"\nSaved {len(teams)} teams -> {OUT}")
    if unmapped_poke:
        print("\n== 未マッチ ポケモン ==")
        for k, v in sorted(unmapped_poke.items(), key=lambda x: -x[1]):
            print(f"  {k}: {v}")
    if unmapped_item:
        print("\n== 未マッチ 持ち物 ==")
        for k, v in sorted(unmapped_item.items(), key=lambda x: -x[1]):
            print(f"  {k}: {v}")

if __name__ == "__main__":
    main()

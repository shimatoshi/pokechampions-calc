#!/usr/bin/env python3
"""champions_sample_teams.json の各チームについて、出典が yakkun.com の
パーティページ(/bbs/party/...)なら、構造化された性格/努力値/技/持ち物を
取得して 並び順(同一)で各メンバーに上書きする。

yakkun のパーティページは EUC-JP。1体ずつ以下のクラスで構造化されている:
  list_nature  ... 性格(JA)
  list_ev      ... 努力値 "… (252表示: HP:252 / 攻撃:12 / 防御:252)"
  list_move    ... 技4つ <a href="?move=ID">技名</a>
  list_item    ... "@ 持ち物名"
各クラスがちょうど6回(=6体)出るので、ドキュメント順にzipする。
"""
import re, json, os, sys, time, unicodedata
from urllib.request import Request, urlopen

def _nfkc(s):
    return unicodedata.normalize("NFKC", s) if isinstance(s, str) else s

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "static", "data")
TEAMS = os.path.join(ROOT, "champions_sample_teams.json")
CACHE = os.path.join(ROOT, ".article_cache")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
os.makedirs(CACHE, exist_ok=True)

def L(f): return json.load(open(os.path.join(DATA, f), encoding="utf-8"))
# 全角/半角の表記ゆれ(例: Thunderbolt="１０まんボルト" vs yakkun"10まんボルト")を
# NFKC正規化で吸収する。
ja2move = {_nfkc(v): k for k, v in L("names_moves_ja.json").items()}
ja2item = {_nfkc(v): k for k, v in L("names_items_ja.json").items()}
EN_NAT = L("data_natures.json")          # EN -> [plus, minus]
NAT_JA = L("names_natures_ja.json")      # EN -> JA
ja2nat = {NAT_JA[en]: EN_NAT.get(en, ["", ""]) for en in NAT_JA if en in EN_NAT}

EV_JA = {"HP": "hp", "攻撃": "at", "防御": "df",
         "特攻": "sa", "特防": "sd", "素早": "sp"}

unmapped_move, unmapped_item = {}, {}

def fetch(url):
    key = re.sub(r'[^a-zA-Z0-9]', '_', url)[-120:] + ".euc.html"
    fp = os.path.join(CACHE, key)
    if os.path.exists(fp):
        return open(fp, encoding="utf-8", errors="replace").read()
    req = Request(url, headers={"User-Agent": UA, "Referer": "https://yakkun.com/",
                                "Accept-Language": "ja,en;q=0.9"})
    with urlopen(req, timeout=30) as r:
        doc = r.read().decode("euc-jp", errors="replace")
    open(fp, "w", encoding="utf-8").write(doc)
    time.sleep(0.8)
    return doc

def _clean(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s)).strip()

def parse(doc):
    """6体分の {plus,minus,sp,moves_ja,item_ja} を順番に返す。揃わなければ None"""
    natures = re.findall(r'class="list_nature"[^>]*>(.*?)</', doc, re.S)
    evs     = re.findall(r'class="list_ev"[^>]*>(.*?)</div>', doc, re.S)
    moves   = re.findall(r'class="list_move"[^>]*>(.*?)</div>', doc, re.S)
    # 持ち物は最初の閉じタグまで(後続の性格/特性テキストを巻き込まない)
    items   = re.findall(r'class="list_item"[^>]*>(.*?)</', doc, re.S)
    if not (len(natures) == len(evs) == len(moves) == len(items) and len(natures) >= 1):
        return None
    sets = []
    for nat_h, ev_h, mv_h, it_h in zip(natures, evs, moves, items):
        nat = _clean(nat_h).lstrip("( ").rstrip(" )")
        plus, minus = ja2nat.get(nat, ["", ""])
        # 努力値: 252表示 を優先
        sp = {k: 0 for k in ("hp", "at", "df", "sa", "sd", "sp")}
        m = re.search(r'252表示[:：]\s*(.+)', _clean(ev_h))
        ev_txt = m.group(1) if m else _clean(ev_h)
        for stat, val in re.findall(r'([HPＨ\w攻撃防御特素早]+)\s*[:：]\s*(\d+)', ev_txt):
            key = EV_JA.get(stat)
            if key:
                sp[key] = int(val)
        # 技: <a href="?move=ID">技名</a> を先頭4つ
        moves_ja = re.findall(r'\?move=\d+"[^>]*>([^<]+)</a>', mv_h)[:4]
        # 持ち物: "@ 名前"
        item_ja = _clean(it_h).lstrip("@ ").split(" (")[0].strip()
        sets.append({"plus": plus, "minus": minus, "sp": sp,
                     "moves_ja": moves_ja, "item_ja": item_ja})
    return sets

def main():
    data = json.load(open(TEAMS, encoding="utf-8"))
    teams = data["teams"]
    enriched = skipped = errors = 0
    for t in teams:
        if t.get("enriched"):
            continue
        m = re.search(r'出典:\s*(\S+)', t.get("notes", ""))
        url = m.group(1) if m else ""
        if "yakkun.com" not in url:
            continue
        try:
            doc = fetch(url)
            sets = parse(doc)
        except Exception as e:
            errors += 1
            print(f"ERR {url}: {e}", file=sys.stderr)
            continue
        if not sets or len(sets) != len(t["members"]):
            skipped += 1
            continue
        for mem, s in zip(t["members"], sets):
            mem["natureMods"] = {"plus": s["plus"], "minus": s["minus"]}
            mem["sp"] = dict(s["sp"])
            mv = []
            for mj in s["moves_ja"]:
                en = ja2move.get(_nfkc(mj))
                if en:
                    mv.append(en)
                elif mj:
                    unmapped_move[mj] = unmapped_move.get(mj, 0) + 1
            mem["moves"] = (mv + ["", "", "", ""])[:4]
            it = ja2item.get(_nfkc(s["item_ja"]))
            if it:
                mem["item"] = it
            elif s["item_ja"]:
                unmapped_item[s["item_ja"]] = unmapped_item.get(s["item_ja"], 0) + 1
        t["enriched"] = "yakkun"
        enriched += 1

    json.dump(data, open(TEAMS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nenriched={enriched} skipped(count-mismatch)={skipped} errors={errors}")
    for label, d in [("move", unmapped_move), ("item", unmapped_item)]:
        if d:
            print(f"\n== unmapped {label} ==")
            for k, v in sorted(d.items(), key=lambda x: -x[1])[:30]:
                print(f"  {k}: {v}")

if __name__ == "__main__":
    main()

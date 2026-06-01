#!/usr/bin/env python3
"""pokesol.app の React Router (devalue系フラット配列) ペイロードをデコードして
記事のパーティ個体情報を取り出すユーティリティ。"""
import re, json, sys

def extract_payload(html):
    m = re.search(r'enqueue\("((?:[^"\\]|\\.)*)"\)', html)
    if not m:
        return None
    return json.loads('"' + m.group(1) + '"')

def load_array(raw):
    # raw は巨大JSON配列のテキスト
    return json.loads(raw)

class Resolver:
    def __init__(self, A):
        self.A = A

    def get(self, i, depth=0, stack=()):
        if not isinstance(i, int):
            return i
        if i < 0:
            return None
        if i >= len(self.A):   # 索引範囲外 = リテラル数値(タイムスタンプ等)
            return i
        if i in stack or depth > 60:      # cycle / depth guard
            return None
        node = self.A[i]
        if isinstance(node, dict):
            out = {}
            for k, v in node.items():
                key = self.A[int(k[1:])] if k.startswith('_') else k
                out[key] = self.get(v, depth + 1, stack + (i,))
            return out
        if isinstance(node, list):
            return [self.get(e, depth + 1, stack + (i,)) for e in node]
        return node

# ---- 遅延ナビゲーション (重いmasterDataを辿らずに目的フィールドだけ取得) ----
def _pairs(A, node):
    """devalueオブジェクトノード {"_keyidx": validx} を {key: validx} に展開"""
    out = {}
    for k, v in node.items():
        key = A[int(k[1:])] if isinstance(k, str) and k.startswith('_') else k
        out[key] = v
    return out

def _nav(A, idx, *keys):
    """idx のノードから keys を順にたどり、最終ノードのインデックスを返す"""
    cur = idx
    for key in keys:
        node = A[cur]
        if not isinstance(node, dict):
            return None
        pairs = _pairs(A, node)
        if key is None:  # ワイルドカード: masterDataとarticleを持つ値を探す
            found = None
            for v in pairs.values():
                if isinstance(v, int) and 0 <= v < len(A) and isinstance(A[v], dict):
                    sub = _pairs(A, A[v])
                    if 'article' in sub and 'masterData' in sub:
                        found = v; break
            if found is None:
                return None
            cur = found
        else:
            if key not in pairs:
                return None
            cur = pairs[key]
    return cur

def get_article_body(html):
    """記事本文HTMLだけを遅延取得 (masterDataを展開しない)"""
    raw = extract_payload(html)
    if not raw:
        return None
    A = load_array(raw)
    route = _nav(A, 0, 'loaderData', None)
    if route is None:
        return None
    art_idx = _pairs(A, A[route]).get('article')
    if art_idx is None:
        return None
    body_idx = _pairs(A, A[art_idx]).get('body')
    if body_idx is None or not (0 <= body_idx < len(A)):
        return None
    body = A[body_idx]
    return body if isinstance(body, str) else None

def build_master(html):
    """masterData の id->name 辞書群を構築 (1記事から1回だけ呼べばよい)"""
    raw = extract_payload(html)
    if not raw:
        return None
    A = load_array(raw)
    R = Resolver(A)
    route = _nav(A, 0, 'loaderData', None)
    if route is None:
        return None
    md_idx = _pairs(A, A[route]).get('masterData')
    md = R.get(md_idx)
    if not isinstance(md, dict):
        return None
    out = {}
    for cat in ['pokemons', 'moves', 'items', 'natures', 'abilities']:
        recs = md.get(cat) or []
        out[cat] = {r['id']: r for r in recs if isinstance(r, dict) and 'id' in r}
    return out

if __name__ == '__main__':
    html = open(sys.argv[1], encoding='utf-8', errors='replace').read()
    body = get_article_body(html)
    print('body len:', len(body) if body else None)
    md = build_master(html)
    if md:
        for k, v in md.items():
            print(f'{k}: {len(v)} records')

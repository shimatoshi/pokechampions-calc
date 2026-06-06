#!/usr/bin/env python3
"""PokeAPIから全ポケモンのスプライトを取得し、lossless WebPに変換する。

背景: 旧スプライトはlossy WebP(q60, YUV420+ALPH)で、古いAndroid GPUの
ChromiumがYUVデコードパスで色化け(ネガ反転)を起こすことがあるため、
VP8L(lossless, RGB直格納)に置き換える。

usage: python3 scripts/fetch_sprites.py [--out static/img]
"""
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else ROOT / 'static/img'
API = 'https://pokeapi.co/api/v2/pokemon/'

def slugify(name: str) -> str:
    """static/js/data.js spriteUrl() と同一のslug化"""
    s = re.sub(r'[^a-z0-9-]', '-', name.lower())
    s = re.sub(r'-+', '-', s).strip('-')
    return s

def api_candidates(name: str) -> list[str]:
    """表示名 → PokeAPI pokemon名の候補リスト(優先順)"""
    base = slugify(name)
    cands = []
    m = re.match(r'^mega-(.+)$', base)
    if m:
        rest = m.group(1)
        # "mega-charizard-x" → "charizard-mega-x", "mega-venusaur" → "venusaur-mega"
        m2 = re.match(r'^(.+)-([xy])$', rest)
        if m2:
            cands.append(f'{m2.group(1)}-mega-{m2.group(2)}')
        cands.append(f'{rest}-mega')
        # 性別分岐ポケモンのメガ
        cands.append(f'{rest}-male-mega')
    else:
        cands.append(base)
    # よくある形式ゆれ
    ALIASES = {
        'basculegion': ['basculegion-male'],
        'basculegion-f': ['basculegion-female'],
        'meowstic': ['meowstic-male'],
        'meowstic-f': ['meowstic-female'],
        'indeedee': ['indeedee-male'],
        'indeedee-f': ['indeedee-female'],
        'maushold': ['maushold-family-of-three'],
        'maushold-four': ['maushold-family-of-four'],
        'morpeko': ['morpeko-full-belly'],
        'palafin': ['palafin-zero'],
        'mimikyu': ['mimikyu-disguised'],
        'aegislash': ['aegislash-shield'],
        'tauros-paldea-combat': ['tauros-paldea-combat-breed'],
        'tauros-paldea-blaze': ['tauros-paldea-blaze-breed'],
        'tauros-paldea-aqua': ['tauros-paldea-aqua-breed'],
        'lycanroc-midday': ['lycanroc'],
        'gourgeist-average': ['gourgeist'],
        'mega-floette': ['floette-eternal-mega'],
        'mega-meowstic': ['meowstic-male-mega', 'meowstic-mega'],
    }
    cands += ALIASES.get(base, [])
    return cands

def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={'User-Agent': 'pokechampions-calc sprite fetcher'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except Exception:
        return None

def main():
    pokemon = json.loads((ROOT / 'static/data/data_pokemon.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    ok, failed = 0, []
    for name in pokemon:
        slug = slugify(name)
        dest = OUT / f'{slug}.webp'
        png_url = None
        for cand in api_candidates(name):
            raw = fetch(API + cand)
            if raw is None:
                continue
            data = json.loads(raw)
            png_url = (data.get('sprites') or {}).get('front_default')
            if png_url:
                break
        if not png_url:
            failed.append(name)
            print(f'NG  {name}: APIにスプライトなし', flush=True)
            continue
        png = fetch(png_url)
        if not png:
            failed.append(name)
            print(f'NG  {name}: PNG取得失敗 {png_url}', flush=True)
            continue
        tmp = OUT / f'_{slug}.png'
        tmp.write_bytes(png)
        r = subprocess.run(['cwebp', '-quiet', '-lossless', '-z', '9', str(tmp), '-o', str(dest)])
        tmp.unlink()
        if r.returncode != 0:
            failed.append(name)
            print(f'NG  {name}: cwebp失敗', flush=True)
            continue
        ok += 1
        print(f'OK  {name} → {dest.name} ({dest.stat().st_size}B)', flush=True)
        time.sleep(0.1)  # PokeAPIへの礼儀
    print(f'\n完了: {ok}/{len(pokemon)} 成功, 失敗 {len(failed)}: {failed}')
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()

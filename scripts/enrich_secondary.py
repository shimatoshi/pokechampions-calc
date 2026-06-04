#!/usr/bin/env python3
"""Showdown moves.json から追加効果を data_moves.json に焼き込む（冪等・再実行可）。

変換内容:
- secondary: true (boolean) → [{chance, status?, boosts?, volatile?, self?}] の構造化配列
  (showdown側に構造がない技はbooleanのまま残す = ちからずく判定用)
- showdownトップレベル self.boosts → selfEffect: {boosts} (インファイト等の確定自己ランク変動。
  ちからずくで消えない)
- statキーは showdown(atk/def/spa/spd/spe) → 本アプリ(at/df/sa/sd/sp) に変換
"""
import json, re, os, sys, urllib.request

SD_URL = 'https://play.pokemonshowdown.com/data/moves.json'
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'static', 'data', 'data_moves.json')
STAT_MAP = {'atk': 'at', 'def': 'df', 'spa': 'sa', 'spd': 'sd', 'spe': 'sp',
            'accuracy': 'acc', 'evasion': 'eva'}


def to_id(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


def conv_boosts(b):
    return {STAT_MAP.get(k, k): v for k, v in b.items()}


def conv_sec(s):
    out = {'chance': s.get('chance', 100)}
    if s.get('status'):
        out['status'] = s['status']
    if s.get('boosts'):
        out['boosts'] = conv_boosts(s['boosts'])
    if s.get('volatileStatus'):
        out['volatile'] = s['volatileStatus']
    if s.get('self', {}).get('boosts'):
        out['self'] = {'boosts': conv_boosts(s['self']['boosts'])}
    # 効果情報なし(トライアタック等、showdownがonHitコードで持つもの)は変換しない
    if len(out) == 1:
        return None
    return out


def main():
    cache = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'sd_moves.json')
    if not os.path.exists(cache):
        print(f'fetching {SD_URL}')
        urllib.request.urlretrieve(SD_URL, cache)
    sd = json.load(open(cache))
    moves = json.load(open(DATA))

    n_sec = n_self = n_keep = 0
    for name, mv in moves.items():
        s = sd.get(to_id(name))
        if not s:
            continue
        secs = s.get('secondaries') or ([s['secondary']] if s.get('secondary') else [])
        conv = [c for c in (conv_sec(x) for x in secs) if c]
        if conv:
            mv['secondary'] = conv
            n_sec += 1
        elif mv.get('secondary') is True:
            n_keep += 1  # 構造化できない → booleanのまま
        if s.get('self', {}).get('boosts'):
            mv['selfEffect'] = {'boosts': conv_boosts(s['self']['boosts'])}
            n_self += 1

    json.dump(moves, open(DATA, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'secondary構造化: {n_sec}技 / boolean維持: {n_keep}技 / selfEffect付与: {n_self}技')


if __name__ == '__main__':
    main()

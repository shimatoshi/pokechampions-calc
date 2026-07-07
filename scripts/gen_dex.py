#!/usr/bin/env python3
"""
dex/data/pokemon.js を本体の正規データから再生成する。
入力: static/data/{data_pokemon,data_learnsets,names_pokemon_ja}.json, static/dex/data/moves.js,
      ~/pchamp/roster_types.tsv(全国番号), static/img/<slug>.webp(スプライト)
出力: static/dex/data/pokemon.js (全315体), 画像は static/dex/images/ へ本体img/から複製。
roster更新時はこれを再実行するだけ。隠れ特性=特性2つ以上なら最後、番号=roster準拠。
プロジェクトルート(static/の親)で実行。
"""
import json,re,sys
ROOT='static'
# --- sources ---
main=json.load(open(f'{ROOT}/data/data_pokemon.json'))
learn=json.load(open(f'{ROOT}/data/data_learnsets.json'))
ja=json.load(open(f'{ROOT}/data/names_pokemon_ja.json'))
mv=open(f'{ROOT}/dex/data/moves.js').read()
MOVES=json.loads(mv[mv.index('=')+1:].rstrip().rstrip(';'))
mvkeys=set(MOVES)
# roster national numbers: col1=NNNN-FF, col2=base slug, col3=form slug
num_base={}; form_slug_num={}
for ln in open('/data/data/com.termux/files/home/pchamp/roster_types.tsv'):
    p=ln.rstrip('\n').split('\t')
    if len(p)<3: continue
    num=int(p[0][:4]); num_base.setdefault(p[1],num); form_slug_num[p[2]]=(num,int(p[0][5:7]))

def slug(s):
    s=s.lower().replace('♀','-f').replace('♂','-m')
    s=re.sub(r"[.'’:]","",s); s=s.replace(' ','-')
    return s

SUF={'-hisui':'Hisuian','-alola':'Alolan','-galar':'Galarian'}
def split_form(name):
    if name.startswith('Mega '):
        r=name[5:]
        if r.endswith(' X'): return r[:-2],'Mega X'
        if r.endswith(' Y'): return r[:-2],'Mega Y'
        return r,'Mega'
    low=name.lower()
    for suf,f in SUF.items():
        if low.endswith(suf): return name[:-len(suf)],f
    if low.endswith('-paldea') or '-paldea-' in low: 
        return name.split('-')[0],'Paldean'
    return name,None

# species with a genuine hyphen in their name (not a form)
HYPHEN_SPECIES={'Kommo-o','Ho-Oh','Porygon-Z','Jangmo-o','Hakamo-o','Mr. Rime','Mr. Mime','Mime Jr.','Type: Null','Nidoran-F','Nidoran-M'}

def base_and_form(name):
    if name in HYPHEN_SPECIES: return name,None
    b,f=split_form(name)
    if f is None and '-' in b and b not in HYPHEN_SPECIES:
        parts=b.split('-',1); return parts[0],parts[1]
    return b,f

def num_for(name, base):
    # try exact form slug, then base slug
    s=slug(name)
    if s in form_slug_num: return form_slug_num[s][0]
    bs=slug(base)
    if bs in num_base: return num_base[bs]
    # regional/alt full slug
    if s in num_base: return num_base[s]
    return None

STAT={'hp':'hp','at':'attack','df':'defense','sa':'special-attack','sd':'special-defense','sp':'speed'}
out=[]; unresolved=[]
for name,d in main.items():
    base,form=base_and_form(name)
    num=num_for(name,base)
    if num is None: unresolved.append(name); num=9999
    bs=d['bs']
    stats={STAT[k]:bs[k] for k in STAT}
    bst=sum(stats.values())
    ab=d.get('abilities') or []
    abilities=[{'name':slug(a),'hidden':(len(ab)>=2 and i==len(ab)-1)} for i,a in enumerate(ab)]
    mvs=[]
    for m in learn.get(name,[]):
        ms=slug(m)
        if ms in mvkeys: mvs.append(ms)
    types=[t.lower() for t in d['types']]
    out.append({'id':str(num),'dex_id':num,'name_en':name,'name_ja':ja.get(name,name),
                'form':form,'types':types,'stats':stats,'bst':bst,'abilities':abilities,
                'moves':mvs,'image':slug(name)+'.webp'})

# sort: national number, base(None) first, then form
def frank(p):
    f=p['form']
    if not f: return 0
    order={'Mega':10,'Mega X':11,'Mega Y':12}
    return order.get(f,5)
out.sort(key=lambda p:(p['dex_id'],frank(p),p['name_en']))

DATA={'game':'Pokemon Champions','game_ja':'ポケモンチャンピオンズ','total':len(out),'pokemon':out}
open(f'{ROOT}/dex/data/pokemon.js','w').write('const DATA='+json.dumps(DATA,ensure_ascii=False,separators=(',',':')))
print('生成:',len(out),'体')
print('番号未解決:',len(unresolved), unresolved[:40])

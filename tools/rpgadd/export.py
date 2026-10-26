"""Writes rpgadd.json (the reader's Add to sheet tray) and rpgrules.json (the guided character builder)."""
import json, books, copy
from lib import BOOKS, SHORT, printed
GLYPH = lambda s: s.replace('', '↑').replace('', '↓')
DROP = ('full', 'perkText', 'hangText', 'btext', 'bonus', 'essk', 'langs', 'bname')
add = {'books': {}}; rules = {'books': {}, 'origins': [], 'influences': [], 'perks': [], 'powers': [], 'zordfeats': [], 'roles': []}
for fid, items in books.ITEMS.items():
    rules['books'][fid] = {'t': SHORT[BOOKS[fid]['title']], 'off': printed(fid)(100) - 100}
    seen, res = set(), []
    for i in sorted(items, key=lambda i: i['p']):
        k = (i['k'], i['n'].lower(), i['p'])
        if k in seen or not i['n'] or len(i['n']) > 70: continue
        seen.add(k)
        j = copy.deepcopy(i); j.pop('full', None)
        for d in DROP: (j.get('f') or {}).pop(d, None)
        res.append(j)
        kind = {'origin': 'origins', 'influence': 'influences', 'perk': 'perks', 'power': 'powers', 'zordfeat': 'zordfeats'}.get(i['k'])
        if kind: r = dict(i); r['b'] = fid; rules[kind].append(r)
    add['books'][fid] = res
rules['roles'] = json.load(open('roles.json'))
for k in rules['roles']: k['cap'] = __import__('re').sub(r'\s+[A-Z]{4,}.*$', '', k['cap'])
open('rpgadd.json', 'w').write(GLYPH(json.dumps(add, ensure_ascii=False, separators=(',', ':'))))
open('rpgrules.json', 'w').write(GLYPH(json.dumps(rules, ensure_ascii=False, separators=(',', ':'))))
print({k: len(v) for k, v in rules.items()})

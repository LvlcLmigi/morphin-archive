"""Writes rpgadd.json from the items books.py finds. Copy the result to static/rpgadd.json."""
import json, books
out = {'books': {}}
for fid, items in books.ITEMS.items():
    seen, res = set(), []
    for i in sorted(items, key=lambda i: i['p']):
        k = (i['k'], i['n'].lower(), i['p'])
        if k in seen or not i['n'] or len(i['n']) > 70: continue
        seen.add(k); res.append(i)
    out['books'][fid] = res
open('rpgadd.json', 'w').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(sum(len(v) for v in out['books'].values()), 'items')

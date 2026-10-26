"""Compiles the wiki: wiki/**/*.md (written articles) plus stub pages made from the site's own data
(comic series and issues, card characters, enemy decks) into _site/wiki/index.json and _site/wiki/a/<slug>.json.

An article is Markdown with a small header block between --- lines:

    ---
    title: Tommy Oliver
    type: character            (character, ranger, team, villain, monster, zord, show, comic-series, comic-issue, place, item, topic)
    aliases: Tommy, Thomas Oliver, Dr. O
    image: card:Tommy Oliver    (card:<character or card title>, cover:<comic id>, or a full https:// link)
    summary: One line shown in lists and search.
    cards: Tommy Oliver          (characters whose Heroes of the Grid cards are shown; defaults to the title and aliases)
    comic: <comic id>            (comic-issue pages: the issue on the site)
    series: <comic series id>    (comic-series pages)
    infobox: Color = Green, White, Red | First appearance = [[Green with Evil]]
    ---
    Body text. Link other articles with [[Title]] or [[Title|shown text]].
"""
import os, re, json, html

def slugify(s):
    s = s.lower().replace('&', ' and ').replace('’', '').replace("'", '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'page'

def parse(text):
    meta, body = {}, text
    m = re.match(r'﻿?---\s*\n(.*?)\n---\s*\n?(.*)$', text, re.S)
    if m:
        body = m.group(2)
        for line in m.group(1).split('\n'):
            if ':' in line and not line.startswith(' '):
                k, v = line.split(':', 1); meta[k.strip().lower()] = v.strip()
    return meta, body.strip()

LINK = re.compile(r'\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]')

def first_para(body):
    for p in re.split(r'\n\s*\n', body):
        p = p.strip()
        if p and not p.startswith(('#', '|', '>', '-', '*', '!')):
            t = LINK.sub(lambda m: m.group(0)[2:-2].split('|')[-1], p)
            t = re.sub(r'[*_`]', '', t)
            return t if len(t) < 240 else t[:237].rsplit(' ', 1)[0] + '…'
    return ''

def split_list(v): return [x.strip() for x in (v or '').split(',') if x.strip()]

def compile_wiki(data, root='wiki', out='_site/wiki'):
    arts = {}
    # 1. written articles
    if os.path.isdir(root):
        for dp, _, fs in os.walk(root):
            for f in sorted(fs):
                if not f.endswith('.md'): continue
                path = os.path.join(dp, f)
                meta, body = parse(open(path, encoding='utf-8').read())
                title = meta.get('title') or f[:-3].replace('-', ' ').title()
                slug = meta.get('slug') or slugify(title)
                arts[slug] = {'slug': slug, 'title': title, 'type': meta.get('type', 'topic'), 'aliases': split_list(meta.get('aliases')),
                              'image': meta.get('image', ''), 'summary': meta.get('summary') or first_para(body), 'cards': split_list(meta.get('cards')),
                              'comic': meta.get('comic', ''), 'series': meta.get('series', ''), 'infobox': meta.get('infobox', ''),
                              'body': body, 'file': path.replace(os.sep, '/'), 'stub': meta.get('status', '') == 'stub'}
    by_comic = {a['comic']: a for a in arts.values() if a['comic']}
    by_series = {a['series']: a for a in arts.values() if a['series']}
    names = {}
    for a in arts.values():
        for n in [a['title']] + a['aliases']: names.setdefault(n.lower(), a['slug'])
    def stub(title, typ, **kw):
        slug = slugify(title)
        if slug in arts or title.lower() in names: return names.get(title.lower(), slug)
        arts[slug] = dict({'slug': slug, 'title': title, 'type': typ, 'aliases': [], 'image': '', 'summary': '', 'cards': [], 'comic': '', 'series': '',
                           'infobox': '', 'body': '', 'file': '', 'stub': True}, **kw)
        names[title.lower()] = slug
        return slug
    # 2. comic series and issues on the site
    series = {s['id']: s for s in data.get('comicSeries', []) if not s.get('hidden')}
    issues = [c for c in data.get('comics', []) if c.get('s') in series and not c.get('st')]
    for sid, s in series.items():
        a = by_series.get(sid)
        slug = a['slug'] if a else stub(str(s['name']) + ' (comic)', 'comic-series', series=sid,
                                       summary=f"{s.get('publisher') or 'Comic'} series" + (f" ({s['years']})" if s.get('years') else '') + '.')
        if not a: arts[slug]['image'] = 'cover:' + next((c['id'] for c in issues if c['s'] == sid), '')
    for c in issues:
        if c['id'] in by_comic: continue
        ct, cn = str(c.get('t') or ''), str(c.get('n') or '')
        if cn.endswith('.0'): cn = cn[:-2]
        t = ct + (f" #{cn}" if cn and not re.search(r'\b' + re.escape(cn) + r'\b', ct) else '')
        stub(t, 'comic-issue', comic=c['id'], image='cover:' + c['id'], summary=f"{c.get('y') or ''} · {c.get('p') or '?'} pages".strip(' ·'))
    # 3. characters with cards, and enemy decks
    for card in data.get('cards', []):
        ch = (card.get('character') or '').strip()
        if card.get('type') == 'ranger' and ch:
            stub(ch, 'character', cards=[ch], image='card:' + ch)
    for d in data.get('decks', []):
        if d.get('kind') in ('boss', 'monster', 'nemesis', 'footsoldier'):
            stub(str(d['name']), {'boss': 'villain', 'nemesis': 'villain'}.get(d['kind'], 'monster'), image='deck:' + str(d['id']))
    # 4. links, backlinks
    for a in arts.values(): a['links'] = []
    lookup = lambda t: names.get(t.strip().lower()) or (slugify(t) if slugify(t) in arts else None)
    for a in arts.values():
        seen = []
        for m in LINK.finditer(a['body'] + ' ' + a['infobox']):
            s = lookup(m.group(1))
            if s and s != a['slug'] and s not in seen: seen.append(s)
        a['links'] = seen
    back = {s: [] for s in arts}
    for a in arts.values():
        for s in a['links']: back[s].append(a['slug'])
    os.makedirs(os.path.join(out, 'a'), exist_ok=True)
    index = []
    for a in sorted(arts.values(), key=lambda a: a['title'].lower()):
        index.append({k: a[k] for k in ('slug', 'title', 'type', 'aliases', 'summary', 'image', 'stub', 'comic', 'series') if a[k] or k in ('slug', 'title', 'type')})
        full = dict(a); full['backlinks'] = sorted(back[a['slug']], key=lambda s: arts[s]['title'].lower())
        with open(os.path.join(out, 'a', a['slug'] + '.json'), 'w', encoding='utf-8') as f:
            json.dump(full, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'articles': index, 'names': names}, f, ensure_ascii=False, separators=(',', ':'))
    return len(arts), sum(1 for a in arts.values() if not a['stub'])

def wiki_hash(root='wiki'):
    h = []
    if os.path.isdir(root):
        for dp, _, fs in os.walk(root):
            for f in sorted(fs):
                if f.endswith('.md'): h.append(open(os.path.join(dp, f), 'rb').read())
    return b''.join(h)

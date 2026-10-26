import json, re, functools
BOOKS = {f['id']: f for f in json.load(open('/home/claude/rpgx/files.json'))}
SHORT = {'Across the Stars': 'Across the Stars', 'Adventures In Angel Grove': 'Angel Grove', 'Beneath the Helmet': 'Beneath the Helmet',
         'Core Rulebook': 'Core', "Finster's Monster-matic Cookbook": 'Cookbook', 'Phantom Gambit': 'Phantom Gambit',
         'Through the Shattered Grid': 'Shattered Grid', 'Time of Knight': 'Time of Knight',
         'Power Rangers Heroes Of The Grid Player Companion': 'HotG Companion'}
def fid_of(title): return next(k for k, v in BOOKS.items() if v['title'] == title)

@functools.lru_cache(None)
def lines(fid):
    return [json.loads(l) for l in open(f'/home/claude/rpgx/txt/{fid}.jsonl')]

@functools.lru_cache(None)
def printed(fid):
    """pdf page -> printed page number (from the folio at the page bottom), filled in by offset where missing."""
    m = {}
    for l in lines(fid):
        if l['y'] > 0.9 and re.fullmatch(r'\d{1,3}', l['t']) and l['sz'] >= 9: m.setdefault(l['p'], int(l['t']))
    offs = {}
    for p, n in m.items(): offs[p - n] = offs.get(p - n, 0) + 1
    off = max(offs, key=offs.get) if offs else 0
    return lambda p: p - off

def tidy(s):
    s = s.replace('­', '').replace('\t', ' ')
    s = re.sub(r'(\w)- (\w)', r'\1\2', s)
    return re.sub(r'\s+', ' ', s).strip()

def first_sentence(text, n=180):
    t = tidy(text)
    m = re.match(r'(.+?(?<!\bft)(?<!\be\.g)(?<!\bi\.e)(?<!\bpg)(?<!\bvs)(?<!\bSt)(?<!\bDr)(?<!\bMr)(?<!\bMs)[.!?])(\s+(?=[A-Z“"(•])|$)', t)
    s = m.group(1) if m else t
    if len(s) > n: s = s[:n].rsplit(' ', 1)[0] + '…'
    return s

def is_folio(l): return l['f'].startswith('LoftStd') or (l['y'] > 0.9 and re.fullmatch(r'\d{1,3}', l['t'])) or (l['y'] < 0.08 and re.fullmatch(r'\d{1,3}', l['t'])) or 'ROLEPLAYING GAME - CHAPTER' in l['t']

def entries(fid, a, b, head, stop=None, skip=None):
    """Entries in pages a..b whose heading lines match head(line). Body = lines until the next heading or stop(line).
    Returns [{n, p, q, body, lines}]. Consecutive heading lines on the same page join into one name."""
    out, cur = [], None
    for l in lines(fid):
        if not a <= l['p'] <= b or is_folio(l): continue
        if skip and skip(l): continue
        if head(l):
            if cur and not cur['body'] and l['p'] == cur['p'] and abs(l['y'] - cur['y']) < l['sz'] * 1.5 / 792 and abs(l['x'] - cur.get('x', l['x'])) < 0.06:
                cur['n'] = tidy(cur['n'] + ' ' + l['t']); cur['y'] = l['y']; continue
            cur = {'n': tidy(l['t']), 'p': l['p'], 'q': l['p'], 'y': l['y'], 'x': l['x'], 'body': '', 'lines': []}; out.append(cur); continue
        if stop and stop(l): cur = None; continue
        if cur:
            cur['body'] += ' ' + l['t']; cur['lines'].append(l); cur['q'] = l['p']
    for e in out: e['body'] = tidy(e['body'])
    return out

def field(body, label, nxt=None):
    """Text after 'Label:' up to the next known label."""
    m = re.search(re.escape(label) + r'\s*:?\s*(.+)', body)
    if not m: return ''
    t = m.group(1)
    if nxt:
        cut = min([t.find(x) for x in nxt if t.find(x) > 0] or [len(t)]); t = t[:cut]
    return t.strip()

def title_case(s):
    if s.upper() != s: return s
    small = {'of', 'the', 'and', 'a', 'an', 'to', 'in', 'on', 'for', 'or', 'at', 'by', 'vs.'}
    def cap(w, i):
        if re.fullmatch(r"(?:[A-Z]\.)+[A-Z]?\.?", w) or re.fullmatch(r"[A-Z]{1,3}\d*", w) and w in ('SPD', 'RPM', 'II', 'III', 'IV', 'V', 'X', 'NASADA', 'R.I.C.'): return w
        lw = w.lower()
        if i and lw in small: return lw
        return re.sub(r"(^|[(\[/\-“\"])([a-z])", lambda m: m.group(1) + m.group(2).upper(), lw)
    return ' '.join(cap(w, i) for i, w in enumerate(s.split(' ')))

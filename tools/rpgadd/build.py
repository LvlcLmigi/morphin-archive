import re, json, sys, pymupdf
from lib import *

ITEMS = {}
def add(fid, kind, e, d='', f=None, n=None, q=None):
    it = {'p': e['p'], 'k': kind, 'n': n or title_case(e['n']), 'd': d}
    qq = q if q is not None else e.get('q', e['p'])
    if qq and qq > it['p']: it['q'] = qq
    if f: it['f'] = {k: v for k, v in f.items() if v not in (None, '', {}, [])}
    ITEMS.setdefault(fid, []).append(it)

def caps(lo, hi=99, font=None):
    return lambda l: lo <= l['sz'] < hi and (font is None or font in l['f']) and l['y'] > 0.07 and re.search('[A-Z]', l['t']) and l['t'].upper() == l['t'] and l['t'].strip() not in RUNNING
RUNNING = {'CHARACTER OPTIONS', 'TOOLS OF THE TRADE', 'WELCOME TO THE UNIVERSE', 'FRIENDS AND FOES'}
def ypos(fid, p, text):
    for l in lines(fid):
        if l['p'] == p and text.lower() in l['t'].lower(): return l['y']
    return 0
def sz(lo, hi=99, font=None):
    return lambda l: lo <= l['sz'] < hi and (font is None or font in l['f'])

def ref(fid, p): return f"{SHORT[BOOKS[fid]['title']]} p.{printed(fid)(p)}"

# ---------- origins ----------
LABELS = ['Starting Health', 'Essence Score Increase Options', 'Bonus Skill Ranks', 'Your Origin trained', 'Ground Movement', 'Languages', 'Origin Benefit']
def origins(fid, a, b, head):
    for e in entries(fid, a, b, head):
        body = e['body']
        if 'Starting Health' not in body or not re.search(r'begin(?: play)? with \d+ Health', body): continue
        hp = re.search(r'begin(?: play)? with (\d+) Health', body)
        mv = re.search(r'Ground Movement is (\d+) ?feet', body)
        ben = re.search(r'Origin Benefit: ([^.]+?)(?=\s+[A-Z][a-z]+ [a-z])', body)
        bname = ben.group(1).strip() if ben else ''
        intro = body.split('Starting Health')[0]
        ess = field(body, 'Essence Score Increase Options', LABELS)
        add(fid, 'origin', e, first_sentence(intro), n=re.sub(r'^Origin:\s*', '', title_case(e['n'])), f={
            'health': hp.group(1) if hp else '', 'movement': (mv.group(1) + ' ft') if mv else '',
            'perk': (bname + ' (origin benefit, ' + ref(fid, e['p']) + ')') if bname else '',
            'ess': first_sentence(ess, 90)})

# ---------- influences ----------
def influences(fid, a, b, head, sub):
    """head: the influence name lines; sub: 'Influence Perk' / 'Hang-Up' sub-headings."""
    for e in entries(fid, a, b, lambda l: head(l) or sub(l)):
        pass
    cur = None; out = []
    for e in entries(fid, a, b, lambda l: head(l) or sub(l)):
        nm = e['n'].lower()
        if 'influence perk' in nm:
            if cur: cur['perk'] = e['body']
        elif 'hang-up' in nm or 'hang up' in nm:
            if cur: cur['hang'] = e['body']
        elif 'suggested' in nm or 'previous places' in nm: continue
        else:
            cur = {'e': e, 'intro': e['body'], 'perk': '', 'hang': ''}; out.append(cur)
    for c in out:
        if not c['perk'] and not c['hang']: continue
        e = c['e']; name = re.sub(r'^Influence:\s*', '', title_case(e['n']))
        pk = first_sentence(c['perk'], 200); hg = first_sentence(c['hang'], 200)
        last = max([x['e']['p'] for x in out if x is c] + [e['p']])
        add(fid, 'influence', e, first_sentence(c['intro']), {
            'line': f"{name}: {pk} ({ref(fid, e['p'])})", 'hangup': f"{hg} ({name})" if hg else ''}, n=name)

# ---------- simple named entries (perks, powers, gear, roles…) ----------
def simple(fid, kind, a, b, head, skip_names=(), keep=None, start=None, end=None, after=None, until=None):
    es = entries(fid, a, b, head)
    if after: es = es[next(i for i, e in enumerate(es) if after.lower() in e['n'].lower()) + 1:]
    if until: es = es[:next(i for i, e in enumerate(es) if until.lower() in e['n'].lower()) + 1]
    for e in es:
        if start and (e['p'], e['y']) < start: continue
        if end and (e['p'], e['y']) > end: continue
        n = title_case(e['n']).strip(' :')
        if not e['body'] or any(re.search(s, n, re.I) for s in skip_names): continue
        if keep and not keep(e): continue
        d = first_sentence(e['body'].lstrip('•* '))
        pm = re.match(r'Prerequisites?:\s*(.+?)(?=\s+(?:You|Your|Calling|Chosen|By|After|The|An?|Despite|With|While|Using)\b)', e['body'])
        if pm: d = 'Needs ' + pm.group(1).strip(' .;') + '. ' + first_sentence(e['body'][pm.end():])
        if kind == 'gear' and ('THREAT LEVEL' in e['body'] or ('SIZE' in e['body'] and 'HEALTH' in e['body'])):
            b = e['body']; g = lambda k: (re.search(k + r':?\s*([^|]+?)\s*(?=\s*\||\s+[A-Z]{4,}|$)', b) or [None, ''])[1].strip()
            d = 'Vehicle · ' + ' · '.join(x for x in [g('SIZE').title(), ('Health ' + g('HEALTH')) if g('HEALTH') else '', g('GROUND MOVEMENT') or g('MOVEMENT')] if x)
        add(fid, kind, e, d, {'line': f"{n} ({ref(fid, e['p'])})"}, n=n)

# ---------- Zords: stat blocks ----------
DIE = {'d2': 1, 'd4': 2, 'd6': 3, 'd8': 4, 'd10': 5, 'd12': 6}
ZSK = {'brawn': 'brawn', 'conditioning': 'cond', 'might': 'might', 'driving': 'drive', 'initiative': 'init'}
def statblock(body, raw=None):
    g = lambda k: (re.search(k + r':?\s*(.+?)\s*(?=\||HEALTH|MOVEMENT|STRENGTH|SPEED|SMARTS|SOCIAL|TOUGHNESS|EVASION|Skills|$)', body) or [None, ''])[1].strip()
    num = lambda k: (re.search(k + r':?\s*(\d+)', body) or [None, ''])[1]
    stats = {'size': g('SIZE'), 'move': g('MOVEMENT'), 'str': num('STRENGTH'), 'spd': num('SPEED'),
             'tough': num('TOUGHNESS'), 'eva': num('EVASION')}
    hp = num('HEALTH')
    skills = {}; custom = ''
    sk = re.search(r'Skills:\s*(.+?)(?=Zord Features|Megaform Traits|Features|ATTACKS|Combiner|$)', body)
    if sk:
        for part in sk.group(1).split(','):
            m = re.match(r'\s*([A-Za-z ]+?)\s*(?:\([^)]*\))?\s*\+?\s*(d\d+|\d+)', part.strip())
            if not m: continue
            nm = m.group(1).strip().lower(); v = m.group(2)
            key = ZSK.get(nm)
            val = DIE.get(v, 0) if v.startswith('d') else int(v)
            if key: skills[key] = val
            elif not custom: custom = m.group(1).strip(); skills['custom'] = val
    AT = re.compile(r'^\*?([A-Z][\w’\'\-/ ]*?) \(([^()]*?(?:Might|Targeting|Brawn|Finesse|Athletics|Driving)[^()]*)\):\s*(.*)$')
    attacks = []; first_at = None; cur = None; pos = 0
    for ln in (raw or '').split('\n'):
        m = AT.match(ln.strip())
        if m:
            if first_at is None: first_at = body.find(m.group(1) + ' (' + m.group(2))
            cur = [m.group(1).strip(), m.group(2).strip(), m.group(3)]; attacks.append(cur)
        elif cur is not None and ln.strip() and not re.match(r'^[A-Z]{4,}', ln.strip()):
            cur[2] += ' ' + ln.strip()
    out = []
    for nm, skill, rest in attacks:
        rest = tidy(rest)
        rng = re.search(r'(Reach(?: ×\d)?|Range [\d/]+ ?ft(?:/[\d]+ ?ft)?|[\d/]+ ?ft)', rest)
        dmg = re.search(r'\(([^()]*damage[^()]*)\)', rest)
        tail = rest[dmg.end():].strip(' ,.') if dmg else ''
        out.append({'weapon': nm + ' (' + skill + ')', 'range': rng.group(1) if rng else '',
                    'effects': (dmg.group(1) if dmg else first_sentence(rest, 60)) + (', ' + tail if tail and len(tail) < 50 else '')})
    attacks = out
    if first_at is not None and first_at < 0: first_at = None
    pre = body[:first_at] if first_at is not None else body
    feats = re.search(r'(Zord Features|Features):\s*(.+?)(?=ATTACKS|Megaform Traits|$)', pre)
    traits = re.search(r'Megaform Traits:\s*(.+?)(?=ATTACKS|$)', pre)
    hm = re.search(r'HEALTH:?\s*\(([\d/ ]+)\)', body)
    if hm: hp = [x.strip() for x in hm.group(1).split('/')]
    feat_text = '; '.join(x for x in [feats.group(2).strip() if feats else '', ('Megaform traits: ' + traits.group(1).strip()) if traits else ''] if x)
    return stats, hp, skills, custom, feat_text, attacks

def zords(fid, a, b, head, mega_re=r'megazord|megaform|mega winger|megavoyager|robo racer|megarover|megafalconzord|mega tigerzord'):
    for e in entries(fid, a, b, head):
        body = e['body']
        if 'TOUGHNESS' not in body or 'STRENGTH' not in body: continue
        n = title_case(e['n']).replace('/ ', '/')
        stats, hp, skills, custom, feats, attacks = statblock(body, '\n'.join(l['t'] for l in e['lines'] if l['sz'] < 18))
        mega = bool(re.search(r'\bmega(zord|form)\b|megavoyager|megafalconzord|mega tigerzord', n, re.I)) or 'Combiner' in stats['size'] or isinstance(hp, list)
        linked = re.search(r'As Linked to (?:a|an) ([^.]+?Ranger)', body)
        f = {'stats': stats, 'health': hp, 'skills': skills, 'customName': custom,
             'features': (feats + f" ({ref(fid, e['p'])})").strip(), 'attacks': attacks[:4 if mega else 2]}
        d = ('Linked to a ' + linked.group(1)) if linked else first_sentence(body.split('SIZE')[0])
        add(fid, 'mega' if mega else 'zord', e, d, f, n=n)

# ---------- tables (weapons, armor) ----------
_docs = {}
def doc(fid):
    if fid not in _docs: _docs[fid] = pymupdf.open(f'/home/claude/rpgx/pdf/{fid}.pdf')
    return _docs[fid]
def clean(s): return re.sub(r'\s+', ' ', s.replace('­', '')).replace(' ,', ',').strip(' .')
def page_rows(fid, p, strategy=None):
    pg = doc(fid)[p - 1]; rows = []
    words = pg.get_text('words')
    tabs = pg.find_tables(strategy=strategy).tables if strategy else pg.find_tables().tables
    for t in tabs:
        for r in t.rows:
            cells = []
            for c in r.cells:
                if not c: cells.append(''); continue
                x0, y0, x1, y1 = c
                ws = [w for w in words if x0 <= (w[0] + w[2]) / 2 < x1 and y0 <= (w[1] + w[3]) / 2 < y1]
                ws.sort(key=lambda w: (round(w[1] / 3), w[0]))
                cells.append(clean(' '.join(w[4] for w in ws)))
            rows.append(cells)
    return rows
def rows_with(fid, p, want):
    for st in (None, 'lines_strict', 'lines'):
        try: R = page_rows(fid, p, st)
        except Exception: continue
        i, u = header_index(R, want)
        if i is not None: return R, i, u
    return [], None, None
def header_index(rows, want):
    for i, r in enumerate(rows):
        u = [c.upper() for c in r]
        if all(any(w in c for c in u) for w in want): return i, u
    return None, None
def col(u, name):
    for i, c in enumerate(u):
        if c.strip() == name or c.startswith(name): return i
    return None
AVAIL = re.compile(r'AVAIL|^LIMITED|^RESTRICTED|^STANDARD|^AUTOMATIC|^UNIQUE', re.I)

def weapon_spread(fid, lp, rp):
    """Left page: TYPE/CLASSIFICATION/DESCRIPTION…; right page: RANGE/HANDS/EFFECTS/ALT/TRAITS. Rows pair in order."""
    L, i, u = rows_with(fid, lp, ['TYPE', 'CLASSIFICATION']); R, j, v = rows_with(fid, rp, ['RANGE', 'HANDS'])
    if i is None or j is None: return 0
    ct, cc, cd, cr = col(u, 'TYPE'), col(u, 'CLASSIFICATION'), col(u, 'DESCRIPTION'), col(u, 'REQUIREMENTS')
    left = [r for r in L[i + 1:] if r[ct] and not AVAIL.search(r[ct]) and r[ct].upper() != r[ct] or (r[ct] and r[cc])]
    left = [r for r in left if not AVAIL.search(r[ct])]
    vr, vh, ve, va, vt = col(v, 'RANGE'), col(v, 'HANDS'), col(v, 'EFFECTS'), col(v, 'ALTERNATE'), col(v, 'TRAITS')
    right = [r for r in R[j + 1:] if r[vr] and not AVAIL.search(r[vr])]
    def nz(r, k):
        if k is None: return ''
        x = r[k]
        if not x:   # text sometimes lands in the neighbouring (empty-header) cell
            for kk in (k + 1, k - 1):
                if 0 <= kk < len(r) and r[kk]: return r[kk]
        return x
    n = 0
    for a, b in zip(left, right):
        name = a[ct]; cls = nz(a, cc)
        skill = cls.split(' ')[0] if cls else ''
        row = {'range': nz(b, vr), 'hands': nz(b, vh), 'traits': nz(b, vt), 'attack': skill,
               'effects': nz(b, ve), 'alt': nz(b, va) if va is not None else ''}
        req = nz(a, cr) if cr is not None else (nz(b, col(v, 'REQUIREMENTS')) if col(v, 'REQUIREMENTS') is not None else '')
        d = nz(a, cd) if cd is not None else ''
        e = {'p': lp, 'q': rp, 'n': name}
        add(fid, 'weapon', e, (d + ('. Needs: ' + req if req and req != '—' else '')).strip(), {'row': row, 'line': f"{name}: {row['effects']} ({ref(fid, lp)})"}, n=name, q=rp)
        n += 1
    if len(left) != len(right): print('  ! weapon rows differ', BOOKS[fid]['title'], lp, rp, len(left), len(right), file=sys.stderr)
    return n

def weapon_page(fid, p):
    """One table with everything: TYPE … RANGE … EFFECTS … TRAITS."""
    R, i, u = rows_with(fid, p, ['RANGE', 'EFFECTS'])
    if i is None: return 0
    ct = col(u, 'TYPE') if col(u, 'TYPE') is not None else col(u, 'WEAPON') if col(u, 'WEAPON') is not None else col(u, 'NAME')
    if ct is None: ct = 0
    cc, vr, vh, ve, va, vt = col(u, 'CLASSIFICATION'), col(u, 'RANGE'), col(u, 'HANDS'), col(u, 'EFFECTS'), col(u, 'ALTERNATE'), col(u, 'TRAITS')
    n = 0
    for r in R[i + 1:]:
        name = r[ct]
        if not name or AVAIL.search(name) or not r[vr]: continue
        g = lambda k: r[k] if k is not None else ''
        row = {'range': g(vr), 'hands': g(vh), 'traits': g(vt), 'attack': g(cc).split(' ')[0] if g(cc) else '', 'effects': g(ve), 'alt': g(va)}
        add(fid, 'weapon', {'p': p, 'n': name}, g(cc), {'row': row, 'line': f"{name}: {row['effects']} ({ref(fid, p)})"}, n=name)
        n += 1
    return n

def armor_page(fid, p):
    R, i, u = rows_with(fid, p, ['TYPE', 'EFFECT'])
    if i is None: return 0
    ct, cc, cd, ce, cr = col(u, 'TYPE'), col(u, 'CLASSIFICATION'), col(u, 'DESCRIPTION'), col(u, 'EFFECT'), col(u, 'TRAITS')
    cp, ca = col(u, 'PASSIVE'), col(u, 'ACTIVE')
    if ce is None and cp is not None:
        for r in R[i + 1:]:
            if len(r) > max(cp, ca or 0): r.append((r[cp] + ('; when used: ' + r[ca] if ca is not None and r[ca] else '')).strip('; '))
        ce = len(u)
    n = 0
    for r in R[i + 1:]:
        name = r[ct]
        if not name or AVAIL.search(name) or not (ce is not None and r[ce]): continue
        g = lambda k: r[k] if k is not None else ''
        row = {'desc': (g(cc) + (' — ' if g(cc) and g(cd) else '') + g(cd)), 'effect': g(ce), 'traits': g(cr)}
        add(fid, 'armor', {'p': p, 'n': name}, g(cd) or g(cc), {'row': row, 'line': f"{name}: {g(ce)} ({ref(fid, p)})"}, n=name)
        n += 1
    return n

# ---------- inline "Name: text" entries (gear lists) ----------
def inline(fid, kind, a, b, after=None, until=None, skip=()):
    on = after is None; cur = None; out = []
    for l in lines(fid):
        if not a <= l['p'] <= b or is_folio(l): continue
        t = l['t']
        if not on:
            if after(l): on = True
            continue
        if until and until(l): break
        if l['sz'] >= 13: cur = None; continue
        m = re.match(r'^\*?([A-Z][\w’\'\-\. ()/]{1,40}?):\s*(.*)$', t)
        if m and not any(re.search(x, m.group(1), re.I) for x in skip):
            cur = {'n': m.group(1).strip(), 'p': l['p'], 'q': l['p'], 'body': m.group(2)}; out.append(cur)
        elif cur: cur['body'] += ' ' + t; cur['q'] = l['p']
    for e in out:
        d = first_sentence(e['body'])
        add(fid, kind, e, d, {'line': f"{e['n']} ({ref(fid, e['p'])})"}, n=e['n'])
    return out

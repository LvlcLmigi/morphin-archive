"""Roles (Ranger colors, advanced roles, Psycho Paths): starting features, the level table and each role perk's text."""
import re, json
from build import *

ROLES = [  # name, book, first page, last page, features page, table page, perk heading test
    ('Black Ranger', 'Core Rulebook', 33, 37, 34, 34), ('Blue Ranger', 'Core Rulebook', 38, 43, 39, 39),
    ('Green Ranger', 'Core Rulebook', 44, 47, 45, 45), ('Pink Ranger', 'Core Rulebook', 48, 51, 49, 49),
    ('Red Ranger', 'Core Rulebook', 52, 55, 53, 53), ('Yellow Ranger', 'Core Rulebook', 56, 59, 57, 57),
    ('White Ranger', 'Core Rulebook', 61, 65, 62, 62),
    ('Gold Ranger', 'Across the Stars', 53, 56, 54, 53), ('Silver Ranger', 'Across the Stars', 57, 59, 58, 57),
    ('Phantom Ranger', 'Across the Stars', 60, 64, 62, 61),
    ('Dark Ranger', 'Beneath the Helmet', 39, 42, 41, 40), ('Silver Ranger (Beneath the Helmet)', 'Beneath the Helmet', 45, 47, 46, 46),
    ('Magna Defender', 'Through the Shattered Grid', 23, 27, 24, 25), ('Guardian of Eltar', 'Through the Shattered Grid', 72, 75, 72, 73),
    ('Psycho Ranger: Path of Cruelty', "Finster's Monster-matic Cookbook", 283, 286, 284, 285),
    ('Psycho Ranger: Path of Flame', "Finster's Monster-matic Cookbook", 287, 290, 287, 288),
    ('Psycho Ranger: Path of Frost', "Finster's Monster-matic Cookbook", 290, 293, 290, 292),
    ('Psycho Ranger: Path of Stone', "Finster's Monster-matic Cookbook", 293, 297, 294, 296),
    ('Psycho Ranger: Path of Thorns', "Finster's Monster-matic Cookbook", 297, 300, 297, 299),
    ('Psycho Ranger: Path of Venom', "Finster's Monster-matic Cookbook", 300, 303, 300, 303),
]
SKILLS = {'athletics': 'ath', 'brawn': 'bra', 'conditioning': 'cond', 'intimidation': 'int', 'might': 'mig', 'acrobatics': 'acr', 'driving': 'dri',
          'finesse': 'fin', 'infiltration': 'inf', 'initiative': 'ini', 'targeting': 'tar', 'alertness': 'ale', 'culture': 'cul', 'science': 'sci',
          'survival': 'sur', 'technology': 'tec', 'animal handling': 'ani', 'deception': 'dec', 'performance': 'per', 'persuasion': 'prs', 'streetwise': 'str'}
ESS = {'STRENGTH': 'str', 'SPEED': 'spd', 'SMARTS': 'sma', 'SOCIAL': 'soc'}

def page_text(fid, a, b):
    return tidy(' '.join(l['t'] for l in lines(fid) if a <= l['p'] <= b and not is_folio(l)))

def skill_list(t):
    """'+2 Might, +1 Persuasion' or '+1 Finesse or Targeting' -> [{n:2, k:['mig']}, {n:1, k:['fin','tar']}]"""
    out = []
    for m in re.finditer(r'\+(\d)\s+([A-Za-z ]+?(?:\s+or\s+[A-Za-z ]+?)*)(?=,|\.|$|\s+[A-Z][a-z]+:)', t):
        ks = [SKILLS.get(x.strip().lower()) for x in re.split(r'\s+or\s+', m.group(2))]
        ks = [k for k in ks if k]
        if ks: out.append({'n': int(m.group(1)), 'k': ks})
    return out

def role(name, book, a, b, fp, tp):
    fid = fid_of(book)
    feat = page_text(fid, fp, fp + 1)
    regen = (re.search(r'Personal Power Regeneration:\s*([^A-Z]+?)(?=\s+Personal|\s+[A-Z])', feat) or [None, ''])[1].strip()
    cap = (re.search(r'Personal Power Capacity:\s*(.+?)(?=\s+Training|\s+Armor:)', feat) or [None, ''])[1].strip()
    armor = (re.search(r'Armor:\s*(.+?)(?=\s+(?:Starting )?Skill (?:Ranks|Levels)|\s+[A-Z]{4,})', feat) or [None, ''])[1].strip()
    sk = (re.search(r'Skill (?:Ranks|Levels):\s*(.+?)(?=\s+Grid Equipment|\s+GRID EQUIPMENT|\s+[A-Z]{5,}|\s+You start)', feat) or [None, ''])[1].strip()
    eq = re.search(r'(?:Grid Equipment|GRID EQUIPMENT)\s*(.+?)(?=\s+LEVEL\s|\s+TABLE|\s+[A-Z][A-Z’\' !]{6,}\s)', feat)
    gear = [g.strip(' *') for g in re.split(r'•', eq.group(1))[1:]] if eq else []
    gear = [re.sub(r'\s*(Those marked.*|.*Morphin Grid\.)$', '', g).strip() for g in gear if g and len(g) < 60]
    # level table
    R, i, u = rows_with(fid, tp, ['LEVEL', 'PERK'])
    cl = col(u, 'LEVEL'); cp = next(k for k, c in enumerate(u) if 'PERK' in c); cc = next(k for k, c in enumerate(u) if c.startswith('PERSONAL'))
    ce = {e: next((k for k, c in enumerate(u) if c.startswith(E)), None) for E, e in ESS.items()}
    special = [k for k, c in enumerate(u) if c and k not in (cl, cp, cc) and k not in ce.values()]
    sname = title_case(u[special[0]]) if special else ''
    levels = []
    for r in R[i + 1:]:
        m = re.match(r'(\d+)', r[cl] or '')
        if not m: continue
        perks = [p.strip() for p in re.split(r',\s*(?![^()]*\))', r[cp].replace('', '+').replace('', '-')) if p.strip() and p.strip() not in ('—', '-')]
        lv = {'l': int(m.group(1)), 'perks': perks, 'pp': r[cc]}
        if special: lv['sp'] = r[special[0]].replace('', '+')
        inc = {e: int(re.sub(r'[^\d]', '', r[k]) or 0) for e, k in ce.items() if k is not None and re.search(r'\d', r[k] or '')}
        if inc: lv['ess'] = inc
        levels.append(lv)
    # role perk texts
    head = sz(15, 18) if book == 'Core Rulebook' else caps(10.5, 14)
    texts = {}
    for e in entries(fid, a, b, head):
        n = title_case(e['n']).strip()
        if e['body'] and n.lower() not in texts: texts[n.lower()] = {'n': n, 't': e['body'][:1500], 'p': e['p']}
    intro = next((first_sentence(x['body'], 240) for x in entries(fid, a, b, lambda l: l['sz'] >= 15) if x['body']), '')
    return {'id': re.sub(r'[^a-z]+', '-', name.lower()).strip('-'), 'n': name, 'book': fid, 'p': a, 'q': b, 'intro': intro,
            'regen': regen, 'cap': cap, 'armor': armor, 'skills': skill_list(sk), 'skillsText': sk, 'gear': gear,
            'special': sname, 'levels': levels, 'perks': texts}

if __name__ == '__main__':
    out = []
    for r in ROLES:
        try: x = role(*r)
        except Exception as ex: print('FAIL', r[0], ex); continue
        out.append(x)
        print(x['n'], '| regen', x['regen'], '| cap', x['cap'][:30], '| armor', x['armor'][:40], '| skills', x['skills'], '| gear', x['gear'][:5], '| levels', len(x['levels']), '| perks', len(x['perks']), '| special', x['special'])
    json.dump(out, open('roles.json', 'w'), ensure_ascii=False)

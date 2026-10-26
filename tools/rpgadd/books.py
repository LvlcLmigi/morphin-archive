from build import *
def core():
    C = fid_of('Core Rulebook')
    origins(C, 24, 29, sz(15, 18))
    for e in entries(C, 33, 65, sz(38, 45)):
        n = title_case(e['n'])
        if n.endswith('Ranger') and 'Spectrum' not in n and 'Advanced' not in n:
            add(C, 'role', e, first_sentence(e['body']), n=n)
    influences(C, 68, 78, sz(24, 30), sz(15, 18))
    simple(C, 'perk', 95, 101, sz(15, 18), keep=lambda e: e['p'] < 101 or e['y'] < 0.25 and e['n'] == 'Wrestler' or e['n'].lower() == 'wrestler')
    simple(C, 'power', 101, 103, sz(15, 18), skip_names=['^Wrestler$'])
    for lp in (110, 112, 114): weapon_spread(C, lp, lp + 1)
    armor_page(C, 121)
    inline(C, 'gear', 122, 123, after=lambda l: l['t'] == 'Gear' and l['sz'] >= 20, until=lambda l: l['sz'] >= 20 and 'Vehicles' in l['t'], skip=['^For example', '^Note', '^Example'])
    simple(C, 'gear', 126, 132, sz(15, 18), skip_names=['^Vehicle', 'About'])
    zords(C, 143, 156, sz(15, 18))
    simple(C, 'zordfeat', 138, 140, sz(11, 13.5))
core()

def ats():
    A = fid_of('Across the Stars')
    origins(A, 40, 44, sz(15, 18))
    influences(A, 44, 51, sz(15, 18), caps(10.5, 13, 'Italic'))
    for e in entries(A, 51, 64, sz(15, 18)):
        if e['n'].endswith('Ranger'): add(A, 'role', e, first_sentence(e['body']), n=title_case(e['n']), q=min(e['p'] + 4, 64))
    simple(A, 'perk', 70, 74, caps(10.5, 13, 'Italic'), until='ZORD ALTERATIONS')
    simple(A, 'power', 74, 75, caps(10.5, 13, 'Italic'), after='ZORD ALTERATIONS')
    for lp in (78, 80, 82): weapon_spread(A, lp, lp + 1)
    armor_page(A, 85); armor_page(A, 86)
    simple(A, 'gear', 87, 89, caps(10.5, 13, 'Italic'), skip_names=['VEHICLE PERKS'])
    simple(A, 'gear', 90, 104, sz(20, 24))
    simple(A, 'zordfeat', 105, 107, caps(10.5, 13, 'Italic'))
    zords(A, 108, 123, sz(13.5, 15))
ats()

def bth():
    B = fid_of('Beneath the Helmet')
    origins(B, 31, 33, sz(15, 18))
    influences(B, 34, 36, sz(15, 18), caps(10.5, 13, 'Italic'))
    for e in entries(B, 39, 49, sz(15, 18)):
        if e['n'].endswith('Ranger'): add(B, 'role', e, first_sentence(e['body']), n=title_case(e['n']), q=min(e['p'] + 3, 49))
    simple(B, 'perk', 52, 57, sz(15, 18), skip_names=['^Origin Form Perks$', '^Sample'])
    simple(B, 'power', 58, 59, sz(15, 18), until='White Ranger Extra Dino')
    simple(B, 'gear', 64, 65, caps(10.5, 13, 'Italic'))
    simple(B, 'gear', 65, 66, sz(15, 18), skip_names=['^Dino Drives$'] and [])
    weapon_page(B, 68)
    armor_page(B, 69)
    simple(B, 'gear', 69, 70, sz(15, 18), skip_names=['^Shield of Triumph$'])
    simple(B, 'gear', 71, 72, sz(15, 18), skip_names=['^Repairing'])
    simple(B, 'zordfeat', 73, 75, sz(15, 18), skip_names=['^Automatic Zord Features$'])
    zords(B, 76, 87, sz(15, 18))
bth()

def tsg():
    T = fid_of('Through the Shattered Grid')
    H = sz(15, 18); C12 = caps(11.5, 13)
    for a, b in ((20, 21), (71, 71), (114, 114)):
        influences(T, a, b, lambda l: H(l) and l['t'].startswith(('Influence', 'Here', 'Shattered', 'Observer')) or H(l) and not l['t'].startswith(('Origin', 'Alternative', 'New Role')), C12)
    for a, b in ((22, 23), (70, 70)): origins(T, a, b, H)
    for e in entries(T, 23, 27, H):
        if 'Magna' in e['n'] or 'Defender' in e['n']: add(T, 'role', e, first_sentence(e['body']), n='Magna Defender', q=27)
    for e in entries(T, 72, 75, H):
        if 'Guardian' in e['n']: add(T, 'role', e, first_sentence(e['body']), n='Guardian of Eltar', q=75)
    simple(T, 'perk', 27, 28, C12, after='ULTIMATE MAGNA DEFENDER', until='ONCE A RANG')
    simple(T, 'power', 28, 28, C12, until='POWER EFFICIENCY')
    simple(T, 'perk', 75, 75, C12, after='SUPREME GUARDIAN', skip_names=['^Table'])
    simple(T, 'power', 76, 76, C12, until='GRID EMPOWERED')
    simple(T, 'perk', 117, 117, C12, until='RISE AGAIN')
    simple(T, 'power', 117, 117, C12, after='RISE AGAIN')
    for p in (25, 33, 79): weapon_page(T, p)
    armor_page(T, 34)
    simple(T, 'gear', 34, 34, C12, after='SHIELDS', skip_names=['^Table'])
    simple(T, 'gear', 79, 79, sz(19, 22))
    simple(T, 'gear', 118, 118, C12, after='GEAR', until='HYPERFORCE MORPHER')
    simple(T, 'zordfeat', 35, 37, C12, after='NEW ZORD FEATURES')
    simple(T, 'zordfeat', 80, 81, C12)
    simple(T, 'zordfeat', 119, 120, C12, after='HYPERFORCE AUTOMATIC', skip_names=['^Table'])
    for a, b in ((38, 41), (81, 81), (120, 125)): zords(T, a, b, sz(13.5, 15))
tsg()

def cookbook():
    K = fid_of("Finster's Monster-matic Cookbook")
    influences(K, 281, 282, sz(19, 22), caps(12.5, 14))
    for e in entries(K, 283, 302, sz(19, 22)):
        if e['n'].startswith('Path of'): add(K, 'role', e, first_sentence(e['body']), n='Psycho Ranger: ' + e['n'], q=min(e['p'] + 3, 302))
    weapon_spread(K, 304, 305)
cookbook()

def gambit():
    G = fid_of('Phantom Gambit')
    simple(G, 'gear', 21, 21, sz(15, 18), until='The Power Wing')
gambit()
if __name__ == '__main__':
    import collections
    for fid, l in ITEMS.items():
        print(BOOKS[fid]['title'], collections.Counter(i['k'] for i in l))
        for i in l: print(' ', i['p'], i['k'], i['n'], '|', i['d'][:70], '|', json.dumps(i.get('f', {}), ensure_ascii=False)[:230])

"""Builds The Morphin Archive for GitHub Pages.

The page sources live in this repository (src/Index.html, src/Mobile.html); files in static/ (Grid Run) are
copied as they are. Card data comes from the Apps Script web app. Writes a standalone site to _site/. GitHub Actions runs this on every push, every 20 minutes and on demand,
so changes deployed in Apps Script show up here on their own.
"""
import base64, hashlib, html, json, os, sys, time, urllib.request

EXEC = 'https://script.google.com/macros/s/AKfycbw8lEIvVt2hWJjsAYEbs3yFH-nsOXkxEKs-UPqULYP97fgh67gty-k2UJ1KR0Y2VLTKxA/exec'
SITE = 'https://powerrangers.volbeat.vip'
OUT = '_site'
VERSION = '2'          # bump to force a rebuild after editing this file


ICONS = {
    'apple-touch-icon.png': 'iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAMAAAAKE/YAAAAAYFBMVEXouTHmtzDhtC/dsC/XrC7SqC3IoCzBmyu7liqvjSmjgyeXeiWRdSSQdSSKcCR9ZiJuWiBkUh5jUR5dTR1URRxFOho0LRgqJRYiHxUdGxUYFxQTExQQEBMMDhILDRMLDRIIkhbqAAADp0lEQVR42u3c65qqIBQGYMysnA52MBNNu/+73I171yiigELAnm/9bZ7pTZGFsIDUHgYBGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhro/wlNLxfqGTrfBoQE29wjdJksSBOLpPQEXZ0j8o7oXPmAvq5JJ9ZX59G3mPTi6+Y0mu4DwolgT51Fl8eQDER4dBR9ichIRBcH0dmmi9zmTV/dik3mGPr2RThA9ofoeiK1oIvDooNbpa9P0lXng0VSOIKujsuObHm8/3x4Zz88VS6g2Yt5KGRvgzV0FoubLdvg48wqmkp2EExqD3bUGrpMQqYrfgz96YPpxMNZw7/paEWHwi80h1a/43QXaBr+TUT3ni2ptHGL9SSbSWh6mHrNmPvT6x+Noe/MYC5SyRfVaSQTmUPPzcxFMjvZqKL7g7kpr+pk3vCPfPbr+D9dda6BfPbGDjey0gi6OjHJZMojNPI4K8w1SKNzZmbgIEomRSHsOJm2lutG06VaWqjOkfjaMSlqSTWjU7Vk8jeJyP7dK1LN6ETlvfonXYvTe3sOLdGM3skPKjtJPhC2/dbwb68ZvZdNJuwb4zNRi5r2u/c3hVadfpRr2obQOyl0FvOnlwRvhQ+LaHaUL/2OYA99H55+FCVQW+gHM5jgxCp9uIVmR6z8GBoUWkGz86ODMTAGtYBmJwdGg5ubLKBPRCnOQAMNNNBAAw000EADDTTQQAMNNNBAA92NW6xi5i0dWZmAFE/zjq9M25nqFUyoiybWbU2qjyxdiFfn7C1fZLF6Y3Zgoeg60rRXVycXimrOwqfkAqhVdL+O7F8FimCp2TK6X7EnU31nHc2uNMvU7DmAbm8pkivycQH9LtEKJWv23EA/m/Y2kC9ccwX9TDbyNXum0K96j52BLYb5zvCVnlljzgmD5UDtwquzTrPJwqtUte+Vi26fftWMLtcGNjQx2XNTakbXlKmomr/FkO6Z+izp/+hOgezJQIFs7WUpctOjatpi+MGib87X+VBez72x7m9kqPtbDH3YMvJ9sfzbnMN7qZLbBpXZ3AbFuWY+bDir/dzaV3u5ibK54/5tV5V9thzbGMxLNqIt2BoG4790s/toZnb2WAFesx04wEHTq/xvPirjOwSHkqT6vum3H/9SDx+0c3D3oJ3mifTvSCNOyvbh8Ch2rsGTY7rq1oFooTcHor3nGvw6eq5JNkmSmfrfOE4RaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmigJeMPBJLd94fsZ4kAAAAASUVORK5CYII=',
    'icon-192.png': 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAAYFBMVEXouTHmtzDjtTDitC/gsy/esS/esS7cry/Wqy7PpS3HnyzBmyuwjimUdyV/ZyJwXCBiUR5TRRxANhkzLBgtJxcpJRYoJBYhHhUXFhQPEBILDRMLDRIKDRILDBIKDBMKDBL6B48eAAAEvUlEQVR42u2d4WLiIAyAWXWz1taq3bQy17z/W950t90KhUIlhXjJz81qPiAklASEHBPo4EvkjALg+qPC/u+u62RU6cYYhL0VZAJi10NYHpPJiEUZQUB9q0Ji+NOdTE4M1iAItL5VMSGJCwOkBZDs8DeryEOIAcIBAB2tgYcQAzCAAgD0NIeH6gGgqDo8UA8ATd3hYXoAqCoPD9IDQFd7YIDIcrkCdJQtoPsEAMoA8AgA1KdRoK0/YAMcj6QB6rUQRU0WYF+ImxR7kgBNKX6kbMgBnCrRk+pECqDdPgtFnrctSjCBAfC+W4sBWe/eMXog/HceNsIgmwPWW4mQE38lLFIdEwdot+q4UUdTaFMQYQd/3td2VZ/P9ar/tzysKYQEOBR9VbPq1tptlSGaQjiA11IZLOWb+V+vyQGMNLM6M2XBTCEMwLnOR+Z8zTfk9TkdgH3h4HU17xwmxgsA0Cgj/MkU95yqp/CmcDeArlUTgHU2gHP94jcu1NH2cq8p3AXwvve3TN3e99EA1Llx4TY3ttuFMugOUQC0qM09UFMfvccUpgK02+U98YHaecvJjm0agBa1rffvd5rP1OWOCDH4V1OmEi1MnRbjTQB4DTWZ6y7kOANAu83CuVO1LRb+piB8+z0PG9uro9F7ueMHoPrRAKsrbT7Y7NEATqX/+rZ1+Ii6ji5POACnwtt2z7s83529rbk4oQBUzkFnf5FcOJhJ0zeFCgWg8FyM/IudXWB75rVBAfjtuDwneSdX8duxoQBk/bcldsNU3eyqdnjo58XAArUHGoepcT3t3W6D2gPfXz7q701vd8ed3nGWITQCcCzN73bHgp031CHkBKCtE7zi/ugAWqiki3XZHBtADZWGxeJD4gI0pXAUo2OLCaCtTmxicmwRAeql8JJlnRjAs/CUFwZgAAZgAAZgAAZgAAZgAAZgAAZgAAZgAAZgAAZgAPoA5qoHn/2ymK/XDXUnw2LasYy7wTFQ+TMs5nqg2FtMTpsctl37+LuU49tM1ryJBLZZRzb6RpJEUgCwbbWOZiYnAWDc7HZIbk0EYDDd4MklMzkZAN2xbZzqWRMC6Du2wjEzOSWAX0lP7pnJaQH8dWyZR2YyLoDwBrg6Nq/MZNyEp+8vR6ip/TH9eZL+cGqz8ZP+suBVeEYPjgPgm/jqJ72KjgIFwD/12MfYZ0g9npD87TPd4id/T0q/d7FdLf3e52vTK4Ao8Aog5CwlKJ4TXFpFQBl6EdDQrwYsw5rQFv9jIZxEKUXM5yxFlOSLQW+hb7hyXBGhHHeoGYkVREv6JemS/KEAw5M5qWMZvLTyYp0RgPzRJJL+4TDS/3ieKq3jeYZiPGIHJN2amfYRVZL+IWGS/DFtg4EarYPyhmYc5KMKyR8WeZEIMrDNR+m4zq+4h/SBqWqMR/DI2luMtyZ9aPBVrjFeTvfY5qs1Hw6tpAyALvAAd3Dw/QOxAchfYSEvdPW/8DUuSQBQn0b5Mqn4PcAXqkXvAb5UMHoP8MWa0XuAARggAABfcc1DiAEkELCDC/AQYgBkAIBEXxVBB449ACkas0Ep4fXp5NS32EBSCBZlhO2pDhLRHibPQhC5Iz7bEO6dRj8RPmBukNsPfrj86B9ncLtiuSXYFAAAAABJRU5ErkJggg==',
    'icon-512.png': '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',
}
SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0d13"/><g transform="translate(11.2 11.2) scale(1.0)"><path d="M20 2 36 11v18L20 38 4 29V11z" transform="scale(1.04)" fill="none" stroke="#E8B931" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 10 28 14.5v9L20 28l-8-4.5v-9z" transform="scale(1.04)" fill="#E8B931"/></g></svg>'


def fetch(url, body=None, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': 'morphin-archive-build'})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode('utf-8')
        except Exception as e:
            if k == tries - 1:
                raise
            print('retrying', url[:80], e)
            time.sleep(5 * (k + 1))


def boot(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def one(s, old, new):
    if s.count(old) != 1:
        sys.exit(f'build: expected one {old[:60]!r}, found {s.count(old)}')
    return s.replace(old, new)


def src(name):
    p = os.path.join('src', name + '.html')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return f.read()
    return fetch(EXEC + '?src=' + name)


index_src = src('Index')
mobile_src = src('Mobile')
STATIC = {}
if os.path.isdir('static'):
    for n in sorted(os.listdir('static')):
        with open(os.path.join('static', n), 'rb') as f:
            STATIC[n] = f.read()
res = json.loads(fetch(EXEC, json.dumps({'fn': 'getData', 'args': ['site-build']}).encode()))
if not res.get('ok'):
    sys.exit('build: getData failed: ' + str(res))
data = res['data']
data.pop('liked', None)
for k in ('cards', 'collections', 'decks', 'settings'):
    data.setdefault(k, [] if k != 'settings' else {})

build_id = hashlib.sha256((VERSION + index_src + mobile_src + json.dumps(data, sort_keys=True)).encode() + b''.join(STATIC.values())).hexdigest()[:16]
force = os.environ.get('FORCE', 'true') == 'true'
try:
    live = fetch(SITE + '/build.txt', tries=1).strip()
except Exception:
    live = ''
changed = force or live != build_id
print('build', build_id, 'live', live or '-', 'deploy' if changed else 'no change')
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
        f.write(f'changed={"true" if changed else "false"}\n')
if not changed:
    sys.exit(0)

data['ts'] = int(time.time() * 1000)
st = data['settings'] or {}
title = st.get('siteTitle') or 'The Morphin Archive'
desc = st.get('tagline') or 'A gallery of Heroes of the Grid Ranger cards and decks: official and homebrew, with every deck, ability and stat.'
pick = sorted(data['cards'], key=lambda c: (not c.get('featured'), -(c.get('likes') or 0)))
src0 = (pick[0].get('src') or '') if pick else ''
og_img = (src0.split('=')[0] + '=w1200') if src0.startswith('https://lh3.googleusercontent.com/') else SITE + '/icon-512.png'
e = html.escape

HEAD = f'''<meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#0b0d13">
<meta name="color-scheme" content="dark light">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Morphin Archive">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(title)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{e(og_img)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="icon" href="icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://script.google.com">
<link rel="preconnect" href="https://script.googleusercontent.com">
<link rel="preconnect" href="https://lh3.googleusercontent.com">
'''

# Phones go to the phone site unless they chose the full one (?full=1, or the full-site link in the phone menu).
ROUTE = '''<script>(function(){var u=new URL(location.href),p=u.searchParams,ls;try{ls=localStorage;}catch(e){}
var qs=function(){var t=p.toString();return t?'?'+t:'';};
if(p.get('view')==='m'){p.delete('view');location.replace('m.html'+qs()+u.hash);return;}
if(p.get('full')==='1'||p.get('view')==='full'){try{ls.setItem('gcg-mobile',JSON.stringify({snooze:Date.now()+365*864e5}));}catch(e){}
  p.delete('full');if(p.get('view')==='full')p.delete('view');try{history.replaceState(null,'',u.pathname+qs()+u.hash);}catch(e){}return;}
try{var pr=JSON.parse(ls.getItem('gcg-mobile')||'null');if(pr&&pr.snooze&&Date.now()<pr.snooze)return;}catch(e){}
if(matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<820)location.replace('m.html'+u.search+u.hash);})();</script>
'''

index = one(index_src, '<?!= boot ?>', boot({'exec': EXEC, 'data': data, 'v': build_id[:8]}))
index = one(index, '<meta name="viewport" content="width=device-width, initial-scale=1">',
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + ROUTE + HEAD)
index = index.replace('<!--DEMO-->', '')

mobile = one(mobile_src, '<?!= boot ?>', boot({'exec': EXEC, 'url': SITE + '/', 'data': data, 'v': build_id[:8]}))
mobile = one(mobile, '<meta name="theme-color" content="#0b0d13">', HEAD.rstrip('\n'))
mobile = mobile.replace('<!--DEMO-->', '')

manifest = {
    'name': title, 'short_name': 'Morphin Archive', 'description': desc,
    'start_url': './', 'scope': './', 'display': 'standalone',
    'background_color': '#0b0d13', 'theme_color': '#0b0d13',
    'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
              {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
              {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}],
}

os.makedirs(OUT, exist_ok=True)
files = {'index.html': index, '404.html': index, 'm.html': mobile, 'build.txt': build_id + '\n',
         'manifest.webmanifest': json.dumps(manifest, indent=1), 'icon.svg': SVG_ICON, '.nojekyll': ''}
for name, text in files.items():
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(text)
for name, raw in STATIC.items():
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(raw)
for name, b64 in ICONS.items():
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(base64.b64decode(b64))
print('wrote', ', '.join(sorted(list(files) + list(ICONS))), f'({len(data["cards"])} cards)')

import json, urllib.request, base64, sys, os, concurrent.futures as cf, time
EXEC='https://script.google.com/macros/s/AKfycbw8lEIvVt2hWJjsAYEbs3yFH-nsOXkxEKs-UPqULYP97fgh67gty-k2UJ1KR0Y2VLTKxA/exec'
def call(fn,*args):
    for k in range(5):
        try:
            req=urllib.request.Request(EXEC,data=json.dumps({'fn':fn,'args':list(args)}).encode(),headers={'User-Agent':'morphin-archive-build','Content-Type':'text/plain'})
            with urllib.request.urlopen(req,timeout=180) as r: res=json.loads(r.read())
            if not res.get('ok'): raise Exception(str(res)[:200])
            return res['data']
        except Exception as e:
            if k==4: raise
            time.sleep(4*(k+1))
d=call('getData','site-build'); files=d['files']
json.dump(files,open('files.json','w'))
CH=4*1024*1024
for f in files:
    out=f"pdf/{f['id']}.pdf"; os.makedirs('pdf',exist_ok=True)
    if os.path.exists(out): continue
    first=call('getFileRange',f['id'],0,CH); size=first['size']
    parts={0:base64.b64decode(first['data'])}
    starts=list(range(CH,size,CH))
    with cf.ThreadPoolExecutor(6) as ex:
        for s,b in zip(starts, ex.map(lambda s: base64.b64decode(call('getFileRange',f['id'],s,min(size,s+CH))['data']), starts)): parts[s]=b
    data=b''.join(parts[k] for k in sorted(parts)); assert len(data)==size,(len(data),size)
    open(out+'.tmp','wb').write(data); os.rename(out+'.tmp',out); print(f['title'],size,flush=True)

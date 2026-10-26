import fitz, json, sys, os
files={f['id']:f for f in json.load(open('files.json'))}
os.makedirs('txt',exist_ok=True)
for fn in sorted(os.listdir('pdf')):
    if not fn.endswith('.pdf'): continue
    fid=fn[:-4]; out=f'txt/{fid}.jsonl'
    if os.path.exists(out): continue
    doc=fitz.open('pdf/'+fn); w=open(out+'.tmp','w')
    for pno,page in enumerate(doc):
        H=page.rect.height; W=page.rect.width
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines',[]):
                spans=[s for s in l['spans'] if s['text'].strip()]
                if not spans: continue
                t=''.join(s['text'] for s in l['spans']).strip()
                s0=max(spans,key=lambda s:len(s['text']))
                w.write(json.dumps({'p':pno+1,'y':round(l['bbox'][1]/H,3),'x':round(l['bbox'][0]/W,3),'sz':round(s0['size'],1),'f':s0['font'],'t':t})+'\n')
    w.close(); os.rename(out+'.tmp',out); print('extracted',files[fid]['title'],len(doc),flush=True)

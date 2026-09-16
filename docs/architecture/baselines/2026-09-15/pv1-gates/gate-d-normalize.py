import re,sys,os,pathlib
base=pathlib.Path(sys.argv[1]); now=pathlib.Path(sys.argv[2])
R=[(r'/_next/static/[A-Za-z0-9_-]{16,}/', '/_next/static/BUILD/'),
   (r'(chunks/(?:app/)?[\w./\[\]%-]*?)-[0-9a-f]{8,20}\.js', r'\1-HASH.js'),
   (r'(chunks/)[0-9a-f]{8,20}\.js', r'\1HASH.js'),
   (r'((?:main-app|page|layout|webpack|polyfills|framework|main|not-found|error|template|loading)-)[0-9a-f]{8,20}(\.js)', r'\1HASH\2'),
   (r'\\?"buildId\\?":\\?"[A-Za-z0-9_-]+\\?"', '"buildId":"BUILD"'),
   (r'(/_next/static/media/[\w-]+)\.[0-9a-f]{6,12}(\.\w+)', r'\1.HASH\2'),
   (r'(/_next/static/css/)[0-9a-f]{8,20}(\.css)', r'\1HASH\2'),
   (r'<lastmod>[^<]*</lastmod>', '<lastmod>X</lastmod>'),
   (r'\$L[0-9a-f]+', '$Lx'), (r'"\$[0-9a-f]+"', '"$x"'),
   (r'\\"[0-9a-f]{20,}\\"', '\\"HEX\\"')]
def norm(s):
    for a,b in R: s=re.sub(a,b,s)
    return s
ok=0; names=sorted(p.name for p in now.glob('*.html'))
for n in names:
    a=norm((base/n).read_text(errors='replace')); b=norm((now/n).read_text(errors='replace'))
    if a==b: print(f"{n}: IDENTICAL after normalization ({len(b)} bytes)"); ok+=1; continue
    ta=a.split('><'); tb=b.split('><')
    import difflib; d=[x for x in difflib.unified_diff(ta,tb,lineterm='',n=0) if x[:1] in '+-' and x[:3] not in ('+++','---')]
    print(f"{n}: DIFFERS ({len(d)} token lines); first 6:"); [print("   "+x[:160]) for x in d[:6]]
print(f"RESULT: {'PASS' if ok==len(names) else 'CHECK'} ({ok}/{len(names)} identical)")

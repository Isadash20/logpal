import sys
def rgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def hx(c): return '#%02x%02x%02x' % tuple(max(0,min(255,round(v))) for v in c)
def mix(a,b,t): A,B=rgb(a),rgb(b); return hx(tuple(A[i]+(B[i]-A[i])*t for i in range(3)))
def rgba(h,a): r,g,b=rgb(h); return 'rgba(%d, %d, %d, %s)'%(r,g,b,a)
W,K='#ffffff','#000000'
# key, label, accent, pop, bg (light), textbase, note
SPECS=[
 ('lavender','Lavender','#8f74d2','#4fb39a','#f6f3fc','#241f2f','lilac with mint about it'),
 ('peach','Peach','#ec7c5f','#3f9fb0','#fdf3ee','#2c2220','coral with teal'),
 ('sky','Sky','#4f8fe0','#e09a4a','#f1f6fc','#1b2534','blue with sand'),
 ('honey','Honey','#d9961f','#4d6fb3','#fcf7ea','#2a2414','mustard with slate blue'),
 ('slate','Slate','#44679f','#e08f2f','#f0f3f8','#161c27','steel blue with amber'),
 ('forest','Forest','#2f8457','#d07a3a','#f0f6f1','#15221a','deep green with copper'),
 ('ocean','Ocean','#1f87a6','#ec7158','#eff5f8','#142128','teal with coral'),
 ('mono','Mono','#23232b','#e23d4e','#f3f3f5','#111114','near-black with one red'),
]
out=[]
out.append("""
/* Eight more, 2026-11-05, "something for everybody": the same rules as
   Sakura and Matcha (one base, the other colour splotched through, pale
   wash, white cards, half-strength tints), generated from a short spec
   by scratchpad/palettes.py so the derivations stay alike. Lavender and
   Peach lean soft; Sky and Honey sit in the middle; Slate, Forest, Ocean
   and Mono lean plain. */
""")
for key,label,acc,pop,bg,text,note in SPECS:
    L={
     'accent':acc,'accent-press':mix(acc,K,.12),'accent-soft':mix(acc,W,.86),'accent-ring':rgba(acc,.16),
     'pop':pop,'pop-press':mix(pop,K,.12),'pop-soft':mix(pop,W,.86),'pop-ring':rgba(pop,.2),
     'ink':mix(text,acc,.15),'ink-2':mix(text,acc,.35),'on-ink':W,'on-ink-2':mix(bg,acc,.25),
     'protein':mix(acc,K,.1),'carbs':pop,'fat':mix(acc,W,.38),'water':pop,'steps':acc,'sleep':mix(acc,K,.22),
     'meal-morning':acc,'meal-afternoon':pop,'meal-evening':mix(acc,K,.1),'meal-late':mix(acc,K,.22),
     'positive':'#6fa470' if key not in ('forest',) else '#c7824f','warning':'#e2a23f','danger':'#d95a6a','gold':'#e9c45c',
     'bg':bg,'bg-top':bg,'surface':W,'surface-2':mix(bg,W,.4),'surface-3':mix(bg,acc,.12),
     'border':mix(bg,acc,.13),'border-strong':mix(bg,acc,.3),
     'text':text,'text-2':mix(text,bg,.42),'text-3':mix(text,bg,.6),
     'tint-k':'0.8' if key!='mono' else '0.55',
    }
    sh=rgba(mix(acc,K,.4),.08)
    L.update({'shadow-1':'0 1px 2px %s, 0 2px 8px %s'%(rgba(mix(acc,K,.4),.05),rgba(mix(acc,K,.4),.05)),
              'shadow-card':'0 2px 4px %s, 0 12px 32px %s'%(rgba(mix(acc,K,.4),.08),rgba(mix(acc,K,.4),.14)),
              'shadow-2':'0 2px 6px %s, 0 10px 30px %s'%(rgba(mix(acc,K,.4),.06),rgba(mix(acc,K,.4),.1)),
              'shadow-3':'0 16px 40px %s'%rgba(mix(acc,K,.4),.16)})
    out.append("/* %s: %s. */\n:root[data-palette='%s'] {\n"%(label,note,key)+''.join("  --%s: %s;\n"%(k,v) for k,v in L.items())+"}\n")
    # dark half
    dacc=mix(acc,W,.35) if key!='mono' else '#c9c9d4'; dpop=mix(pop,W,.3)
    dbg=mix('#121214',acc,.08); dtext='#f1f1f5'
    D={
     'accent':dacc,'accent-press':mix(dacc,W,.12),'accent-soft':mix(dbg,dacc,.22),'accent-ring':rgba(dacc,.2),
     'pop':dpop,'pop-press':mix(dpop,W,.12),'pop-soft':mix(dbg,dpop,.22),'pop-ring':rgba(dpop,.22),
     'ink':dtext,'ink-2':mix(dtext,dbg,.15),'on-ink':dbg,'on-ink-2':mix(dtext,dbg,.6),
     'protein':mix(dacc,W,.08),'carbs':dpop,'fat':mix(dacc,W,.4),'water':dpop,'steps':dacc,'sleep':mix(dacc,W,.18),
     'meal-morning':dacc,'meal-afternoon':dpop,'meal-evening':mix(dacc,W,.08),'meal-late':mix(dacc,W,.18),
     'positive':'#8fcf8c' if key!='forest' else mix('#c7824f',W,.3),'warning':'#ffb75c','danger':'#ff7a8c','gold':'#fdd56a',
     'bg':dbg,'bg-top':dbg,'surface':mix(dbg,W,.05),'surface-2':mix(dbg,W,.08),'surface-3':mix(dbg,W,.14),
     'border':mix(dbg,W,.12),'border-strong':mix(dbg,W,.22),
     'text':dtext,'text-2':mix(dtext,dbg,.3),'text-3':mix(dtext,dbg,.52),
     'tint-k':'0.8',
     'shadow-1':'0 1px 2px rgba(0, 0, 0, 0.4)','shadow-card':'0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.35)',
     'shadow-2':'0 4px 14px rgba(0, 0, 0, 0.55)','shadow-3':'0 16px 40px rgba(0, 0, 0, 0.7)',
    }
    out.append(":root[data-theme='dark'][data-palette='%s'] {\n"%key+''.join("  --%s: %s;\n"%(k,v) for k,v in D.items())+"}\n")
css='\n'.join(out)
open('src/styles/tokens.css','a').write(css)
# theme.ts swatches + types (skipped when already registered)
p='src/lib/theme.ts'; s=open(p).read()
if "'lavender'" in s:
    import re
    for k,l,a,pp,bg,_,_ in SPECS:
        s=re.sub(r"  \{ key: '%s',[^\n]*\n"%k, "  { key: '%s', label: '%s', bg: '%s', accent: '%s', second: '%s' },\n"%(k,l,bg,a,pp), s)
    open(p,'w').write(s); print('swatches updated'); sys.exit(0)
rows=''.join("  { key: '%s', label: '%s', bg: '%s', accent: '%s', second: '%s' },\n"%(k,l,bg,a,pp) for k,l,a,pp,bg,_,_ in SPECS)
s=s.replace("  { key: 'matcha', label: 'Matcha', bg: '#f5f8f3', accent: '#83a97f', second: '#d98ba3' },\n",
            "  { key: 'matcha', label: 'Matcha', bg: '#f5f8f3', accent: '#83a97f', second: '#d98ba3' },\n"+rows)
open(p,'w').write(s)
p='src/types.ts'; s=open(p).read()
s=s.replace("export type Palette = 'classic' | 'sakura' | 'matcha'","export type Palette =\n  | 'classic'\n  | 'sakura'\n  | 'matcha'\n"+''.join("  | '%s'\n"%k for k,*_ in SPECS).rstrip('\n'))
open(p,'w').write(s)
print('generated', len(SPECS))

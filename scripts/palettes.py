import sys
def rgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def hx(c): return '#%02x%02x%02x' % tuple(max(0,min(255,round(v))) for v in c)
def mix(a,b,t): A,B=rgb(a),rgb(b); return hx(tuple(A[i]+(B[i]-A[i])*t for i in range(3)))
def rgba(h,a): r,g,b=rgb(h); return 'rgba(%d, %d, %d, %s)'%(r,g,b,a)
W,K='#ffffff','#000000'
# key, label, accent, pop, bg (light), textbase, note
SPECS=[
 # key, label, pastel accent, deep second colour, cream wash, text, note.
 # The recipe Phillip liked in Neapolitan and Mint Choc (2026-11-05 night):
 # a warm cream wash, a pastel main colour, a dark second colour.
 ('sakura','Sakura','#ec9ab9','#5a3a44','#fcf6f3','#3a2a2e','strawberry pink with dark rose-brown, on cream'),
 ('matcha','Matcha','#9fc48f','#4a4a32','#faf8ec','#33341f','matcha with dark olive, on cream'),
 ('lavender','Lavender','#b39adb','#4a3d5c','#fbf7f6','#342c3e','lilac with deep plum, on cream'),
 ('sky','Sky','#8fb8e6','#3a4658','#f9f8f1','#26303c','sky blue with deep navy, on cream'),
 ('honey','Honey','#e9b84a','#5c4320','#fcf7e4','#3a2c14','honey with dark caramel, on cream'),
 ('slate','Slate','#8aa0bd','#2f3a4a','#f7f6f1','#232b36','steel with charcoal, on cream'),
 ('mocha','Mocha','#bf8f70','#3b2a22','#fbf7f1','#2e221c','milk chocolate with espresso, on cream'),
 # An optional eighth value is a third colour, for water, fat and sleep.
 ('earth','Earth','#b9ae66','#163e11','#fbf1df','#2b2a18','his olive, forest, sand, brown set','#73503d'),
 ('neapolitan','Neapolitan','#e27ab0','#604734','#fcf7e4','#3a2a22','strawberry, chocolate and vanilla'),
]
out=[]
out.append("""
/* All the looks, 2026-11-05, generated from SPECS in scripts/palettes.py
   (run from the repo root after cutting everything from this comment
   down; it appends). The recipe is the one Phillip picked out of
   Neapolitan and Mint Choc that night: a warm cream wash, white cards, a
   pastel main colour for the brand and the widgets, and one deep dark
   second colour that takes the add button, links, the picked day, the
   icon tiles, water and carbs. Each has a dark half. */
""")
for key,label,acc,pop,bg,text,note,*rest in SPECS:
    third=rest[0] if rest else None
    L={
     'accent':acc,'accent-press':mix(acc,K,.12),'accent-soft':mix(acc,W,.86),'accent-ring':rgba(acc,.16),
     'pop':pop,'pop-press':mix(pop,K,.12),'pop-soft':mix(pop,W,.86),'pop-ring':rgba(pop,.2),
     'ink':mix(text,acc,.15),'ink-2':mix(text,acc,.35),'on-ink':W,'on-ink-2':mix(bg,acc,.25),
     'protein':mix(acc,K,.1),'carbs':pop,'fat':(mix(third,W,.15) if third else mix(acc,W,.38)),'water':(third or pop),'steps':acc,'sleep':(mix(third,K,.15) if third else mix(acc,K,.22)),
     'meal-morning':acc,'meal-afternoon':pop,'meal-evening':mix(acc,K,.1),'meal-late':mix(acc,K,.22),
     'positive':'#6fa470','warning':'#e2a23f','danger':'#d95a6a','gold':'#e9c45c',
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
     'protein':mix(dacc,W,.08),'carbs':dpop,'fat':(mix(third,W,.4) if third else mix(dacc,W,.4)),'water':(mix(third,W,.25) if third else dpop),'steps':dacc,'sleep':(mix(third,W,.2) if third else mix(dacc,W,.18)),
     'meal-morning':dacc,'meal-afternoon':dpop,'meal-evening':mix(dacc,W,.08),'meal-late':mix(dacc,W,.18),
     'positive':'#8fcf8c','warning':'#ffb75c','danger':'#ff7a8c','gold':'#fdd56a',
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
    for k,l,a,pp,bg,*_ in SPECS:
        s=re.sub(r"  \{ key: '%s',[^\n]*\n"%k, "  { key: '%s', label: '%s', bg: '%s', accent: '%s', second: '%s' },\n"%(k,l,bg,a,pp), s)
    open(p,'w').write(s); print('swatches updated'); sys.exit(0)
rows=''.join("  { key: '%s', label: '%s', bg: '%s', accent: '%s', second: '%s' },\n"%(k,l,bg,a,pp) for k,l,a,pp,bg,*_ in SPECS)
s=s.replace("  { key: 'matcha', label: 'Matcha', bg: '#f5f8f3', accent: '#83a97f', second: '#d98ba3' },\n",
            "  { key: 'matcha', label: 'Matcha', bg: '#f5f8f3', accent: '#83a97f', second: '#d98ba3' },\n"+rows)
open(p,'w').write(s)
p='src/types.ts'; s=open(p).read()
s=s.replace("export type Palette = 'classic' | 'sakura' | 'matcha'","export type Palette =\n  | 'classic'\n  | 'sakura'\n  | 'matcha'\n"+''.join("  | '%s'\n"%k for k,*_ in SPECS).rstrip('\n'))
open(p,'w').write(s)
print('generated', len(SPECS))

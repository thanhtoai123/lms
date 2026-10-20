"""Tranh minh hoạ vector cho landing quảng cáo TH STEAM (bảng màu bộ nhận diện; người là nhân vật vẽ, không phải ảnh thật)."""
import math, os, sys
B="#1D4ED8"; BD="#1E40AF"; BL="#4F75E1"; BT="#DBEAFE"; E="#10B981"; ED="#059669"; ET="#D1FAE5"; G="#F59E0B"; GD="#D97706"; GT="#FEF3C7"; GF="#F7D27A"
N="#0F172A"; N2="#1E293B"; S="#F8FAFC"; W="#FFFFFF"; L="#E2E8F0"; L2="#CBD5E1"; T2="#475569"; T3="#94A3B8"
SKIN=[("#F6D3B3","#E8B48F"),("#E8B48F","#D49A72"),("#C68B5E","#A9714A"),("#F2C9A1","#DFAA80")]
HAIR=["#2B1B17","#1F1F2E","#4A2E21","#111827","#5A3825"]
OUT=os.environ.get("OUT",os.path.join(os.environ.get("REPO", "."), "apps/web/public/lp-anh"))
os.makedirs(OUT,exist_ok=True)

def svg(w,h,body,defs="",title=""):
    t=f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">{t}{("<defs>"+defs+"</defs>") if defs else ""}{body}</svg>'
def bg(w,h,i="bg",c1=S,c2=BT):
    return (f'<linearGradient id="{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>',
            f'<rect width="{w}" height="{h}" fill="url(#{i})"/>')
def star(x,y,r,fill=G,op=1):
    k=r*0.28
    return f'<path d="M{x},{y-r} Q{x+k},{y-k} {x+r},{y} Q{x+k},{y+k} {x},{y+r} Q{x-k},{y+k} {x-r},{y} Q{x-k},{y-k} {x},{y-r}Z" fill="{fill}" opacity="{op}"/>'
def dots(x,y,c,r_,gap,color=B,op=.16):
    return "".join(f'<circle cx="{x+i*gap}" cy="{y+j*gap}" r="3" fill="{color}" opacity="{op}"/>' for i in range(c) for j in range(r_))
def orbit(cx,cy,rx,ry,rot,color=G,w=10,op=1):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({rot} {cx} {cy})" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-dasharray="{rx*4.2:.0f} {rx*2.1:.0f}" opacity="{op}"/>'
def rocket(x,y,s=1,rot=40,color=B):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="M-9.2 1.5 C-13.8 4.2 -16.4 9 -16.8 16.8 C-14.6 14.6 -12.2 13.6 -9.2 13.6 Z M9.2 1.5 C13.8 4.2 16.4 9 16.8 16.8 C14.6 14.6 12.2 13.6 9.2 13.6 Z M-4.6 13.6 H4.6 L3.4 18.2 H-3.4 Z" fill="{color}"/>'
            f'<path d="M0 -27.5 C5.4 -25 9.2 -18.5 9.2 -6 L9.2 10.5 C9.2 12.5 7.8 13.6 6 13.6 L-6 13.6 C-7.8 13.6 -9.2 12.5 -9.2 10.5 L-9.2 -6 C-9.2 -18.5 -5.4 -25 0 -27.5 Z" fill="{color}"/>'
            f'<circle cx="0" cy="-9" r="4.8" fill="{W}"/><path d="M-3 19 L0 30 L3 19Z" fill="{G}"/></g>')
def plant(x,y,s=1):
    return (f'<g transform="translate({x} {y}) scale({s})"><path d="M0 0 C-30 -20 -34 -60 -10 -80 C-4 -50 4 -30 0 0Z" fill="{E}"/><path d="M0 0 C26 -16 40 -50 22 -76 C10 -50 4 -30 0 0Z" fill="{ED}"/>'
            f'<path d="M0 0 C-6 -30 -2 -70 6 -96 C12 -60 8 -30 0 0Z" fill="{E}"/><path d="M-22 0 H22 L16 40 H-16Z" fill="{G}"/><rect x="-26" y="-4" width="52" height="10" rx="5" fill="{GD}"/></g>')

# ----------------------------------------------------------------- nhân vật
def hair_back(cx,cy,r,style,c):
    if style=="pony":
        return f'<path d="M{cx+r*0.7},{cy-r*0.3} C{cx+r*1.5},{cy-r*0.2} {cx+r*1.55},{cy+r*0.9} {cx+r*1.05},{cy+r*1.25} C{cx+r*1.2},{cy+r*0.7} {cx+r*1.0},{cy+r*0.2} {cx+r*0.6},{cy}Z" fill="{c}"/>'
    if style=="long":
        return f'<path d="M{cx-r*1.02},{cy-r*0.1} C{cx-r*1.15},{cy+r*0.9} {cx-r*0.9},{cy+r*1.45} {cx-r*0.55},{cy+r*1.5} L{cx+r*0.55},{cy+r*1.5} C{cx+r*0.9},{cy+r*1.45} {cx+r*1.15},{cy+r*0.9} {cx+r*1.02},{cy-r*0.1}Z" fill="{c}"/>'
    if style=="bun":
        return f'<circle cx="{cx}" cy="{cy-r*1.08}" r="{r*0.42}" fill="{c}"/>'
    if style=="bob":
        return f'<path d="M{cx-r*1.08},{cy-r*0.2} C{cx-r*1.12},{cy+r*0.6} {cx-r*0.9},{cy+r*0.85} {cx-r*0.6},{cy+r*0.8} L{cx+r*0.6},{cy+r*0.8} C{cx+r*0.9},{cy+r*0.85} {cx+r*1.12},{cy+r*0.6} {cx+r*1.08},{cy-r*0.2}Z" fill="{c}"/>'
    return ""
def hair_front(cx,cy,r,style,c):
    top=(f'<path d="M{cx-r*1.0},{cy-r*0.05} C{cx-r*1.08},{cy-r*1.05} {cx-r*0.3},{cy-r*1.3} {cx+r*0.15},{cy-r*1.18} '
         f'C{cx+r*0.85},{cy-r*1.1} {cx+r*1.12},{cy-r*0.6} {cx+r*1.0},{cy-r*0.05} ')
    if style in ("short","spiky"):
        fr=(f'C{cx+r*0.86},{cy-r*0.42} {cx+r*0.55},{cy-r*0.62} {cx+r*0.1},{cy-r*0.6} C{cx-r*0.35},{cy-r*0.58} {cx-r*0.7},{cy-r*0.42} {cx-r*1.0},{cy-r*0.05}Z')
        out=f'{top}{fr}" fill="{c}"/>'
        if style=="spiky":
            out+=f'<path d="M{cx-r*0.2},{cy-r*1.2} L{cx},{cy-r*1.45} L{cx+r*0.2},{cy-r*1.18} L{cx+r*0.45},{cy-r*1.36} L{cx+r*0.55},{cy-r*1.08}Z" fill="{c}"/>'
        return out
    # tóc mái dài (con gái / giáo viên nữ)
    fr=(f'C{cx+r*0.9},{cy-r*0.5} {cx+r*0.4},{cy-r*0.8} {cx-r*0.1},{cy-r*0.55} C{cx-r*0.45},{cy-r*0.35} {cx-r*0.8},{cy-r*0.3} {cx-r*1.0},{cy-r*0.05}Z')
    return f'{top}{fr}" fill="{c}"/>'

def face(cx,cy,r,skin,shade,mood="smile",look=0,glasses=False):
    ex=r*0.36; ey=cy+r*0.02; lx=look*r*0.08
    o=(f'<circle cx="{cx-r*0.98}" cy="{cy+r*0.1}" r="{r*0.2}" fill="{shade}"/><circle cx="{cx+r*0.98}" cy="{cy+r*0.1}" r="{r*0.2}" fill="{shade}"/>'
       f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{skin}"/>')
    for sx in (-1,1):
        o+=f'<ellipse cx="{cx+sx*ex+lx}" cy="{ey}" rx="{r*0.085}" ry="{r*0.115}" fill="{N}"/><circle cx="{cx+sx*ex+lx+r*0.03}" cy="{ey-r*0.04}" r="{r*0.03}" fill="{W}"/>'
        o+=f'<path d="M{cx+sx*ex-r*0.13},{ey-r*0.24} Q{cx+sx*ex},{ey-r*0.32} {cx+sx*ex+r*0.13},{ey-r*0.24}" stroke="{N2}" stroke-width="{r*0.05:.1f}" fill="none" stroke-linecap="round"/>'
        o+=f'<ellipse cx="{cx+sx*r*0.58}" cy="{cy+r*0.3}" rx="{r*0.13}" ry="{r*0.08}" fill="{shade}" opacity=".55"/>'
    if glasses:
        for sx in (-1,1):
            o+=f'<rect x="{cx+sx*ex-r*0.2}" y="{ey-r*0.16}" width="{r*0.4}" height="{r*0.32}" rx="{r*0.1}" fill="none" stroke="{N}" stroke-width="{r*0.05:.1f}"/>'
        o+=f'<path d="M{cx-ex+r*0.2},{ey} H{cx+ex-r*0.2}" stroke="{N}" stroke-width="{r*0.05:.1f}"/>'
    if mood=="open":
        o+=f'<path d="M{cx-r*0.2},{cy+r*0.36} Q{cx},{cy+r*0.64} {cx+r*0.2},{cy+r*0.36}Z" fill="{N2}"/><path d="M{cx-r*0.11},{cy+r*0.5} Q{cx},{cy+r*0.6} {cx+r*0.11},{cy+r*0.5}" fill="#E25D5D" opacity=".0"/>'
    else:
        o+=f'<path d="M{cx-r*0.2},{cy+r*0.38} Q{cx},{cy+r*0.56} {cx+r*0.2},{cy+r*0.38}" stroke="{N2}" stroke-width="{r*0.06:.1f}" fill="none" stroke-linecap="round"/>'
    return o

def darken(c,f=0.82):
    c=c.lstrip("#"); r,g,b=(int(c[i:i+2],16) for i in (0,2,4))
    return "#%02X%02X%02X"%(int(r*f),int(g*f),int(b*f))
def arm(x1,y1,x2,y2,c,skin,w,bend=0.0):
    mx=(x1+x2)/2+bend; my=(y1+y2)/2; c=darken(c)
    return (f'<path d="M{x1},{y1} Q{mx},{my} {x2},{y2}" stroke="{c}" stroke-width="{w}" fill="none" stroke-linecap="round"/>'
            f'<circle cx="{x2}" cy="{y2}" r="{w*0.52}" fill="{skin}"/>')

def person(cx,cy,s=1.0,skin=0,hair=0,style="short",shirt=B,pose="type",headset=False,glasses=False,mood="smile",look=0,collar=W,hand_to=None):
    """Nhân vật nửa người. (cx,cy) = tâm đầu; bán kính đầu 40*s."""
    r=40*s; sk,sh=SKIN[skin]; hc=HAIR[hair]
    sw=92*s; top=cy+r*1.25; bot=cy+r*4.4
    o=hair_back(cx,cy,r,style,hc)
    # thân áo
    o+=(f'<path d="M{cx-sw},{bot} C{cx-sw},{top+r*0.6} {cx-sw*0.7},{top} {cx-r*0.4},{top} L{cx+r*0.4},{top} C{cx+sw*0.7},{top} {cx+sw},{top+r*0.6} {cx+sw},{bot}Z" fill="{shirt}"/>')
    o+=f'<rect x="{cx-r*0.24}" y="{cy+r*0.8}" width="{r*0.48}" height="{r*0.55}" rx="{r*0.12}" fill="{sh}"/>'
    o+=f'<path d="M{cx-r*0.42},{top} L{cx},{top+r*0.42} L{cx+r*0.42},{top}" fill="none" stroke="{collar}" stroke-width="{r*0.12:.1f}" stroke-linejoin="round" opacity=".9"/>'
    o+=face(cx,cy,r,sk,sh,mood,look,glasses)+hair_front(cx,cy,r,style,hc)
    if headset:
        o+=(f'<path d="M{cx-r*1.05},{cy} C{cx-r*1.1},{cy-r*1.55} {cx+r*1.1},{cy-r*1.55} {cx+r*1.05},{cy}" stroke="{N}" stroke-width="{r*0.13:.1f}" fill="none"/>'
            f'<rect x="{cx-r*1.22}" y="{cy-r*0.25}" width="{r*0.34}" height="{r*0.55}" rx="{r*0.14}" fill="{N}"/><rect x="{cx+r*0.88}" y="{cy-r*0.25}" width="{r*0.34}" height="{r*0.55}" rx="{r*0.14}" fill="{N}"/>'
            f'<path d="M{cx-r*1.0},{cy+r*0.25} Q{cx-r*0.9},{cy+r*0.7} {cx-r*0.35},{cy+r*0.62}" stroke="{N}" stroke-width="{r*0.07:.1f}" fill="none"/><circle cx="{cx-r*0.32}" cy="{cy+r*0.62}" r="{r*0.09}" fill="{G}"/>')
    lw=r*0.46; sx=cx-sw*0.78; sy=top+r*0.55; rx_=cx+sw*0.78
    if pose=="type":
        o+=arm(sx,sy,cx-r*0.95,bot-r*0.95,shirt,sk,lw,-r*0.5)+arm(rx_,sy,cx+r*0.95,bot-r*0.95,shirt,sk,lw,r*0.5)
    elif pose=="wave":
        o+=arm(sx,sy,cx-r*0.95,bot-r*0.95,shirt,sk,lw,-r*0.5)+arm(rx_,sy,cx+sw*1.35,cy-r*0.6,shirt,sk,lw,r*0.9)
    elif pose=="point":
        tx,ty=hand_to or (cx+sw*1.9,cy+r*0.4)
        o+=arm(sx,sy,cx-r*0.95,bot-r*0.95,shirt,sk,lw,-r*0.5)+arm(rx_,sy,tx,ty,shirt,sk,lw,r*0.3)
        o+=f'<rect x="{tx}" y="{ty-lw*0.18}" width="{lw*0.7}" height="{lw*0.36}" rx="{lw*0.18}" fill="{sk}"/>'
    elif pose=="present":
        o+=arm(sx,sy,cx-r*0.95,bot-r*0.95,shirt,sk,lw,-r*0.5)+arm(rx_,sy,cx+sw*1.6,cy+r*1.4,shirt,sk,lw,r*0.2)
    elif pose=="cheer":
        o+=arm(sx,sy,cx-sw*1.3,cy-r*0.9,shirt,sk,lw,-r*0.8)+arm(rx_,sy,cx+sw*1.3,cy-r*0.9,shirt,sk,lw,r*0.8)
    elif pose=="phone":
        o+=arm(sx,sy,cx-r*0.2,cy+r*2.3,shirt,sk,lw,-r*0.6)+arm(rx_,sy,cx+r*0.35,cy+r*2.35,shirt,sk,lw,r*0.6)
        o+=f'<rect x="{cx-r*0.55}" y="{cy+r*1.45}" width="{r*1.05}" height="{r*1.65}" rx="{r*0.14}" fill="{N}"/><rect x="{cx-r*0.46}" y="{cy+r*1.56}" width="{r*0.87}" height="{r*1.4}" rx="{r*0.08}" fill="{BT}"/>'
        o+=f'<rect x="{cx-r*0.36}" y="{cy+r*1.7}" width="{r*0.6}" height="{r*0.16}" rx="{r*0.08}" fill="{E}"/><rect x="{cx-r*0.36}" y="{cy+r*1.95}" width="{r*0.45}" height="{r*0.16}" rx="{r*0.08}" fill="{B}"/>'
        o+=arm(rx_,sy,cx+r*0.35,cy+r*2.35,shirt,sk,lw*0.0001,0) if False else ""
        o+=f'<circle cx="{cx-r*0.2}" cy="{cy+r*2.3}" r="{lw*0.52}" fill="{sk}"/><circle cx="{cx+r*0.35}" cy="{cy+r*2.35}" r="{lw*0.52}" fill="{sk}"/>'
    return o

# ----------------------------------------------------------------- đồ vật
def laptop(x,y,w,screen_fill=N,inner="",back=False):
    """(x,y) góc trên trái màn hình; w rộng màn hình."""
    h=w*0.62
    o=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w*0.035}" fill="{N2 if back else N}"/>'
    if back:
        o+=f'<g transform="translate({x+w/2} {y+h/2}) scale({w/260})"><circle r="16" fill="{T3}" opacity=".5"/></g>'
    else:
        o+=f'<rect x="{x+w*0.035}" y="{y+w*0.035}" width="{w*0.93}" height="{h-w*0.07}" rx="{w*0.015}" fill="{screen_fill}"/>{inner}'
    o+=f'<path d="M{x-w*0.08},{y+h+w*0.06} L{x+w*1.08},{y+h+w*0.06} L{x+w*1.0},{y+h} L{x},{y+h}Z" fill="{L2}"/><rect x="{x-w*0.08}" y="{y+h+w*0.05}" width="{w*1.16}" height="{w*0.025}" rx="{w*0.012}" fill="{T3}"/>'
    return o
def laptop_back(cx,y,w,c=L2,logo=True):
    h=w*0.62
    o=f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="{h}" rx="{w*0.04}" fill="{c}"/><rect x="{cx-w/2}" y="{y+h-6}" width="{w}" height="10" rx="5" fill="{T3}"/>'
    if logo:
        o+=f'<circle cx="{cx}" cy="{y+h*0.46}" r="{w*0.09}" fill="{W}" opacity=".9"/>'+f'<g transform="translate({cx} {y+h*0.46}) scale({w/520})">'+'<path d="M-30 -22 H8 V-12 H-4 V24 H-16 V-12 H-30Z" fill="#1D4ED8"/><path d="M10 -22 H20 V-4 H30 V-22 H40 V24 H30 V6 H20 V24 H10Z" fill="#10B981" transform="translate(-6 0)"/></g>'
    return o
def card(x,y,w,h,inner="",fill=W,r=20,shadow=True):
    sh=f'<rect x="{x+6}" y="{y+10}" width="{w}" height="{h}" rx="{r}" fill="{N}" opacity=".08"/>' if shadow else ""
    return sh+f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{L}" stroke-width="2"/>'+inner
def desk(x,y,w,c=BD,top=B):
    return f'<rect x="{x}" y="{y}" width="{w}" height="22" rx="11" fill="{top}"/><rect x="{x+30}" y="{y+18}" width="16" height="140" fill="{c}"/><rect x="{x+w-46}" y="{y+18}" width="16" height="140" fill="{c}"/>'
def robot(cx,cy,s=1.0,body=B,face_=N,eye=E,wheels=True):
    o=(f'<g transform="translate({cx} {cy}) scale({s})">'
       f'<path d="M0 -92 V-112" stroke="{body}" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="-118" r="10" fill="{G}"/>'
       f'<rect x="-62" y="-94" width="124" height="88" rx="30" fill="{body}"/><rect x="-46" y="-78" width="92" height="56" rx="20" fill="{face_}"/>'
       f'<ellipse cx="-20" cy="-50" rx="11" ry="13" fill="{eye}"/><ellipse cx="20" cy="-50" rx="11" ry="13" fill="{eye}"/><circle cx="-16" cy="-55" r="4" fill="{W}"/><circle cx="24" cy="-55" r="4" fill="{W}"/>'
       f'<path d="M-14 -32 Q0 -24 14 -32" stroke="{eye}" stroke-width="5" fill="none" stroke-linecap="round"/>'
       f'<rect x="-74" y="-62" width="14" height="30" rx="7" fill="{BD}"/><rect x="60" y="-62" width="14" height="30" rx="7" fill="{BD}"/>'
       f'<rect x="-52" y="0" width="104" height="70" rx="22" fill="{body}"/><rect x="-32" y="14" width="64" height="30" rx="10" fill="{W}"/>'
       f'<circle cx="-16" cy="29" r="6" fill="{G}"/><circle cx="0" cy="29" r="6" fill="{E}"/><circle cx="16" cy="29" r="6" fill="{BL}"/>'
       f'<path d="M-52 18 Q-86 30 -84 62" stroke="{body}" stroke-width="16" fill="none" stroke-linecap="round"/><circle cx="-84" cy="66" r="11" fill="{G}"/>'
       f'<path d="M52 18 Q86 6 92 -22" stroke="{body}" stroke-width="16" fill="none" stroke-linecap="round"/><circle cx="93" cy="-28" r="11" fill="{G}"/>')
    if wheels:
        o+=f'<rect x="-66" y="66" width="132" height="34" rx="17" fill="{N}"/>'+"".join(f'<circle cx="{-44+i*29}" cy="83" r="9" fill="{T3}"/>' for i in range(4))
    return o+"</g>"
def chip(x,y,s=1,c=E):
    o=f'<g transform="translate({x} {y}) scale({s})"><rect x="-26" y="-26" width="52" height="52" rx="10" fill="{N}"/><rect x="-15" y="-15" width="30" height="30" rx="5" fill="{c}"/>'
    for i in (-14,0,14):
        o+=f'<rect x="{i-3}" y="-38" width="6" height="12" rx="3" fill="{N}"/><rect x="{i-3}" y="26" width="6" height="12" rx="3" fill="{N}"/><rect x="-38" y="{i-3}" width="12" height="6" rx="3" fill="{N}"/><rect x="26" y="{i-3}" width="12" height="6" rx="3" fill="{N}"/>'
    return o+f'<text x="0" y="6" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="16" fill="{W}" text-anchor="middle">AI</text></g>'
def bubble(x,y,w,h,fill,tail="left",lines=2,lc=W):
    t=f'<path d="M{x+18},{y+h-2} L{x+6},{y+h+16} L{x+38},{y+h-2}Z" fill="{fill}"/>' if tail=="left" else f'<path d="M{x+w-18},{y+h-2} L{x+w-6},{y+h+16} L{x+w-38},{y+h-2}Z" fill="{fill}"/>'
    o=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{min(22,h/2)}" fill="{fill}"/>'+t
    for i in range(lines):
        o+=f'<rect x="{x+18}" y="{y+16+i*18}" width="{(w-36)*(1-0.3*i)}" height="9" rx="4.5" fill="{lc}" opacity=".9"/>'
    return o
def cube(cx,cy,s,top=GF,left=B,right=BD):
    return f'<path d="M{cx} {cy-s} L{cx+s*0.9} {cy-s*0.5} L{cx} {cy} L{cx-s*0.9} {cy-s*0.5}Z" fill="{top}"/><path d="M{cx-s*0.9} {cy-s*0.5} L{cx} {cy} V{cy+s} L{cx-s*0.9} {cy+s*0.5}Z" fill="{left}"/><path d="M{cx+s*0.9} {cy-s*0.5} L{cx} {cy} V{cy+s} L{cx+s*0.9} {cy+s*0.5}Z" fill="{right}"/>'
def codewin(x,y,w,h,dark=True):
    o=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{N if dark else W}" stroke="{L if not dark else N}" stroke-width="2"/>'
    o+=f'<circle cx="{x+18}" cy="{y+16}" r="5" fill="{G}"/><circle cx="{x+34}" cy="{y+16}" r="5" fill="{E}"/><circle cx="{x+50}" cy="{y+16}" r="5" fill="{BL}"/>'
    cols=[G,E,BL,T3,E,G,BL]
    n=int((h-46)/22)
    for i in range(n):
        o+=f'<rect x="{x+18+(i%3)*14}" y="{y+38+i*22}" width="{w*[0.55,0.4,0.62,0.3,0.5,0.45,0.58][i%7]:.0f}" height="9" rx="4.5" fill="{cols[i%7]}"/>'
    return o
def blocks(x,y,s=1):
    o=""
    for i,(c,wid) in enumerate([(G,150),(B,190),(E,130),(BD,170)]):
        yy=y+i*52*s; xx=x+(i%2)*18*s; wd=wid*s; hh=40*s
        o+=(f'<path d="M{xx} {yy} H{xx+20*s} l7 7 h16 l7 -7 H{xx+wd} a9 9 0 0 1 9 9 V{yy+hh-9} a9 9 0 0 1 -9 9 H{xx+50*s} l-7 7 h-16 l-7 -7 H{xx} a9 9 0 0 1 -9 -9 V{yy+9} a9 9 0 0 1 9 -9Z" fill="{c}"/>'
            f'<rect x="{xx+14}" y="{yy+hh/2-5}" width="{wd*0.45:.0f}" height="10" rx="5" fill="{W}" opacity=".85"/>')
    return o
def tile(x,y,w,h,inner,label=None,live=False,fill=W):
    o=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{L}" stroke-width="2"/>'
    o+=f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {w} {h}" overflow="hidden">{inner}</svg>'
    if label: o+=f'<rect x="{x+8}" y="{y+h-26}" width="{len(label)*7.4+16}" height="20" rx="10" fill="{N}" opacity=".85"/><text x="{x+16}" y="{y+h-12}" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="11" fill="{W}">{label}</text>'
    if live: o+=f'<rect x="{x+w-52}" y="{y+8}" width="44" height="18" rx="9" fill="#DC2626"/><text x="{x+w-30}" y="{y+21}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="10" fill="{W}" text-anchor="middle">LIVE</text>'
    return o
def mini(w,h,skin,hair,style,shirt,**k):
    """Người trong ô video: đầu ở 45% chiều cao"""
    s=k.get("scale",h/210)
    return f'<rect width="{w}" height="{h}" fill="{BT}"/>'+person(w/2,h*k.get("hy",0.4),s,skin,hair,style,shirt,pose=k.get("pose","none"),headset=k.get("headset",False),glasses=k.get("glasses",False),mood=k.get("mood","smile"))

def save(n,s):
    open(f"{OUT}/{n}.svg","w").write(s); print("  ", n)

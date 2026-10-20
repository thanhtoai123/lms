"""Các cảnh minh hoạ cho landing quảng cáo (1200x900, tỉ lệ 4:3)."""
import sys
from art_lp import *

W_,H_=1200,900

def deco(b, seed=0):
    b+=dots(70,80,6,4,24)+dots(1000,720,6,4,24)
    b+=star(1080,120,18,G)+star(150,840,14,E)+star(1110,520,11,B,.6)+star(90,330,10,G,.8)
    return b

def class_window(x,y,w,h,teacher=True,kids=3,title="Lớp học online · ClassIn"):
    """Khung lớp học trực tuyến: ô giáo viên lớn + các ô học sinh"""
    o=card(x,y,w,h,fill=W)
    o+=f'<rect x="{x}" y="{y}" width="{w}" height="44" rx="20" fill="{N}"/><rect x="{x}" y="{y+24}" width="{w}" height="20" fill="{N}"/>'
    o+=f'<circle cx="{x+22}" cy="{y+22}" r="6" fill="{G}"/><circle cx="{x+42}" cy="{y+22}" r="6" fill="{E}"/><circle cx="{x+62}" cy="{y+22}" r="6" fill="{BL}"/>'
    o+=f'<text x="{x+84}" y="{y+27}" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="14" fill="{W}">{title}</text>'
    o+=f'<rect x="{x+w-62}" y="{y+12}" width="46" height="20" rx="10" fill="#DC2626"/><text x="{x+w-39}" y="{y+26}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="11" fill="{W}" text-anchor="middle">LIVE</text>'
    pad=14; gy=y+44+pad; gh=h-44-pad*2-46
    tw=(w-pad*3)*0.64; kw=(w-pad*3)-tw
    o+=tile(x+pad,gy,tw,gh,mini(tw,gh,0,1,"short",B,headset=True,glasses=True,mood="open",scale=gh/300,hy=0.36),"Giáo viên")
    kh=(gh-pad*(kids-1))/kids
    kk=[(1,0,"pony",E),(2,3,"spiky",G),(3,4,"bob",BL),(0,2,"short",ED)]
    for i in range(kids):
        sk,hr,st,c=kk[i%4]
        o+=tile(x+pad*2+tw,gy+i*(kh+pad),kw,kh,mini(kw,kh,sk,hr,st,c,scale=kh/150,hy=0.42),None)
    by=y+h-pad-34
    for i,c in enumerate([BL,L2,L2,"#DC2626"]):
        o+=f'<rect x="{x+w/2-80+i*42}" y="{by}" width="34" height="34" rx="10" fill="{c}"/>'
    return o

def robot_card(x,y,w,h):
    o=card(x,y,w,h)
    o+=f'<rect x="{x+16}" y="{y+16}" width="{w-32}" height="{h-32}" rx="14" fill="{BT}"/>'
    # sa bàn có vạch dò đường (vòng đua + ô xuất phát / đích)
    o+=f'<rect x="{x+36}" y="{y+36}" width="{w-72}" height="{h-72}" rx="{(h-72)/2}" fill="none" stroke="{N}" stroke-width="9"/>'
    o+=f'<path d="M{x+w/2} {y+36} V{y+h-36}" stroke="{N}" stroke-width="9"/>'
    o+=f'<rect x="{x+48}" y="{y+h/2-14}" width="36" height="28" rx="6" fill="{E}"/><rect x="{x+w-84}" y="{y+h/2-14}" width="36" height="28" rx="6" fill="{G}"/>'
    o+=f'<text x="{x+66}" y="{y+h/2+5}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="11" fill="{W}" text-anchor="middle">GO</text>'
    o+=robot(x+w*0.3,y+h*0.42,0.3,B)
    o+=f'<rect x="{x+w*0.62}" y="{y+h*0.3}" width="26" height="22" rx="4" fill="{BL}"/><rect x="{x+w*0.66}" y="{y+h*0.56}" width="26" height="22" rx="4" fill="{GD}"/>'
    return o

def ai_card(x,y,w,h):
    o=card(x,y,w,h)
    o+=bubble(x+18,y+20,w*0.62,48,BT,"left",2,B)
    o+=bubble(x+w*0.3,y+86,w*0.62,48,ET,"right",2,ED)
    o+=chip(x+46,y+h-46,0.8,E)
    o+=f'<rect x="{x+88}" y="{y+h-62}" width="{w-110}" height="34" rx="17" fill="{S}" stroke="{L}" stroke-width="2"/><circle cx="{x+w-40}" cy="{y+h-45}" r="12" fill="{B}"/>'
    return o

def cube_card(x,y,w,h):
    o=card(x,y,w,h)
    o+=f'<rect x="{x+16}" y="{y+16}" width="{w-32}" height="{h-32}" rx="14" fill="{S}"/>'
    for i in range(6):
        o+=f'<path d="M{x+30} {y+40+i*24} H{x+w-30}" stroke="{L}" stroke-width="2"/>'
    o+=cube(x+w*0.38,y+h*0.52,52)+cube(x+w*0.7,y+h*0.62,30,ET,E,ED)
    o+=f'<circle cx="{x+w*0.72}" cy="{y+h*0.3}" r="20" fill="{G}"/>'
    return o

def code_card(x,y,w,h):
    return codewin(x,y,w,h,True)

# ------------------------------------------------------------------ 1. Hero chung
def hero_chung():
    d,b=bg(W_,H_)
    b+=f'<circle cx="600" cy="470" r="380" fill="{W}" opacity=".6"/><circle cx="600" cy="470" r="290" fill="{W}" opacity=".5"/>'
    b=deco(b)
    b+=orbit(600,470,520,170,-18,G,14,.85)
    b+=class_window(70,90,560,380)
    b+=robot_card(880,110,270,230)
    b+=ai_card(860,540,300,220)
    b+=cube_card(60,560,250,200)
    # học viên + bàn
    b+=person(600,470,1.45,0,2,"pony",E,pose="wave",headset=True)
    b+=f'<rect x="300" y="700" width="600" height="26" rx="13" fill="{B}"/><rect x="330" y="722" width="18" height="180" fill="{BD}"/><rect x="852" y="722" width="18" height="180" fill="{BD}"/>'
    b+=laptop_back(600,560,300)
    b+=plant(370,700,0.8)
    b+=rocket(1110,330,2.0,40,B)+rocket(340,80,1.2,40,E)
    return svg(W_,H_,b,d,"Học viên học online cùng giáo viên qua ClassIn: Robotics, AI, đồ họa, lập trình")

# ------------------------------------------------------------------ 2. Robotics
def hero_robotics():
    d,b=bg(W_,H_,c2=ET)
    b+=f'<circle cx="560" cy="480" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)+orbit(600,480,520,160,-16,G,14,.85)
    # sa bàn ảo lớn phía sau
    x,y,w,h=90,80,640,360
    b+=card(x,y,w,h,fill=W)
    b+=f'<rect x="{x+18}" y="{y+18}" width="{w-36}" height="{h-36}" rx="16" fill="{BT}"/>'
    b+=f'<rect x="{x+60}" y="{y+60}" width="{w-120}" height="{h-120}" rx="{(h-120)/2}" fill="none" stroke="{N}" stroke-width="12"/><path d="M{x+w/2} {y+60} V{y+h-60}" stroke="{N}" stroke-width="12"/>'
    b+=f'<rect x="{x+76}" y="{y+h/2-20}" width="52" height="40" rx="8" fill="{E}"/><text x="{x+102}" y="{y+h/2+6}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="15" fill="{W}" text-anchor="middle">START</text>'
    b+=f'<rect x="{x+w-128}" y="{y+h/2-20}" width="52" height="40" rx="8" fill="{G}"/><text x="{x+w-102}" y="{y+h/2+6}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="15" fill="{N}" text-anchor="middle">END</text>'
    for i,(xx,yy,c) in enumerate([(x+230,y+120,BL),(x+390,y+220,GD),(x+260,y+230,E),(x+420,y+118,B)]):
        b+=cube(xx,yy,20,GF if i%2 else ET,c,darken(c))
    b+=robot(x+180,y+150,0.32,B)
    # khối lệnh
    b+=card(820,120,300,300)+blocks(850,150,1.15)
    b+=f'<text x="850" y="400" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="16" fill="{T2}">Lập trình kéo thả</text>'
    # học viên + robot bạn đồng hành
    b+=person(520,500,1.4,2,1,"spiky",B,pose="point",headset=True,hand_to=(700,560))
    b+=f'<rect x="250" y="780" width="560" height="26" rx="13" fill="{E}"/><rect x="280" y="802" width="18" height="100" fill="{ED}"/><rect x="762" y="802" width="18" height="100" fill="{ED}"/>'
    b+=laptop_back(500,644,220)
    b+=robot(960,700,1.15,B)
    b+=star(1010,470,16,G)+rocket(150,700,1.6,40,B)
    return svg(W_,H_,b,d,"Học viên lập trình robot ảo trên sa bàn, robot làm nhiệm vụ")

# ------------------------------------------------------------------ 3. AI
def hero_ai():
    d,b=bg(W_,H_)
    b+=f'<circle cx="600" cy="470" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)+orbit(600,470,520,170,-20,G,14,.85)
    # khung chat AI
    x,y,w,h=80,90,520,400
    b+=card(x,y,w,h)
    b+=f'<rect x="{x}" y="{y}" width="{w}" height="50" rx="20" fill="{N}"/><rect x="{x}" y="{y+28}" width="{w}" height="22" fill="{N}"/>'
    b+=chip(x+36,y+25,0.55,E)+f'<text x="{x+66}" y="{y+31}" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="16" fill="{W}">Trợ lý AI của em</text>'
    b+=bubble(x+230,y+76,260,56,BT,"right",2,B)
    b+=bubble(x+26,y+160,320,76,ET,"left",3,ED)
    b+=bubble(x+250,y+262,240,40,BT,"right",1,B)
    b+=f'<rect x="{x+22}" y="{y+h-66}" width="{w-44}" height="46" rx="23" fill="{S}" stroke="{L}" stroke-width="2"/><rect x="{x+44}" y="{y+h-48}" width="200" height="10" rx="5" fill="{L2}"/><circle cx="{x+w-46}" cy="{y+h-43}" r="16" fill="{B}"/><path d="M{x+w-53} {y+h-43} H{x+w-39} M{x+w-45} {y+h-50} L{x+w-38} {y+h-43} L{x+w-45} {y+h-36}" stroke="{W}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    # tranh AI vẽ + nốt nhạc
    b+=card(820,110,300,250)
    b+=f'<rect x="840" y="130" width="260" height="170" rx="12" fill="{BT}"/><circle cx="1050" cy="175" r="26" fill="{G}"/><path d="M840 300 L920 210 L980 270 L1030 225 L1100 300Z" fill="{E}"/><path d="M840 300 L900 250 L960 300Z" fill="{B}"/>'
    b+=f'<rect x="840" y="314" width="140" height="12" rx="6" fill="{L2}"/><rect x="840" y="334" width="90" height="10" rx="5" fill="{L}"/>'
    b+=f'<g transform="translate(1040 560)"><path d="M0 0 V-90 L60 -104 V-14" stroke="{B}" stroke-width="10" fill="none" stroke-linejoin="round"/><ellipse cx="-12" cy="2" rx="18" ry="13" fill="{B}"/><ellipse cx="48" cy="-12" rx="18" ry="13" fill="{B}"/></g>'
    # mạng nơ-ron nhỏ
    nodes=[(860,450),(920,410),(920,490),(985,450)]
    for (x1,y1) in nodes:
        for (x2,y2) in nodes:
            if x1<x2: b+=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{BL}" stroke-width="3" opacity=".5"/>'
    for i,(xx,yy) in enumerate(nodes): b+=f'<circle cx="{xx}" cy="{yy}" r="14" fill="{[B,E,G,BD][i]}"/><circle cx="{xx}" cy="{yy}" r="5" fill="{W}"/>'
    b+=person(600,520,1.4,1,4,"long",BL,pose="type",headset=False)
    b+=f'<rect x="320" y="800" width="560" height="26" rx="13" fill="{B}"/><rect x="350" y="822" width="18" height="80" fill="{BD}"/><rect x="832" y="822" width="18" height="80" fill="{BD}"/>'
    b+=laptop_back(600,664,220)
    b+=rocket(1110,700,1.6,40,B)
    return svg(W_,H_,b,d,"Học viên trò chuyện với trợ lý AI, dùng AI vẽ tranh và làm nhạc")

# ------------------------------------------------------------------ 4. Đồ họa
def hero_dohoa():
    d,b=bg(W_,H_,c2=GT)
    b+=f'<circle cx="600" cy="470" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)+orbit(600,470,520,170,-18,B,12,.5)
    # khung thiết kế 3D: lưới + khối + ngôi nhà
    x,y,w,h=80,90,560,390
    b+=card(x,y,w,h)
    b+=f'<rect x="{x+18}" y="{y+18}" width="{w-140}" height="{h-36}" rx="14" fill="{S}"/>'
    for i in range(9): b+=f'<path d="M{x+30} {y+50+i*36} H{x+w-136}" stroke="{L}" stroke-width="2"/>'
    for i in range(11): b+=f'<path d="M{x+40+i*38} {y+30} V{y+h-30}" stroke="{L}" stroke-width="2"/>'
    b+=cube(x+170,y+230,70)+f'<path d="M{x+300} {y+150} L{x+380} {y+110} L{x+460} {y+150} L{x+380} {y+190}Z" fill="#DC2626" opacity=".0"/>'
    # nhà 3D
    hx,hy=x+330,y+250
    b+=f'<path d="M{hx-70} {hy-30} L{hx} {hy+5} V{hy+85} L{hx-70} {hy+50}Z" fill="{E}"/><path d="M{hx+70} {hy-30} L{hx} {hy+5} V{hy+85} L{hx+70} {hy+50}Z" fill="{ED}"/>'
    b+=f'<path d="M{hx-80} {hy-28} L{hx-10} {hy-110} L{hx} {hy+8}Z" fill="{G}"/><path d="M{hx+80} {hy-28} L{hx-10} {hy-110} L{hx} {hy+8}Z" fill="{GD}"/>'
    b+=f'<rect x="{hx-40}" y="{hy+10}" width="22" height="34" rx="3" fill="{W}" transform="skewY(26) translate(0 {-(hx-40)*0.4877:.0f})" opacity=".0"/>'
    for i,(c,ic) in enumerate([(B,"■"),(E,"●"),(G,"▲"),(BL,"◆"),(GD,"★")]):
        b+=f'<rect x="{x+w-104}" y="{y+24+i*66}" width="84" height="56" rx="12" fill="{S}" stroke="{L}" stroke-width="2"/><text x="{x+w-62}" y="{y+62+i*66}" font-family="Arial" font-size="26" fill="{c}" text-anchor="middle">{ic}</text>'
    # khung sửa ảnh (layer + bảng màu)
    b+=card(820,120,300,330)
    b+=f'<rect x="840" y="140" width="260" height="160" rx="12" fill="{BT}"/><circle cx="910" cy="200" r="34" fill="{G}"/><path d="M840 300 L930 230 L990 280 L1040 245 L1100 300Z" fill="{B}"/>'
    for i,c in enumerate([G,E,B]):
        b+=f'<rect x="840" y="{316+i*40}" width="260" height="32" rx="8" fill="{S}" stroke="{L}" stroke-width="2"/><rect x="848" y="{322+i*40}" width="20" height="20" rx="5" fill="{c}"/><rect x="878" y="{328+i*40}" width="110" height="8" rx="4" fill="{L2}"/>'
    b+=person(600,520,1.4,3,0,"bun",G,pose="present",headset=False)
    b+=f'<rect x="320" y="800" width="560" height="26" rx="13" fill="{B}"/><rect x="350" y="822" width="18" height="80" fill="{BD}"/><rect x="832" y="822" width="18" height="80" fill="{BD}"/>'
    b+=laptop_back(540,664,220)
    # bút vẽ
    b+=f'<g transform="translate(930 640) rotate(35)"><rect x="-10" y="-90" width="20" height="150" rx="10" fill="{B}"/><path d="M-10 60 L0 90 L10 60Z" fill="{N}"/><rect x="-10" y="-90" width="20" height="26" rx="10" fill="{G}"/></g>'
    b+=cube(1040,620,40,ET,E,ED)+rocket(150,720,1.6,40,B)
    return svg(W_,H_,b,d,"Học viên thiết kế mô hình 3D và chỉnh sửa ảnh cùng AI")

# ------------------------------------------------------------------ 5. Lập trình
def hero_laptrinh():
    d,b=bg(W_,H_)
    b+=f'<circle cx="600" cy="470" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)+orbit(600,470,520,170,-14,G,14,.85)
    b+=card(70,110,320,280)+blocks(100,140,1.2)
    b+=codewin(430,80,380,330,True)
    # điện thoại app
    b+=f'<rect x="880" y="100" width="190" height="340" rx="32" fill="{N}"/><rect x="896" y="128" width="158" height="290" rx="16" fill="{BT}"/>'
    b+=f'<rect x="912" y="146" width="126" height="70" rx="12" fill="{B}"/><circle cx="975" cy="181" r="20" fill="{G}"/><rect x="912" y="230" width="126" height="16" rx="8" fill="{E}"/><rect x="912" y="256" width="90" height="16" rx="8" fill="{L2}"/>'
    b+=bubble(912,286,120,44,W,"left",1,BL)+f'<circle cx="975" cy="390" r="18" fill="{E}"/>'
    # tay cầm game
    b+=f'<path d="M900 600 h140 a52 52 0 0 1 0 104 h-24 l-24 -24 h-44 l-24 24 h-24 a52 52 0 0 1 0 -104Z" fill="{B}"/><path d="M906 652 h24 M918 640 v24" stroke="{W}" stroke-width="7" stroke-linecap="round"/><circle cx="1018" cy="640" r="9" fill="{G}"/><circle cx="1040" cy="660" r="9" fill="{E}"/>'
    b+=person(560,520,1.4,0,3,"short",N2,pose="type",headset=True,glasses=True)
    b+=f'<rect x="280" y="800" width="560" height="26" rx="13" fill="{B}"/><rect x="310" y="822" width="18" height="80" fill="{BD}"/><rect x="792" y="822" width="18" height="80" fill="{BD}"/>'
    b+=laptop_back(560,664,220)
    b+=f'<text x="210" y="650" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="64" fill="{B}" opacity=".9">&lt;/&gt;</text>'
    b+=rocket(1110,330,1.8,40,B)
    return svg(W_,H_,b,d,"Học viên lập trình kéo thả, viết mã, làm game và ứng dụng điện thoại")

# ------------------------------------------------------------------ 6. Giáo viên dạy trực tiếp
def giao_vien():
    d,b=bg(W_,H_)
    b+=f'<circle cx="600" cy="470" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)
    # màn hình lớn: lưới 8 học viên (lớp nhỏ 6–8)
    x,y,w,h=90,70,1020,470
    b+=card(x,y,w,h)
    b+=f'<rect x="{x}" y="{y}" width="{w}" height="48" rx="20" fill="{N}"/><rect x="{x}" y="{y+26}" width="{w}" height="22" fill="{N}"/>'
    b+=f'<circle cx="{x+22}" cy="{y+24}" r="6" fill="{G}"/><circle cx="{x+42}" cy="{y+24}" r="6" fill="{E}"/><circle cx="{x+62}" cy="{y+24}" r="6" fill="{BL}"/>'
    b+=f'<text x="{x+86}" y="{y+30}" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="17" fill="{W}">Lớp nhóm 6–8 học sinh · 90 phút</text>'
    b+=f'<rect x="{x+w-70}" y="{y+13}" width="52" height="22" rx="11" fill="#DC2626"/><text x="{x+w-44}" y="{y+29}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="12" fill="{W}" text-anchor="middle">LIVE</text>'
    kids=[(0,0,"pony",E),(2,1,"spiky",G),(1,4,"bob",BL),(3,2,"short",ED),(0,3,"bun",B),(2,0,"long",GD),(1,1,"short",E),(3,4,"pony",BL)]
    tw=(w-40-3*14)/4; th=(h-48-36-14)/2
    for i,(sk,hr,st,c) in enumerate(kids):
        cx_=x+20+(i%4)*(tw+14); cy_=y+66+(i//4)*(th+14)
        b+=tile(cx_,cy_,tw,th,mini(tw,th,sk,hr,st,c,scale=th/190,hy=0.42,pose="wave" if i in (1,6) else "none"))
    # giáo viên phía trước
    b+=person(600,640,1.5,1,1,"short",B,pose="wave",headset=True,glasses=True,mood="open")
    b+=f'<rect x="300" y="830" width="600" height="26" rx="13" fill="{N}"/>'
    b+=laptop_back(600,720,240)
    b+=rocket(1130,640,1.6,40,B)+star(120,640,14,G)
    return svg(W_,H_,b,d,"Giáo viên dạy trực tiếp lớp nhóm nhỏ qua ClassIn")

# ------------------------------------------------------------------ 7. Báo cáo cuối khoá trước phụ huynh
def bao_cao():
    d,b=bg(W_,H_,c2=GT)
    b+=f'<circle cx="600" cy="470" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)
    # màn hình dự án
    x,y,w,h=470,90,640,400
    b+=card(x,y,w,h)
    b+=f'<rect x="{x+18}" y="{y+18}" width="{w-36}" height="{h-110}" rx="14" fill="{BT}"/>'
    b+=f'<text x="{x+40}" y="{y+64}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="24" fill="{N}">Dự án cuối khoá của em</text>'
    b+=robot(x+180,y+250,0.55,B)+f'<rect x="{x+330}" y="{y+110}" width="250" height="16" rx="8" fill="{B}"/><rect x="{x+330}" y="{y+140}" width="200" height="14" rx="7" fill="{BL}"/><rect x="{x+330}" y="{y+168}" width="220" height="14" rx="7" fill="{BL}"/>'
    b+=f'<rect x="{x+330}" y="{y+200}" width="90" height="70" rx="10" fill="{E}"/><rect x="{x+430}" y="{y+220}" width="90" height="50" rx="10" fill="{G}"/>'
    # phụ huynh trong cuộc gọi (vỗ tay)
    for i,(sk,hr,st,c) in enumerate([(0,0,"short",N2),(1,2,"long",E),(3,4,"bob",BL)]):
        b+=tile(x+18+i*206,y+h-84,194,66,mini(194,66,sk,hr,st,c,scale=66/150,hy=0.48,pose="cheer"))
    # học viên trình bày
    b+=person(270,470,1.55,0,2,"pony",E,pose="present",headset=True,mood="open")
    b+=f'<rect x="60" y="720" width="440" height="26" rx="13" fill="{B}"/>'
    # giấy chứng nhận + huy hiệu
    b+=card(700,580,330,230,fill="#FFFDF6")
    b+=f'<rect x="716" y="596" width="298" height="198" rx="12" fill="none" stroke="{G}" stroke-width="4"/><rect x="760" y="630" width="210" height="16" rx="8" fill="{N}"/><rect x="790" y="660" width="150" height="10" rx="5" fill="{L2}"/><rect x="770" y="686" width="190" height="10" rx="5" fill="{L2}"/>'
    b+=f'<circle cx="865" cy="748" r="30" fill="{G}"/>'+star(865,748,16,W)
    b+=rocket(1120,560,1.6,40,B)+star(150,140,16,G)
    return svg(W_,H_,b,d,"Học viên báo cáo dự án cuối khoá trước phụ huynh, nhận phiếu đánh giá và chứng nhận")

# ------------------------------------------------------------------ 8. Phụ huynh theo dõi
def phu_huynh():
    d,b=bg(W_,H_,c2=ET)
    b+=f'<circle cx="600" cy="470" r="370" fill="{W}" opacity=".6"/>'
    b=deco(b)
    # thẻ năng lực (3 mức)
    b+=card(80,110,360,300)
    b+=f'<text x="106" y="156" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="20" fill="{N}">Năng lực của con</text>'
    for i,(lab,v,c) in enumerate([("Tư duy",0.9,E),("Kỹ năng số",0.66,B),("Bản lĩnh",0.78,G),("Phẩm chất",0.9,ED)]):
        yy=186+i*52
        b+=f'<text x="106" y="{yy+14}" font-family="Plus Jakarta Sans,Arial" font-weight="600" font-size="15" fill="{T2}">{lab}</text><rect x="106" y="{yy+22}" width="300" height="14" rx="7" fill="{L}"/><rect x="106" y="{yy+22}" width="{300*v:.0f}" height="14" rx="7" fill="{c}"/>'
    # tin nhắn nhóm lớp
    b+=card(780,100,340,250)
    b+=bubble(800,124,250,56,BT,"left",2,B)+bubble(850,206,250,56,ET,"right",2,ED)
    b+=f'<rect x="800" y="290" width="300" height="40" rx="20" fill="{S}" stroke="{L}" stroke-width="2"/>'
    # biểu đồ tiến bộ
    b+=card(800,430,320,230)
    for i,v in enumerate([60,90,80,120,140]):
        b+=f'<rect x="{830+i*56}" y="{630-v}" width="36" height="{v}" rx="8" fill="{[BL,B,BL,B,E][i]}"/>'
    b+=f'<path d="M848 560 L904 520 L960 540 L1016 490 L1072 470" stroke="{G}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    # phụ huynh cầm điện thoại
    b+=person(560,470,1.6,1,0,"short",B,pose="phone")
    b+=person(340,560,1.05,0,2,"pony",E,pose="cheer")
    b+=f'<rect x="200" y="780" width="560" height="26" rx="13" fill="{N}" opacity=".0"/>'
    b+=rocket(1120,760,1.6,40,B)+star(160,740,16,G)
    return svg(W_,H_,b,d,"Phụ huynh theo dõi năng lực, tiến bộ và nhận xét của con trên điện thoại")

SCENES={"lp-hero-chung":hero_chung,"lp-hero-robotics":hero_robotics,"lp-hero-ai":hero_ai,"lp-hero-do-hoa":hero_dohoa,"lp-hero-lap-trinh":hero_laptrinh,
        "lp-giao-vien-truc-tiep":giao_vien,"lp-bao-cao-cuoi-khoa":bao_cao,"lp-phu-huynh-theo-doi":phu_huynh}
if __name__=="__main__":
    names=sys.argv[1:] or list(SCENES)
    for n in names: save(n,SCENES[n]())

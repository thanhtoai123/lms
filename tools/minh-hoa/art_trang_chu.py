"""Tranh minh hoạ cho TRANG CHÍNH TH STEAM (bộ nhận diện: Deep Ocean Blue, Emerald, Cosmic Gold, Midnight Navy;
mô-típ logo: quỹ đạo vàng thon hai đầu, tên lửa, ngôi sao 4 cánh). Người là nhân vật vẽ, không phải ảnh trẻ em thật.

    REPO=. python3 tools/minh-hoa/art_trang_chu.py      # vẽ apps/web/public/lp-anh/tc-*.svg
"""
import sys
from art_lp import *
from art_lp_scenes import class_window, robot_card, ai_card, cube_card

FONT = "Plus Jakarta Sans,Arial"

def swoosh(x0, y0, x1, y1, bend, w=18, color=G, op=1.0):
    """Quỹ đạo vàng kiểu logo: dải cong thon hai đầu (vẽ bằng hai đường bezier lệch nhau)"""
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2 + bend
    return (f'<path d="M{x0} {y0} Q{mx} {my - w} {x1} {y1} Q{mx} {my + w} {x0} {y0}Z" fill="{color}" opacity="{op}"/>')

def label(x, y, text, fill=N, color=W, size=15, pad=14):
    w = len(text) * size * 0.56 + pad * 2
    return (f'<rect x="{x}" y="{y}" width="{w:.0f}" height="{size * 2:.0f}" rx="{size:.0f}" fill="{fill}"/>'
            f'<text x="{x + pad}" y="{y + size * 1.36:.0f}" font-family="{FONT}" font-weight="800" font-size="{size}" fill="{color}">{text}</text>')

def report_card(x, y, w, h):
    """Thẻ 'Báo cáo năng lực' nhỏ: 3 thanh + huy hiệu ngôi sao"""
    o = card(x, y, w, h)
    o += f'<text x="{x + 20}" y="{y + 36}" font-family="{FONT}" font-weight="800" font-size="17" fill="{N}">Báo cáo năng lực</text>'
    for i, (v, c) in enumerate([(0.86, E), (0.7, B), (0.92, G)]):
        yy = y + 58 + i * 30
        o += f'<rect x="{x + 20}" y="{yy}" width="{w - 90}" height="12" rx="6" fill="{L}"/><rect x="{x + 20}" y="{yy}" width="{(w - 90) * v:.0f}" height="12" rx="6" fill="{c}"/>'
    o += f'<circle cx="{x + w - 40}" cy="{y + h - 52}" r="26" fill="{GT}"/>' + star(x + w - 40, y + h - 52, 15, G)
    return o

# ------------------------------------------------------------------ 1. Mở đầu trang chính
def tc_hero():
    d, b = bg(1200, 900)
    b += f'<circle cx="600" cy="480" r="390" fill="{W}" opacity=".65"/><circle cx="600" cy="480" r="300" fill="{W}" opacity=".55"/>'
    b += dots(70, 70, 6, 4, 24) + dots(1010, 740, 6, 4, 24)
    b += swoosh(40, 720, 1150, 210, -220, 20, G, .95)
    b += class_window(60, 80, 520, 350, title="Lớp học online · ClassIn")
    b += robot_card(860, 70, 280, 230)
    b += label(880, 316, "Sản phẩm của con", E)
    b += ai_card(870, 420, 290, 210)
    b += cube_card(50, 560, 240, 190)
    b += report_card(890, 680, 260, 190)
    b += person(600, 480, 1.45, 0, 2, "pony", E, pose="wave", headset=True)
    b += f'<rect x="300" y="710" width="600" height="26" rx="13" fill="{B}"/><rect x="330" y="732" width="18" height="170" fill="{BD}"/><rect x="852" y="732" width="18" height="170" fill="{BD}"/>'
    b += laptop_back(600, 570, 300)
    b += plant(372, 710, 0.8)
    b += rocket(1150, 196, 2.1, 40, B) + rocket(640, 60, 1.0, 40, E)
    b += star(1090, 395, 16, G) + star(120, 500, 13, E) + star(780, 120, 11, B, .7) + star(330, 820, 12, G)
    return svg(1200, 900, b, d, "Tranh minh hoạ: học viên học công nghệ online cùng giáo viên qua ClassIn, làm robot, AI, mô hình 3D và nhận báo cáo năng lực")

# ------------------------------------------------------------------ 2. Từ xem sang tạo (khối so sánh)
def phone_feed(x, y, w, h):
    """Điện thoại lướt video: các ô video xám nối tiếp, mũi tên cuộn vô tận"""
    o = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="34" fill="{N2}"/><rect x="{x + 12}" y="{y + 14}" width="{w - 24}" height="{h - 28}" rx="24" fill="{S}"/>'
    o += f'<rect x="{x + w / 2 - 30}" y="{y + 22}" width="60" height="8" rx="4" fill="{L2}"/>'
    for i in range(3):
        yy = y + 46 + i * ((h - 90) / 3)
        hh = (h - 90) / 3 - 14
        o += f'<rect x="{x + 26}" y="{yy}" width="{w - 52}" height="{hh:.0f}" rx="14" fill="{L}"/>'
        cx, cy = x + w / 2, yy + hh / 2
        o += f'<circle cx="{cx}" cy="{cy:.0f}" r="22" fill="{W}"/><path d="M{cx - 7} {cy - 12:.0f} L{cx + 13} {cy:.0f} L{cx - 7} {cy + 12:.0f}Z" fill="{T3}"/>'
        o += f'<path d="M{x + w - 50} {yy + hh - 26:.0f} c-6 -8 -18 -4 -14 6 l14 12 l14 -12 c4 -10 -8 -14 -14 -6Z" fill="{L2}"/>'
    o += f'<path d="M{x + w / 2 - 14} {y + h - 34} l14 12 l14 -12" stroke="{T3}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    return o

def maker_laptop(x, y, w):
    """Laptop đang mở: bên trái khối lệnh, bên phải robot chạy trên sa bàn — con đang TẠO"""
    h = w * 0.62
    inner = f'<rect x="{x + w * 0.05}" y="{y + w * 0.05}" width="{w * 0.4}" height="{h - w * 0.1}" rx="10" fill="{W}"/>'
    inner += blocks(x + w * 0.08, y + w * 0.08, w / 560)
    px, py, pw, ph = x + w * 0.5, y + w * 0.05, w * 0.45, h - w * 0.1
    inner += f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="10" fill="{BT}"/>'
    inner += f'<rect x="{px + 18}" y="{py + 30}" width="{pw - 36}" height="{ph - 90}" rx="26" fill="none" stroke="{N}" stroke-width="7"/>'
    inner += f'<rect x="{px + 26}" y="{py + 30 + (ph - 90) / 2 - 12}" width="30" height="24" rx="6" fill="{E}"/><rect x="{px + pw - 56}" y="{py + 30 + (ph - 90) / 2 - 12}" width="30" height="24" rx="6" fill="{G}"/>'
    inner += robot(px + pw * 0.5, py + 30 + (ph - 90) * 0.62, 0.24, B)
    inner += f'<rect x="{px + pw - 78}" y="{py + ph - 40}" width="62" height="26" rx="13" fill="{E}"/><text x="{px + pw - 47}" y="{py + ph - 22}" font-family="{FONT}" font-weight="800" font-size="13" fill="{W}" text-anchor="middle">Chạy ▶</text>'
    return laptop(x, y, w, screen_fill=N, inner=inner)

def tc_xem_tao():
    W2, H2 = 1200, 520
    d, b = bg(W2, H2, "bg2", S, W)
    b += f'<rect x="30" y="40" width="440" height="440" rx="40" fill="{L}" opacity=".55"/>'
    b += f'<rect x="560" y="30" width="610" height="460" rx="40" fill="{BT}"/>'
    b += dots(600, 60, 5, 3, 22) + dots(1040, 400, 5, 3, 22)
    b += phone_feed(150, 70, 200, 380)
    b += label(70, 70, "Chỉ xem", T3)
    b += f'<text x="250" y="478" font-family="{FONT}" font-weight="700" font-size="17" fill="{T3}" text-anchor="middle">lướt hết video này sang video khác</text>'
    b += swoosh(380, 330, 640, 150, -40, 12, G)
    b += rocket(650, 140, 1.5, 55, B)
    b += maker_laptop(690, 110, 420)
    b += label(600, 50, "Tự tay tạo ra", E)
    b += cube(1110, 120, 34) + chip(640, 420, .9, E) + star(1140, 300, 15, G) + star(600, 300, 11, E)
    b += f'<text x="900" y="470" font-family="{FONT}" font-weight="700" font-size="17" fill="{BD}" text-anchor="middle">lập trình, sửa lỗi, rồi giới thiệu sản phẩm</text>'
    return svg(W2, H2, b, d, "Tranh minh hoạ: từ chỉ lướt xem video trên điện thoại đến tự lập trình robot và tạo sản phẩm trên máy tính")

SCENES = {"tc-hero": tc_hero, "tc-xem-tao": tc_xem_tao}
if __name__ == "__main__":
    for n in sys.argv[1:] or list(SCENES):
        save(n, SCENES[n]())

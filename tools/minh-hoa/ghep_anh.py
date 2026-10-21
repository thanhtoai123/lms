"""Ảnh GHÉP cho trang chính (kiểu "sắc màu"): màn hình phần mềm THẬT (giấy phép mở) đặt trong laptop / máy tính bảng /
điện thoại vẽ bằng HTML, thêm thẻ nổi và mô-típ quỹ đạo vàng + ngôi sao 4 cánh của logo. Không có người, không ảnh trẻ em.

Dựng bằng Chromium (Playwright) nên chữ và khung sắc nét; nền trong suốt để đặt lên mọi màu nền.

    REPO=. FONTS=/duong/dan/font python3 tools/minh-hoa/ghep_anh.py          # mọi cảnh
    REPO=. python3 tools/minh-hoa/ghep_anh.py tc-ghep-hero                    # một cảnh

FONTS: thư mục chứa pjs-vi.woff2, pjs-ext.woff2, pjs-latin.woff2 (Plus Jakarta Sans, bản biến thiên).
Không có thì dùng font hệ thống (Inter / Arial).

Nguồn ảnh màn hình (ghi dưới ảnh trên trang):
  roblox-studio-lau-dai  — Roblox Creator Docs (GitHub), CC BY 4.0
  scratch-trinh-soan     — Wikimedia Commons / MouseCursor, CC BY-SA 2.0
  teachable-machine-du-lieu — Google Creative Lab, Apache-2.0
  python-pygame-ma       — Wikimedia Commons / Rikulpatel1, CC0
"""
import base64, io, os, sys
from pathlib import Path
from PIL import Image

REPO = Path(os.environ.get("REPO", "."))
THAT = REPO / "apps/web/public/lp-anh/that"
OUT = REPO / "apps/web/public/lp-anh"
FONTS = Path(os.environ.get("FONTS", "/tmp/claude-0/fonts"))

B, BD, E, ED, G, GD, N = "#1D4ED8", "#1E40AF", "#10B981", "#047857", "#F59E0B", "#B45309", "#0F172A"
BT, ET, GT, S, L, T2, T3 = "#DBEAFE", "#D1FAE5", "#FEF3C7", "#F8FAFC", "#E2E8F0", "#475569", "#64748B"


def data_url(name: str, box=None, max_w=1400) -> str:
    im = Image.open(THAT / f"{name}.webp").convert("RGB")
    if box:
        im = im.crop(box)
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=90)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def font_css() -> str:
    parts = []
    for f, rng in (("pjs-vi", "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB"),
                   ("pjs-ext", "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+1E00-1E9F,U+1EF2-1EFF"),
                   ("pjs-latin", "U+0000-00FF,U+2000-206F,U+2122,U+2212")):
        p = FONTS / f"{f}.woff2"
        if p.exists():
            b = base64.b64encode(p.read_bytes()).decode()
            parts.append(f"@font-face{{font-family:PJS;font-weight:200 800;src:url(data:font/woff2;base64,{b}) format('woff2');unicode-range:{rng}}}")
    return "".join(parts)


STAR = lambda c: f'<svg viewBox="0 0 24 24"><path d="M12 0Q13.8 10.2 24 12Q13.8 13.8 12 24Q10.2 13.8 0 12Q10.2 10.2 12 0Z" fill="{c}"/></svg>'
CHECK = f'<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="12" fill="{E}"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'

BASE_CSS = f"""
*{{box-sizing:border-box;margin:0}}
html,body{{background:transparent}}
body{{font-family:PJS,Inter,Arial,sans-serif;color:{N};-webkit-font-smoothing:antialiased}}
.stage{{position:relative;overflow:hidden}}
.shot{{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}}
.laptop{{position:absolute}}
.laptop .lid{{background:#111827;border-radius:22px 22px 6px 6px;padding:14px 14px 18px;box-shadow:0 40px 80px -30px rgba(15,23,42,.55)}}
.laptop .scr{{border-radius:6px;overflow:hidden;background:#000;aspect-ratio:16/10}}
.laptop .base{{height:22px;margin:0 -64px;background:linear-gradient(#e5e7eb,#cbd5e1);border-radius:2px 2px 18px 18px;position:relative;box-shadow:0 18px 30px -16px rgba(15,23,42,.5)}}
.laptop .base::after{{content:"";position:absolute;left:50%;top:0;width:120px;height:8px;margin-left:-60px;background:#94a3b8;border-radius:0 0 10px 10px}}
.tablet{{position:absolute;background:#0f172a;border-radius:30px;padding:16px;box-shadow:0 40px 70px -30px rgba(15,23,42,.6)}}
.tablet .scr{{border-radius:14px;overflow:hidden;width:100%;height:100%;background:#fff}}
.phone{{position:absolute;background:#0f172a;border-radius:38px;padding:12px;box-shadow:0 40px 70px -28px rgba(15,23,42,.6)}}
.phone .scr{{border-radius:28px;overflow:hidden;width:100%;height:100%;background:#fff;position:relative}}
.phone .scr::before{{content:"";position:absolute;top:10px;left:50%;width:70px;height:18px;margin-left:-35px;background:#0f172a;border-radius:10px;z-index:2}}
.card{{position:absolute;background:#fff;border-radius:20px;box-shadow:0 24px 50px -22px rgba(15,23,42,.45);padding:14px;border:1px solid {L}}}
.card .ttl{{font-weight:800;font-size:17px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}}
.card .sub{{font-size:13px;color:{T3};font-weight:600;margin-top:2px}}
.ic{{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;flex:none}}
.ic svg{{width:22px;height:22px}}
.thumb{{border-radius:12px;overflow:hidden;margin-top:10px;border:1px solid {L}}}
.pill{{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-weight:800;font-size:13px}}
.star{{position:absolute}}
.star svg{{width:100%;height:100%;display:block}}
.orbit{{position:absolute;inset:0;pointer-events:none}}
.bar{{height:10px;border-radius:6px;background:{L};margin-top:8px;overflow:hidden}}
.bar i{{display:block;height:100%;border-radius:6px}}
"""

ICO = {
    "robot": '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6"/><circle cx="12" cy="3.5" r="1"/>',
    "ai": '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M5 19l2.8-2.8M16.2 7.8 19 5"/>',
    "code": '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
    "game": '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M18 14h.01"/>',
    "app": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    "cup": '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6"/>',
}


def ico(name, bg, fg):
    return (f'<span class="ic" style="background:{bg};color:{fg}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICO[name]}</svg></span>')


def swoosh(w, h, d, color=G, width=14):
    """Quỹ đạo vàng kiểu logo: nét cong to giữa, thon hai đầu (vẽ bằng 2 lớp nét)"""
    return (f'<svg class="orbit" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" opacity=".95"/>'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width * 1.9}" stroke-linecap="round" opacity=".18"/></svg>')


def star(x, y, s, c=G):
    return f'<span class="star" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px">{STAR(c)}</span>'


# ------------------------------------------------------------------ cảnh 1: đầu trang (dải ảnh rộng dưới tiêu đề)
def tc_ghep_hero():
    W, H = 1200, 600
    roblox = data_url("roblox-studio-lau-dai", box=(0, 60, 1120, 788))
    scratch = data_url("scratch-trinh-soan", max_w=1000)
    tm = data_url("teachable-machine-du-lieu", box=(40, 60, 1060, 520), max_w=700)
    py = data_url("python-pygame-ma", box=(0, 0, 900, 420), max_w=600)
    leaf = (f'<svg viewBox="0 0 120 120" width="110" height="110"><path d="M60 108C60 70 62 40 92 14C100 50 92 86 60 108Z" fill="{E}"/>'
            f'<path d="M60 108C58 78 44 52 18 38C14 70 30 96 60 108Z" fill="{ED}"/><path d="M60 108C64 70 76 44 90 22" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/></svg>')
    corner = lambda pos: f'<i style="position:absolute;{pos};width:22px;height:22px;border:4px solid {G};border-radius:4px"></i>'
    phone_ui = f"""<div style="padding:40px 14px 14px;height:100%;background:{S};display:flex;flex-direction:column;gap:10px">
      <div style="font-weight:800;font-size:15px">AI nhận diện</div>
      <div style="position:relative;background:#fff;border-radius:16px;height:150px;display:grid;place-items:center;border:1px solid {L}">{leaf}
        {corner("left:10px;top:10px;border-right:0;border-bottom:0")}{corner("right:10px;top:10px;border-left:0;border-bottom:0")}
        {corner("left:10px;bottom:10px;border-right:0;border-top:0")}{corner("right:10px;bottom:10px;border-left:0;border-top:0")}</div>
      <div style="font-size:12px;font-weight:700;color:{T2}">Lá cây <b style="float:right;color:{ED}">92%</b><div class="bar" style="margin-top:4px"><i style="width:92%;background:{E}"></i></div></div>
      <div style="font-size:12px;font-weight:700;color:{T2}">Bông hoa <b style="float:right">8%</b><div class="bar" style="margin-top:4px"><i style="width:8%;background:{B}"></i></div></div>
      <div style="margin-top:auto;text-align:center;background:{B};color:#fff;border-radius:999px;padding:9px;font-weight:800;font-size:13px">Chụp ảnh mới</div></div>"""
    body = f"""
<div class="stage" style="width:{W}px;height:{H}px">
 {swoosh(W, H, "M40 500 C 260 600, 760 600, 1160 170", G, 12)}
 {star(1120, 96, 34)}{star(36, 140, 22, E)}{star(1030, 520, 18, "#fff")}{star(170, 560, 16)}
 <div class="tablet" style="left:56px;top:176px;width:320px;height:246px;transform:rotate(-6deg)"><div class="scr"><img class="shot" src="{scratch}"></div></div>
 <div class="laptop" style="left:336px;top:56px;width:528px"><div class="lid"><div class="scr"><img class="shot" src="{roblox}"></div></div><div class="base"></div></div>
 <div class="phone" style="left:906px;top:186px;width:186px;height:356px;transform:rotate(5deg)"><div class="scr">{phone_ui}</div></div>
 <div class="card" style="left:76px;top:20px;width:250px">
   <div class="ttl">{ico("ai", ET, ED)}<span>Dạy máy học<div class="sub">Teachable Machine</div></span></div>
   <div class="thumb"><img class="shot" style="height:88px" src="{tm}"></div>
 </div>
 <div class="card" style="left:870px;top:24px;width:256px">
   <div class="ttl">{ico("game", BT, BD)}<span>Game tự làm<div class="sub">Roblox Studio</div></span></div>
   <div style="display:flex;gap:6px;margin-top:10px"><span class="pill" style="background:{GT};color:{GD}">★ Màn 1</span><span class="pill" style="background:{ET};color:{ED}">Chạy ▶</span></div>
 </div>
 <div class="card" style="left:232px;top:452px;width:250px">
   <div class="ttl">{ico("code", GT, GD)}<span>Python<div class="sub">Viết code, sửa lỗi</div></span></div>
   <div class="thumb"><img class="shot" style="height:54px" src="{py}"></div>
 </div>
 <div class="card" style="left:640px;top:470px;width:240px">
   <div class="ttl">{ico("cup", BT, BD)}<span>Báo cáo năng lực<div class="sub">Gửi phụ huynh định kỳ</div></span></div>
   <div class="bar"><i style="width:86%;background:{E}"></i></div>
   <div class="bar"><i style="width:70%;background:{B}"></i></div>
 </div>
</div>"""
    return W, H, body, "Ảnh ghép: màn hình phần mềm thật trên laptop, máy tính bảng, điện thoại — game Roblox Studio, Scratch, App Inventor, AI Teachable Machine, Python"


SCENES = {"tc-ghep-hero": tc_ghep_hero}


def render(name):
    from playwright.sync_api import sync_playwright
    W, H, body, _alt = SCENES[name]()
    html = f"<!doctype html><html><head><meta charset=utf-8><style>{font_css()}{BASE_CSS}</style></head><body>{body}</body></html>"
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
        pg.set_content(html)
        pg.wait_for_timeout(300)
        png = pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": W, "height": H})
        b.close()
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    im = im.resize((1600, round(1600 * H / W)), Image.LANCZOS)
    out = OUT / f"{name}.webp"
    im.save(out, "WEBP", quality=84, method=6)
    print(out, im.size, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    for n in sys.argv[1:] or list(SCENES):
        render(n)

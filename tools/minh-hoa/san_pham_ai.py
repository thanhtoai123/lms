"""Ảnh MINH HOẠ loại sản phẩm của chuyên ngành Trí tuệ nhân tạo AI (ứng dụng công cụ AI: tranh, poster, video ngắn, trang web).

Tranh nền là ảnh tạo bằng AI, phạm vi công cộng / CC0 trên Wikimedia Commons:
  ai-mars.jpg        "A city on Mars under a glass dome…" — DALL·E 3, phạm vi công cộng
  ai-greenwood.jpg   "'Greenwood Estates Vista City' by Midjourney" — Dennis Sylvester Hurd, CC0
  ai-valley-imagen   "Illuminated Valley in the Afternoon (Imagen 4.0)" — VulcanSphere, phạm vi công cộng
Khung poster / trình phát video / trình duyệt là giao diện tự dựng (không phải ảnh chụp sản phẩm của học viên).

    REPO=. SRC=/thu-muc/anh-ai python3 tools/minh-hoa/san_pham_ai.py
"""
import base64, io, os
from pathlib import Path
from PIL import Image

REPO = Path(os.environ.get("REPO", "."))
SRC = Path(os.environ.get("SRC", "/mnt/user-data/uploads/thaytoai-stem-lms/anh-tai/v5"))
OUT = REPO / "apps/web/public/lp-anh/that"
FONTS = Path(os.environ.get("FONTS", "/tmp/claude-0/fonts"))
B, E, G, N = "#1D4ED8", "#10B981", "#F59E0B", "#0F172A"


def url(name, w=1400):
    im = Image.open(SRC / name).convert("RGB")
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "WEBP", quality=88)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def font_css():
    out = ""
    for f in ("pjs-vi", "pjs-ext", "pjs-latin"):
        p = FONTS / f"{f}.woff2"
        if p.exists():
            out += f"@font-face{{font-family:PJS;font-weight:200 800;src:url(data:font/woff2;base64,{base64.b64encode(p.read_bytes()).decode()})}}"
    return out


CSS = """*{box-sizing:border-box;margin:0}body{font-family:PJS,Inter,Arial,sans-serif;color:#0f172a}
.st{position:relative;width:1200px;height:750px;overflow:hidden}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.tag{display:inline-block;background:#fff;border-radius:999px;padding:8px 16px;font-weight:800;font-size:20px}
"""


def poster():
    m = url("ai-mars.jpg", 1000)
    return f"""<div class="st" style="background:linear-gradient(135deg,#DBEAFE,#FEF3C7)">
 <div style="position:absolute;left:330px;top:40px;width:540px;height:670px;background:#0F172A;border-radius:18px;overflow:hidden;box-shadow:0 40px 70px -30px rgba(15,23,42,.6);transform:rotate(-2deg)">
  <img src="{m}" style="width:100%;height:440px;object-fit:cover">
  <div style="padding:26px 30px;color:#fff">
   <div style="font-size:18px;font-weight:800;letter-spacing:.14em;color:#FCD34D">POSTER KHOA HỌC</div>
   <div style="font-size:44px;font-weight:800;line-height:1.08;margin-top:8px">Thành phố trên sao Hỏa</div>
   <div style="font-size:19px;opacity:.85;margin-top:10px">Nếu con người sống dưới mái vòm kính, ta cần trồng cây, giữ nước và tạo không khí thế nào?</div>
  </div>
 </div>
 <div style="position:absolute;left:60px;top:90px" class="tag">Ảnh tạo bằng AI</div>
 <div style="position:absolute;right:56px;bottom:90px" class="tag">Chữ, bố cục: con tự làm</div>
</div>"""


def video():
    g = url("ai-greenwood.jpg", 1400)
    return f"""<div class="st" style="background:#0F172A">
 <img class="bg" src="{g}" style="height:640px">
 <div style="position:absolute;left:0;right:0;top:520px;text-align:center"><span style="background:rgba(15,23,42,.75);color:#fff;font-size:30px;font-weight:700;padding:8px 18px;border-radius:10px">Ngày xưa, thành phố của em toàn là cây xanh…</span></div>
 <div style="position:absolute;left:50%;top:250px;width:120px;height:120px;margin-left:-60px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;box-shadow:0 20px 40px -16px rgba(0,0,0,.6)">
  <div style="width:0;height:0;border-left:40px solid {B};border-top:26px solid transparent;border-bottom:26px solid transparent;margin-left:10px"></div></div>
 <div style="position:absolute;left:0;right:0;bottom:0;height:110px;background:#0F172A;padding:22px 40px;color:#fff">
  <div style="height:8px;border-radius:4px;background:#334155"><div style="width:32%;height:100%;border-radius:4px;background:{G}"></div></div>
  <div style="display:flex;justify-content:space-between;margin-top:18px;font-size:22px;font-weight:700"><span>▶ 0:19 / 1:00</span><span style="color:#FCD34D">Video kể chuyện · Thành phố xanh</span></div>
 </div>
</div>"""


def web():
    v = url("ai-valley-imagen.webp", 1400)
    return f"""<div class="st" style="background:linear-gradient(135deg,#D1FAE5,#DBEAFE)">
 <div style="position:absolute;left:70px;top:46px;width:1060px;height:660px;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 40px 70px -30px rgba(15,23,42,.55)">
  <div style="height:46px;background:#E2E8F0;display:flex;align-items:center;gap:10px;padding:0 18px"><i style="width:14px;height:14px;border-radius:50%;background:#F87171"></i><i style="width:14px;height:14px;border-radius:50%;background:#FBBF24"></i><i style="width:14px;height:14px;border-radius:50%;background:#34D399"></i><span style="margin-left:16px;background:#fff;border-radius:10px;padding:5px 16px;font-size:16px;color:#475569;width:520px">thung-lung-xanh.trang-web-cua-em</span></div>
  <div style="position:relative;height:400px"><img class="bg" src="{v}">
   <div style="position:absolute;left:48px;bottom:40px;color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.5)"><div style="font-size:54px;font-weight:800;line-height:1.05">Thung lũng xanh</div><div style="font-size:22px;margin-top:8px">Trang giới thiệu chuyến dã ngoại của lớp</div></div></div>
  <div style="display:flex;gap:18px;padding:26px 48px">
   <div style="flex:1;background:#F8FAFC;border-radius:14px;padding:18px"><b style="font-size:22px">Đi đâu?</b><div style="font-size:17px;color:#475569;margin-top:6px">Lịch trình 1 ngày</div></div>
   <div style="flex:1;background:#F8FAFC;border-radius:14px;padding:18px"><b style="font-size:22px">Mang gì?</b><div style="font-size:17px;color:#475569;margin-top:6px">Danh sách đồ dùng</div></div>
   <div style="flex:1;background:{G};border-radius:14px;padding:18px;display:grid;place-items:center"><b style="font-size:22px">Đăng ký tham gia</b></div>
  </div>
 </div>
</div>"""


SCENES = {"sp-ai-poster": poster, "sp-ai-video": video, "sp-ai-web": web}


def render():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 750}, device_scale_factor=1)
        for name, fn in SCENES.items():
            pg.set_content(f"<!doctype html><meta charset=utf-8><style>{font_css()}{CSS}</style><body>{fn()}</body>")
            pg.wait_for_timeout(300)
            png = pg.screenshot(clip={"x": 0, "y": 0, "width": 1200, "height": 750})
            im = Image.open(io.BytesIO(png)).convert("RGB").resize((960, 600), Image.LANCZOS)
            out = OUT / f"{name}.webp"; im.save(out, "WEBP", quality=84, method=6)
            print(out, out.stat().st_size // 1024, "KB")
        b.close()
    # ảnh tổng hợp cho tab chuyên ngành: video lớn bên trái, poster + trang web bên phải
    v = Image.open(OUT / "sp-ai-video.webp"); po = Image.open(OUT / "sp-ai-poster.webp"); w = Image.open(OUT / "sp-ai-web.webp")
    c = Image.new("RGB", (1200, 750), "#F8FAFC")
    c.paste(v.resize((780, 488)).crop((0, 0, 780, 488)), (0, 131))
    c.paste(po.resize((400, 250)), (800, 105)); c.paste(w.resize((400, 250)), (800, 395))
    c.save(OUT / "sp-ai-bo-san-pham.webp", "WEBP", quality=84, method=6)


if __name__ == "__main__":
    render()

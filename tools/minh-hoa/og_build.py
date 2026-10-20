from playwright.sync_api import sync_playwright
import os
PUB=os.path.abspath(os.path.join(os.environ.get("REPO", "."), "apps/web/public"))
PAGES=[
 ("hoc-cong-nghe-online","Khóa học công nghệ online cho trẻ 8–18 tuổi","Robotics · AI · Đồ họa · Lập trình","lp-hero-chung"),
 ("robotics-ai-cho-tre","Lập trình Robotics AI cho trẻ 8–10 tuổi","RoboSim → RoboVR · 2 năm học","lp-hero-robotics"),
 ("tri-tue-nhan-tao-ai-cho-hoc-sinh","Trí tuệ nhân tạo AI cho học sinh 8–14 tuổi","AI for kids · AI for teen","lp-hero-ai"),
 ("thiet-ke-do-hoa-ai-cho-hoc-sinh","Thiết kế đồ họa AI cho học sinh","3D Tinkercad · Photoshop & AI","lp-hero-do-hoa"),
 ("lap-trinh-ai-cho-tre-em","Lập trình cho trẻ em 8–18 tuổi","Scratch → Roblox → Python → Web","lp-hero-lap-trinh"),
]
CSS="""@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap');
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#fff;overflow:hidden}
.w{display:grid;grid-template-columns:600px 600px;height:630px}
.l{padding:56px 40px 48px 64px;display:flex;flex-direction:column;gap:22px;background:linear-gradient(160deg,#F8FAFC,#fff)}
.logo{height:46px;width:auto;align-self:flex-start}
h1{font-size:50px;line-height:1.1;font-weight:800;color:#0F172A;letter-spacing:-.01em}
.sub{font-size:26px;font-weight:700;color:#047857}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:auto}
.chips span{padding:9px 18px;border-radius:999px;font-size:19px;font-weight:700;background:#DBEAFE;color:#1D4ED8}
.chips span.g{background:#FEF3C7;color:#B45309}
.r{background:#DBEAFE;display:flex;align-items:center;justify-content:center}
.r img{width:600px;height:630px;object-fit:cover;object-position:50% 60%}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(90deg,#1D4ED8 0 33%,#10B981 33% 66%,#F59E0B 66%)}"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1200,"height":630})
    for slug,h1,sub,art in PAGES:
        html=f"""<html><head><style>{CSS}</style></head><body><div class="w"><div class="l"><img class="logo" src="file://{PUB}/thsteam/logo-ngang.svg"><h1>{h1}</h1><p class="sub">{sub}</p>
        <div class="chips"><span>Học online qua ClassIn</span><span>Lớp 6–8 học sinh</span><span class="g">Học trải nghiệm 1:1</span></div></div>
        <div class="r"><img src="file://{PUB}/lp-anh/{art}.svg"></div></div><div class="bar"></div></body></html>"""
        open("/tmp/claude-0/og/p.html","w").write(html)
        pg.goto("file:///tmp/claude-0/og/p.html"); pg.wait_for_timeout(900)
        pg.screenshot(path=f"{PUB}/lp-anh/og-{slug}.png")
    b.close()
print("ok")

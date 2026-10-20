import os,re,glob
from PIL import Image
root=os.path.join(os.environ.get("REPO", "."), "apps/web/public")
out={}
for d in ["anh-site","lp-anh","lp-anh/that","thsteam"]:
    for f in sorted(glob.glob(f"{root}/{d}/*")):
        if os.path.isdir(f): continue
        n=os.path.basename(f); p=f"/{d}/{n}"
        if not re.match(r"^[a-z0-9-]+\.(svg|png|jpg|webp)$",n): continue
        if n.endswith(".svg"):
            m=re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"',open(f).read(3000))
            if not m: continue
            w,h=round(float(m.group(1))),round(float(m.group(2)))
        else:
            w,h=Image.open(f).size
        out[p]=(w,h)
lines=[f'  "{k}": [{w}, {h}],' for k,(w,h) in out.items()]
src='''/**
 * KÍCH THƯỚC ẢNH ĐI KÈM ỨNG DỤNG (apps/web/public) — để thẻ <img> có width/height, trang không bị nhảy bố cục (CLS).
 * Tệp sinh tự động bằng gen/media_manifest.py; ảnh tải lên thư viện hoặc https không có ở đây thì bỏ qua kích thước.
 */
export const LP_MEDIA_SIZE: Readonly<Record<string, readonly [number, number]>> = {
'''+"\n".join(lines)+'''
};

export function mediaSize(src: string): readonly [number, number] | null {
  return LP_MEDIA_SIZE[src] ?? null;
}
'''
open(os.path.join(os.environ.get("REPO", "."), "packages/core/src/landing/media.ts"),"w").write(src)
print(len(out))

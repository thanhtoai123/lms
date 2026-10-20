# Tranh minh hoạ landing TH STEAM

Chạy từ thư mục gốc repo (cần Python 3 + Pillow + Playwright):

```
REPO=. python3 tools/minh-hoa/art_lp_scenes.py      # vẽ lại apps/web/public/lp-anh/*.svg
REPO=. python3 tools/minh-hoa/og_build.py           # ảnh chia sẻ 1200×630 /lp-anh/og-*.png
REPO=. python3 tools/minh-hoa/media_manifest.py     # cập nhật kích thước ảnh: packages/core/src/landing/media.ts
```

Nhân vật là tranh vẽ theo bảng màu bộ nhận diện, không phải ảnh người thật.

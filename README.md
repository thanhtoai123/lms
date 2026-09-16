# Sata Robo Platform

Nền tảng vận hành trung tâm giáo dục thế hệ mới cho Sata Robo — xây lại theo **modular monolith**, **workflow-first**, **API-first**, **privacy by design**. Giai đoạn 1 tập trung vào domain **Academics** (lớp / lịch / buổi học / điểm danh) và **Teacher app**.

## Kiến trúc

```
apps/web                Next.js 16 (App Router) — /teacher (PWA mobile-first), /ops (console), /login
packages/core           Lõi nghiệp vụ thuần TypeScript, 0 dependency, có unit test
packages/db             Drizzle schema + client + seed + SQL constraints (EXCLUDE, audit append-only)
packages/api            tRPC v11 routers + services (phân quyền, transaction, audit)
scripts/migrate-legacy  Script chuyển dữ liệu từ Supabase cũ (dry-run mặc định)
docs/                   ADR, kiến trúc, ERD
```

Luồng dữ liệu: `UI → tRPC → services (authorize → core rules → transaction + audit) → Postgres`.
Không có "logic trong UI": mọi quy tắc (sinh lịch, state machine buổi học, chuyên cần, rủi ro, phân quyền) nằm trong `packages/core` và được test.

## Chạy local

```bash
pnpm install
cp .env.example .env            # DATABASE_URL trỏ tới Postgres local hoặc Supabase
docker compose up -d postgres    # nếu chưa có Postgres
pnpm db:push                     # tạo bảng từ Drizzle schema (drizzle-kit push --force)
pnpm db:apply-sql                # EXCLUDE constraints, audit trigger, view
pnpm db:seed                     # dữ liệu mẫu (không dùng dữ liệu thật)
pnpm dev                         # http://localhost:3000
```

Đăng nhập dev: trang `/login` → "Dev mode — chọn tài khoản mẫu" (GV, Quản lý CS1, Super admin). Production dùng Supabase Auth (điền `NEXT_PUBLIC_SUPABASE_*`).

## Kiểm thử

```bash
pnpm --filter @satarobo/core test   # 21 unit test: sinh lịch, xung đột, state machine, chuyên cần, rủi ro, phân quyền
pnpm -r typecheck
```

CI (GitHub Actions) chạy: build core → unit test → typecheck → db push + seed trên Postgres service → build web → smoke test render Teacher app và Ops.

## Những gì Giai đoạn 1 đã làm

- **Lịch học là dữ liệu** (`class_schedules`) thay cho chuỗi `sata6.15h45-T7.CS2-P302`; buổi học sinh tự động, bỏ ngày nghỉ, gán bài học theo giáo trình, chặn trùng phòng/GV ở cả app và DB (`EXCLUDE USING gist`).
- **Buổi học có vòng đời** `scheduled → attendance_done → notes_done → completed` với guard (không điểm danh buổi tương lai, phải đủ điểm danh, phải có nhận xét). "Buổi chưa hoàn tất" = truy vấn trạng thái, không phải quy tắc trong UI.
- **Teacher app một màn hình**: điểm danh (chạm xoay trạng thái) → nhận xét → hoàn tất, có mốc học bạ, quá hạn nổi bật trên "Hôm nay".
- **Ops console**: hàng đợi buổi quá hạn, lớp học (tiến độ, quá hạn), chi tiết lớp với chuyên cần + cảnh báo rủi ro tính từ rule engine, mở lớp mới sinh lịch tự động.
- **Phân quyền role × cơ sở × ownership** trong `packages/core/policy`, áp ở service; 15 vai trò tương thích hệ cũ.
- **Audit log append-only** (trigger DB), PII nhạy cảm tách bảng `parent_private` mã hoá, ảnh lưu object key (bucket private).
- **CSP thật** (không report-only), security headers.

## Lộ trình tiếp theo

Xem `docs/ROADMAP.md`. Giai đoạn 2: Admissions (lead inbox/SLA/automation), Engagement (ZNS, push, NPS); Giai đoạn 3: Finance (ledger), People; Giai đoạn 4: Parent/Student app nối backend thật, Public site SSG.

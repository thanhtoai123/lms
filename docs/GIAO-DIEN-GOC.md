# Bộ giao diện của bản gốc admin.satarobo.vn (trích 18/09/2026)

Trích từ CSS và HTML máy chủ trả về (chỉ đọc). Dùng làm chuẩn để hệ mới nhìn giống bản gốc.

## 1. Phông chữ
- Sans: **Be Vietnam Pro** (`--font-sans`), có mono riêng cho mã.

## 2. Biến màu

Nền chung (ngoài khu quản trị):
```
--background:#fff  --foreground:#0a0a0a
--card:#fff        --card-foreground:#0a0a0a
--muted:#f5f5f5    --muted-foreground:#737373
--border:#e5e5e5   --ring:#a1a1a1
--destructive:#e40014
--sidebar:#fafafa  --sidebar-border:#e5e5e5
--radius:.625rem   (rounded-sm = .6×, md = .8×, lg = 1×, xl = 1.4×)
```

**Khu quản trị `.admin-scope` ghi đè** (đây mới là màu thật của admin):
```
--primary:#610b8a            --primary-foreground:#fff
--primary-dark:#4e237d       --primary-darker:#3b1a5e
--primary-soft:#610b8a1a     --primary-soft-hover:#610b8a2e
--primary-ink:#610b8a        --primary-ink-hover:#4e237d
--ring:#610b8a
--accent:#ff8f2d             --accent-dark:#f8903b
--accent-soft:#ff8f2d1f      --accent-ink:#b45309
--accent-foreground:#241a2e
--muted-foreground:#6c6c6c
```
Màu vai: `--parent:#610c8d`, `--student:#fd8f2d`.
`.admin-scope select` có mũi tên tự vẽ (SVG data-uri, `stroke=#6b7280`), `padding-right:2rem`.

## 3. Khung trang

```
aside  : flex h-full flex-col border-r border-border bg-card transition-[width] duration-200 w-64
  ├ div : flex h-16 items-center border-b border-border gap-2 px-6      (logo)
  ├ nav : flex-1 overflow-y-auto py-4
  └ div : border-t border-border text-xs text-muted-foreground p-4       (chân)

nhóm menu (button): flex w-full items-center justify-between px-6 py-1.5
                    text-[11px] font-bold uppercase tracking-wider text-foreground
                    transition-colors hover:text-primary

mục menu (a)      : flex items-center text-sm font-medium transition-colors gap-3 px-6 py-2
  đang mở         : bg-primary-soft text-primary border-l-2 border-primary
  bình thường     : text-muted-foreground hover:bg-muted hover:text-foreground

header : flex h-16 items-center justify-between gap-2 border-b border-border bg-card px-4 md:px-6
  ├ button menu : -ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg
                  text-muted-foreground hover:bg-muted  (icon lucide-menu h-5 w-5)
  ├ form tìm    : hidden md:flex flex-1 max-w-md
  │   input     : w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-muted
  │               focus:bg-card focus:border-primary
  │   icon      : lucide-search absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground
  └ phải        : flex items-center gap-2
      chuông    : relative inline-flex h-9 w-9 items-center justify-center rounded-lg
                  text-muted-foreground hover:bg-muted  (lucide-bell)
      người dùng: flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted
                  [avatar size-8 rounded-full] [tên + vai trò, hidden md:block] [lucide-chevron-down h-4 w-4]

main   : flex-1 overflow-y-auto p-4 sm:p-6
body   : min-h-full flex flex-col font-sans
```

## 4. Thành phần hay dùng

```
thẻ          : overflow-hidden rounded-xl border border-border bg-card
nút chính    : inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-white
               shadow-md hover:bg-primary-dark
nút phụ      : inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2
               text-sm font-bold text-foreground hover:bg-muted
tiêu đề trang: text-2xl font-bold
ô tiêu đề bảng: p-4 text-xs font-bold uppercase tracking-wider text-foreground
thân bảng    : divide-y divide-border
```

## 5. Icon từng mục menu (bộ lucide)

Nhóm/mục → tên icon lucide:

```
/dashboard layout-dashboard      /crm chart-column
/leads users                     /nhap-khach-hang user-plus
/leads/bulk-convert workflow     /quan-ly-chia-lead list-ordered
/ban-giao-lead arrow-left-right  /lead-nguoi alarm-clock
/leads/bao-cao-chuyen workflow   /affiliates share2
/crm/messenger messages-square   /lop-trial flask-conical
/students graduation-cap         /students/tai-khoan key-round
/enrollments clipboard-list      /chuyen-lop arrow-left-right
/students/sap-het-khoa graduation-cap
/hoan-thanh-khoa award           /hoc-ba scroll-text
/report-cards notebook-pen       /satacoin coins
/classes book-open               /sessions calendar-days
/lich calendar-check             /attendance clipboard-check
/media image                     /duyet-media check-check
/hoc-bu refresh-cw               /centers map-pin
/rooms door-open                 /curriculums book-marked
/de-xuat-giao-an clipboard-pen   /courses boxes
/course-prerequisites workflow   /documents file-text
/assignments notebook-pen        /teaching-materials presentation
/scorm package                   /tin-nhan message-circle
/hoi-thoai messages-square       /parent-requests message-square-plus
/parent-feedback star            /khao-sat gauge
/notifications bell              /canh-bao-rui-ro triangle-alert
/cham-soc-hv heart-handshake     /sinh-nhat cake
/teachers user-cog               /nhan-su id-card
/nhan-su/vi-tri briefcase        /cham-cong clock
/don-tu clipboard-list           /cham-cong/lich-ca user-round
/jobs briefcase                  /kits package
/products package2               /inventory/dashboard boxes
/inventory/audit clipboard-check /orders shopping-bag
/payments credit-card            /cong-no wallet
/thieu-hoc-phi wallet            /nhap-giao-dich-cu file-spreadsheet
/bien-dong-so-du wallet          /hoan-tien undo2
/crm/commission coins            /news newspaper
/site-content image              /marketing chart-column
/marketing/funnel workflow       /email-templates mail
/email-logs send                 /otp-logs message-circle
/users key-round                 /user-groups users-round
/roles key-round                 /to-chuc network
/audit-log scroll-text           /compliance triangle-alert
/crm/webhook-replay refresh-cw   /tich-hop plug
/cau-hinh-van-hanh sliders-horizontal
/settings settings
/bao-cao/lead chart-column       /bao-cao/trial flask-conical
/bao-cao/dao-tao book-open       /bao-cao/trung-tam coins
/bao-cao/hieu-suat-gv graduation-cap
/bao-cao/cohort users            /bao-cao/churn chart-column
/bao-cao/doanh-thu coins         /bao-cao/chat-pilot messages-square
```

Mục chỉ có ở hệ mới — chọn icon cùng bộ cho hợp: `/huong-dan book-open-check`, `/bao-mat shield-check`,
`/bao-mat-he-thong shield-alert`, `/class-groups layers`, `/evaluations clipboard-pen`, `/thong-bao bell-ring`,
`/chuyen-doi database`, `/go-live rocket`, `/van-hanh server-cog`, `/course-packages package-open`,
`/payment-methods landmark`, `/hoa-don receipt`, `/the-hoc-vien id-card`, `/classes/kiem-tra-lich calendar-search`,
`/quan-ly-chia-lead/lich-su history`, `/cham-cong/phan-ca table-properties`, `/cham-cong/ky-cong calendar-clock`,
`/cham-cong/danh-muc-ca tags`, `/cham-cong/diem-cham map-pinned`, `/cham-cong/man-hinh monitor`,
`/leads/import upload`, `/leads/import/registered upload`, `/bao-cao/sau-go-live line-chart`.

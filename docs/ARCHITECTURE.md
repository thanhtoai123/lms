# Kiến trúc hệ thống

## Bounded contexts

| Context | Giai đoạn | Nội dung |
|---|---|---|
| **Academics** | 1 (đã có) | Cơ sở, phòng, khoá, giáo trình, lớp, lịch, buổi, ghi danh, điểm danh, ảnh, học bù |
| **Identity & Platform** | 1 (đã có) | Users, roles theo cơ sở, policy engine, audit log |
| Admissions | 2 | Lead lifecycle, phân bổ, SLA, trial, attribution |
| Engagement | 2 | Thông báo (ZNS/push), nhận xét → PH, NPS, rủi ro → chăm sóc |
| Finance | 3 | Ledger bất biến, đơn/thu/nợ/hoàn, hoa hồng, đối soát MISA |
| People | 3 | Nhân sự, hợp đồng, chấm công, tải giảng dạy |

Mỗi context = một thư mục schema + services + router. Giao tiếp giữa context qua **domain events** (bảng `outbox`, giai đoạn 2) chứ không gọi chéo service.

## Lớp và trách nhiệm

```
apps/web (Next.js)         render + gọi tRPC; KHÔNG chứa quy tắc nghiệp vụ
packages/api               authorize → gọi core → transaction → audit → trả read model
packages/core              quy tắc thuần, deterministic, test được; không biết DB
packages/db                schema, constraints, seed; RLS là phòng thủ cuối (giai đoạn 2)
```

## Quyết định quan trọng (ADR)

- **ADR-001 Modular monolith** thay vì microservices — quy mô 2–10 cơ sở, đội nhỏ.
- **ADR-002 Lịch học là dữ liệu** — `class_schedules` + sinh `sessions`; EXCLUDE constraint chặn trùng.
- **ADR-003 Buổi học là state machine** — mọi hàng đợi "chưa hoàn tất" là truy vấn trạng thái.
- **ADR-004 Phân quyền ở service layer** — role × centerId × ownership; RLS chỉ là lớp cuối.
- **ADR-005 PII tách bảng và mã hoá** — `parent_private`, reveal có audit; ảnh trẻ em private bucket + consent.
- **ADR-006 tRPC nội bộ, OpenAPI cho ngoài** — type-safe end-to-end; sinh OpenAPI ở giai đoạn 2 cho Zalo Mini App / n8n.

## Hiệu năng

- Dữ liệu tham chiếu (cơ sở, phòng, GV, khoá) cache ở client 30s và ở server bằng `unstable_cache` (giai đoạn 2).
- Dashboard đọc từ view/materialized view (`v_overdue_sessions`), không tính toán trong request.
- Không prefetch toàn bộ sidebar; chỉ prefetch on-hover.
- Region: đặt DB và function cùng khu vực Singapore.

## Bảo mật

- CSP enforce (không report-only), HSTS, nosniff, Referrer-Policy.
- Mỗi người một tài khoản; 2FA cho SUPER_ADMIN/HO_* (Supabase MFA, giai đoạn 2).
- Audit log append-only bằng trigger.
- Test ma trận quyền chạy trong CI (`policy.test.ts`).

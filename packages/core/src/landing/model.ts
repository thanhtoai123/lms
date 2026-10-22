/**
 * LANDING PAGE THEO KHỐI — mô hình dữ liệu + kiểm tra (thuần, không DOM / React).
 *
 * Một landing = danh sách KHỐI (section) theo thứ tự. Mỗi khối có kiểu (hero, stats, faq…), bật / tắt,
 * các trường chữ / ảnh / liên kết và các danh sách con (thẻ, dòng, câu hỏi…). Định nghĩa trường nằm ở
 * `SECTION_DEFS` — màn quản trị dựng form từ đây, bộ kiểm tra và bộ hiển thị (`render.ts`) cũng đọc từ đây
 * nên thêm một trường chỉ sửa một chỗ.
 *
 * Nguyên tắc an toàn: nội dung chỉ là CHỮ + ẢNH + LIÊN KẾT; không có HTML / script do người dùng nhập.
 * Mọi chuỗi được cắt theo giới hạn, mọi liên kết / ảnh phải qua `validUrl` / `validImage`, hiển thị luôn escape.
 * Xem docs/LANDING-PAGE.md.
 */

export type LFieldType = "text" | "textarea" | "url" | "image";
export interface LField { key: string; label: string; type: LFieldType; max: number; required?: boolean; hint?: string }
export interface LList { key: string; label: string; addLabel: string; max: number; min?: number; fields: LField[]; hint?: string }

export const SECTION_TYPES = ["header", "hero", "leadHero", "stats", "features", "programs", "roadmap", "tools", "split", "teacher", "testimonials", "cta", "steps", "timeline", "gallery", "faq", "form", "text", "insights", "contrast", "tracks", "change", "trial", "footer"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface SectionDef {
  type: SectionType;
  label: string;
  desc: string;
  fields: LField[];
  lists: LList[];
  /** Chỉ một khối loại này trong trang */
  single?: boolean;
  /** Cố định vị trí: đầu trang / cuối trang (không kéo đi chỗ khác, không xoá) */
  fixed?: "top" | "bottom";
  /** Nếu danh sách chính (list này) trống thì khối không hiển thị */
  needs?: string;
}

const t = (key: string, label: string, max: number, extra: Partial<LField> = {}): LField => ({ key, label, type: "text", max, ...extra });
const ta = (key: string, label: string, max: number, extra: Partial<LField> = {}): LField => ({ key, label, type: "textarea", max, ...extra });
const u = (key: string, label: string, extra: Partial<LField> = {}): LField => ({ key, label, type: "url", max: 400, ...extra });
const img = (key: string, label: string, extra: Partial<LField> = {}): LField => ({ key, label, type: "image", max: 500, ...extra });

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  header: {
    type: "header", label: "Đầu trang & menu", single: true, fixed: "top",
    desc: "Logo (lấy từ Nhận diện thương hiệu), menu, số điện thoại và nút kêu gọi.",
    fields: [t("phone", "Số điện thoại", 24, { hint: "Hiện trên đầu trang, bấm để gọi" }), t("ctaLabel", "Chữ nút kêu gọi", 40, { required: true }), u("ctaUrl", "Liên kết nút", { required: true })],
    lists: [{ key: "nav", label: "Menu", addLabel: "Thêm mục menu", max: 6, fields: [t("label", "Tên mục", 30, { required: true }), u("href", "Liên kết (vd #hoi-dap)", { required: true })] }],
  },
  hero: {
    type: "hero", label: "Mở đầu (Hero)", single: true,
    desc: "Tiêu đề lớn, mô tả, hai nút và ảnh. Khối đầu tiên phụ huynh nhìn thấy.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề lớn", 140, { required: true }), ta("subtitle", "Mô tả ngắn", 400), t("primaryLabel", "Nút chính", 40, { required: true }), u("primaryUrl", "Liên kết nút chính", { required: true }), t("secondaryLabel", "Nút phụ", 40), u("secondaryUrl", "Liên kết nút phụ"), img("image", "Ảnh")],
    lists: [{ key: "badges", label: "Điểm tin cậy (chip)", addLabel: "Thêm điểm", max: 4, fields: [t("text", "Nội dung", 70, { required: true })], hint: "Ví dụ: Lớp 6–8 học sinh · Học online qua ClassIn" }],
  },
  leadHero: {
    type: "leadHero", label: "Mở đầu + form đăng ký (quảng cáo)", single: true,
    desc: "Dành cho landing chạy quảng cáo: tiêu đề chứa từ khoá, 3–5 lợi ích, form 4 ô ngay màn hình đầu (điện thoại: form nằm ngay dưới tiêu đề).",
    fields: [
      t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề lớn (H1, có từ khoá)", 120, { required: true, hint: "Đặt *cụm từ* trong dấu sao để tô màu nhấn" }), ta("subtitle", "Mô tả ngắn", 300),
      img("image", "Ảnh minh hoạ"), t("imageAlt", "Mô tả ảnh (alt, có từ khoá)", 160),
      t("credit", "Nguồn ảnh (hiện nhỏ dưới ảnh)", 240), u("creditUrl", "Liên kết nguồn ảnh"),
      t("formTitle", "Tiêu đề form", 80, { required: true }), t("formNote", "Dòng nhỏ dưới tiêu đề form", 140),
      t("interest", "Chuyên ngành chọn sẵn trong form", 60, { hint: "Robotics AI / Trí tuệ nhân tạo AI / Thiết kế đồ họa AI / Lập trình AI — để trống: phụ huynh tự chọn" }),
      t("thankYou", "Lời cảm ơn sau khi gửi", 300),
    ],
    lists: [
      { key: "points", label: "Lợi ích (dấu ✓)", addLabel: "Thêm lợi ích", max: 5, fields: [t("text", "Nội dung", 110, { required: true })] },
      { key: "badges", label: "Điểm tin cậy (chip)", addLabel: "Thêm điểm", max: 4, fields: [t("text", "Nội dung", 60, { required: true })] },
      { key: "showcase", label: "Dải ảnh sản phẩm dưới tiêu đề (thay cho ảnh minh hoạ)", addLabel: "Thêm ảnh", max: 5, hint: "4–5 ảnh sản phẩm thật làm bằng phần mềm con học, mỗi ảnh ghi nguồn. Đủ 5 ảnh: ảnh đầu hiện to ở giữa", fields: [
        img("image", "Ảnh", { required: true }), t("imageAlt", "Mô tả ảnh (alt)", 160), t("title", "Nhãn (vd Game 3D tự làm)", 40, { required: true }), t("tool", "Phần mềm", 40),
        t("credit", "Nguồn ảnh", 80), u("creditUrl", "Liên kết nguồn ảnh"),
        t("fit", "Cách đặt ảnh", 10, { hint: "để trống = phủ kín khung · vua = hiện trọn ảnh trên nền nhạt (ảnh điện thoại, ảnh dọc)" }),
        t("pos", "Điểm giữ trong khung", 12, { hint: "vd 70% 30% (ngang dọc) — phần ảnh luôn hiện khi khung cắt bớt; để trống = giữa" }),
      ] },
    ],
  },
  roadmap: {
    type: "roadmap", label: "Lộ trình học", desc: "Các chặng nối tiếp: năm học, học phần, luyện thi. Hiện như mũi tên từ trái sang phải.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Mô tả", 300), t("note", "Ghi chú dưới lộ trình", 200)],
    lists: [{ key: "items", label: "Chặng", addLabel: "Thêm chặng", max: 6, fields: [t("step", "Nhãn chặng (vd Năm 1)", 30, { required: true }), t("name", "Tên", 80, { required: true }), t("meta", "Độ tuổi · số buổi", 80), ta("text", "Con học / làm được", 300), t("tag", "Nhãn phụ (vd Tự chọn)", 30)] }],
    needs: "items",
  },
  tools: {
    type: "tools", label: "Phần mềm / công cụ con học", desc: "Ảnh chụp phần mềm thật kèm tên, mô tả và ghi nguồn ảnh.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Mô tả", 300)],
    lists: [{ key: "items", label: "Công cụ", addLabel: "Thêm công cụ", max: 8, fields: [img("image", "Ảnh", { required: true }), t("name", "Tên phần mềm", 60, { required: true }), ta("text", "Con làm gì với phần mềm này", 240), t("credit", "Nguồn ảnh", 120, { hint: "vd Ảnh: Autodesk Tinkercad" }), t("tag", "Nhãn (vd Năm 1 · 8–9 tuổi)", 40)] }],
    needs: "items",
  },
  split: {
    type: "split", label: "Ảnh + nội dung", desc: "Ảnh một bên, tiêu đề + nội dung + các ý ✓ một bên. Các khối liền nhau tự đổi bên.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 60), t("title", "Tiêu đề", 120, { required: true }), ta("body", "Nội dung", 800), img("image", "Ảnh", { required: true }), t("imageAlt", "Mô tả ảnh (alt)", 160), t("ctaLabel", "Chữ nút", 40), u("ctaUrl", "Liên kết nút")],
    lists: [{ key: "points", label: "Các ý (dấu ✓)", addLabel: "Thêm ý", max: 6, fields: [t("text", "Nội dung", 160, { required: true })] }],
  },
  teacher: {
    type: "teacher", label: "Giảng viên", desc: "Ảnh, tên, vai trò, kinh nghiệm, chứng chỉ (chỉ thông tin thật).",
    fields: [t("title", "Tiêu đề", 120, { required: true }), t("name", "Họ tên", 80, { required: true }), t("role", "Vai trò", 120), img("photo", "Ảnh chân dung"), ta("bio", "Giới thiệu", 600), ta("quote", "Triết lý / câu nói", 240), img("certImage", "Ảnh chứng chỉ"), t("certCaption", "Chú thích chứng chỉ", 160)],
    lists: [
      { key: "points", label: "Điểm nổi bật", addLabel: "Thêm điểm", max: 5, fields: [t("title", "Tiêu đề", 80, { required: true }), t("text", "Mô tả", 200)] },
      { key: "tags", label: "Đội tuyển / lĩnh vực (chip)", addLabel: "Thêm chip", max: 8, fields: [t("text", "Nội dung", 40, { required: true })] },
    ],
  },
  stats: {
    type: "stats", label: "Số liệu nổi bật", desc: "Dải 3–6 con số. Chỉ nhập số THẬT; để trống thì khối tự ẩn.",
    fields: [t("title", "Tiêu đề (tuỳ chọn)", 120)],
    lists: [{ key: "items", label: "Số liệu", addLabel: "Thêm số liệu", max: 6, fields: [t("value", "Con số", 20, { required: true, hint: "vd 1.200+, 4,9/5" }), t("label", "Nhãn", 60, { required: true })] }],
    needs: "items",
  },
  features: {
    type: "features", label: "Cam kết / lợi ích", desc: "Thẻ đánh số: vì sao phụ huynh chọn trung tâm.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300), img("image", "Ảnh lớn đầu lưới (tuỳ chọn)"), t("imageAlt", "Mô tả ảnh (alt)", 160)],
    lists: [{ key: "items", label: "Thẻ", addLabel: "Thêm thẻ", max: 8, fields: [t("title", "Tiêu đề thẻ", 100, { required: true }), ta("text", "Mô tả", 300), t("icon", "Biểu tượng", 20, { hint: "Biểu tượng (tuỳ chọn): man-hinh, nhom, mat, chuan, nha, ho-so, tia-sang, la-ban, code, cup, chia-se, ten-lua" })] }],
    needs: "items",
  },
  programs: {
    type: "programs", label: "Chương trình học", desc: "Thẻ chương trình / khoá học với mô tả, mức học phí và liên kết.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Chương trình", addLabel: "Thêm chương trình", max: 6, fields: [t("name", "Tên", 100, { required: true }), t("badge", "Nhãn nhỏ (vd Online · ClassIn)", 30), ta("text", "Mô tả", 400), t("meta", "Thông tin (độ tuổi, số buổi…)", 120), t("price", "Học phí", 60, { hint: "Chỉ ghi khi đã chốt giá" }), u("url", "Liên kết xem thêm"), t("linkLabel", "Chữ liên kết", 40), img("image", "Ảnh")] }],
    needs: "items",
  },
  testimonials: {
    type: "testimonials", label: "Phản hồi phụ huynh", desc: "Chỉ dùng phản hồi THẬT, đã được phụ huynh đồng ý đăng. Mỗi phản hồi một lần.",
    fields: [t("title", "Tiêu đề", 120, { required: true })],
    lists: [{ key: "items", label: "Phản hồi", addLabel: "Thêm phản hồi", max: 6, fields: [ta("quote", "Nội dung", 400, { required: true }), t("name", "Tên người nói (vd Chị Lan)", 80, { required: true }), t("meta", "Thêm (con học lớp, khu vực)", 80)] }],
    needs: "items",
  },
  cta: {
    type: "cta", label: "Dải kêu gọi", desc: "Băng màu giữa trang: lời mời + nút + vài ý tin cậy.",
    fields: [t("title", "Tiêu đề", 140, { required: true }), ta("text", "Mô tả", 300), t("primaryLabel", "Nút chính", 40, { required: true }), u("primaryUrl", "Liên kết nút chính", { required: true }), t("secondaryLabel", "Nút phụ", 40), u("secondaryUrl", "Liên kết nút phụ", { hint: "vd tel:0900000000 hoặc link Zalo" })],
    lists: [{ key: "points", label: "Ý tin cậy (có dấu ✓)", addLabel: "Thêm ý", max: 6, fields: [t("text", "Nội dung", 80, { required: true })] }],
  },
  steps: {
    type: "steps", label: "Các bước / quy trình", desc: "Ví dụ: Đăng ký → Học thử → Xếp lớp.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Bước", addLabel: "Thêm bước", max: 6, fields: [t("title", "Tên bước", 80, { required: true }), ta("text", "Mô tả", 240), t("icon", "Biểu tượng", 20, { hint: "Biểu tượng (tuỳ chọn): man-hinh, nhom, mat, chuan, nha, ho-so, tia-sang, la-ban, code, cup, chia-se, ten-lua" })] }],
    needs: "items",
  },
  timeline: {
    type: "timeline", label: "Lịch / mốc thời gian", desc: "Lịch khai giảng, vòng thi, sự kiện.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Mốc", addLabel: "Thêm mốc", max: 10, fields: [t("when", "Thời gian", 60, { required: true }), t("what", "Nội dung", 160, { required: true }), t("where", "Địa điểm", 100)] }],
    needs: "items",
  },
  gallery: {
    type: "gallery", label: "Thư viện ảnh", desc: "Ảnh lớp học, sản phẩm của bé (chỉ ảnh đã được phụ huynh đồng ý).",
    fields: [t("title", "Tiêu đề", 120, { required: true })],
    lists: [{ key: "items", label: "Ảnh", addLabel: "Thêm ảnh", max: 8, fields: [img("image", "Ảnh", { required: true }), t("tag", "Nhãn nhỏ (vd chuyên ngành)", 30), t("caption", "Chú thích", 120), t("credit", "Nguồn / giấy phép ảnh", 120, { hint: "vd Ảnh: Wikimedia Commons / Zio27, CC0" }), u("creditUrl", "Liên kết nguồn ảnh")] }],
    needs: "items",
  },
  faq: {
    type: "faq", label: "Câu hỏi thường gặp", desc: "Trả lời trước những băn khoăn của phụ huynh.",
    fields: [t("title", "Tiêu đề", 120, { required: true })],
    lists: [{ key: "items", label: "Câu hỏi", addLabel: "Thêm câu hỏi", max: 12, fields: [t("q", "Câu hỏi", 200, { required: true }), ta("a", "Trả lời", 800, { required: true })] }],
    needs: "items",
  },
  form: {
    type: "form", label: "Form đăng ký học thử", desc: "Form gửi thẳng vào CRM (lead), tự gắn nguồn UTM của chiến dịch.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("subtitle", "Mô tả", 300), t("thankYou", "Lời cảm ơn sau khi gửi", 300)],
    lists: [],
  },
  text: {
    type: "text", label: "Đoạn chữ tự do", desc: "Tiêu đề + nội dung (hỗ trợ **đậm**, danh sách “- ”, tiêu đề “## ”) + ảnh.",
    fields: [t("title", "Tiêu đề", 120), ta("body", "Nội dung", 5000, { required: true }), img("image", "Ảnh")],
    lists: [],
  },
  insights: {
    type: "insights", label: "Số liệu có nguồn (nỗi lo / bối cảnh)",
    desc: "3–6 con số kèm nguồn trích dẫn (báo, khảo sát, văn bản). Chỉ dùng số liệu đã kiểm chứng và ghi rõ nguồn. Kiểu “toi” = nền navy để nhấn mạnh.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề", 140, { required: true }), ta("intro", "Mô tả", 400), ta("closing", "Câu chốt dưới các con số", 400), t("tone", "Kiểu nền", 10, { hint: "toi = nền navy · để trống = nền sáng" })],
    lists: [{ key: "items", label: "Số liệu", addLabel: "Thêm số liệu", max: 6, fields: [t("value", "Con số", 20, { required: true }), t("label", "Ý nghĩa con số", 140, { required: true }), ta("text", "Giải thích thêm", 280), t("source", "Nguồn (tên báo / tổ chức, ngày)", 120, { required: true }), u("sourceUrl", "Liên kết nguồn")] }],
    needs: "items",
  },
  contrast: {
    type: "contrast", label: "So sánh hai lựa chọn", desc: "Hai cột đối lập (vd Dùng công nghệ ↔ Tạo ra công nghệ). Cột phải là lựa chọn trung tâm mang lại.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề", 140, { required: true }), ta("intro", "Mô tả", 400), t("leftTitle", "Tiêu đề cột trái", 80, { required: true }), t("rightTitle", "Tiêu đề cột phải", 80, { required: true }), ta("note", "Ghi chú dưới hai cột", 300), img("image", "Ảnh minh hoạ (rộng)"), t("imageAlt", "Mô tả ảnh (alt)", 160)],
    lists: [
      { key: "left", label: "Cột trái", addLabel: "Thêm ý", max: 6, fields: [t("text", "Nội dung", 120, { required: true })] },
      { key: "right", label: "Cột phải", addLabel: "Thêm ý", max: 6, fields: [t("text", "Nội dung", 120, { required: true })] },
    ],
    needs: "right",
  },
  tracks: {
    type: "tracks", label: "Chuyên ngành (thẻ chuyển tab)",
    desc: "Mỗi chuyên ngành một tab: dành cho bạn nhỏ nào, con làm gì, con làm được gì, phần mềm. Mã tab dùng cho đường dẫn ?nganh=<mã> (chạy quảng cáo): mở sẵn tab, đổi tiêu đề lớn, chọn sẵn chuyên ngành trong form.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề", 140, { required: true }), ta("intro", "Mô tả", 400), t("ctaLabel", "Chữ liên kết cuối khối", 60), u("ctaUrl", "Liên kết cuối khối")],
    lists: [{ key: "items", label: "Chuyên ngành", addLabel: "Thêm chuyên ngành", max: 6, fields: [
      t("key", "Mã tab (vd robotics)", 20, { required: true, hint: "chữ thường không dấu, gạch ngang" }), t("tab", "Chữ trên tab", 30, { required: true }), t("name", "Tên chuyên ngành", 80, { required: true }),
      t("ages", "Độ tuổi / cấp học", 80), t("hook", "Dành cho bạn nhỏ nào", 160), ta("text", "Con học gì", 500), ta("outcomes", "Con làm được (mỗi dòng một ý)", 500),
      t("tools", "Phần mềm / luyện thi", 200), img("image", "Ảnh"), t("imageAlt", "Mô tả ảnh (alt)", 160), t("credit", "Nguồn ảnh", 120), u("creditUrl", "Liên kết nguồn ảnh"),
      t("headline", "Tiêu đề lớn khi vào bằng ?nganh=", 120), t("interest", "Chuyên ngành chọn sẵn trong form", 60),
      t("icon", "Biểu tượng trên thẻ chọn", 20, { hint: "robot, ai, co-ve, code, ten-lua… — để trống: tự chọn theo mã tab" }),
    ] }],
    needs: "items",
  },
  change: {
    type: "change", label: "Con thay đổi thế nào (trước → sau)", desc: "Các tiêu chí đánh giá với mô tả trước khi học và sau năm học. Chỉ ghi điều chương trình hướng tới, không hứa kết quả.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề", 140, { required: true }), ta("intro", "Mô tả", 400), t("beforeLabel", "Nhãn cột trước", 40), t("afterLabel", "Nhãn cột sau", 40), ta("note", "Ghi chú", 300), img("image", "Ảnh minh hoạ"), t("imageAlt", "Mô tả ảnh (alt)", 160)],
    lists: [{ key: "items", label: "Tiêu chí", addLabel: "Thêm tiêu chí", max: 9, fields: [t("area", "Tiêu chí", 60, { required: true }), t("before", "Trước khi học", 140, { required: true }), t("after", "Sau năm học", 160, { required: true })] }],
    needs: "items",
  },
  trial: {
    type: "trial", label: "Giá trị buổi học trải nghiệm",
    desc: "Các bước của buổi trải nghiệm (bố mẹ đăng ký → hẹn lịch → con học cùng thầy → thầy đánh giá, định hướng) và những gì gia đình nhận được, kèm nút đặt lịch. Chỉ ghi điều trung tâm làm thật; không so sánh giá ảo.",
    fields: [
      t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề", 140, { required: true, hint: "Đặt *cụm từ* trong dấu sao để tô màu nhấn" }), ta("intro", "Mô tả", 400),
      t("gainsTitle", "Tiêu đề phần “bố mẹ nhận được”", 80), t("badge", "Dòng nổi bật (vd không mất phí)", 80), ta("note", "Ghi chú nhỏ dưới nút", 240),
      t("primaryLabel", "Nút chính", 40, { required: true }), u("primaryUrl", "Liên kết nút chính", { required: true }),
      t("secondaryLabel", "Nút phụ", 40), u("secondaryUrl", "Liên kết nút phụ", { hint: "vd tel:0900000000" }),
    ],
    lists: [
      { key: "steps", label: "Các bước", addLabel: "Thêm bước", max: 5, fields: [t("who", "Ai làm (vd Bố mẹ)", 30), t("title", "Tên bước", 60, { required: true }), ta("text", "Mô tả", 220)] },
      { key: "gains", label: "Gia đình nhận được", addLabel: "Thêm ý", max: 6, fields: [t("title", "Tiêu đề", 70, { required: true }), ta("text", "Mô tả", 200), t("icon", "Biểu tượng", 20, { hint: "man-hinh, nhom, mat, chuan, nha, ho-so, tia-sang, la-ban, code, cup, chia-se, ten-lua" })] },
    ],
    needs: "steps",
  },
  footer: {
    type: "footer", label: "Chân trang", single: true, fixed: "bottom",
    desc: "Địa chỉ cơ sở, liên hệ, liên kết chính sách, thông tin pháp lý.",
    fields: [ta("tagline", "Câu giới thiệu ngắn", 200), t("email", "Email", 120), t("phone", "Điện thoại", 24), ta("legal", "Thông tin pháp lý", 400), t("copyright", "Dòng bản quyền", 120)],
    lists: [
      { key: "addresses", label: "Cơ sở", addLabel: "Thêm cơ sở", max: 4, fields: [t("label", "Tên cơ sở", 60, { required: true }), t("text", "Địa chỉ", 200, { required: true })] },
      { key: "links", label: "Liên kết", addLabel: "Thêm liên kết", max: 12, fields: [t("label", "Tên", 40, { required: true }), u("href", "Liên kết", { required: true })] },
    ],
  },
};

/* ------------------------------------------------------------------ */

export interface LandingSection {
  id: string;
  type: SectionType;
  enabled: boolean;
  data: Record<string, string>;
  lists: Record<string, Record<string, string>[]>;
}
export interface LandingDoc { sections: LandingSection[] }

export const LANDING_VARIANTS = ["classic", "soft", "bold", "studio", "vivid"] as const;
export type LandingVariant = (typeof LANDING_VARIANTS)[number];
export const VARIANT_LABEL: Record<LandingVariant, string> = { classic: "Cổ điển — nền sáng, thẻ bo tròn", soft: "Dịu — nền kem, nhiều khoảng trắng", bold: "Nổi bật — băng màu đậm, chữ lớn", studio: "Studio — chữ lớn, nhiều khoảng trắng, ảnh thật", vivid: "Sắc màu — trang chính: màu thương hiệu đậm, thẻ chuyên ngành, ảnh sản phẩm thật (DESIGN.md)" };

export const MAX_SECTIONS = 40;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const HOME_SLUG = "trang-chu";

export function validSlug(slug: string): string | null {
  if (slug.length < 2 || slug.length > 60) return "Đường dẫn dài 2–60 ký tự";
  if (!SLUG_RE.test(slug)) return "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang";
  return null;
}

/** Liên kết được phép: https, đường dẫn nội bộ, #mốc, tel:, mailto: — không javascript:, data: … */
export function validUrl(v: string): boolean {
  return /^(https:\/\/|\/|#|tel:|mailto:)[^\s"'<>\\]*$/.test(v) && !/^\/\//.test(v);
}
export function validImage(v: string): boolean {
  // Thư viện ảnh website, ảnh đi kèm ứng dụng (apps/web/public: anh-site, lp-anh, thsteam), hoặc https
  return /^(\/api\/public\/site-media\/[A-Za-z0-9._-]+|\/(anh-site|lp-anh|lp-anh\/that|thsteam)\/[a-z0-9-]+\.(svg|png|jpg|webp)|https:\/\/[^\s"'<>\\]+)$/.test(v);
}

export function fieldsOf(def: SectionDef, listKey: string): LField[] {
  return def.lists.find((l) => l.key === listKey)?.fields ?? [];
}

export const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

function newId(type: string, n: number): string { return `${type}-${n}`; }

/**
 * Đọc dữ liệu lưu (hoặc do người dùng gửi) thành LandingDoc hợp lệ về hình dạng:
 * bỏ khối lạ, cắt chuỗi / danh sách theo giới hạn, mỗi khối `single` chỉ giữ cái đầu,
 * đầu trang luôn ở đầu, chân trang luôn ở cuối. KHÔNG kiểm đủ nội dung — việc đó của `validateLanding`.
 */
export function normalizeLanding(raw: unknown): LandingDoc {
  const arr = raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections) ? ((raw as { sections: unknown[] }).sections) : [];
  const seenSingle = new Set<string>();
  const seenId = new Set<string>();
  const out: LandingSection[] = [];
  let n = 0;
  for (const r of arr) {
    if (out.length >= MAX_SECTIONS) break;
    if (!r || typeof r !== "object") continue;
    const s = r as Record<string, unknown>;
    const type = s.type as SectionType;
    const def = SECTION_DEFS[type];
    if (!def) continue;
    if (def.single) { if (seenSingle.has(type)) continue; seenSingle.add(type); }
    n += 1;
    let id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : newId(type, n);
    while (seenId.has(id)) { n += 1; id = newId(type, n); }
    seenId.add(id);
    const dataIn = s.data && typeof s.data === "object" ? (s.data as Record<string, unknown>) : {};
    const data: Record<string, string> = {};
    for (const f of def.fields) data[f.key] = cleanText(dataIn[f.key], f.max);
    const listsIn = s.lists && typeof s.lists === "object" ? (s.lists as Record<string, unknown>) : {};
    const lists: Record<string, Record<string, string>[]> = {};
    for (const l of def.lists) {
      const rows = Array.isArray(listsIn[l.key]) ? (listsIn[l.key] as unknown[]) : [];
      lists[l.key] = rows.slice(0, l.max).filter((x) => x && typeof x === "object").map((x) => {
        const row: Record<string, string> = {};
        for (const f of l.fields) row[f.key] = cleanText((x as Record<string, unknown>)[f.key], f.max);
        return row;
      });
    }
    out.push({ id, type, enabled: s.enabled !== false, data, lists });
  }
  const top = out.filter((s) => SECTION_DEFS[s.type].fixed === "top");
  const bottom = out.filter((s) => SECTION_DEFS[s.type].fixed === "bottom");
  const mid = out.filter((s) => !SECTION_DEFS[s.type].fixed);
  return { sections: [...top, ...mid, ...bottom] };
}

/** Khối có được hiển thị không: đang bật và (nếu cần danh sách) danh sách có ít nhất một dòng đủ trường bắt buộc */
export function sectionVisible(s: LandingSection): boolean {
  if (!s.enabled) return false;
  const def = SECTION_DEFS[s.type];
  if (def.needs) return rowsOf(s, def.needs).length > 0;
  return true;
}

/** Các dòng của một danh sách đã đủ trường bắt buộc (dòng thiếu trường bắt buộc bị bỏ khi hiển thị) */
export function rowsOf(s: LandingSection, listKey: string): Record<string, string>[] {
  const def = SECTION_DEFS[s.type];
  const l = def.lists.find((x) => x.key === listKey);
  if (!l) return [];
  return (s.lists[listKey] ?? []).filter((row) => l.fields.every((f) => !f.required || (row[f.key] ?? "").trim() !== ""));
}

const PLACEHOLDER_RE = /(^|[^\d.,])0(\.0{3})+(?!\d)|lorem ipsum|\bxxx+\b|\btodo\b|\bđang cập nhật\b|\[demo\]/i;
const ZERO_STAT_RE = /^\s*0\s*[+%]?\s*$/;

export interface LandingCheck { errors: string[]; warnings: string[] }

/**
 * Kiểm đủ để XUẤT BẢN. `errors` chặn xuất bản; `warnings` chỉ nhắc (vd số liệu còn là 0, chữ giữ chỗ).
 * Lưu nháp thì không cần qua kiểm tra này.
 */
export function validateLanding(doc: LandingDoc, meta: { title: string; slug: string }): LandingCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slugErr = validSlug(meta.slug);
  if (slugErr) errors.push(slugErr);
  if (meta.title.trim().length < 3) errors.push("Tên trang tối thiểu 3 ký tự");
  const visible = doc.sections.filter(sectionVisible);
  if (!visible.some((s) => s.type === "hero" || s.type === "leadHero")) errors.push("Cần bật khối Mở đầu (Hero)");
  if (!visible.some((s) => s.type === "form" || s.type === "hero" || s.type === "leadHero" || s.type === "cta" || s.type === "trial")) errors.push("Trang cần có form hoặc nút kêu gọi để phụ huynh đăng ký");
  if (visible.some((s) => s.type === "hero") && visible.some((s) => s.type === "leadHero")) warnings.push("Trang có cả Mở đầu (Hero) và Mở đầu + form — chỉ nên giữ một tiêu đề lớn (H1)");

  for (const s of doc.sections) {
    if (!s.enabled) continue;
    const def = SECTION_DEFS[s.type];
    const where = def.label;
    for (const f of def.fields) checkField(f, s.data[f.key] ?? "", where, errors);
    for (const l of def.lists) {
      const rows = s.lists[l.key] ?? [];
      rows.forEach((row, i) => {
        const filled = l.fields.some((f) => (row[f.key] ?? "") !== "");
        if (!filled) return;
        for (const f of l.fields) checkField(f, row[f.key] ?? "", `${where} › ${l.label} #${i + 1}`, errors);
      });
    }
    if (def.needs && rowsOf(s, def.needs).length === 0) warnings.push(`${where}: chưa có dòng nào đủ nội dung — khối sẽ tự ẩn khi hiển thị`);

    // Cảnh báo chữ giữ chỗ / số liệu 0
    const texts: string[] = [...Object.values(s.data), ...Object.values(s.lists).flatMap((rows) => rows.flatMap((r) => Object.values(r)))];
    if (texts.some((x) => PLACEHOLDER_RE.test(x))) warnings.push(`${where}: còn chữ giữ chỗ (vd [DEMO], 0.000.000đ, “đang cập nhật”, lorem) — nên thay bằng nội dung thật`);
    if (s.type === "stats" && rowsOf(s, "items").some((r) => ZERO_STAT_RE.test(r.value ?? ""))) warnings.push(`${where}: có con số là 0 — hãy nhập số thật hoặc xoá dòng đó`);
  }
  return { errors, warnings };
}

function checkField(f: LField, v: string, where: string, errors: string[]) {
  if (f.required && !v) { errors.push(`${where}: “${f.label}” bắt buộc`); return; }
  if (!v) return;
  if (f.type === "url" && !validUrl(v)) errors.push(`${where}: “${f.label}” phải là https://, đường dẫn /…, #mốc, tel: hoặc mailto:`);
  if (f.type === "image" && !validImage(v)) errors.push(`${where}: “${f.label}” — ảnh phải tải lên từ thư viện ảnh website hoặc là https://`);
}

/** Tạo khối mới rỗng theo định nghĩa (dùng ở màn quản trị) */
export function emptySection(type: SectionType, id: string): LandingSection {
  const def = SECTION_DEFS[type];
  return {
    id, type, enabled: true,
    data: Object.fromEntries(def.fields.map((f) => [f.key, ""])),
    lists: Object.fromEntries(def.lists.map((l) => [l.key, [] as Record<string, string>[]])),
  };
}

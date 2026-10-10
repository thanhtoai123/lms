/**
 * NỘI DUNG DEMO CỦA KHUNG WEBSITE — trang con có sẵn để xem bố cục và dùng làm chỗ bắt đầu.
 *
 * Mọi tiêu đề khối bắt đầu bằng "[DEMO]": khi Xuất bản, hệ thống nhắc "còn chữ giữ chỗ" cho từng khối cho tới khi
 * anh thay bằng nội dung thật (xoá chữ [DEMO]). Không có con số thành tích, giá, hay lời của phụ huynh trong nội dung demo.
 * Đầu / chân trang lấy từ khung chung (chrome.ts) khi hiển thị, nên không cần sửa ở từng trang.
 */
import { emptySection, type LandingDoc, type LandingSection, type LandingVariant, type SectionType } from "../landing/model.js";
import { applyChrome, DEFAULT_CHROME } from "./chrome.js";

type Row = Record<string, string>;
function sec(type: SectionType, id: string, data: Row = {}, lists: Record<string, Row[]> = {}, enabled = true): LandingSection {
  const s = emptySection(type, id);
  return { ...s, enabled, data: { ...s.data, ...data }, lists: { ...s.lists, ...lists } };
}

export interface SiteDemoPage {
  slug: string;
  title: string;
  /** Khoá mẫu dùng ở danh sách "tạo trang" */
  template: string;
  /** Tên hiển thị của mẫu */
  label: string;
  desc: string;
  variant: LandingVariant;
  seoTitle: string;
  seoDescription: string;
  build(): LandingDoc;
}

const page = (middle: LandingSection[]): LandingDoc => applyChrome({ sections: middle }, DEFAULT_CHROME);

const CTA = (title: string) => sec("cta", "cta", { title, text: "Điền form để trung tâm gọi lại tư vấn trong giờ làm việc.", primaryLabel: "Đặt buổi học thử", primaryUrl: "/dang-ky", secondaryLabel: "Gọi hotline", secondaryUrl: "tel:0837312860" }, { points: [{ text: "Miễn phí" }, { text: "Không ràng buộc" }, { text: "Giáo viên tư vấn trực tiếp" }] });

/* --------------------------- Giới thiệu --------------------------- */
const about: SiteDemoPage = {
  slug: "gioi-thieu", title: "Giới thiệu", template: "site-gioi-thieu", label: "Giới thiệu", variant: "classic",
  desc: "Câu chuyện, giá trị, hành trình và đội ngũ của trung tâm.",
  seoTitle: "Giới thiệu — Sata Robo", seoDescription: "Câu chuyện, giá trị và phương pháp học lập trình robot của Sata Robo tại Đà Nẵng.",
  build: () => page([
    sec("hero", "hero", {
      eyebrow: "Về chúng tôi", title: "[DEMO] Về Sata Robo",
      subtitle: "Đoạn mở đầu giới thiệu ngắn gọn trung tâm là ai, dạy gì, dành cho ai. Thay bằng câu chuyện thật của trung tâm.",
      primaryLabel: "Đặt buổi học thử", primaryUrl: "/dang-ky", secondaryLabel: "Xem các khoá học", secondaryUrl: "/khoa-hoc",
    }, { badges: [] }),
    sec("text", "story", {
      title: "[DEMO] Câu chuyện của chúng tôi",
      body: "Viết 2–3 đoạn ngắn: vì sao thành lập trung tâm, trung tâm tin vào điều gì, điều gì khác biệt.\n\n**Gợi ý:** kể bằng giọng gần gũi với phụ huynh, tránh liệt kê dài.\n\n- Ý thứ nhất\n- Ý thứ hai\n- Ý thứ ba",
    }),
    sec("features", "values", { title: "[DEMO] Giá trị cốt lõi", intro: "Ba điều trung tâm giữ vững trong mọi lớp học." }, {
      items: [
        { title: "Học qua làm", text: "Nội dung mẫu: mỗi bé tự tay làm ra sản phẩm sau buổi học." },
        { title: "Lớp nhỏ, kèm sát", text: "Nội dung mẫu: giáo viên theo dõi từng bé để không ai bị bỏ lại." },
        { title: "Phụ huynh đồng hành", text: "Nội dung mẫu: phụ huynh nhận nhận xét và theo dõi tiến bộ của con." },
      ],
    }),
    sec("timeline", "journey", { title: "[DEMO] Hành trình phát triển", intro: "Các mốc chính của trung tâm (điền năm và sự kiện thật)." }, {
      items: [
        { when: "[DEMO] Năm", what: "Mốc thứ nhất của trung tâm", where: "" },
        { when: "[DEMO] Năm", what: "Mốc thứ hai của trung tâm", where: "" },
        { when: "[DEMO] Năm", what: "Mốc thứ ba của trung tâm", where: "" },
      ],
    }),
    sec("gallery", "gallery", { title: "[DEMO] Hình ảnh lớp học" }, { items: [] }, false),
    sec("testimonials", "testimonials", { title: "[DEMO] Phụ huynh nói gì" }, { items: [] }, false),
    CTA("[DEMO] Mời ba mẹ đến trải nghiệm một buổi học"),
  ]),
};

/* --------------------------- Khoá học (danh sách) --------------------------- */
const courses: SiteDemoPage = {
  slug: "khoa-hoc", title: "Khoá học", template: "site-khoa-hoc", label: "Danh sách khoá học", variant: "classic",
  desc: "Tổng hợp các khoá học, mỗi khoá dẫn sang trang chi tiết.",
  seoTitle: "Khoá học lập trình robot cho bé — Sata Robo", seoDescription: "Các khoá học lập trình robot, luyện thi RoboSim và học online của Sata Robo.",
  build: () => page([
    sec("hero", "hero", {
      eyebrow: "Khoá học", title: "[DEMO] Các khoá học của Sata Robo",
      subtitle: "Mô tả ngắn cách trung tâm chia khoá học (theo lớp, theo mục tiêu) để phụ huynh chọn nhanh.",
      primaryLabel: "Đặt buổi học thử", primaryUrl: "/dang-ky", secondaryLabel: "", secondaryUrl: "",
    }, { badges: [] }),
    sec("programs", "programs", { title: "[DEMO] Chọn khoá học cho con", intro: "Mỗi thẻ dẫn tới trang chi tiết riêng. Thêm / bớt khoá ở khối này." }, {
      items: [
        { name: "Lập trình Robot", badge: "Tại trung tâm", text: "Nội dung mẫu: lắp ráp và lập trình robot theo lộ trình từng cấp độ.", meta: "Độ tuổi / lớp: điền thông tin", price: "", url: "/khoa-hoc/lap-trinh-robot", linkLabel: "Xem chi tiết", image: "" },
        { name: "Luyện thi RoboSim", badge: "Luyện thi", text: "Nội dung mẫu: ôn luyện theo thể lệ cuộc thi, thực hành mô phỏng trên máy tính.", meta: "Độ tuổi / lớp: điền thông tin", price: "", url: "/khoa-hoc/luyen-thi-robosim", linkLabel: "Xem chi tiết", image: "" },
        { name: "Học online", badge: "Online", text: "Nội dung mẫu: học từ xa linh hoạt, có giáo viên hướng dẫn.", meta: "Độ tuổi / lớp: điền thông tin", price: "", url: "/khoa-hoc/hoc-online", linkLabel: "Xem chi tiết", image: "" },
      ],
    }),
    sec("steps", "how", { title: "[DEMO] Chọn khoá học thế nào?", intro: "" }, {
      items: [
        { title: "Học thử", text: "Bé học thử cùng giáo viên để biết mình hợp khoá nào." },
        { title: "Tư vấn lộ trình", text: "Giáo viên gợi ý khoá và cấp độ phù hợp." },
        { title: "Chọn lịch học", text: "Gia đình chọn cơ sở và khung giờ thuận tiện." },
      ],
    }),
    sec("faq", "faq", { title: "[DEMO] Câu hỏi về khoá học" }, {
      items: [
        { q: "Bé nên học khoá nào trước?", a: "Nội dung mẫu: giáo viên sẽ tư vấn sau buổi học thử dựa trên độ tuổi và nền tảng của bé." },
        { q: "Học phí các khoá ra sao?", a: "Nội dung mẫu: trung tâm gửi bảng học phí chi tiết khi tư vấn. Thay bằng chính sách học phí thật." },
      ],
    }),
    CTA("[DEMO] Chưa biết chọn khoá nào? Học thử trước"),
  ]),
};

/* --------------------------- Chi tiết khoá học --------------------------- */
function course(slug: string, name: string, badge: string, templateKey: string, label: string): SiteDemoPage {
  return {
    slug, title: name, template: templateKey, label, variant: "classic",
    desc: "Trang chi tiết một khoá học: mô tả, kết quả đạt được, lộ trình, hỏi đáp.",
    seoTitle: `${name} — Sata Robo`, seoDescription: `Chi tiết khoá ${name} tại Sata Robo: nội dung, lộ trình và cách đăng ký học thử.`,
    build: () => page([
      sec("hero", "hero", {
        eyebrow: `Khoá học · ${badge}`, title: `[DEMO] ${name}`,
        subtitle: "Một đến hai câu nói khoá học này dành cho ai và giúp bé đạt được gì. Thay bằng mô tả thật.",
        primaryLabel: "Đặt học thử", primaryUrl: "/dang-ky", secondaryLabel: "Xem các khoá khác", secondaryUrl: "/khoa-hoc",
      }, { badges: [{ text: "Độ tuổi / lớp: điền thông tin" }, { text: "Thời lượng: điền thông tin" }, { text: "Hình thức: điền thông tin" }] }),
      sec("features", "outcomes", { title: "[DEMO] Con học được gì", intro: "Các kết quả cụ thể bé đạt được sau khoá học." }, {
        items: [
          { title: "Kết quả thứ nhất", text: "Nội dung mẫu: mô tả một kỹ năng hoặc sản phẩm cụ thể." },
          { title: "Kết quả thứ hai", text: "Nội dung mẫu: mô tả một kỹ năng hoặc sản phẩm cụ thể." },
          { title: "Kết quả thứ ba", text: "Nội dung mẫu: mô tả một kỹ năng hoặc sản phẩm cụ thể." },
          { title: "Kết quả thứ tư", text: "Nội dung mẫu: mô tả một kỹ năng hoặc sản phẩm cụ thể." },
        ],
      }),
      sec("steps", "path", { title: "[DEMO] Lộ trình học", intro: "Các giai đoạn của khoá, từ làm quen đến hoàn thành sản phẩm." }, {
        items: [
          { title: "Giai đoạn 1", text: "Nội dung mẫu: làm quen và nắm kiến thức nền." },
          { title: "Giai đoạn 2", text: "Nội dung mẫu: thực hành và làm dự án nhỏ." },
          { title: "Giai đoạn 3", text: "Nội dung mẫu: hoàn thiện sản phẩm và trình bày." },
        ],
      }),
      sec("stats", "stats", { title: "" }, { items: [] }, false),
      sec("faq", "faq", { title: "[DEMO] Hỏi đáp về khoá học" }, {
        items: [
          { q: "Khoá học này phù hợp với bé nào?", a: "Nội dung mẫu: nêu độ tuổi, lớp và nền tảng cần có." },
          { q: "Mỗi buổi học diễn ra thế nào?", a: "Nội dung mẫu: mô tả một buổi học điển hình." },
          { q: "Học phí và lịch khai giảng?", a: "Nội dung mẫu: trung tâm gửi bảng học phí và lịch khai giảng khi tư vấn." },
        ],
      }),
      CTA("[DEMO] Cho con học thử khoá này"),
    ]),
  };
}
const courseRobot = course("khoa-hoc-lap-trinh-robot", "Lập trình Robot", "Tại trung tâm", "site-khoa-hoc-chi-tiet", "Chi tiết một khoá học");
const courseRobosim = course("khoa-hoc-luyen-thi-robosim", "Luyện thi RoboSim", "Luyện thi", "site-khoa-hoc-chi-tiet", "Chi tiết một khoá học");
const courseOnline = course("khoa-hoc-hoc-online", "Học online", "Online", "site-khoa-hoc-chi-tiet", "Chi tiết một khoá học");

/* --------------------------- Liên hệ --------------------------- */
const contact: SiteDemoPage = {
  slug: "lien-he", title: "Liên hệ", template: "site-lien-he", label: "Liên hệ", variant: "classic",
  desc: "Cách liên hệ, giờ làm việc và form để lại thông tin.",
  seoTitle: "Liên hệ — Sata Robo", seoDescription: "Địa chỉ cơ sở, hotline và form để lại thông tin để được Sata Robo tư vấn.",
  build: () => page([
    sec("hero", "hero", {
      eyebrow: "Liên hệ", title: "[DEMO] Liên hệ với Sata Robo",
      subtitle: "Gọi hotline, nhắn Zalo hoặc để lại thông tin — trung tâm phản hồi trong giờ làm việc.",
      primaryLabel: "Gọi 0837 312 860", primaryUrl: "tel:0837312860", secondaryLabel: "", secondaryUrl: "",
    }, { badges: [] }),
    sec("text", "visit", {
      title: "[DEMO] Đến trung tâm",
      body: "Địa chỉ các cơ sở nằm ở chân trang. Viết thêm hướng dẫn đường đi, chỗ gửi xe, mốc dễ nhận biết.\n\n**Giờ làm việc:** [DEMO] điền giờ làm việc thật.\n\n**Bản đồ:** dán liên kết bản đồ vào đây.",
    }),
    sec("form", "form", { title: "Để lại thông tin", subtitle: "Trung tâm sẽ gọi lại tư vấn trong giờ làm việc.", thankYou: "Cảm ơn ba mẹ! Trung tâm sẽ gọi lại trong giờ làm việc." }),
    sec("faq", "faq", { title: "[DEMO] Câu hỏi thường gặp" }, {
      items: [
        { q: "Bao lâu thì trung tâm phản hồi?", a: "Nội dung mẫu: nêu thời gian phản hồi thật của trung tâm." },
        { q: "Có thể đến tham quan trước không?", a: "Nội dung mẫu: nêu cách hẹn lịch tham quan." },
      ],
    }),
  ]),
};

/* --------------------------- Chính sách --------------------------- */
function policy(slug: string, title: string, label: string, topic: string): SiteDemoPage {
  const body = [
    `**[DEMO] Văn bản mẫu — thay bằng ${topic} đã được người có thẩm quyền duyệt.**`,
    "",
    "## 1. Phạm vi áp dụng",
    "Nêu văn bản này áp dụng cho ai, trong trường hợp nào.",
    "",
    "## 2. Nội dung chính",
    "- Điểm thứ nhất",
    "- Điểm thứ hai",
    "- Điểm thứ ba",
    "",
    "## 3. Quyền và trách nhiệm",
    "Nêu quyền và trách nhiệm của phụ huynh / học viên và của trung tâm.",
    "",
    "## 4. Liên hệ",
    "Nêu cách liên hệ khi có thắc mắc hoặc khiếu nại.",
  ].join("\n");
  return {
    slug, title, template: "site-chinh-sach", label, variant: "classic",
    desc: "Trang văn bản chính sách: bảo mật, điều khoản…",
    seoTitle: `${title} — Sata Robo`, seoDescription: `${title} của Sata Robo.`,
    build: () => page([
      sec("hero", "hero", { eyebrow: "Chính sách", title: `[DEMO] ${title}`, subtitle: "Cập nhật lần cuối: điền ngày.", primaryLabel: "Về trang chủ", primaryUrl: "/", secondaryLabel: "", secondaryUrl: "" }, { badges: [] }),
      sec("text", "body", { title: "", body }),
    ]),
  };
}
const privacy = policy("chinh-sach-bao-mat", "Chính sách bảo mật", "Chính sách / điều khoản", "chính sách bảo mật");
const terms = policy("chinh-sach-dieu-khoan", "Điều khoản sử dụng", "Chính sách / điều khoản", "điều khoản sử dụng");

/** Các trang demo của khung website, đúng thứ tự sơ đồ */
export const SITE_DEMO_PAGES: readonly SiteDemoPage[] = [about, courses, courseRobot, courseRobosim, courseOnline, contact, privacy, terms];

/** Mẫu tạo trang mới trong khu quản trị (mỗi loại một mẫu): trang con của website */
export const SITE_TEMPLATES: readonly SiteDemoPage[] = [
  { ...about, slug: "", title: "", template: "site-gioi-thieu" },
  { ...courseRobot, slug: "", title: "", template: "site-khoa-hoc-chi-tiet", label: "Trang chi tiết một khoá học" },
  { ...privacy, slug: "", title: "", template: "site-chinh-sach", label: "Trang chính sách / văn bản" },
];

export const siteDemoBySlug = (slug: string): SiteDemoPage | null => SITE_DEMO_PAGES.find((p) => p.slug === slug) ?? null;
export const siteTemplateByKey = (key: string): SiteDemoPage | null => SITE_TEMPLATES.find((t) => t.template === key) ?? null;

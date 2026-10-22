/**
 * CÁC TRANG CON CỦA WEBSITE TH STEAM ACADEMY — Giới thiệu, Chương trình học, 4 trang chuyên ngành, Liên hệ, 2 trang chính sách.
 *
 * Nội dung THẬT, dựng từ danh mục chương trình chuẩn (curriculum/thsteam.ts) và bộ nhận diện (system/th-brand.ts) qua
 * site/thsteam-content.ts — đổi chương trình / học phí ở danh mục thì dựng lại trang là khớp.
 * Riêng "Chính sách bảo mật" là BẢN NHÁP (có chữ "[DEMO]"): hệ thống nhắc khi xuất bản cho tới khi người có thẩm quyền duyệt.
 * Không có số thành tích, lời phụ huynh hay ảnh trẻ em thật; ảnh là minh hoạ vector đi kèm ứng dụng.
 * Đầu / chân trang lấy từ khung chung (chrome.ts) khi hiển thị, nên không cần sửa ở từng trang.
 *
 * Tên xuất `SITE_DEMO_PAGES` giữ nguyên để màn quản trị "tạo trang còn thiếu" và lệnh `pnpm db:seed-site` dùng tiếp.
 */
import { emptySection, type LandingDoc, type LandingSection, type LandingVariant, type SectionType } from "../landing/model.js";
import { applyChrome, DEFAULT_CHROME } from "./chrome.js";
import { TH_BRAND } from "../system/th-brand.js";
import { TH_DELIVERY, TH_PRICING, TH_TRACKS, TH_LEVEL_VI, ageRange, programSummary, thProgramsOfTrack, examCourseName, type ThTrack } from "../curriculum/thsteam.js";
import {
  TH_ART, TH_TRACK_PAGE, COMMON_FAQ, COMPETENCY_ITEMS, MODULE_STEPS, PARENT_ITEMS, PREPARE_TEXT, REPORT_STEPS, SESSION_STEPS, TEACHER, VIRTUE_TEXT,
  clip, overviewLines, priceCards, programAnchor, programLabel, programMarkdown, telHref, termsMarkdown, trackAges, trackCards, trackLevels, trackYears, vnd,
} from "./thsteam-content.js";

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
const B = TH_BRAND.name;

const CTA = (title: string, id = "cta") => sec("cta", id, {
  title, text: "Con học một buổi 1:1 cùng giáo viên qua ClassIn, sau đó giáo viên tư vấn lộ trình phù hợp.",
  primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "/hoc-thu-mien-phi", secondaryLabel: `Gọi ${TH_BRAND.hotline}`, secondaryUrl: telHref,
}, { points: [{ text: "Học online tại nhà" }, { text: "Lớp nhóm 6–8 học sinh" }, { text: "90 phút/buổi · 1 buổi/tuần" }] });

/* --------------------------- Giới thiệu --------------------------- */
const about: SiteDemoPage = {
  slug: "gioi-thieu", title: "Giới thiệu", template: "site-gioi-thieu", label: "Giới thiệu", variant: "vivid",
  desc: "Câu chuyện thương hiệu, giá trị cốt lõi, chuẩn đào tạo và giảng viên.",
  seoTitle: `Giới thiệu — ${B}`, seoDescription: `${B}: Robotics, AI, đồ họa và lập trình cho học sinh 8–18 tuổi, học online cùng giáo viên qua ClassIn.`,
  build: () => page([
    sec("hero", "hero", {
      eyebrow: `Về ${B} · ${TH_BRAND.tagline}`, title: "Thắp lửa đam mê công nghệ cho thế hệ trẻ",
      subtitle: `${B} dạy Robotics, Trí tuệ nhân tạo, Thiết kế đồ họa và Lập trình cho học sinh. Mọi lớp học online qua ClassIn, giáo viên dạy trực tiếp, lớp nhỏ 6–8 học sinh.`,
      primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "/hoc-thu-mien-phi", secondaryLabel: "Xem chương trình học", secondaryUrl: "/khoa-hoc",
      image: TH_ART.hero,
    }, { badges: [{ text: "4 chuyên ngành" }, { text: "Tiểu học · THCS · THPT" }, { text: "Học online qua ClassIn" }] }),
    sec("text", "cau-chuyen", {
      title: "Ý nghĩa thương hiệu",
      body: [
        TH_BRAND.about,
        "",
        "- **Chữ T** là nền tảng công nghệ (Technology & Talent).",
        "- **Chữ H** là con người và sự trưởng thành (Human, Horizon, Harmony). Hai cột là thầy và trò, gạch nối là tinh thần liên môn STEAM.",
        "- **Quỹ đạo vàng** là con đường khám phá khoa học; **tên lửa** là khát vọng bứt phá; **ngôi sao** là đích đến: chứng nhận, thành tích, sự tự tin.",
      ].join("\n"),
    }),
    sec("features", "gia-tri", { title: "Giá trị cốt lõi", intro: "Mỗi buổi học, con tự tay làm ra một sản phẩm của riêng mình." }, {
      items: [
        { title: "Innovation — Đổi mới sáng tạo", text: "Mỗi học phần kết thúc bằng một dự án do con tự lên ý tưởng và xây dựng." },
        { title: "Interdisciplinary — Tích hợp liên môn", text: "Robotics, AI, đồ họa và lập trình gắn với toán, khoa học, tiếng Anh và đời sống." },
        { title: "Integrity & Excellence — Chính trực & Đỉnh cao", text: "Con tự làm sản phẩm của mình, dùng công nghệ trung thực và có trách nhiệm." },
      ],
    }),
    sec("features", "chuan", { title: "Bám sát chương trình giáo dục mới", intro: "Chương trình giúp con học trước, sâu hơn và làm quen sớm với nội dung ở trường." }, {
      items: [
        { title: "GDPT 2018 · môn Tin học", text: "Các kiến thức tuần tự, lặp, rẽ nhánh, giải quyết vấn đề với công nghệ được con thực hành qua dự án." },
        { title: "Thông tư 02/2025/TT-BGDĐT", text: "Khung năng lực số cho người học: 6 miền năng lực, trong đó có giải quyết vấn đề và ứng dụng AI." },
        { title: "Quyết định 2422/QĐ-BGDĐT", text: "Học sinh phổ thông học AI 12 tiết mỗi năm từ năm học 2026–2027. Con làm quen sớm, nắm chắc hơn." },
      ],
    }),
    sec("steps", "cach-hoc", { title: "Con học như thế nào", intro: TH_DELIVERY }, { items: MODULE_STEPS }),
    sec("programs", "giang-vien", { title: "Giảng viên đào tạo", intro: "Người đồng hành cùng con." }, {
      items: [{ name: TEACHER.name, badge: TEACHER.role, text: `${TEACHER.text} ${TEACHER.motto}`, meta: "Robotics · Tin học trẻ · KHKT · HKICO", price: "", url: "", linkLabel: "", image: "" }],
    }),
    sec("features", "dong-hanh", { title: "Đồng hành cùng phụ huynh", intro: "Bố mẹ biết con học gì, tiến bộ ra sao." }, { items: PARENT_ITEMS }),
    sec("testimonials", "phan-hoi", { title: "Phụ huynh nói gì" }, { items: [] }, false),
    CTA("Cho con trải nghiệm một buổi học 1:1"),
  ]),
};

/* --------------------------- Chương trình học (danh sách) --------------------------- */
const courses: SiteDemoPage = {
  slug: "khoa-hoc", title: "Chương trình học", template: "site-khoa-hoc", label: "Danh sách chương trình", variant: "vivid",
  desc: "4 chuyên ngành, lộ trình theo cấp học, học phí; mỗi chuyên ngành dẫn sang trang riêng.",
  seoTitle: `Chương trình học Robotics, AI, đồ họa, lập trình — ${B}`.slice(0, 70),
  seoDescription: "4 chuyên ngành cho học sinh Tiểu học, THCS, THPT: lộ trình năm học 45 buổi, luyện thi tự chọn, học phí năm học 2026–2027.",
  build: () => page([
    sec("hero", "hero", {
      eyebrow: "Chương trình học", title: "4 chuyên ngành, lộ trình rõ ràng theo cấp học",
      subtitle: `Mỗi năm học 45 buổi = 3 học phần × 15 buổi, từ Basic (Nền tảng) → Advanced (Nâng cao) → Expert (Chuyên sâu). ${TH_DELIVERY}.`,
      primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "/hoc-thu-mien-phi", secondaryLabel: "Xem học phí", secondaryUrl: "/khoa-hoc#hoc-phi",
      image: TH_ART.hero,
    }, { badges: [{ text: "Tiểu học · 8–10 tuổi" }, { text: "THCS · 11–15 tuổi" }, { text: "THPT · 15–18 tuổi" }] }),
    sec("programs", "chuyen-nganh", { title: "Chọn chuyên ngành cho con", intro: "Mỗi thẻ dẫn tới trang chi tiết: chương trình theo cấp học, nội dung từng học phần, luyện thi." }, { items: trackCards() }),
    sec("text", "lo-trinh", { title: "Lộ trình 4 chuyên ngành theo cấp học", body: [...overviewLines(), "**1 năm học = 45 buổi · Luyện thi: tự chọn, học thêm sau năm học.**"].join("\n").trim() }),
    sec("steps", "hoc-phan", { title: "Một học phần 15 buổi", intro: "Kết thúc bằng dự án do con tự làm và buổi báo cáo trước phụ huynh." }, { items: MODULE_STEPS }),
    sec("steps", "buoi-hoc", { title: "Một buổi học 90 phút", intro: "Ít lý thuyết, nhiều thực hành." }, { items: SESSION_STEPS }),
    sec("text", "hoc-phi", {
      title: `Học phí năm học ${TH_PRICING.schoolYear}`,
      body: `Học phí giống nhau ở cả 4 chuyên ngành. ${TH_PRICING.note} Phiếu đăng ký ghi rõ gói học, cấp độ, lịch học và giáo viên phụ trách.`,
    }),
    sec("programs", "bang-gia", { title: "Bảng học phí", intro: "Chọn lớp nhóm hoặc kèm 1:1; combo 2 năm học được giảm nhiều hơn." }, { items: priceCards() }),
    sec("faq", "faq", { title: "Câu hỏi về chương trình" }, {
      items: [
        { q: "Con nên học chuyên ngành nào trước?", a: "Sau buổi học trải nghiệm 1:1, giáo viên gợi ý chuyên ngành và năm học phù hợp với độ tuổi, sở thích và nền tảng của con." },
        ...COMMON_FAQ,
      ].slice(0, 12),
    }),
    CTA("Chưa biết chọn chuyên ngành nào? Học trải nghiệm trước"),
  ]),
};

/* --------------------------- Trang chuyên ngành --------------------------- */
function trackFaq(t: ThTrack): Row[] {
  const extra: Record<ThTrack["code"], Row> = {
    ROBO: { q: "Có cần mua bộ robot không?", a: "Không. Con học với robot ảo trên máy tính (RoboSim, RoboVR), học ngay tại nhà." },
    AI: { q: "Con dùng AI có an toàn không?", a: "Con học cách hỏi AI rõ ràng, kiểm chứng câu trả lời, giữ an toàn thông tin và tôn trọng bản quyền ngay từ học phần đầu tiên." },
    DOHOA: { q: "Cần phần mềm gì?", a: "Tiểu học học Tinkercad của Autodesk (chạy trên trình duyệt); THCS học Adobe Photoshop. Giáo viên hướng dẫn cài đặt trước khi vào học." },
    CODE: { q: "Con chưa biết lập trình có học được không?", a: "Được. Mỗi năm học bắt đầu từ học phần Basic (Nền tảng); 4 chặng nối tiếp từ Scratch ở tiểu học đến lập trình web ở THPT." },
  };
  const y = TH_PRICING.year;
  return [
    { q: "Con bao nhiêu tuổi thì học?", a: thProgramsOfTrack(t.code).map((p) => `${TH_LEVEL_VI[p.level]} ${ageRange(p.ageFrom, p.ageTo)}: ${p.name} (${p.years.length} năm học)`).join(". ") + "." },
    extra[t.code],
    { q: "Học phí bao nhiêu?", a: `Năm học ${TH_PRICING.schoolYear}: lớp nhóm 1 năm học (45 buổi) ${vnd(y.group.price)} (niêm yết ${vnd(y.group.list)}, giảm ${y.group.discountPct}%); kèm 1:1 ${vnd(y.oneToOne.price)}. Xem đủ bảng học phí ở trang Chương trình học.` },
    { q: "Cần chuẩn bị gì để học?", a: PREPARE_TEXT },
    COMMON_FAQ[2]!, COMMON_FAQ[3]!, COMMON_FAQ[5]!,
  ];
}

function trackPage(t: ThTrack): SiteDemoPage {
  const ps = thProgramsOfTrack(t.code);
  const a = trackAges(t);
  const contests = ps.flatMap((p) => p.contests.map((c) => ({ p, c })));
  const notes = ps.map((p) => p.contestNote).filter((x): x is string => !!x);
  return {
    slug: TH_TRACK_PAGE[t.code].slug, title: t.name, template: "site-khoa-hoc-chi-tiet", label: "Trang một chuyên ngành", variant: "vivid",
    desc: "Trang một chuyên ngành: chương trình theo cấp học, nội dung từng học phần, luyện thi, hỏi đáp.",
    seoTitle: `${t.name} — ${B}`.slice(0, 70),
    seoDescription: clip(`${t.name} cho học sinh ${trackLevels(t)} (${ageRange(a.from, a.to)}): ${ps.map((p) => p.name).join("; ")}. Học online qua ClassIn.`, 170),
    build: () => page([
      sec("hero", "hero", {
        eyebrow: `Chuyên ngành · ${trackLevels(t)}`, title: t.name,
        subtitle: `${t.tagline ?? ""} ${TH_DELIVERY}.`.trim(),
        primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "/hoc-thu-mien-phi", secondaryLabel: "Xem các chuyên ngành khác", secondaryUrl: "/khoa-hoc",
        image: TH_ART[t.code],
      }, { badges: [{ text: ageRange(a.from, a.to) }, { text: `${ps.length} chương trình · ${trackYears(t)} năm học` }, { text: "Lớp 6–8 học sinh hoặc kèm 1:1" }, { text: "90 phút/buổi · 1 buổi/tuần" }] }),
      sec("programs", "chuong-trinh", { title: "Chương trình theo cấp học", intro: "Mỗi năm học 45 buổi = 3 học phần Basic → Advanced → Expert. Bấm vào chương trình để xem nội dung từng học phần." }, {
        items: ps.map((p) => ({
          name: programLabel(p), badge: TH_LEVEL_VI[p.level],
          text: p.years.map((y) => `Năm ${y.no} (${ageRange(y.ageFrom, y.ageTo)}): ${y.title}.`).join(" "),
          meta: clip(programSummary(p), 120), price: "", url: `#${programAnchor(p)}`, linkLabel: "Xem lộ trình", image: "",
        })),
      }),
      ...ps.map((p) => sec("text", programAnchor(p), { title: programLabel(p), body: programMarkdown(p) })),
      sec("timeline", "luyen-thi", {
        title: "Luyện thi (tự chọn)",
        intro: clip(["Khóa luyện thi học thêm sau năm học tương ứng. Học phí chưa gồm lệ phí dự thi.", ...notes].join(" "), 300),
      }, {
        items: contests.map(({ p, c }) => ({ when: `Sau Năm ${c.afterYear} · ${TH_LEVEL_VI[p.level]}`, what: clip(`${examCourseName(p, c)} · ${c.sessions} buổi`, 160), where: clip(c.eligibility ?? "", 100) })),
      }),
      sec("features", "nang-luc", { title: "Đánh giá theo 6 năng lực + 3 phẩm chất", intro: VIRTUE_TEXT }, { items: COMPETENCY_ITEMS }),
      sec("steps", "bao-cao", { title: "Buổi báo cáo · buổi 15 mỗi học phần", intro: "Cứ 15 buổi, bố mẹ thấy rõ con tiến bộ. Sau buổi báo cáo, gia đình nhận phiếu đánh giá, video báo cáo và chứng nhận học phần." }, { items: REPORT_STEPS }),
      sec("faq", "faq", { title: `Hỏi đáp về ${t.name}` }, { items: trackFaq(t) }),
      CTA(`Cho con học trải nghiệm ${t.name}`),
    ]),
  };
}
const trackPages = TH_TRACKS.map(trackPage);

/* --------------------------- Liên hệ --------------------------- */
const contact: SiteDemoPage = {
  slug: "lien-he", title: "Liên hệ", template: "site-lien-he", label: "Liên hệ", variant: "vivid",
  desc: "Hotline, website, fanpage, cách phản ánh và form để lại thông tin.",
  seoTitle: `Liên hệ — ${B}`, seoDescription: `Hotline ${TH_BRAND.hotline} · ${TH_BRAND.website}. Để lại thông tin để ${B} tư vấn lộ trình và hẹn buổi học trải nghiệm 1:1.`,
  build: () => page([
    sec("hero", "hero", {
      eyebrow: "Liên hệ", title: `Liên hệ ${B}`,
      subtitle: "Gọi hotline hoặc để lại thông tin, trung tâm liên hệ lại để tư vấn lộ trình và hẹn buổi học trải nghiệm 1:1 cho con.",
      primaryLabel: `Gọi ${TH_BRAND.hotline}`, primaryUrl: telHref, secondaryLabel: "Đăng ký học trải nghiệm", secondaryUrl: "/hoc-thu-mien-phi",
    }, { badges: [{ text: `Hotline ${TH_BRAND.hotline}` }, { text: TH_BRAND.website }, { text: `Fanpage ${TH_BRAND.fanpage}` }] }),
    sec("text", "kenh", {
      title: "Kênh liên hệ",
      body: [
        `- **Hotline:** ${TH_BRAND.hotline}`,
        `- **Website:** ${TH_BRAND.website}`,
        `- **Fanpage:** ${TH_BRAND.fanpage}`,
        "- **Học viên đang học:** nhắn trong nhóm Zalo của lớp.",
        "",
        `**Hình thức học:** ${TH_DELIVERY}. Con học tại nhà, không cần đến cơ sở.`,
        "",
        `**Phản ánh chất lượng:** qua Zalo lớp hoặc hotline ${TH_BRAND.hotline}. Trung tâm phản hồi trong 24 giờ, xử lý trong 5 ngày làm việc.`,
      ].join("\n"),
    }),
    sec("form", "form", { title: "Để lại thông tin", subtitle: "Trung tâm liên hệ lại để tư vấn lộ trình cho con.", thankYou: `Cảm ơn ba mẹ! ${B} sẽ liên hệ lại trong giờ làm việc.` }),
    sec("faq", "faq", { title: "Câu hỏi thường gặp" }, { items: [COMMON_FAQ[0]!, COMMON_FAQ[1]!, COMMON_FAQ[2]!] }),
  ]),
};

/* --------------------------- Chính sách --------------------------- */
const terms: SiteDemoPage = {
  slug: "chinh-sach-dieu-khoan", title: "Điều khoản đăng ký học", template: "site-chinh-sach", label: "Chính sách / điều khoản", variant: "vivid",
  desc: "Học phí, chương trình, quy chuẩn lớp online, học bù, bảo lưu, hoàn phí, phản ánh, hình ảnh của con.",
  seoTitle: `Điều khoản đăng ký học — ${B}`, seoDescription: "Học phí, học bù, bảo lưu, chuyển nhượng, hoàn học phí và phản ánh chất lượng khi đăng ký học tại TH STEAM Academy.",
  build: () => page([
    sec("hero", "hero", { eyebrow: "Chính sách", title: "Điều khoản đăng ký học", subtitle: `Áp dụng từ năm học ${TH_PRICING.schoolYear}.`, primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "/hoc-thu-mien-phi", secondaryLabel: "Về trang chủ", secondaryUrl: "/" }, { badges: [] }),
    sec("text", "noi-dung", { title: "", body: termsMarkdown() }),
  ]),
};

/**
 * Chính sách bảo mật (21/10/2026) — theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP: nêu đúng
 * dữ liệu hệ thống đang thu (form 4 ô, trang đăng ký, hồ sơ học tập, cookie đo lường), mục đích TỪNG LOẠI, đồng ý riêng cho
 * đo lường quảng cáo (banner, components/landing/consent-banner.tsx), quyền của chủ thể dữ liệu. Không phải ý kiến pháp lý:
 * trung tâm nên nhờ luật sư rà lại trước khi chạy quảng cáo lớn.
 */
const privacy: SiteDemoPage = {
  slug: "chinh-sach-bao-mat", title: "Chính sách bảo mật", template: "site-chinh-sach", label: "Chính sách / điều khoản", variant: "vivid",
  desc: "Cách trung tâm thu thập, sử dụng và bảo vệ thông tin của phụ huynh và học sinh.",
  seoTitle: `Chính sách bảo mật — ${B}`, seoDescription: `Cách ${B} thu thập, sử dụng và bảo vệ thông tin của phụ huynh và học sinh.`,
  build: () => page([
    sec("hero", "hero", { eyebrow: "Chính sách", title: "Chính sách bảo mật", subtitle: "Có hiệu lực từ ngày 21/10/2026. Áp dụng cho website, form đăng ký và quá trình học tại trung tâm.", primaryLabel: "Về trang chủ", primaryUrl: "/", secondaryLabel: "", secondaryUrl: "" }, { badges: [] }),
    sec("text", "noi-dung", {
      title: "",
      body: [
        `${TH_BRAND.legalName} (${B}, sau đây gọi là "trung tâm") tôn trọng và bảo vệ dữ liệu cá nhân của phụ huynh và học sinh, theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.`,
        "",
        "## 1. Dữ liệu trung tâm thu thập",
        "- **Khi bố mẹ đăng ký học trải nghiệm:** họ tên phụ huynh, số điện thoại / Zalo, lớp của con, chuyên ngành quan tâm và ghi chú do bố mẹ tự nhập. Trang đăng ký đầy đủ có thể hỏi thêm tên con và trường.",
        "- **Khi con học tại trung tâm:** lịch học, chuyên cần, bài tập, sản phẩm, video buổi học, phiếu đánh giá năng lực và chứng nhận (hồ sơ công nghệ của con); thông tin học phí, hoá đơn.",
        "- **Khi xem website:** trang đã xem, nguồn truy cập (mã chiến dịch UTM) và một mã ngẫu nhiên lưu trên trình duyệt để đếm lượt truy cập. Mã này không chứa tên hay số điện thoại.",
        "- **Cookie đo lường quảng cáo (Meta, Google):** chỉ được nạp khi bố mẹ bấm \"Đồng ý\" ở thông báo đo lường trên website.",
        "",
        "## 2. Trung tâm dùng dữ liệu để làm gì",
        "- Gọi điện / nhắn Zalo tư vấn và hẹn buổi học trải nghiệm — theo sự đồng ý của bố mẹ khi gửi form.",
        "- Xếp lớp, gửi lịch học, thông báo của lớp, báo cáo tiến bộ, thu học phí và xuất hoá đơn — để thực hiện việc học đã đăng ký.",
        "- Đo hiệu quả quảng cáo — chỉ khi bố mẹ đồng ý riêng ở thông báo đo lường.",
        "- Gửi ưu đãi, sự kiện — chỉ khi bố mẹ đồng ý nhận; bố mẹ có thể từ chối bất cứ lúc nào.",
        "Trung tâm không dùng dữ liệu cho mục đích khác khi chưa hỏi lại bố mẹ.",
        "",
        "## 3. Dữ liệu và hình ảnh của trẻ em",
        "- Trung tâm chỉ nhận thông tin của con từ phụ huynh hoặc người giám hộ.",
        "- Hình ảnh, video của con dùng cho hồ sơ công nghệ của con. Chỉ dùng cho truyền thông khi có đồng ý bằng văn bản của phụ huynh, và của cả con nếu con từ đủ 7 tuổi.",
        "",
        "## 4. Chia sẻ dữ liệu",
        "- Trung tâm **không bán, không cho thuê** dữ liệu cá nhân.",
        "- Chỉ chia sẻ phần cần thiết với đơn vị cung cấp dịch vụ cho trung tâm: máy chủ lưu trữ, lớp học trực tuyến ClassIn, Zalo, tin nhắn, ngân hàng / cổng thanh toán; và Meta, Google khi bố mẹ đã đồng ý đo lường quảng cáo. Một số dịch vụ có máy chủ ở nước ngoài.",
        "- Cung cấp cho cơ quan nhà nước khi pháp luật yêu cầu.",
        "",
        "## 5. Lưu trữ và bảo vệ",
        "- Thông tin đăng ký của phụ huynh chưa nhập học được lưu tối đa 24 tháng, sau đó xoá hoặc ẩn danh.",
        "- Hồ sơ học tập lưu trong thời gian con học và theo yêu cầu của bố mẹ; chứng từ học phí lưu theo quy định về kế toán.",
        "- Hệ thống dùng kết nối mã hoá (HTTPS), phân quyền theo vai trò (chỉ người phụ trách lớp, tư vấn, vận hành xem phần dữ liệu cần cho công việc), ghi nhật ký truy cập và sao lưu định kỳ.",
        "- Nếu xảy ra sự cố lộ lọt dữ liệu, trung tâm xử lý và thông báo theo quy định pháp luật.",
        "",
        "## 6. Quyền của bố mẹ và học sinh",
        "Bố mẹ (và con theo quy định) có quyền: được biết dữ liệu đang được xử lý; xem, sửa dữ liệu; rút lại sự đồng ý; yêu cầu xoá hoặc hạn chế xử lý; phản đối việc dùng dữ liệu cho quảng cáo, tiếp thị; khiếu nại theo quy định pháp luật.",
        `Gửi yêu cầu qua hotline ${TH_BRAND.hotline} hoặc nhóm Zalo lớp. Trung tâm phản hồi trong 24 giờ và xử lý trong 5 ngày làm việc. Rút lại đồng ý không ảnh hưởng tới việc xử lý đã thực hiện trước đó.`,
        "",
        "## 7. Đo lường trên website",
        "- Trung tâm tự đếm lượt xem trang và nguồn truy cập để cải thiện website; dữ liệu này không bán, không gửi cho bên quảng cáo.",
        "- Cookie của Meta Pixel, Google Analytics, Google Ads chỉ chạy khi bố mẹ chọn \"Đồng ý\". Muốn đổi lựa chọn: bấm \"Đổi lựa chọn đo lường\" ở chân trang.",
        "",
        "## 8. Thay đổi chính sách",
        "Khi chính sách thay đổi, trung tâm cập nhật trên trang này và ghi ngày hiệu lực mới.",
        "",
        "## 9. Liên hệ",
        `${TH_BRAND.legalName} · Hotline ${TH_BRAND.hotline} · ${TH_BRAND.website}.`,
      ].join("\n"),
    }),
  ]),
};

/** Các trang con của website, đúng thứ tự sơ đồ */
export const SITE_DEMO_PAGES: readonly SiteDemoPage[] = [about, courses, ...trackPages, contact, privacy, terms];
/** Trang con có chữ "[DEMO]" (bản nháp cần duyệt) */
/** Trang còn là bản nháp (có chữ [DEMO]) — hiện không còn trang nào */
export const SITE_DRAFT_SLUGS: readonly string[] = [];

/* --------------------------- Mẫu tạo trang mới --------------------------- */
/** Mẫu trang chi tiết cho chương trình / khoá mới (chưa có trong danh mục chuẩn): chữ mẫu có [DEMO] để nhắc thay */
const courseTemplate: SiteDemoPage = {
  slug: "", title: "", template: "site-khoa-hoc-chi-tiet", label: "Trang chi tiết một chương trình", variant: "vivid",
  desc: "Trang một chương trình / khoá học: mô tả, con học được gì, học phần, hỏi đáp.",
  seoTitle: "", seoDescription: "",
  build: () => page([
    sec("hero", "hero", {
      eyebrow: "Chương trình học", title: "[DEMO] Tên chương trình",
      subtitle: `[DEMO] Một đến hai câu: chương trình dành cho ai, con làm được gì. ${TH_DELIVERY}.`,
      primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "/hoc-thu-mien-phi", secondaryLabel: "Xem các chuyên ngành", secondaryUrl: "/khoa-hoc",
    }, { badges: [{ text: "[DEMO] Độ tuổi" }, { text: "[DEMO] Số năm học · số buổi" }, { text: "Học online qua ClassIn" }] }),
    sec("features", "con-hoc", { title: "[DEMO] Con học được gì", intro: "Mỗi học phần một nhóm kỹ năng và một sản phẩm." }, {
      items: [
        { title: "[DEMO] Học phần 1 · Basic (Nền tảng)", text: "Con học … · Sản phẩm … · Con làm được …" },
        { title: "[DEMO] Học phần 2 · Advanced (Nâng cao)", text: "Con học … · Sản phẩm … · Con làm được …" },
        { title: "[DEMO] Học phần 3 · Expert (Chuyên sâu)", text: "Con học … · Sản phẩm … · Con làm được …" },
      ],
    }),
    sec("steps", "hoc-phan", { title: "Một học phần 15 buổi", intro: "" }, { items: MODULE_STEPS }),
    sec("faq", "faq", { title: "Hỏi đáp" }, { items: COMMON_FAQ.slice(0, 4) }),
    CTA("Cho con học trải nghiệm chương trình này"),
  ]),
};

/** Mẫu tạo trang mới trong khu quản trị (mỗi loại một mẫu): trang con của website */
export const SITE_TEMPLATES: readonly SiteDemoPage[] = [
  { ...about, slug: "", title: "", template: "site-gioi-thieu" },
  courseTemplate,
  { ...terms, slug: "", title: "", template: "site-chinh-sach", label: "Trang chính sách / văn bản" },
];

export const siteDemoBySlug = (slug: string): SiteDemoPage | null => SITE_DEMO_PAGES.find((p) => p.slug === slug) ?? null;
export const siteTemplateByKey = (key: string): SiteDemoPage | null => SITE_TEMPLATES.find((t) => t.template === key) ?? null;

/** Trang cũ của khung website trước khi chuyển sang TH STEAM (để lệnh dọn dẹp ẩn đi, không xoá) */
export const SITE_RETIRED_SLUGS: readonly string[] = ["khoa-hoc-lap-trinh-robot", "khoa-hoc-luyen-thi-robosim", "khoa-hoc-hoc-online"];

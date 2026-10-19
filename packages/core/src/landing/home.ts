/**
 * TRANG CHỦ TH STEAM ACADEMY — bố cục theo thứ tự các phần của trang đích edtech.teky.edu.vn (chỉ học CẤU TRÚC, không chép chữ
 * hay khẳng định của Teky): hero → số liệu → vì sao chọn → chuyên ngành → học trải nghiệm → giá trị (6 năng lực) → buổi học →
 * hành trang → kêu gọi → lộ trình theo cấp học → cách bắt đầu → đồng hành phụ huynh → phản hồi → giảng viên → buổi báo cáo
 * → hỏi đáp → form.
 *
 * Nội dung lấy từ danh mục chương trình chuẩn và bộ nhận diện (site/thsteam-content.ts) — không có số liệu thành tích,
 * không ghi "miễn phí" (bộ slide chỉ nói "học trải nghiệm 1:1 trước khi đăng ký"), không nêu học phí trên trang chủ.
 * "Số liệu" chỉ là thông số thật của chương trình (4 chuyên ngành, 8–18 tuổi, lớp 6–8 học sinh, 90 phút, 45 buổi).
 * Phản hồi phụ huynh để TẮT cho tới khi có lời thật, được phép đăng. Ảnh là minh hoạ vector (apps/web/public/anh-site).
 * Hệ thống chỉ có một form mỗi trang nên các nút "Đăng ký" đều cuộn tới form cuối trang; thẻ chuyên ngành dẫn sang trang riêng.
 *
 * Mỗi lần cải tiến: sửa chữ trong Website → Landing page → "Trang chủ" rồi Xuất bản; hoặc sửa ở đây cho lần dựng sau.
 */
import { emptySection, type LandingDoc, type LandingSection, type SectionType } from "./model.js";
import { TH_BRAND } from "../system/th-brand.js";
import { TH_PROGRAMS, TH_LEVEL_VI, ageRange, type ThSchoolLevel } from "../curriculum/thsteam.js";
import {
  TH_ART, COMMON_FAQ, COMPETENCY_ITEMS, PARENT_ITEMS, REGISTER_STEPS, REPORT_STEPS, SESSION_STEPS, TEACHER, VIRTUE_TEXT, WHY_ITEMS, telHref, trackCards,
} from "../site/thsteam-content.js";

function sec(type: SectionType, id: string, data: Record<string, string> = {}, lists: Record<string, Record<string, string>[]> = {}, enabled = true): LandingSection {
  const s = emptySection(type, id);
  return { ...s, enabled, data: { ...s.data, ...data }, lists: { ...s.lists, ...lists } };
}

const B = TH_BRAND.name;
const LEVELS: ThSchoolLevel[] = ["tieu-hoc", "thcs", "thpt"];

/** "Tiểu học · 8–10 tuổi" → các chương trình của cấp học đó */
function levelRoadmap(): Record<string, string>[] {
  const rows = LEVELS.map((l) => {
    const ps = TH_PROGRAMS.filter((p) => p.level === l);
    const from = Math.min(...ps.map((p) => p.ageFrom)), to = Math.max(...ps.map((p) => p.ageTo));
    return { when: `${TH_LEVEL_VI[l]} · ${ageRange(from, to)}`, what: ps.map((p) => p.name).join(" · ").slice(0, 160), where: "" };
  });
  return [
    ...rows,
    { when: "Mỗi năm học", what: "45 buổi = 3 học phần Basic → Advanced → Expert; buổi 15 mỗi học phần báo cáo trước phụ huynh", where: "" },
    { when: "Luyện thi", what: "Tự chọn, học thêm sau năm học: Sáng tạo Robotics, ENJOY AI, Sáng tạo trẻ AI, ACP Photoshop, Tin học trẻ, HKICO, KHKT, Tốt nghiệp THPT môn Tin học", where: "" },
  ];
}

export const HOME_PAGE = {
  slug: "trang-chu",
  title: "Trang chủ TH STEAM Academy",
  template: "trang-chu-thsteam",
  variant: "classic" as const,
  seoTitle: `${B} — Robotics, AI, đồ họa, lập trình online cho học sinh`.slice(0, 70),
  seoDescription: "Học Robotics, Trí tuệ nhân tạo, Thiết kế đồ họa và Lập trình online qua ClassIn: lớp 6–8 học sinh, 90 phút/buổi, lộ trình theo cấp học 8–18 tuổi.",
  build(): LandingDoc {
    return {
      sections: [
        sec("header", "header", { phone: TH_BRAND.hotline, ctaLabel: "Học trải nghiệm 1:1", ctaUrl: "#dang-ky" }, {
          nav: [{ label: "Vì sao chọn TH STEAM", href: "#cam-ket" }, { label: "Chuyên ngành", href: "#khoa-hoc" }, { label: "Cách bắt đầu", href: "#quy-trinh" }, { label: "Hỏi đáp", href: "#hoi-dap" }],
        }),
        sec("hero", "hero", {
          eyebrow: `${TH_BRAND.wordmark} · ${TH_BRAND.tagline}`,
          title: "Con làm chủ công nghệ: Robotics, AI, đồ họa và lập trình",
          subtitle: "Học online cùng giáo viên dạy trực tiếp qua ClassIn. Lớp nhỏ 6–8 học sinh, mỗi học phần con tự làm dự án và báo cáo trước bố mẹ.",
          primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "#dang-ky",
          secondaryLabel: `Gọi ${TH_BRAND.hotline}`, secondaryUrl: telHref,
          image: TH_ART.hero,
        }, { badges: [{ text: "Học online tại nhà qua ClassIn" }, { text: "Lớp nhóm 6–8 học sinh hoặc kèm 1:1" }, { text: "Bám sát GDPT 2018 và nội dung AI 2026–2027" }] }),
        sec("stats", "stats", { title: "" }, {
          items: [
            { value: "4", label: "Chuyên ngành: Robotics, AI, Đồ họa, Lập trình" },
            { value: "8–18", label: "Tuổi · Tiểu học, THCS, THPT" },
            { value: "6–8", label: "Học sinh mỗi lớp nhóm" },
            { value: "45", label: "Buổi mỗi năm học · 90 phút/buổi" },
          ],
        }),
        sec("features", "features", { title: `Vì sao phụ huynh chọn ${B}`, intro: "Bốn điều giúp con vừa thích học, vừa thật sự tiến bộ." }, { items: WHY_ITEMS }),
        sec("programs", "programs", { title: "4 chuyên ngành cho con", intro: "Mỗi chuyên ngành có lộ trình theo cấp học. Bấm vào thẻ để xem nội dung từng năm học." }, { items: trackCards() }),
        sec("cta", "uu-dai", {
          title: "Cho con học trải nghiệm 1:1 cùng giáo viên",
          text: "Con học một buổi 1:1 qua ClassIn trước khi đăng ký. Sau buổi học, giáo viên tư vấn chuyên ngành và lộ trình phù hợp.",
          primaryLabel: "Đăng ký học trải nghiệm", primaryUrl: "#dang-ky", secondaryLabel: `Gọi ${TH_BRAND.hotline}`, secondaryUrl: telHref,
        }, { points: [{ text: "Học 1:1 cùng giáo viên" }, { text: "Tư vấn lộ trình theo độ tuổi" }, { text: "Học ngay tại nhà" }] }),
        sec("features", "gia-tri", { title: "Con phát triển 6 năng lực", intro: VIRTUE_TEXT }, { items: COMPETENCY_ITEMS }),
        sec("gallery", "buoi-hoc", { title: "Con học gì ở TH STEAM" }, {
          items: [
            { image: TH_ART.ROBO, caption: "Robotics AI: lập trình robot ảo RoboSim, RoboVR (hình minh hoạ)" },
            { image: TH_ART.AI, caption: "Trí tuệ nhân tạo AI: học, vẽ, làm nhạc, video, web cùng AI (hình minh hoạ)" },
            { image: TH_ART.DOHOA, caption: "Thiết kế đồ họa AI: mô hình 3D Tinkercad, Photoshop (hình minh hoạ)" },
            { image: TH_ART.CODE, caption: "Lập trình: Scratch, Roblox, App Inventor, Python, web (hình minh hoạ)" },
          ],
        }),
        sec("steps", "hanh-trang", { title: "Một buổi học 90 phút", intro: "Ít lý thuyết, nhiều thực hành: phần lớn thời gian con tự làm sản phẩm." }, { items: SESSION_STEPS }),
        sec("cta", "ket-luan", {
          title: "Thắp lửa đam mê công nghệ cho con",
          text: "Để lại thông tin, trung tâm liên hệ tư vấn và hẹn buổi học trải nghiệm 1:1 trong giờ làm việc.",
          primaryLabel: "Đăng ký ngay", primaryUrl: "#dang-ky",
        }, { points: [{ text: TH_BRAND.tagline }, { text: "Học online qua ClassIn" }] }),
        sec("timeline", "lo-trinh", { title: "Lộ trình theo cấp học", intro: "Giáo viên gợi ý chương trình và năm học phù hợp sau buổi học trải nghiệm." }, { items: levelRoadmap() }),
        sec("steps", "steps", { title: "Bắt đầu thật đơn giản", intro: "Bốn bước để con vào lớp." }, { items: REGISTER_STEPS }),
        sec("features", "he-sinh-thai", { title: "Đồng hành cùng phụ huynh", intro: "Bố mẹ biết con học gì, tiến bộ ra sao." }, { items: PARENT_ITEMS }),
        sec("testimonials", "phan-hoi", { title: "Phụ huynh nói gì" }, { items: [] }, false),
        sec("programs", "doi-ngu", { title: "Giảng viên đào tạo", intro: "Người đồng hành cùng con." }, {
          items: [{ name: TEACHER.name, badge: TEACHER.role, text: `${TEACHER.text} ${TEACHER.motto}`, meta: "Robotics · Tin học trẻ · KHKT · HKICO", price: "", url: "", linkLabel: "", image: "" }],
        }),
        sec("steps", "bao-cao", { title: "Cứ 15 buổi, bố mẹ thấy rõ con tiến bộ", intro: "Buổi 15 mỗi học phần là buổi báo cáo trực tuyến có phụ huynh tham dự. Sau buổi báo cáo, gia đình nhận phiếu đánh giá, video báo cáo và chứng nhận học phần." }, { items: REPORT_STEPS }),
        sec("faq", "faq", { title: "Câu hỏi bố mẹ hay hỏi" }, {
          items: [
            { q: "Con bao nhiêu tuổi thì học được?", a: "Tiểu học 8–10 tuổi học được cả 4 chuyên ngành; THCS 11–15 tuổi có AI for teen, Photoshop, Roblox Lua → App Inventor, Python → lập trình web; THPT 15–18 tuổi có lập trình web full-stack → WordPress." },
            ...COMMON_FAQ,
            { q: "Học phí bao nhiêu?", a: "Học phí giống nhau ở cả 4 chuyên ngành, có lớp nhóm và kèm 1:1, combo 2 năm học được giảm nhiều hơn. Xem bảng học phí ở trang Chương trình học hoặc gọi hotline để được tư vấn." },
          ],
        }),
        sec("form", "form", {
          title: "Đăng ký học trải nghiệm 1:1",
          subtitle: "Để lại thông tin, trung tâm liên hệ lại để tư vấn và hẹn giờ học trải nghiệm cho con.",
          thankYou: `Cảm ơn ba mẹ! ${B} sẽ liên hệ lại trong giờ làm việc để hẹn buổi học trải nghiệm.`,
        }),
        sec("footer", "footer", {
          tagline: `${TH_BRAND.tagline} — ${TH_BRAND.taglineVi}.`,
          email: "", phone: TH_BRAND.hotline,
          legal: TH_BRAND.legalName,
          copyright: `© 2026 ${B}`,
        }, {
          addresses: [{ label: "Hình thức học", text: "Online qua ClassIn" }, { label: "Website", text: TH_BRAND.website }],
          links: [{ label: "Chương trình học", href: "/khoa-hoc" }, { label: "Điều khoản đăng ký học", href: "/chinh-sach/dieu-khoan" }, { label: "Chính sách bảo mật", href: "/chinh-sach/bao-mat" }],
        }),
      ],
    };
  },
};

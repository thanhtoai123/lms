/**
 * LANDING CHẠY QUẢNG CÁO (Google / Facebook / Zalo Ads) — 1 trang chung + 4 trang theo chuyên ngành.
 *
 * Nguyên tắc (trải nghiệm trang đích của Google Ads + SEO on-page):
 *  - Mỗi trang khớp MỘT nhóm quảng cáo: tiêu đề H1, title, mô tả chứa đúng từ khoá của chuyên ngành (message match).
 *  - Form 4 ô ngay màn hình đầu (điện thoại: ngay dưới tiêu đề), thêm form ở cuối trang và thanh "Gọi / Đăng ký" cố định.
 *  - Nội dung thật, lấy từ danh mục chương trình chuẩn (curriculum/thsteam.ts) và bộ slide đã duyệt: lộ trình, phần mềm,
 *    học phần, giảng viên, điều khoản. Không ghi "miễn phí", không số liệu thành tích, không hiện học phí (mời học trải nghiệm).
 *  - Ảnh: tranh minh hoạ vector (/lp-anh, nhân vật vẽ — không phải ảnh trẻ em thật), ảnh chụp phần mềm thật có ghi nguồn
 *    (/lp-anh/that), ảnh và chứng chỉ của giảng viên do trung tâm cung cấp.
 *  - Liên kết nội bộ sang trang chuyên ngành khác và website (/khoa-hoc…) để máy tìm kiếm hiểu cấu trúc.
 * Sửa chữ ngay trong Website → Landing page; dựng lại từ đây khi danh mục chương trình đổi (pnpm db:seed-thsteam).
 */
import { emptySection, type LandingDoc, type LandingSection, type LandingVariant, type SectionType } from "./model.js";
import { TH_BRAND } from "../system/th-brand.js";
import {
  TH_LEVEL_VI, TH_SESSIONS_PER_YEAR, TH_TRACKS, TH_TRACK_SHORT, TH_DIFFICULTY_PLAIN, ageRange, examCourseName, moduleTitle, thProgramsOfTrack, yearCourseName,
  type ThProgram, type ThTrackCode,
} from "../curriculum/thsteam.js";
import { COMMON_FAQ, COMPETENCY_ITEMS, MODULE_STEPS, PARENT_ITEMS, PREPARE_TEXT, REGISTER_STEPS, REPORT_STEPS, TEACHER, VIRTUE_TEXT, WHY_ITEMS } from "../site/thsteam-content.js";

type Row = Record<string, string>;
function sec(type: SectionType, id: string, data: Row = {}, lists: Record<string, Row[]> = {}, enabled = true): LandingSection {
  const s = emptySection(type, id);
  return { ...s, enabled, data: { ...s.data, ...data }, lists: { ...s.lists, ...lists } };
}
const B = TH_BRAND.name;
const telHref = `tel:${TH_BRAND.hotlineTel}`;

/** Ảnh đi kèm ứng dụng (apps/web/public/lp-anh) */
export const LP_ART = {
  chung: "/lp-anh/lp-hero-chung.svg",
  ROBO: "/lp-anh/lp-hero-robotics.svg",
  AI: "/lp-anh/lp-hero-ai.svg",
  DOHOA: "/lp-anh/lp-hero-do-hoa.svg",
  CODE: "/lp-anh/lp-hero-lap-trinh.svg",
  teacherLive: "/lp-anh/lp-giao-vien-truc-tiep.svg",
  report: "/lp-anh/lp-bao-cao-cuoi-khoa.svg",
  parent: "/lp-anh/lp-phu-huynh-theo-doi.svg",
  teacherPhoto: "/lp-anh/that/thay-phan-thanh-toai.webp",
  teacherCert: "/lp-anh/that/chung-nhan-stem-org.webp",
} as const;

/** Ảnh chụp phần mềm thật (nguồn ghi theo bộ slide chương trình) */
const SHOT = {
  robosimSaBan: { image: "/lp-anh/that/robosim-sa-ban-vong-loai.webp", credit: "Ảnh: Thể lệ Cuộc thi Sáng tạo Robotics toàn quốc 2026 (tainangviet.vn)" },
  robosimMoHinh: { image: "/lp-anh/that/robosim-mo-hinh-nhiem-vu.webp", credit: "Ảnh: Thể lệ Cuộc thi Sáng tạo Robotics toàn quốc 2026 (tainangviet.vn)" },
  robovrMap: { image: "/lp-anh/that/robovr-chon-ban-do.webp", credit: "Ảnh: WhalesBot (whalesbot.ai)" },
  robovrCity: { image: "/lp-anh/that/robovr-ban-do-thanh-pho.webp", credit: "Ảnh: WhalesBot (whalesbot.ai)" },
  robovrSpace: { image: "/lp-anh/that/robovr-ban-do-khong-gian.webp", credit: "Ảnh: WhalesBot (whalesbot.ai)" },
  tinkercad: { image: "/lp-anh/that/tinkercad-giao-dien.webp", credit: "Ảnh: Autodesk Tinkercad (tinkercad.com)" },
  tinkercadGear: { image: "/lp-anh/that/tinkercad-banh-rang.webp", credit: "Ảnh: Autodesk Tinkercad (tinkercad.com)" },
  photoshop: { image: "/lp-anh/that/photoshop-generative-expand.webp", credit: "Ảnh: Adobe (adobe.com)" },
  photoshopFill: { image: "/lp-anh/that/photoshop-generative-fill-ong.webp", credit: "Ảnh: Adobe (adobe.com)" },
  scratch: { image: "/lp-anh/that/scratch-giao-dien.webp", credit: "Ảnh: Scratch Foundation (AGPL-3.0)" },
  creaticode: { image: "/lp-anh/that/creaticode-khoi-ai.webp", credit: "Ảnh: CreatiCode (play.creaticode.com)" },
  roblox: { image: "/lp-anh/that/roblox-studio-giao-dien.webp", credit: "Ảnh: Roblox Creator Docs (CC BY 4.0)" },
  appinventor: { image: "/lp-anh/that/appinventor-khoi-lenh.webp", credit: "Ảnh: MIT App Inventor (Apache-2.0)" },
  thonny: { image: "/lp-anh/that/thonny-giao-dien.webp", credit: "Ảnh: Raspberry Pi Ltd (CC BY-SA 4.0)" },
  web: { image: "/lp-anh/that/web-trang-chu-truong-hoc.webp", credit: "Ảnh: MDN Web Docs (CC BY-SA 2.5)" },
  vscode: { image: "/lp-anh/that/vscode-bootstrap-goi-y.webp", credit: "Ảnh: Bootstrap docs (MIT)" },
  wordpress: { image: "/lp-anh/that/wordpress-block-editor.webp", credit: "Ảnh: WordPress Gutenberg (GPL-2.0)" },
} as const;
type Shot = { image: string; credit: string };

/** Ảnh phần mềm của từng năm học (mã khoá năm học → ảnh) */
const YEAR_SHOT: Record<string, Shot> = {
  "ROBO-TH-N1": SHOT.robosimSaBan, "ROBO-TH-N2": SHOT.robovrMap,
  "DOHOA-TH-N1": SHOT.tinkercad, "DOHOA-THCS-N1": SHOT.photoshop,
  "CODE-TH-N1": SHOT.scratch, "CODE-TH-N2": SHOT.creaticode, "CODE-THCS1-N1": SHOT.roblox, "CODE-THCS1-N2": SHOT.appinventor,
  "CODE-THCS2-N1": SHOT.thonny, "CODE-THCS2-N2": SHOT.web, "CODE-THPT-N1": SHOT.vscode, "CODE-THPT-N2": SHOT.wordpress,
};
const yearCode = (p: ThProgram, no: number) => `${p.code}-N${no}`;

export interface AdsLandingPage {
  slug: string;
  title: string;
  /** Khoá mẫu: "ads-chung", "ads-ROBO"… (nhận biết trang quảng cáo trong sitemap / đồng bộ) */
  template: string;
  track: ThTrackCode | null;
  variant: LandingVariant;
  seoTitle: string;
  seoDescription: string;
  /** Ảnh chia sẻ 1200×630 (Facebook, Zalo) */
  seoImage: string;
  /** Từ khoá chính của nhóm quảng cáo (ghi chú cho người chạy ads, không hiển thị) */
  keywords: string[];
  build(): LandingDoc;
}

/* ------------------------------------------------------------------ các khối dùng chung */

const header = () => sec("header", "header", { phone: TH_BRAND.hotline, ctaLabel: "Đăng ký học thử", ctaUrl: "#dang-ky-nhanh" }, {
  nav: [{ label: "Lộ trình", href: "#lo-trinh" }, { label: "Con học gì", href: "#khoa-hoc" }, { label: "Giảng viên", href: "#giang-vien" }, { label: "Hỏi đáp", href: "#hoi-dap" }],
});

const teacher = () => sec("teacher", "giang-vien", {
  title: "Giảng viên đồng hành cùng con", name: TEACHER.name, role: TEACHER.role, photo: LP_ART.teacherPhoto,
  bio: "Người xây dựng chương trình và trực tiếp đứng lớp. Thầy dạy theo phương pháp thực chiến “1-Chạm”: mỗi buổi con tự tay làm ra một sản phẩm.",
  quote: TEACHER.motto, certImage: LP_ART.teacherCert, certCaption: "Chứng nhận STEM.org Certified Educational Instructor (10/9/2026)",
}, {
  points: [
    { title: "6 năm kinh nghiệm", text: "Giảng dạy và phát triển chương trình đào tạo công nghệ số (EdTech)." },
    { title: "Giáo viên đạt chuẩn STEM.org", text: "Chứng nhận quốc tế STEM.org Certified Educational Instructor." },
    { title: "Huấn luyện viên đội tuyển", text: "Dẫn dắt học sinh thi đấu Robotics, Tin học trẻ, KHKT, HKICO." },
  ],
  tags: [{ text: "Robotics" }, { text: "Tin học trẻ" }, { text: "KHKT" }, { text: "HKICO" }],
});

const liveClass = () => sec("split", "hoc-online", {
  eyebrow: "Hình thức học", title: "Học online trực tiếp cùng giáo viên qua ClassIn",
  body: "Không phải video quay sẵn: mỗi buổi giáo viên dạy trực tiếp, nhìn màn hình và sửa bài cho từng bạn. Con học ngay tại nhà, bố mẹ không phải đưa đón.",
  image: LP_ART.teacherLive, imageAlt: "Giáo viên dạy trực tiếp lớp nhóm 6–8 học sinh qua ClassIn (tranh minh hoạ)",
}, { points: [{ text: "Lớp nhóm 6–8 học sinh, hoặc kèm 1:1" }, { text: "90 phút/buổi, 1 buổi/tuần, lịch cố định" }, { text: "Mỗi năm học 45 buổi = 3 học phần Basic → Advanced → Expert" }, { text: `Cần chuẩn bị: ${PREPARE_TEXT}` }] });

const reportDay = () => sec("split", "bao-cao", {
  eyebrow: "Cứ 15 buổi một lần", title: "Con báo cáo dự án cuối khóa trước bố mẹ",
  body: "Buổi 15 của mỗi học phần là buổi báo cáo trực tuyến có phụ huynh tham dự. Gia đình nhận phiếu đánh giá 6 năng lực, 3 phẩm chất và chứng nhận học phần.",
  image: LP_ART.report, imageAlt: "Học viên báo cáo dự án cuối khóa trước phụ huynh (tranh minh hoạ)",
}, { points: REPORT_STEPS.map((r) => ({ text: `${r.title}: ${r.text}` })) });

const parents = () => sec("split", "dong-hanh", {
  eyebrow: "Đồng hành cùng phụ huynh", title: "Bố mẹ biết con học gì, tiến bộ ra sao",
  body: "Mỗi buổi học có nhận xét, ảnh và sản phẩm của con. Hồ sơ công nghệ lưu lại toàn bộ hành trình học tập.",
  image: LP_ART.parent, imageAlt: "Phụ huynh theo dõi năng lực và nhận xét của con trên điện thoại (tranh minh hoạ)",
}, { points: PARENT_ITEMS.map((r) => ({ text: `${r.title}: ${r.text}` })) });

const modules = () => sec("steps", "hoc-phan", { title: "Một học phần 15 buổi diễn ra thế nào", intro: "Học đi đôi với làm: con làm dự án ngay từ buổi đầu, cuối học phần tự làm dự án riêng." }, { items: MODULE_STEPS });
const competencies = () => sec("features", "nang-luc", { title: "Con phát triển 6 năng lực và 3 phẩm chất", intro: VIRTUE_TEXT }, { items: COMPETENCY_ITEMS });
const why = (title: string) => sec("features", "cam-ket", { title, intro: "Bốn điều giúp con vừa thích học, vừa thật sự tiến bộ." }, { items: WHY_ITEMS });
const register = () => sec("steps", "quy-trinh", { title: "Bắt đầu thật đơn giản", intro: "Bốn bước để con vào lớp." }, { items: REGISTER_STEPS });
const thanks = `Cảm ơn ba mẹ! ${B} sẽ gọi lại trong giờ làm việc để tư vấn và hẹn buổi học trải nghiệm 1:1 cho con.`;
const bottomForm = (title: string) => sec("form", "form", { title, subtitle: "Để lại số điện thoại, giáo viên tư vấn gọi lại để hẹn giờ học trải nghiệm 1:1 qua ClassIn.", thankYou: thanks });
const footer = () => sec("footer", "footer", {
  tagline: `${TH_BRAND.tagline} — ${TH_BRAND.taglineVi}. Robotics, AI, đồ họa và lập trình cho học sinh, học online cùng giáo viên qua ClassIn.`,
  email: "", phone: TH_BRAND.hotline, legal: TH_BRAND.legalName, copyright: `© 2026 ${B}`,
}, {
  addresses: [{ label: "Hình thức học", text: "Online qua ClassIn · lớp nhóm 6–8 học sinh · 90 phút/buổi" }, { label: "Website", text: TH_BRAND.website }, { label: "Fanpage", text: TH_BRAND.fanpage }],
  links: [
    ...TH_TRACKS.map((t) => ({ label: t.name, href: `/lp/${ADS_TRACK_SLUG[t.code]}` })),
    { label: "Trang chủ", href: "/" }, { label: "Điều khoản đăng ký học", href: "/chinh-sach/dieu-khoan" }, { label: "Chính sách bảo mật", href: "/chinh-sach/bao-mat" },
  ],
});
const cta = (title: string) => sec("cta", "cta", {
  title, text: "Con học một buổi 1:1 cùng giáo viên qua ClassIn trước khi đăng ký. Sau buổi học, giáo viên tư vấn lộ trình phù hợp.",
  primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "#dang-ky", secondaryLabel: `Gọi ${TH_BRAND.hotline}`, secondaryUrl: telHref,
}, { points: [{ text: "Học online tại nhà" }, { text: "Lớp nhóm 6–8 học sinh" }, { text: "Báo cáo trước phụ huynh mỗi 15 buổi" }] });

/* ------------------------------------------------------------------ nội dung theo chuyên ngành */

export const ADS_TRACK_SLUG: Record<ThTrackCode, string> = {
  ROBO: "robotics-ai-cho-tre",
  AI: "tri-tue-nhan-tao-ai-cho-hoc-sinh",
  DOHOA: "thiet-ke-do-hoa-ai-cho-hoc-sinh",
  CODE: "lap-trinh-ai-cho-tre-em",
};
export const ADS_HOME_SLUG = "hoc-cong-nghe-online";

function trackAgesOf(code: ThTrackCode) {
  const ps = thProgramsOfTrack(code);
  return { from: Math.min(...ps.map((p) => p.ageFrom)), to: Math.max(...ps.map((p) => p.ageTo)) };
}

/** Thẻ năm học: tên chuẩn, độ tuổi, phần mềm, 3 học phần, ảnh phần mềm thật */
function yearCards(code: ThTrackCode): Row[] {
  const out: Row[] = [];
  for (const p of thProgramsOfTrack(code)) {
    if (code === "CODE") {
      // Lập trình có 4 chương trình × 2 năm: mỗi thẻ là một chương trình theo cấp học
      const shot = YEAR_SHOT[yearCode(p, 1)];
      out.push({
        name: `${TH_LEVEL_VI[p.level]} ${ageRange(p.ageFrom, p.ageTo)}: ${p.name}`, badge: `${p.years.length} năm học · ${p.years.length * TH_SESSIONS_PER_YEAR} buổi`,
        meta: p.years.map((y) => yearCourseName(p, y)).join(" → "),
        text: p.years.map((y) => `${yearCourseName(p, y)}: ${y.modules.map((m) => m.name).join(", ")}${y.featuredProjects.length ? `. Dự án: ${y.featuredProjects.join(", ")}` : ""}.`).join(" "),
        price: "", url: "#dang-ky-nhanh", linkLabel: "Đăng ký học thử", image: shot?.image ?? LP_ART.CODE,
      });
      continue;
    }
    for (const y of p.years) {
      const shot = YEAR_SHOT[yearCode(p, y.no)];
      out.push({
        name: yearCourseName(p, y), badge: `${TH_LEVEL_VI[p.level]} · ${ageRange(y.ageFrom, y.ageTo)}`,
        meta: `${y.software} · ${TH_SESSIONS_PER_YEAR} buổi · 3 học phần`,
        text: y.modules.map((m) => `${moduleTitle(p, y, m)} (${TH_DIFFICULTY_PLAIN[m.difficulty]}): ${m.name} — sản phẩm: ${m.product}.`).join(" "),
        price: "", url: "#dang-ky-nhanh", linkLabel: "Đăng ký học thử", image: shot?.image ?? LP_ART[code],
      });
    }
  }
  return out.slice(0, 6);
}

/** Lộ trình: năm học nối tiếp + luyện thi tự chọn */
function roadmapOf(code: ThTrackCode): { items: Row[]; note: string } {
  const ps = thProgramsOfTrack(code);
  const items: Row[] = [];
  if (code === "CODE") {
    for (const p of ps) items.push({ step: `${TH_LEVEL_VI[p.level]} ${ageRange(p.ageFrom, p.ageTo)}`, name: p.name, meta: `${p.years.length} năm học · ${p.years.length * TH_SESSIONS_PER_YEAR} buổi`, text: p.years.map((y) => yearCourseName(p, y)).join(" → "), tag: "" });
    const exams = [...new Set(ps.flatMap((p) => p.contests.map((c) => c.short)))];
    return { items, note: `Luyện thi (tự chọn, học thêm sau năm học): ${exams.join(", ")}. Mỗi khóa luyện thi 30 buổi.` };
  }
  for (const p of ps) {
    for (const y of p.years) items.push({ step: ps.length > 1 ? `${TH_LEVEL_VI[p.level]} · Năm ${y.no}` : `Năm ${y.no}`, name: yearCourseName(p, y), meta: `${ageRange(y.ageFrom, y.ageTo)} · ${TH_SESSIONS_PER_YEAR} buổi`, text: y.modules.map((m) => m.name).join(" → "), tag: "" });
  }
  for (const p of ps) for (const c of p.contests) items.push({ step: "Luyện thi", name: examCourseName(p, c), meta: `${c.sessions} buổi · sau năm ${c.afterYear}`, text: c.eligibility ?? c.full, tag: "Tự chọn" });
  const notes = ps.map((p) => p.contestNote).filter(Boolean) as string[];
  return { items: items.slice(0, 6), note: notes[0] ?? "Khóa luyện thi là tự chọn, học thêm sau năm học tương ứng; học phí chưa gồm lệ phí dự thi." };
}

function toolsOf(code: ThTrackCode): Row[] {
  const r = (s: Shot, name: string, text: string, tag: string): Row => ({ image: s.image, credit: s.credit, name, text, tag });
  switch (code) {
    case "ROBO": return [
      r(SHOT.robosimSaBan, "RoboSim", "Phần mềm mô phỏng robot: con thiết kế robot 2 bánh, gắn cảm biến và lập trình làm nhiệm vụ trên sa bàn ảo.", "Năm 1 · 8–9 tuổi"),
      r(SHOT.robosimMoHinh, "Nhiệm vụ trên sa bàn", "Robot dò vạch, nhận màu, tránh vật cản — đúng dạng nhiệm vụ của Cuộc thi Sáng tạo Robotics.", "Năm 1"),
      r(SHOT.robovrMap, "RoboVR", "Robot ảo 3D giao diện tiếng Anh: chọn robot, lập trình và chạy thử trên nhiều bản đồ.", "Năm 2 · 9–10 tuổi"),
      r(SHOT.robovrCity, "Bản đồ thành phố 3D", "Cảm biến nhận diện làn đường, biển báo; phần mềm tự chấm điểm và thời gian.", "Năm 2"),
    ];
    case "DOHOA": return [
      r(SHOT.tinkercad, "Tinkercad", "Thiết kế mô hình 3D trên trình duyệt: ghép, cắt, căn chỉnh khối hình thành đồ vật, ngôi nhà, thành phố.", "Tiểu học · 8–10 tuổi"),
      r(SHOT.tinkercadGear, "Ghép khối thành sản phẩm", "Con dựng bánh răng, đồ vật theo kích thước — rèn tư duy không gian.", "Tiểu học"),
      r(SHOT.photoshop, "Adobe Photoshop", "Chỉnh sửa, ghép ảnh, thiết kế poster; dùng AI mở rộng khung ảnh theo câu mô tả.", "THCS · 11–14 tuổi"),
      r(SHOT.photoshopFill, "AI tạo sinh trong Photoshop", "Thêm, bớt chi tiết bằng câu lệnh — học cách dùng AI có trách nhiệm và tôn trọng bản quyền.", "THCS"),
    ];
    case "CODE": return [
      r(SHOT.scratch, "Scratch", "Lập trình kéo thả: hoạt hình kể chuyện, game đầu tay, game nhiều màn.", "Tiểu học · 8–9 tuổi"),
      r(SHOT.creaticode, "CreatiCode AI", "Khối lệnh AI và thế giới 3D: trợ lý AI của em, AI nhìn và hiểu.", "Tiểu học · 9–10 tuổi"),
      r(SHOT.roblox, "Roblox Studio", "Làm game 3D bằng Lua: nhảy nền thu xu, game nhiều người chơi.", "THCS · 11–12 tuổi"),
      r(SHOT.appinventor, "MIT App Inventor", "Làm app điện thoại bằng khối lệnh: app dữ liệu, bản đồ, app có AI.", "THCS · 12–13 tuổi"),
      r(SHOT.thonny, "Python", "Lập trình Python nền tảng, phần mềm Tkinter, game Pygame Zero.", "THCS · 13–14 tuổi"),
      r(SHOT.wordpress, "Web & WordPress", "HTML, CSS, JavaScript đến web full-stack và WordPress.", "THCS 14–15 · THPT"),
    ];
    case "AI": return [];
  }
}

const TRACK_COPY: Record<ThTrackCode, { h1: string; eyebrow: string; sub: string; points: string[]; seoTitle: string; seoDesc: string; keywords: string[]; faq: Row[]; why: string; cta: string }> = {
  ROBO: {
    h1: "Khóa học lập trình Robotics AI online cho trẻ 8–10 tuổi",
    eyebrow: "Lập trình Robotics AI · Tiểu học 8–10 tuổi",
    sub: "Con lập trình robot ảo RoboSim, RoboVR ngay tại nhà, cùng giáo viên dạy trực tiếp qua ClassIn. Không cần mua bộ robot.",
    points: ["Lộ trình 2 năm học · 90 buổi: RoboSim → RoboVR", "Mỗi buổi một sản phẩm; cuối học phần tự làm dự án riêng", "Làm quen dạng nhiệm vụ của Sáng tạo Robotics, ENJOY AI", "Báo cáo trước phụ huynh mỗi 15 buổi"],
    seoTitle: "Lập trình Robotics AI online cho trẻ 8–10 tuổi | TH STEAM",
    seoDesc: "Khóa học lập trình robot ảo RoboSim, RoboVR cho trẻ 8–10 tuổi: học online qua ClassIn, lớp 6–8 học sinh, 90 phút/buổi. Đăng ký học trải nghiệm 1:1.",
    keywords: ["khóa học robotics cho trẻ em", "học lập trình robot online", "lập trình robot cho trẻ 8 tuổi", "robosim", "robovr"],
    faq: [
      { q: "Con có cần mua bộ robot không?", a: "Không. Con lập trình robot ảo trên máy tính bằng phần mềm RoboSim (năm 1) và RoboVR (năm 2), học ngay tại nhà." },
      { q: "Máy tính cần cấu hình thế nào để học RoboVR?", a: "Theo khuyến nghị của WhalesBot cho RoboVR: Windows 10 64-bit, Intel Core i3 thế hệ 10 trở lên, RAM 8 GB, card đồ họa NVIDIA GTX 1060 hoặc AMD RX 580 trở lên, SSD còn trống 100 GB. Năm 1 (RoboSim) nhẹ hơn; giáo viên kiểm tra máy cùng gia đình ở buổi học trải nghiệm." },
      { q: "Học xong con có đi thi được không?", a: "Có khóa luyện thi tự chọn, học thêm sau năm học: Sáng tạo Robotics (sau năm 1) và ENJOY AI hạng mục Robot ảo 3D (sau năm 2), mỗi khóa 15 buổi. Học phí luyện thi chưa gồm lệ phí dự thi." },
    ],
    why: "Vì sao bố mẹ chọn khóa Robotics AI tại TH STEAM", cta: "Cho con thử lập trình robot ảo 1:1 cùng giáo viên",
  },
  AI: {
    h1: "Khóa học Trí tuệ nhân tạo AI cho học sinh 8–14 tuổi, học online",
    eyebrow: "Trí tuệ nhân tạo AI · Tiểu học & THCS",
    sub: "Con dùng AI để học, vẽ, làm nhạc, làm video và trang web — an toàn, có trách nhiệm, cùng giáo viên dạy trực tiếp qua ClassIn.",
    points: ["AI for kids (8–10 tuổi) và AI for teen (11–14 tuổi)", "Bám nội dung AI trong trường học từ năm học 2026–2027 (QĐ 2422)", "Công cụ theo đúng độ tuổi; dưới 13 tuổi do giáo viên thao tác", "Luyện thi tự chọn: Sáng tạo trẻ AI (THCS)"],
    seoTitle: "Khóa học AI cho học sinh 8–14 tuổi, học online | TH STEAM",
    seoDesc: "Học Trí tuệ nhân tạo cho học sinh: AI for kids 8–10 tuổi, AI for teen 11–14 tuổi. Học online qua ClassIn, lớp 6–8 học sinh. Đăng ký học trải nghiệm 1:1.",
    keywords: ["khóa học AI cho học sinh", "học trí tuệ nhân tạo cho trẻ em", "AI cho trẻ em", "học AI online"],
    faq: [
      { q: "Con dùng các công cụ AI có an toàn không?", a: "Công cụ dùng đúng độ tuổi của nhà cung cấp. Ví dụ ChatGPT, Suno từ 13 tuổi (13–18 tuổi cần phụ huynh đồng ý): với học sinh nhỏ hơn, giáo viên thao tác trên màn hình chung, con đưa ý tưởng và viết câu lệnh. Gemini dùng qua tài khoản Google có Family Link do phụ huynh bật." },
      { q: "Con học AI để làm gì?", a: "Con học dùng AI làm trợ lý học tập, tạo nội dung số (tranh, nhạc, video), làm trang web và dự án AI giải quyết vấn đề; đồng thời hiểu dữ liệu, rủi ro, quyền riêng tư và dùng AI trung thực." },
      { q: "Có khóa luyện thi AI không?", a: "Có cho THCS: Luyện thi Cuộc thi Sáng tạo trẻ quốc gia trong lĩnh vực AI (Bảng A – THCS), 15 buổi, tự chọn sau năm học. Cuộc thi chưa có bảng tiểu học." },
    ],
    why: "Vì sao bố mẹ chọn khóa AI tại TH STEAM", cta: "Cho con học thử AI 1:1 cùng giáo viên",
  },
  DOHOA: {
    h1: "Khóa học thiết kế đồ họa AI cho học sinh: 3D Tinkercad, Photoshop",
    eyebrow: "Thiết kế đồ họa AI · Tiểu học & THCS",
    sub: "Con dựng mô hình 3D với Tinkercad, chỉnh sửa và ghép ảnh với Photoshop cùng công cụ AI — giáo viên dạy trực tiếp qua ClassIn.",
    points: ["Tiểu học 8–10 tuổi: thiết kế 3D Tinkercad", "THCS 11–14 tuổi: Photoshop theo chuẩn kỹ năng ACP", "Sản phẩm thật: ngôi nhà mơ ước, poster, bìa sách", "Luyện thi tự chọn: ACP Photoshop (từ 13 tuổi)"],
    seoTitle: "Học thiết kế đồ họa 3D, Photoshop cho học sinh | TH STEAM",
    seoDesc: "Khóa học thiết kế đồ họa AI cho học sinh: mô hình 3D Tinkercad (8–10 tuổi), Photoshop và AI (11–14 tuổi). Học online qua ClassIn. Đăng ký học thử 1:1.",
    keywords: ["học thiết kế đồ họa cho học sinh", "khóa học photoshop cho học sinh", "học thiết kế 3D cho trẻ em", "tinkercad"],
    faq: [
      { q: "Con dùng tài khoản phần mềm thế nào?", a: "Tinkercad: trẻ dưới 13 tuổi dùng tài khoản được phụ huynh chấp thuận hoặc vào lớp do giáo viên tạo. Photoshop: tài khoản Adobe yêu cầu từ 13 tuổi, nên tài khoản học tập do trung tâm hoặc phụ huynh quản lý. Công cụ AI tạo ảnh ở tiểu học do giáo viên thao tác trong giờ học." },
      { q: "Có khóa luyện thi thiết kế không?", a: "Có cho THCS: Luyện thi ACP Photoshop (Vô địch Thiết kế đồ họa thế giới ACP, từ 13 tuổi), 15 buổi, tự chọn sau năm học. Nhóm tiểu học hiện chưa có cuộc thi thiết kế 3D chính thức phù hợp nên chưa mở khóa luyện thi." },
    ],
    why: "Vì sao bố mẹ chọn khóa thiết kế đồ họa tại TH STEAM", cta: "Cho con thử thiết kế 3D 1:1 cùng giáo viên",
  },
  CODE: {
    h1: "Khóa học lập trình cho trẻ em 8–18 tuổi: Scratch đến Python, web",
    eyebrow: "Lập trình & phát triển ứng dụng AI · 8 năm học",
    sub: "Từ Scratch, Roblox, App Inventor đến Python và lập trình web — 4 chặng theo cấp học, giáo viên dạy trực tiếp qua ClassIn.",
    points: ["Tiểu học: Scratch → CreatiCode AI", "THCS 11–13: Roblox Studio → App Inventor", "THCS 13–15: Python → lập trình web", "THPT: web full-stack → WordPress"],
    seoTitle: "Khóa học lập trình cho trẻ em 8–18 tuổi online | TH STEAM",
    seoDesc: "Học lập trình online cho trẻ em: Scratch, Roblox, App Inventor, Python, lập trình web theo cấp học 8–18 tuổi. Lớp 6–8 học sinh qua ClassIn. Học thử 1:1.",
    keywords: ["khóa học lập trình cho trẻ em", "học lập trình scratch online", "học python cho học sinh", "học lập trình roblox", "lập trình web cho học sinh"],
    faq: [
      { q: "Con bắt đầu từ chặng nào?", a: "Theo tuổi và mức độ của con: Tiểu học 8–10 tuổi bắt đầu từ Scratch; 11–13 tuổi từ Roblox Studio; 13–15 tuổi từ Python; THPT từ lập trình web full-stack. Giáo viên tư vấn chặng phù hợp sau buổi học trải nghiệm." },
      { q: "Có khóa luyện thi lập trình không?", a: "Có, tự chọn, học thêm sau năm học, mỗi khóa 30 buổi: Tin học trẻ, HKICO, KHKT và Tốt nghiệp THPT môn Tin học (tùy cấp học). Học phí chưa gồm lệ phí dự thi." },
    ],
    why: "Vì sao bố mẹ chọn khóa lập trình tại TH STEAM", cta: "Cho con học thử lập trình 1:1 cùng giáo viên",
  },
};

function trackPage(code: ThTrackCode): AdsLandingPage {
  const t = TH_TRACKS.find((x) => x.code === code)!;
  const c = TRACK_COPY[code];
  const a = trackAgesOf(code);
  const slug = ADS_TRACK_SLUG[code];
  return {
    slug, title: `Quảng cáo · ${t.name}`, template: `ads-${code}`, track: code, variant: "classic",
    seoTitle: c.seoTitle, seoDescription: c.seoDesc, seoImage: `/lp-anh/og-${slug}.png`, keywords: c.keywords,
    build(): LandingDoc {
      const road = roadmapOf(code);
      const tools = toolsOf(code);
      return {
        sections: [
          header(),
          sec("leadHero", "top", {
            eyebrow: c.eyebrow, title: c.h1, subtitle: c.sub, image: LP_ART[code],
            imageAlt: `${t.name} cho học sinh ${ageRange(a.from, a.to)}: học online cùng giáo viên (tranh minh hoạ)`,
            formTitle: "Đăng ký học trải nghiệm 1:1", formNote: "Giáo viên gọi lại tư vấn lộ trình phù hợp với con.",
            interest: TH_TRACK_SHORT[code], thankYou: thanks,
          }, { points: c.points.map((text) => ({ text })), badges: [{ text: "Học online qua ClassIn" }, { text: "Lớp 6–8 học sinh" }, { text: "90 phút/buổi" }] }),
          why(c.why),
          sec("roadmap", "lo-trinh", { title: `Lộ trình ${t.name} theo độ tuổi`, intro: `${ageRange(a.from, a.to)} · mỗi năm học 45 buổi = 3 học phần Basic → Advanced → Expert.`, note: road.note }, { items: road.items }),
          sec("programs", "khoa-hoc", { title: "Con học gì trong từng năm học", intro: "Tên khóa theo phần mềm con học; mỗi học phần kết thúc bằng một dự án do con tự làm." }, { items: yearCards(code) }),
          ...(tools.length ? [sec("tools", "cong-cu", { title: "Phần mềm thật con được học", intro: "Ảnh chụp phần mềm con dùng trong giờ học (nguồn ảnh ghi dưới mỗi hình)." }, { items: tools })] : []),
          liveClass(),
          modules(),
          cta(c.cta),
          reportDay(),
          competencies(),
          parents(),
          teacher(),
          register(),
          sec("faq", "faq", { title: `Câu hỏi bố mẹ hay hỏi về khóa ${t.name}` }, {
            items: [{ q: "Con bao nhiêu tuổi thì học được?", a: thProgramsOfTrack(code).map((p) => `${TH_LEVEL_VI[p.level]} ${ageRange(p.ageFrom, p.ageTo)}: ${p.name} (${p.years.length} năm học)`).join(". ") + "." }, ...c.faq, ...COMMON_FAQ].slice(0, 12),
          }),
          bottomForm(`Đăng ký học trải nghiệm ${t.name} cho con`),
          footer(),
        ],
      };
    },
  };
}

/* ------------------------------------------------------------------ trang chung */

const homePage: AdsLandingPage = {
  slug: ADS_HOME_SLUG, title: "Quảng cáo · Trang chung 4 chuyên ngành", template: "ads-chung", track: null, variant: "classic",
  seoTitle: "Khóa học công nghệ online cho trẻ 8–18 tuổi | TH STEAM",
  seoDescription: "Robotics, Trí tuệ nhân tạo AI, Thiết kế đồ họa và Lập trình cho học sinh 8–18 tuổi. Học online cùng giáo viên qua ClassIn, lớp 6–8 học sinh. Học thử 1:1.",
  seoImage: `/lp-anh/og-${ADS_HOME_SLUG}.png`,
  keywords: ["khóa học công nghệ cho trẻ em", "học lập trình cho trẻ online", "học robotics AI cho học sinh", "trung tâm STEAM online"],
  build(): LandingDoc {
    return {
      sections: [
        header(),
        sec("leadHero", "top", {
          eyebrow: `${TH_BRAND.wordmark} · ${TH_BRAND.tagline}`,
          title: "Khóa học công nghệ online cho trẻ 8–18 tuổi: Robotics, AI, đồ họa, lập trình",
          subtitle: "Con học cùng giáo viên dạy trực tiếp qua ClassIn, lớp nhỏ 6–8 học sinh. Mỗi học phần con tự làm dự án và báo cáo trước bố mẹ.",
          image: LP_ART.chung, imageAlt: "Học viên học công nghệ online cùng giáo viên qua ClassIn: robot, AI, thiết kế 3D, lập trình (tranh minh hoạ)",
          formTitle: "Đăng ký học trải nghiệm 1:1", formNote: "Chọn chuyên ngành con thích — giáo viên tư vấn lộ trình theo độ tuổi.",
          interest: "", thankYou: thanks,
        }, {
          points: [{ text: "4 chuyên ngành, lộ trình theo cấp học Tiểu học · THCS · THPT" }, { text: "Bám GDPT 2018 môn Tin học và nội dung AI 2026–2027" }, { text: "Phần mềm thật: RoboSim, Tinkercad, Scratch, Python…" }, { text: "Báo cáo trước phụ huynh mỗi 15 buổi" }],
          badges: [{ text: "Học online qua ClassIn" }, { text: "Lớp 6–8 học sinh" }, { text: "90 phút/buổi" }],
        }),
        why(`Vì sao phụ huynh chọn ${B}`),
        sec("roadmap", "lo-trinh", { title: "4 chuyên ngành, lộ trình theo độ tuổi", intro: "Mỗi năm học 45 buổi = 3 học phần Basic → Advanced → Expert. Luyện thi là tự chọn, học thêm sau năm học.", note: "Chưa biết chọn chuyên ngành nào? Đăng ký học trải nghiệm 1:1 — giáo viên tư vấn theo sở thích và độ tuổi của con." }, {
          items: TH_TRACKS.map((t) => { const a = trackAgesOf(t.code); return { step: ageRange(a.from, a.to), name: t.name, meta: thProgramsOfTrack(t.code).map((p) => p.name).join(" | "), text: t.tagline ?? "", tag: "" }; }),
        }),
        sec("programs", "khoa-hoc", { title: "Con học gì ở từng chuyên ngành", intro: "Bấm vào từng chuyên ngành để xem lộ trình, phần mềm và dự án chi tiết." }, {
          items: TH_TRACKS.map((t) => {
            const a = trackAgesOf(t.code);
            const ps = thProgramsOfTrack(t.code);
            return { name: t.name, badge: ageRange(a.from, a.to), meta: ps.map((p) => `${TH_LEVEL_VI[p.level]}: ${p.name}`).join(" · "), text: t.tagline ?? "", price: "", url: `/lp/${ADS_TRACK_SLUG[t.code]}`, linkLabel: "Xem lộ trình", image: LP_ART[t.code] };
          }),
        }),
        sec("tools", "cong-cu", { title: "Phần mềm thật con được học", intro: "Ảnh chụp phần mềm con dùng trong giờ học (nguồn ảnh ghi dưới mỗi hình)." }, {
          items: [
            { ...SHOT.robovrMap, name: "RoboVR", text: "Robot ảo 3D — Robotics AI năm 2.", tag: "9–10 tuổi" },
            { ...SHOT.tinkercad, name: "Tinkercad", text: "Thiết kế mô hình 3D — Thiết kế đồ họa AI.", tag: "8–10 tuổi" },
            { ...SHOT.scratch, name: "Scratch", text: "Lập trình kéo thả — Lập trình AI chặng 1.", tag: "8–9 tuổi" },
            { ...SHOT.roblox, name: "Roblox Studio", text: "Làm game 3D bằng Lua — Lập trình AI chặng 2.", tag: "11–12 tuổi" },
            { ...SHOT.photoshop, name: "Adobe Photoshop", text: "Thiết kế ảnh cùng AI — Đồ họa AI THCS.", tag: "11–14 tuổi" },
            { ...SHOT.thonny, name: "Python", text: "Phần mềm và game bằng Python — Lập trình AI chặng 3.", tag: "13–14 tuổi" },
          ].map((r) => ({ image: r.image, credit: r.credit, name: r.name, text: r.text, tag: r.tag })),
        }),
        liveClass(),
        cta("Cho con học trải nghiệm 1:1 cùng giáo viên"),
        reportDay(),
        competencies(),
        parents(),
        modules(),
        teacher(),
        register(),
        sec("faq", "faq", { title: "Câu hỏi bố mẹ hay hỏi" }, {
          items: [
            { q: "Con bao nhiêu tuổi thì học được?", a: "Tiểu học 8–10 tuổi học được cả 4 chuyên ngành; THCS 11–15 tuổi có AI for teen, Photoshop, Roblox → App Inventor, Python → lập trình web; THPT 15–18 tuổi có lập trình web full-stack → WordPress." },
            { q: "Chưa biết con hợp chuyên ngành nào?", a: "Đăng ký học trải nghiệm 1:1: con học một buổi cùng giáo viên qua ClassIn, sau đó giáo viên tư vấn chuyên ngành và năm học phù hợp với sở thích, độ tuổi của con." },
            ...COMMON_FAQ,
          ].slice(0, 12),
        }),
        bottomForm("Đăng ký học trải nghiệm 1:1 cho con"),
        footer(),
      ],
    };
  },
};

export const ADS_LANDINGS: readonly AdsLandingPage[] = [homePage, ...TH_TRACKS.map((t) => trackPage(t.code))];
export const isAdsTemplate = (template: string | null | undefined): boolean => !!template && template.startsWith("ads-");
/** Lựa chọn "chuyên ngành quan tâm" trong form gọn (giá trị = tên ngắn, hiện = tên đầy đủ) */
export const LEAD_INTERESTS: readonly { value: string; label: string }[] = [
  ...TH_TRACKS.map((t) => ({ value: TH_TRACK_SHORT[t.code], label: t.name })),
  { value: "Chưa rõ", label: "Chưa rõ — cần tư vấn" },
];

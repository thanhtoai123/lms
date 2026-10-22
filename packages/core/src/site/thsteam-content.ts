/**
 * CHỮ DÙNG CHUNG CỦA WEBSITE TH STEAM ACADEMY — trang chủ (landing/home.ts) và các trang con (site/demo.ts).
 *
 * Nguồn: danh mục chương trình chuẩn (curriculum/thsteam-data.ts, sinh từ bộ slide đã duyệt) và bộ nhận diện (system/th-brand.ts).
 * Nguyên tắc: chỉ ghi điều có trong bộ slide / bộ nhận diện; không tự thêm số liệu, giải thưởng, cam kết "miễn phí", "số 1"…
 * Số buổi, độ tuổi, tên cuộc thi, học phí đọc thẳng từ danh mục để website luôn khớp với hệ thống.
 */
import {
  TH_PRICING, TH_PROGRAMS, TH_TRACKS, TH_LEVEL_VI, TH_SESSIONS_PER_YEAR, TH_DIFFICULTY_PLAIN, ageRange, yearCourseName, moduleTitle, examCourseName, thProgramsOfTrack,
  type ThProgram, type ThSchoolLevel, type ThTrack, type ThTrackCode,
} from "../curriculum/thsteam.js";
import { TH_BRAND } from "../system/th-brand.js";

type Row = Record<string, string>;

/** Ảnh minh hoạ vector đi kèm ứng dụng (apps/web/public/anh-site) — không phải ảnh người thật */
export const TH_ART = {
  hero: "/anh-site/th-hero-hoc-online.svg",
  ROBO: "/anh-site/khoa-lap-trinh-robot.svg",
  AI: "/anh-site/th-ai.svg",
  DOHOA: "/anh-site/th-do-hoa.svg",
  CODE: "/anh-site/th-lap-trinh.svg",
  present: "/anh-site/canh-thuyet-trinh.svg",
  coding: "/anh-site/canh-lap-trinh.svg",
} as const;

/** Trang của từng chuyên ngành trên website (slug khoa-hoc-<x> → /khoa-hoc/<x>) */
export const TH_TRACK_PAGE: Record<ThTrackCode, { slug: string; path: string }> = {
  ROBO: { slug: "khoa-hoc-robotics-ai", path: "/khoa-hoc/robotics-ai" },
  AI: { slug: "khoa-hoc-tri-tue-nhan-tao-ai", path: "/khoa-hoc/tri-tue-nhan-tao-ai" },
  DOHOA: { slug: "khoa-hoc-thiet-ke-do-hoa-ai", path: "/khoa-hoc/thiet-ke-do-hoa-ai" },
  CODE: { slug: "khoa-hoc-lap-trinh-ung-dung-ai", path: "/khoa-hoc/lap-trinh-ung-dung-ai" },
};

export const vnd = (n: number): string => `${n.toLocaleString("de-DE")}đ`;
export const telHref = `tel:${TH_BRAND.hotlineTel}`;
const LEVELS: ThSchoolLevel[] = ["tieu-hoc", "thcs", "thpt"];

/** Khoá neo của khối lộ trình từng chương trình: "lo-trinh-robo-th" */
export const programAnchor = (p: ThProgram): string => `lo-trinh-${p.code.toLowerCase()}`;

export function trackAges(t: ThTrack): { from: number; to: number } {
  const ps = thProgramsOfTrack(t.code);
  return { from: Math.min(...ps.map((p) => p.ageFrom)), to: Math.max(...ps.map((p) => p.ageTo)) };
}
export function trackYears(t: ThTrack): number {
  return thProgramsOfTrack(t.code).reduce((n, p) => n + p.years.length, 0);
}
/** "Tiểu học · THCS" */
export function trackLevels(t: ThTrack): string {
  const have = new Set(thProgramsOfTrack(t.code).map((p) => p.level));
  return LEVELS.filter((l) => have.has(l)).map((l) => TH_LEVEL_VI[l]).join(" · ");
}
/** Cắt chuỗi ở ranh giới "; " / " · " / ", " gần nhất để không đứt giữa từ */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(" · "), cut.lastIndexOf(", "));
  return (at > max * 0.4 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(" "))).trim();
}

/** Thẻ 4 chuyên ngành (khối "programs") */
export function trackCards(linkLabel = "Xem chương trình"): Row[] {
  return TH_TRACKS.map((t) => {
    const a = trackAges(t);
    const ps = thProgramsOfTrack(t.code);
    return {
      name: t.name, badge: trackLevels(t),
      text: t.tagline ?? "",
      meta: clip(`${ageRange(a.from, a.to)} · ${trackYears(t)} năm học · ${ps.map((p) => p.name).join(" | ")}`, 120),
      price: "", url: TH_TRACK_PAGE[t.code].path, linkLabel, image: TH_ART[t.code],
    };
  });
}

/** Một dòng lộ trình theo cấp học (giống slide "Lộ trình 4 chuyên ngành theo cấp học") */
export function overviewLines(): string[] {
  const out: string[] = [];
  for (const t of TH_TRACKS) {
    out.push(`## ${t.name}`);
    for (const l of LEVELS) {
      const ps = TH_PROGRAMS.filter((p) => p.track === t.code && p.level === l);
      if (!ps.length) { out.push(`- **${TH_LEVEL_VI[l]}:** Chưa mở`); continue; }
      for (const p of ps) {
        const n = p.years.length;
        const exams = p.contests.map((c) => c.short).join(", ");
        out.push(`- **${TH_LEVEL_VI[l]} · ${ageRange(p.ageFrom, p.ageTo)}:** ${p.years.map((y) => y.software).join(" → ")} · ${n} năm học · ${n * TH_SESSIONS_PER_YEAR} buổi${exams ? ` · Luyện thi: ${exams}` : ""}`);
      }
    }
    out.push("");
  }
  return out;
}

/** Bảng học phí năm học (thẻ "programs" có giá) — đúng TH_PRICING */
export function priceCards(): Row[] {
  const y = TH_PRICING.year, c = TH_PRICING.combo, e = TH_PRICING.exam;
  const row = (name: string, badge: string, text: string, meta: string, price: number): Row => ({ name, badge, text, meta, price: vnd(price), url: "/hoc-thu-mien-phi", linkLabel: "Đăng ký học trải nghiệm", image: "" });
  return [
    row("Lớp nhóm · 1 năm học", "Lớp 6–8 học sinh", `Niêm yết ${vnd(y.group.list)}, giảm ${y.group.discountPct}%.`, `${y.sessions} buổi · 90 phút/buổi`, y.group.price),
    row("Lớp nhóm · combo 2 năm học", "Lớp 6–8 học sinh", `Niêm yết ${vnd(c.group.list)}, giảm ${c.group.discountPct}%.`, `${c.sessions} buổi · 90 phút/buổi`, c.group.price),
    row("Kèm 1:1 · 1 năm học", "1 giáo viên – 1 học sinh", `Niêm yết ${vnd(y.oneToOne.list)} (bằng 3 lần lớp nhóm), giảm ${y.oneToOne.discountPct}%.`, `${y.sessions} buổi · 90 phút/buổi`, y.oneToOne.price),
    row("Kèm 1:1 · combo 2 năm học", "1 giáo viên – 1 học sinh", `Niêm yết ${vnd(c.oneToOne.list)}, giảm ${c.oneToOne.discountPct}%.`, `${c.sessions} buổi · 90 phút/buổi`, c.oneToOne.price),
    row("Luyện thi 15 buổi", "Tự chọn", `Robotics, AI, Đồ họa. Kèm 1:1: ${vnd(e[15]!.oneToOne)}. Chưa gồm lệ phí dự thi.`, "15 buổi · học thêm sau năm học", e[15]!.group),
    row("Luyện thi 30 buổi", "Tự chọn", `Lập trình. Kèm 1:1: ${vnd(e[30]!.oneToOne)}. Chưa gồm lệ phí dự thi.`, "30 buổi · học thêm sau năm học", e[30]!.group),
  ];
}

/** Vì sao chọn TH STEAM (thẻ features) */
export const WHY_ITEMS: Row[] = [
  { title: "Giáo viên dạy trực tiếp qua ClassIn", text: "Mỗi buổi học có giáo viên dạy trực tiếp. Con học ngay tại nhà, không cần đi lại." },
  { title: "Lớp nhỏ 6–8 học sinh", text: "Giáo viên theo sát, sửa bài cho từng bạn. Có lớp kèm 1:1 khi gia đình cần." },
  { title: "Bám sát chương trình giáo dục mới", text: "Theo GDPT 2018 môn Tin học, khung năng lực số (Thông tư 02/2025) và nội dung AI trong trường học từ năm học 2026–2027." },
  { title: "Cứ 15 buổi, một buổi báo cáo", text: "Con trình bày dự án trước phụ huynh và nhận phiếu đánh giá 6 năng lực, 3 phẩm chất." },
];

/** 6 năng lực (3 nhóm) — khung đánh giá học bạ */
export const COMPETENCY_ITEMS: Row[] = [
  { title: "Tư duy công nghệ", text: "Nhóm Tư duy · Chia nhỏ vấn đề, tìm quy luật, viết các bước giải cho robot, cho AI, cho chương trình." },
  { title: "Tư duy phản biện", text: "Nhóm Tư duy · Tìm lỗi, so sánh cách giải, kiểm chứng kết quả trước khi tin." },
  { title: "Kỹ năng vi tính", text: "Nhóm Kỹ năng số · Thao tác máy tính, cài phần mềm, quản lý tệp, học online." },
  { title: "Tiếng Anh chuyên ngành", text: "Nhóm Kỹ năng số · Đọc hiểu thuật ngữ và giao diện tiếng Anh của phần mềm." },
  { title: "Tự tin, trình bày", text: "Nhóm Bản lĩnh · Báo cáo dự án sau mỗi học phần, tự tin trả lời câu hỏi." },
  { title: "Tự chủ, hành vi số", text: "Nhóm Bản lĩnh · Tập trung, kiên trì, dùng máy tính và AI an toàn, trung thực." },
];
export const VIRTUE_TEXT = "3 phẩm chất (thái độ học tập): Chăm chỉ · Trách nhiệm · Trung thực. Mỗi tiêu chí đánh giá theo 3 mức Tốt / Đạt / Cần cố gắng, như cách đánh giá ở trường (Thông tư 27/2020).";

/** Một buổi học 90 phút */
export const SESSION_STEPS: Row[] = [
  { title: "10 phút · Khởi động", text: "Câu chuyện, tình huống mở đầu bài học." },
  { title: "15 phút · Khám phá", text: "Giáo viên giới thiệu kiến thức mới, làm mẫu trên phần mềm." },
  { title: "30 phút · Thực hành", text: "Con tự làm theo hướng dẫn trên máy tính của mình." },
  { title: "25 phút · Thử thách", text: "Con tự sáng tạo, nâng cấp sản phẩm của mình." },
  { title: "10 phút · Chia sẻ", text: "Con trình bày và nghe nhận xét của giáo viên, bạn bè." },
];

/** Cấu trúc học phần 15 buổi */
export const MODULE_STEPS: Row[] = [
  { title: "Buổi 1–4 và 6–12 · Dự án sáng tạo", text: "Mỗi buổi con học một kiến thức mới và làm một sản phẩm." },
  { title: "Buổi 5 · Ôn tập & kiểm tra", text: "Củng cố kiến thức, kiểm tra giữa học phần, hoàn thiện sản phẩm cùng giáo viên." },
  { title: "Buổi 13–14 · Dự án & demo cuối khoá", text: "Con tự lên ý tưởng, xây dựng và trình diễn (demo) dự án cuối khoá." },
  { title: "Buổi 15 · Báo cáo cuối khoá", text: "Con báo cáo dự án trước phụ huynh, nhận phiếu đánh giá." },
];

/** Buổi báo cáo (buổi 15) — 4 bước */
export const REPORT_STEPS: Row[] = [
  { title: "Con trình bày", text: "Ý tưởng, cách làm, khó khăn đã vượt qua. Rèn kỹ năng trình bày." },
  { title: "Chạy dự án trực tiếp", text: "Con vận hành sản phẩm ngay trên phần mềm. Rèn tư duy." },
  { title: "Hỏi – đáp", text: "Bố mẹ, bạn bè đặt câu hỏi, con trả lời. Rèn phản biện." },
  { title: "Nhận xét", text: "Giáo viên đánh giá và gợi ý bước học tiếp theo." },
];

/** Đồng hành cùng phụ huynh */
export const PARENT_ITEMS: Row[] = [
  { title: "Nhóm Zalo lớp học", text: "Lịch học, thông báo của lớp; ảnh, video sản phẩm sau mỗi buổi; nhận xét ngắn của giáo viên." },
  { title: "Hệ thống học tập (LMS)", text: "Bài học và bài tập theo tuần, xem lại video buổi học, theo dõi chuyên cần." },
  { title: "Hồ sơ công nghệ", text: "Lưu mọi dự án, video demo, phiếu đánh giá năng lực, chứng nhận học phần của con." },
  { title: "Buổi báo cáo học phần", text: "Buổi 15 của mỗi học phần: con trình bày dự án, phụ huynh tham dự trực tuyến." },
];

/** Quy trình đăng ký (điều khoản đăng ký học) */
export const REGISTER_STEPS: Row[] = [
  { title: "Học trải nghiệm 1:1", text: "Con học một buổi 1:1 cùng giáo viên qua ClassIn trước khi đăng ký." },
  { title: "Tư vấn lộ trình", text: "Giáo viên gợi ý chuyên ngành, chương trình và năm học phù hợp với con." },
  { title: "Ký phiếu, đóng học phí", text: "Phiếu đăng ký ghi rõ gói học, cấp độ, lịch học và giáo viên phụ trách." },
  { title: "Vào lớp khai giảng", text: "Lịch cố định 1 buổi/tuần, 90 phút/buổi. Đóng học phí ít nhất 3 ngày trước khai giảng để được xếp lớp." },
];

export const PREPARE_TEXT = "Máy tính có camera, tai nghe có micro và Internet ổn định. Ưu tiên máy tính cấu hình tốt, nhất là khi học phần mềm 3D.";

/** Giảng viên — theo slide "Giảng viên đào tạo" đã duyệt */
export const TEACHER = {
  name: "Thầy Phan Thành Toại",
  role: "Nhà sáng lập TH STEAM Academy",
  text: "6 năm giảng dạy và phát triển chương trình đào tạo công nghệ số (EdTech). Giáo viên đạt chuẩn STEM.org Certified Educational Instructor (10/9/2026). Huấn luyện viên đội tuyển Robotics, Tin học trẻ, KHKT, HKICO.",
  motto: "“Dạy bằng sự tận tâm và trách nhiệm, để mỗi học sinh tự tin làm chủ công nghệ.”",
} as const;

/** Hỏi đáp chung (lấy từ điều khoản đăng ký học và chuẩn chương trình) */
export const COMMON_FAQ: Row[] = [
  { q: "Con học online như thế nào?", a: "Giáo viên dạy trực tiếp qua ClassIn. Lớp nhóm 6–8 học sinh, 90 phút/buổi, 1 buổi/tuần; mỗi năm học 45 buổi chia 3 học phần Basic (Nền tảng) → Advanced (Nâng cao) → Expert (Chuyên sâu)." },
  { q: "Cần chuẩn bị gì để học?", a: PREPARE_TEXT },
  { q: "Bố mẹ theo dõi con học thế nào?", a: "Qua nhóm Zalo lớp, hệ thống học tập (LMS) và hồ sơ công nghệ của con. Cuối mỗi học phần (buổi 15), con báo cáo dự án trước phụ huynh và gia đình nhận phiếu đánh giá 6 năng lực, 3 phẩm chất." },
  { q: "Con nghỉ học có được học bù không?", a: "Báo nghỉ trước ít nhất 24 giờ qua Zalo lớp hoặc hotline thì được học bù, tối đa 3 buổi mỗi năm học. Nghỉ không báo trước thì không học bù. Trung tâm hủy buổi học thì bù đủ 100%." },
  { q: "Có bảo lưu hoặc chuyển nhượng được không?", a: "Bảo lưu tối đa 6 tháng, 1 lần mỗi năm học, báo trước 7 ngày; học phí bảo lưu giữ nguyên giá trị. Có thể chuyển nhượng 1 lần các buổi chưa học cho học sinh khác." },
  { q: "Khóa luyện thi học khi nào?", a: "Khóa luyện thi là tự chọn, học thêm sau năm học tương ứng. Học phí khóa luyện thi chưa gồm lệ phí dự thi (do ban tổ chức cuộc thi thu riêng)." },
];

/** Điều khoản đăng ký học (nguyên ý bộ slide "Điều khoản đăng ký học 1/2, 2/2") */
export function termsMarkdown(): string {
  return [
    "Điều khoản áp dụng khi phụ huynh đăng ký cho con học tại " + TH_BRAND.name + ` (${TH_BRAND.legalName}).`,
    "",
    "## 1. Học phí",
    "- Con học trải nghiệm 1:1 trước khi đăng ký.",
    "- Đóng trọn học phí ít nhất 3 ngày trước khai giảng để được xếp lớp.",
    "- Ưu đãi theo bảng học phí từng năm học; lệ phí dự thi do ban tổ chức cuộc thi thu riêng.",
    "",
    "## 2. Chương trình đăng ký",
    "- Phiếu đăng ký ghi rõ gói học, cấp độ, lịch học và giáo viên phụ trách.",
    "- Lịch cố định 1 buổi/tuần, 90 phút/buổi.",
    "- Đổi lịch hoặc chuyển lớp 1 lần mỗi học phần, khi lớp còn chỗ.",
    "",
    "## 3. Quy chuẩn lớp học online",
    "- Vào ClassIn đúng giờ, bật camera và micro.",
    "- Máy tính, Internet đáp ứng yêu cầu của khóa học.",
    "- Tôn trọng thầy cô, bạn bè; tự làm sản phẩm của mình.",
    "- Không quay video, chụp ảnh chia sẻ buổi học ra bên ngoài.",
    "",
    "## 4. Nghỉ học và học bù",
    "- Báo nghỉ trước ít nhất 24 giờ qua Zalo lớp hoặc hotline.",
    "- Được học bù tối đa 3 buổi mỗi năm học (lớp bù cùng nội dung, hoặc video bài giảng kèm bài tập có giáo viên chữa).",
    "- Nghỉ không báo trước: không học bù.",
    "- Trung tâm hủy buổi học: bù đủ 100%.",
    "",
    "## 5. Bảo lưu và chuyển nhượng",
    "- Bảo lưu tối đa 6 tháng, 1 lần mỗi năm học, báo trước 7 ngày. Khi quay lại, con được xếp vào lớp có nội dung tương ứng.",
    "- Học phí bảo lưu giữ nguyên giá trị.",
    "- Chuyển nhượng 1 lần các buổi chưa học cho học sinh khác.",
    "",
    "## 6. Hoàn học phí",
    "- Hoàn 100% phần chưa học nếu trung tâm không mở được lớp hoặc hủy lớp.",
    "- Hoàn trong 14 ngày làm việc.",
    "- Lý do cá nhân: không hoàn, được bảo lưu hoặc chuyển nhượng.",
    "",
    "## 7. Phản ánh chất lượng",
    `- Qua Zalo lớp hoặc hotline ${TH_BRAND.hotline}.`,
    "- Phản hồi trong 24 giờ, xử lý trong 5 ngày làm việc.",
    "- Khảo sát hài lòng cuối mỗi học phần.",
    "",
    "## 8. Hình ảnh của con",
    "- Dùng cho hồ sơ công nghệ của con.",
    "- Chỉ dùng cho truyền thông khi phụ huynh đồng ý bằng văn bản, theo quy định pháp luật về bảo vệ dữ liệu cá nhân.",
    "",
    "## Quy trình đăng ký",
    "1. Học trải nghiệm 1:1",
    "2. Tư vấn lộ trình phù hợp",
    "3. Ký phiếu, đóng học phí",
    "4. Vào lớp khai giảng",
  ].join("\n");
}

/** Nội dung lộ trình một chương trình (khối chữ): năm học → 3 học phần → con thay đổi gì */
export function programMarkdown(p: ThProgram): string {
  const out: string[] = [];
  for (const y of p.years) {
    out.push(`## ${yearCourseName(p, y)} · ${y.title} (${ageRange(y.ageFrom, y.ageTo)})`);
    out.push(`**Phần mềm:** ${y.software} · ${TH_SESSIONS_PER_YEAR} buổi = 3 học phần × 15 buổi.${y.featuredProjects.length ? ` **Dự án tiêu biểu:** ${y.featuredProjects.join("; ")}.` : ""}`);
    out.push("");
    for (const m of y.modules) out.push(`- **${moduleTitle(p, y, m)} (${TH_DIFFICULTY_PLAIN[m.difficulty]}) — ${m.name}.** Con học: ${m.learn}. Sản phẩm: ${m.product}. Con làm được: ${m.canDo}`);
    out.push("");
  }
  if (p.contests.length) {
    out.push("## Luyện thi (tự chọn)");
    for (const c of p.contests) out.push(`- **${examCourseName(p, c)}** (${c.full}) · ${c.sessions} buổi · sau Năm ${c.afterYear}${c.eligibility ? `. ${c.eligibility}` : ""}`);
    out.push("");
  } else if (p.contestNote) { out.push(`**Luyện thi:** ${p.contestNote}`); out.push(""); }
  if (p.growth.length) {
    const two = p.years.length > 1;
    out.push(`## Con thay đổi gì sau ${two ? "mỗi năm học" : "năm học"}`);
    for (const g of p.growth) out.push(`- **${g.criterion}:** ${g.before} → ${g.after1}${two && g.after2 ? ` → ${g.after2}` : ""}`);
  }
  return out.join("\n").trim();
}

/** Nhãn "Tiểu học 8–10 tuổi · RoboSim → RoboVR" */
export const programLabel = (p: ThProgram): string => `${TH_LEVEL_VI[p.level]} ${ageRange(p.ageFrom, p.ageTo)} · ${p.name}`;

/** Chữ mặc định của trang /dang-ky (khối "register") */
export const TH_REGISTER_BLOCK = {
  title: "Đăng ký học trải nghiệm 1:1",
  subtitle: "Con học trực tuyến 1:1 cùng thầy và tự tay làm sản phẩm; sau buổi học, thầy đánh giá và gợi ý lộ trình riêng cho con. Không mất phí.",
  thankYou: `Cảm ơn ba mẹ! ${TH_BRAND.name} sẽ liên hệ lại trong giờ làm việc để hẹn buổi học trải nghiệm.`,
  button: "Đặt lịch học trải nghiệm 1:1",
} as const;

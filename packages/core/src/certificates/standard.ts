/**
 * NỘI DUNG CHUẨN IN TRÊN GIẤY CHỨNG NHẬN TH STEAM ACADEMY — một nguồn duy nhất cho mọi nơi cấp chứng nhận
 * (duyệt hoàn thành khoá, cấp chứng nhận lộ trình, dữ liệu mẫu, đồng bộ danh mục chuẩn).
 *
 * Giấy chứng nhận khoá (một năm học = 3 học phần × 15 buổi), từ trên xuống:
 *   GIẤY CHỨNG NHẬN · Trân trọng chứng nhận
 *   NGUYỄN MINH AN                       ← tên học viên (IN HOA)
 *   đã hoàn thành chương trình
 *   LẬP TRÌNH ROBOVR                     ← tên môn của năm học, IN HOA, không ghi "Năm N"
 *   Chuyên ngành Lập trình Robotics AI   ← không ghi cấp học / độ tuổi
 *   45 buổi học · 3 học phần: Basic – Advanced – Expert
 *   Xếp loại: Hoàn thành tốt
 *   [QR] Số: …        [dấu triện]        Đà Nẵng, ngày 23 tháng 8 năm 2026 · GIÁM ĐỐC TRUNG TÂM · (ký) · Họ tên
 *
 * Không in ngày sinh (vẫn chụp vào bản ghi để đối chiếu). Không lặp tên khoá ở dòng thời lượng.
 */
import {
  TH_MODULES_PER_YEAR, TH_PROGRAMS, TH_SESSIONS_PER_YEAR, TH_DIFFICULTY_SHORT, examCourseCode, thTrack, yearCourseCode, yearSubjectName,
} from "../curriculum/thsteam.js";
import type { ThProgram } from "../curriculum/thsteam-types.js";
import { TH_BRAND } from "../system/th-brand.js";
import { defaultTemplateFields, type TemplateField, type TemplateOrientation } from "./rules.js";

/**
 * Người ký và nơi cấp mặc định của mẫu chuẩn. Trung tâm sửa được ở Lộ trình → Mẫu chứng nhận (ô "Tên người ký",
 * "Chức danh người ký", "Ngày cấp → địa danh"); giấy đã cấp giữ nguyên người ký lúc cấp.
 */
export const TH_CERTIFICATE_SIGNER = {
  title: "Giám đốc trung tâm",
  name: "Phan Thành Toại",
  /** Địa danh trước ngày cấp — trụ sở pháp nhân của trung tâm */
  place: "Đà Nẵng",
} as const;

export interface CertificateAchievement {
  /** Dòng lớn: tên khoá / lộ trình */
  name: string;
  /** Dòng chuyên ngành / chương trình */
  description: string | null;
  /** Dòng thời lượng / điều kiện đạt */
  criteriaText: string;
}

function programOfCode(code: string): ThProgram | null {
  return TH_PROGRAMS.find((p) => code === p.code || code.startsWith(`${p.code}-N`) || code.startsWith(`${p.code}-THI-`)) ?? null;
}

/** Tên chuyên ngành, không kèm cấp học: "Lập trình Robotics AI" */
const trackName = (p: ThProgram) => thTrack(p.track)?.name ?? p.name;

const levelsLine = () => (["basic", "advanced", "expert"] as const).map((d) => TH_DIFFICULTY_SHORT[d]).join(" – ");

/** Nội dung in cho chứng nhận hoàn thành KHOÁ (một năm học, hoặc khoá luyện thi) */
export function courseCertificateAchievement(course: { code: string; name: string; totalSessions?: number | null }): CertificateAchievement {
  const p = programOfCode(course.code);
  const sessions = course.totalSessions ?? null;
  if (p) {
    const year = p.years.find((y) => yearCourseCode(p, y.no) === course.code);
    if (year) {
      return {
        name: yearSubjectName(p, year),
        description: `Chuyên ngành ${trackName(p)}`,
        criteriaText: `${sessions ?? TH_SESSIONS_PER_YEAR} buổi học · ${TH_MODULES_PER_YEAR} học phần: ${levelsLine()}`,
      };
    }
    const contest = p.contests.find((c) => examCourseCode(p, c) === course.code);
    if (contest) {
      return {
        name: `Luyện thi: ${contest.short}`,
        description: `Chuyên ngành ${trackName(p)}`,
        criteriaText: `${sessions ?? contest.sessions} buổi học · khóa luyện thi tự chọn`,
      };
    }
  }
  return { name: course.name.trim(), description: null, criteriaText: sessions ? `${sessions} buổi học` : "Hoàn thành chương trình khoá học" };
}

/** Nội dung in cho chứng nhận hoàn thành LỘ TRÌNH (cả chương trình nhiều năm học) */
export function pathCertificateAchievement(path: { code: string; name: string; criteriaText?: string | null }): CertificateAchievement {
  const p = TH_PROGRAMS.find((x) => x.code === path.code) ?? null;
  if (p) {
    const n = p.years.length;
    return {
      name: trackName(p),
      description: `Lộ trình ${n} năm học: ${p.years.map((y) => yearSubjectName(p, y)).join(" → ")}`,
      criteriaText: `${n * TH_SESSIONS_PER_YEAR} buổi học · ${n * TH_MODULES_PER_YEAR} học phần`,
    };
  }
  const crit = (path.criteriaText ?? "").trim();
  return { name: path.name.trim(), description: null, criteriaText: crit || `Hoàn thành các khoá bắt buộc của ${path.name.trim()}` };
}

/** Ô trường của MẪU CHUẨN (nền dựng sẵn): bố cục mặc định + người ký, nơi cấp của trung tâm */
export function standardTemplateFields(orientation: TemplateOrientation = "landscape"): TemplateField[] {
  return defaultTemplateFields(orientation).map((f) =>
    f.key === "signerName" ? { ...f, text: TH_CERTIFICATE_SIGNER.name }
      : f.key === "signerTitle" ? { ...f, text: TH_CERTIFICATE_SIGNER.title }
        : f.key === "issuedDate" ? { ...f, place: TH_CERTIFICATE_SIGNER.place }
          : f,
  );
}

/** Tên mẫu chuẩn */
export const TH_STANDARD_TEMPLATE_NAME = `Mẫu chuẩn ${TH_BRAND.name} (A4 ngang)`;

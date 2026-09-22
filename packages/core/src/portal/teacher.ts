/**
 * APP GIÁO VIÊN — luật thuần cho "Lớp của tôi" và màn "Chuẩn bị buổi dạy" (docs/PHIA-NGUOI-DUNG.md).
 *  - Học viên có nguy cơ: vắng nhiều / vắng liên tiếp, mức đánh giá phiếu buổi giảm.
 *  - Học bạ mốc sắp đến hạn / đã đến hạn mà chưa viết.
 *  - Ghi chú cần lưu ý của từng học viên trước buổi (sức khoẻ, vắng buổi trước, thẻ nổi bật, PH cần trao đổi).
 */

const ABSENT = new Set(["absent_excused", "absent_unexcused"]);
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface StudentRisk {
  level: "high" | "watch" | null;
  reasons: string[];
}

/**
 * @param recent  trạng thái điểm danh các buổi đã điểm danh, CŨ → MỚI (null = chưa điểm danh, bỏ qua)
 * @param averages điểm trung bình phiếu buổi đã phát hành (thang 1–4), CŨ → MỚI
 */
export function studentRisk(x: { recent: readonly (string | null | undefined)[]; averages: readonly number[] }): StudentRisk {
  const reasons: string[] = [];
  const hits: ("high" | "watch")[] = [];
  const bump = (l: "high" | "watch") => { hits.push(l); };

  const last = x.recent.filter((s): s is string => !!s).slice(-6);
  let streak = 0;
  for (let i = last.length - 1; i >= 0 && ABSENT.has(last[i]!); i--) streak++;
  const absences = last.filter((s) => ABSENT.has(s)).length;
  if (streak >= 2) { bump("high"); reasons.push(`Vắng ${streak} buổi liên tiếp`); }
  else if (absences >= 3) { bump("high"); reasons.push(`Vắng ${absences}/${last.length} buổi gần đây`); }
  else if (absences === 2) { bump("watch"); reasons.push(`Vắng 2/${last.length} buổi gần đây`); }

  const a = x.averages.filter((v) => Number.isFinite(v));
  if (a.length >= 4) {
    const cur = avg(a.slice(-3))!;
    const prev = avg(a.slice(Math.max(0, a.length - 6), -3))!;
    const diff = round1(cur - prev);
    if (diff <= -0.5) { bump("high"); reasons.push(`Mức đánh giá giảm rõ (${round1(prev)} → ${round1(cur)})`); }
    else if (diff <= -0.3) { bump("watch"); reasons.push(`Mức đánh giá giảm (${round1(prev)} → ${round1(cur)})`); }
  }
  if (a.length >= 2) {
    const cur = avg(a.slice(-3))!;
    if (cur < 2) { bump("watch"); reasons.push("Đang cần hỗ trợ nhiều (mức < 2)"); }
  }
  const level: StudentRisk["level"] = hits.includes("high") ? "high" : hits.length ? "watch" : null;
  return { level, reasons };
}

export interface MilestoneDue {
  seq: number;
  /** due: đã tới buổi mốc mà chưa có học bạ; soon: còn ≤ `window` buổi nữa */
  state: "due" | "soon";
  /** Số buổi còn lại (0 khi đã tới hạn) */
  left: number;
}

/** Học bạ mốc cần chú ý của một lớp */
export function milestonesDue(x: { done: number; milestones: readonly number[]; written: readonly number[]; window?: number }): MilestoneDue[] {
  const w = x.window ?? 2;
  const out: MilestoneDue[] = [];
  for (const m of [...new Set(x.milestones)].sort((p, q) => p - q)) {
    if (m <= x.done) {
      if (!x.written.includes(m)) out.push({ seq: m, state: "due", left: 0 });
    } else if (m - x.done <= w) {
      out.push({ seq: m, state: "soon", left: m - x.done });
    }
  }
  return out;
}

export type PrepTone = "danger" | "warn" | "info" | "good";
export interface PrepNote {
  tone: PrepTone;
  text: string;
}

/** Ghi chú cần lưu ý của một học viên trước buổi dạy (xếp: sức khoẻ → vắng → PH → trial → khen) */
export function prepNotes(x: {
  healthNotes?: string | null;
  allergies?: readonly string[] | null;
  lastStatus?: string | null;
  parentConcern?: boolean;
  trial?: boolean;
  highlights?: readonly string[] | null;
}): PrepNote[] {
  const out: PrepNote[] = [];
  const allergies = (x.allergies ?? []).map((a) => a.trim()).filter(Boolean);
  if (allergies.length) out.push({ tone: "danger", text: `Dị ứng: ${allergies.join(", ")}` });
  const health = (x.healthNotes ?? "").trim();
  if (health) out.push({ tone: "danger", text: `Sức khoẻ: ${health.slice(0, 120)}` });
  if (x.lastStatus && ABSENT.has(x.lastStatus)) out.push({ tone: "warn", text: "Vắng buổi trước — hỏi thăm, ôn nhanh phần đã lỡ" });
  if (x.parentConcern) out.push({ tone: "warn", text: "Phụ huynh cần trao đổi sau buổi gần đây" });
  if (x.trial) out.push({ tone: "info", text: "Đang học thử" });
  const hl = [...new Set((x.highlights ?? []).map((h) => h.trim()).filter(Boolean))].slice(0, 3);
  if (hl.length) out.push({ tone: "good", text: `Nổi bật gần đây: ${hl.join(", ")}` });
  return out;
}

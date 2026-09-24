/**
 * LỊCH HẸN BÁN HÀNG — "gọi lại 19h", "chị ghé xem cơ sở thứ bảy", "cho bé học thử sáng CN".
 *
 * Quy tắc sống còn của nghề tư vấn: **hẹn mà quên là mất khách**. Nên hai con số phải luôn nổi lên
 * cạnh hộp thư: *Lịch hẹn 24h tới* (chuẩn bị) và *Hẹn quá hạn* (đã lỡ, phải xin lỗi và đặt lại).
 * Các hàm ở đây thuần tuý để màn hình, truy vấn và worker nhắc việc dùng chung một định nghĩa.
 */

export const APPOINTMENT_KINDS = ["goi_lai", "tu_van", "hoc_thu", "khac"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const APPOINTMENT_KIND_VI: Record<AppointmentKind, string> = {
  goi_lai: "Gọi lại",
  tu_van: "Hẹn tư vấn",
  hoc_thu: "Hẹn học thử",
  khac: "Khác",
};

export const APPOINTMENT_STATUSES = ["dat", "xong", "huy", "vang"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_STATUS_VI: Record<AppointmentStatus, string> = {
  dat: "Đã đặt",
  xong: "Đã xong",
  huy: "Đã huỷ",
  vang: "Khách không đến",
};
/** Trạng thái còn phải làm gì đó */
export const APPOINTMENT_OPEN: AppointmentStatus[] = ["dat"];

export const APPOINTMENT_TITLE_MAX = 120;
/** Nhắc trước giờ hẹn bao lâu (phút) */
export const NHAC_TRUOC_PHUT = 60;
/** "Sắp tới" tính trong bao nhiêu giờ — giống ô "Lịch hẹn 24h tới" */
export const SAP_TOI_GIO = 24;

export function validateLichHen(x: { title: string; at: Date | string | null; durationMin?: number | null }): string[] {
  const loi: string[] = [];
  const t = (x.title ?? "").trim();
  if (t.length < 3) loi.push("Nội dung hẹn quá ngắn");
  if (t.length > APPOINTMENT_TITLE_MAX) loi.push(`Nội dung hẹn tối đa ${APPOINTMENT_TITLE_MAX} ký tự`);
  const at = x.at instanceof Date ? x.at : x.at ? new Date(x.at) : null;
  if (!at || Number.isNaN(at.getTime())) loi.push("Thời điểm hẹn không hợp lệ");
  const d = x.durationMin ?? 30;
  if (!Number.isFinite(d) || d < 5 || d > 480) loi.push("Thời lượng phải từ 5 đến 480 phút");
  return loi;
}

export interface LichHenToiThieu {
  at: Date;
  status: AppointmentStatus;
}

/** Đã qua giờ hẹn mà vẫn để "đã đặt" — nghĩa là chưa ai xử lý */
export function henQuaHan(h: LichHenToiThieu, now: Date): boolean {
  return h.status === "dat" && h.at.getTime() < now.getTime();
}

/** Hẹn trong vòng `gio` giờ tới (mặc định 24) và chưa qua giờ */
export function henSapToi(h: LichHenToiThieu, now: Date, gio: number = SAP_TOI_GIO): boolean {
  if (h.status !== "dat") return false;
  const cach = h.at.getTime() - now.getTime();
  return cach >= 0 && cach <= gio * 3600_000;
}

/** Đến lúc bắn nhắc chưa (trước giờ hẹn NHAC_TRUOC_PHUT, chưa nhắc lần nào) */
export function denGioNhac(h: LichHenToiThieu & { remindedAt: Date | null }, now: Date, truocPhut: number = NHAC_TRUOC_PHUT): boolean {
  if (h.status !== "dat" || h.remindedAt) return false;
  const cach = h.at.getTime() - now.getTime();
  return cach <= truocPhut * 60_000 && cach > -60_000;
}

/** Nhãn hiển thị cho một cuộc hẹn: gấp nhất trước */
export function nhanLichHen(h: LichHenToiThieu, now: Date): { key: "qua_han" | "sap_toi" | "hom_nay" | "sau_nay" | "xong"; label: string; gap: boolean } {
  if (h.status !== "dat") return { key: "xong", label: APPOINTMENT_STATUS_VI[h.status], gap: false };
  if (henQuaHan(h, now)) return { key: "qua_han", label: "Quá hạn", gap: true };
  if (henSapToi(h, now, 2)) return { key: "sap_toi", label: "Sắp tới", gap: true };
  if (henSapToi(h, now, SAP_TOI_GIO)) return { key: "hom_nay", label: "Trong 24 giờ", gap: false };
  return { key: "sau_nay", label: "Sắp xếp sau", gap: false };
}

/* ------------------------------------------------------------------ */
/* Sinh nhật                                                            */
/* ------------------------------------------------------------------ */

/** "Sinh nhật 7 ngày tới" — so ngày/tháng, bỏ qua năm; trả số ngày còn lại hoặc null */
export function sinhNhatTrongVong(dateOfBirth: Date | string | null | undefined, now: Date, soNgay: number): number | null {
  if (!dateOfBirth) return null;
  const d = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  const mocHomNay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let nam = now.getUTCFullYear(); nam <= now.getUTCFullYear() + 1; nam++) {
    const moc = Date.UTC(nam, d.getUTCMonth(), d.getUTCDate());
    if (moc < mocHomNay) continue;
    const con = Math.round((moc - mocHomNay) / 86_400_000);
    return con <= soNgay ? con : null;
  }
  return null;
}

/**
 * HỘP THƯ BÁN HÀNG — bốn con số mà người trực máy cần thấy ngay khi mở màn.
 *
 * Công cụ CRM Zalo mà trung tâm đang dùng đặt bốn ô đếm ngay đầu hộp thư: *Chưa đọc · Chưa rep ·
 * Đình trệ · Sẵn sàng*. Đó không phải trang trí: nó chia hội thoại theo **việc phải làm**, thay vì
 * theo trạng thái kỹ thuật (open/pending/closed) vốn chẳng nói lên ai đang chờ.
 *
 * | Ô đếm | Nghĩa | Vì sao cần |
 * |---|---|---|
 * | **Chưa đọc** | Khách nhắn sau lần cuối có người mở hội thoại | Có tin mà chưa ai liếc qua — nguy cơ rơi |
 * | **Chưa trả lời** | Khách nhắn xong, trung tâm chưa gửi gì lại | Đang nợ khách một câu trả lời |
 * | **Đình trệ** | Chưa trả lời và đã quá chỉ tiêu phản hồi | Đã trễ hẹn với khách, phải xử lý ngay |
 * | **Sẵn sàng** | Trung tâm đã trả lời, đang chờ khách | Không phải việc của mình lúc này |
 *
 * Các hàm ở đây thuần tuý để dùng chung giữa truy vấn đếm (SQL) và hiển thị (giao diện) — cùng một
 * định nghĩa, không để hai nơi hiểu khác nhau.
 */

export const INBOX_VIEWS = ["tat_ca", "chua_doc", "chua_tra_loi", "dinh_tre", "san_sang", "cua_toi", "gan_co", "chua_gan_lead"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export const INBOX_VIEW_VI: Record<InboxView, string> = {
  tat_ca: "Tất cả",
  chua_doc: "Chưa đọc",
  chua_tra_loi: "Chưa trả lời",
  dinh_tre: "Đình trệ",
  san_sang: "Sẵn sàng",
  cua_toi: "Của tôi",
  gan_co: "Gắn cờ",
  chua_gan_lead: "Chưa gắn lead",
};

/** Giải thích ngắn hiện dưới ô đếm — để người mới hiểu ngay mà không cần hỏi */
export const INBOX_VIEW_MO_TA: Record<InboxView, string> = {
  tat_ca: "Mọi hội thoại đang mở",
  chua_doc: "Khách nhắn sau lần cuối có người mở hội thoại",
  chua_tra_loi: "Khách đã nhắn, trung tâm chưa trả lời",
  dinh_tre: "Chưa trả lời và đã quá chỉ tiêu phản hồi",
  san_sang: "Đã trả lời, đang chờ khách",
  cua_toi: "Hội thoại giao cho tôi",
  gan_co: "Có cờ cảnh báo (từ nhạy cảm, chuyển khoản riêng…)",
  chua_gan_lead: "Khách nhắn nhưng chưa vào phễu tuyển sinh",
};

export interface HoiThoaiToiThieu {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  staffSeenAt: Date | null;
  waitingSince: Date | null;
  status: string;
}

/** Khách nhắn sau lần cuối có người mở hội thoại */
export function chuaDoc(c: Pick<HoiThoaiToiThieu, "lastInboundAt" | "staffSeenAt">): boolean {
  if (!c.lastInboundAt) return false;
  return !c.staffSeenAt || c.staffSeenAt.getTime() < c.lastInboundAt.getTime();
}

/** Khách đã nhắn và trung tâm chưa trả lời sau tin đó */
export function chuaTraLoi(c: Pick<HoiThoaiToiThieu, "lastInboundAt" | "lastOutboundAt" | "status">): boolean {
  if (c.status === "closed" || !c.lastInboundAt) return false;
  return !c.lastOutboundAt || c.lastOutboundAt.getTime() < c.lastInboundAt.getTime();
}

/** Chờ quá chỉ tiêu phản hồi (phút) — mặc định lấy FIRST_RESPONSE_SLA_MIN của rules */
export function dinhTre(waitingSince: Date | null, now: Date, slaPhut: number): boolean {
  if (!waitingSince) return false;
  return now.getTime() - waitingSince.getTime() > slaPhut * 60_000;
}

/** Đã trả lời, bóng đang ở sân khách */
export function sanSang(c: Pick<HoiThoaiToiThieu, "lastInboundAt" | "lastOutboundAt" | "status">): boolean {
  if (c.status === "closed") return false;
  if (!c.lastOutboundAt) return false;
  return !c.lastInboundAt || c.lastOutboundAt.getTime() >= c.lastInboundAt.getTime();
}

/** Nhãn một dòng cho hội thoại, ưu tiên việc gấp nhất */
export function nhanHoiThoai(c: HoiThoaiToiThieu, now: Date, slaPhut: number): { key: InboxView; label: string; gap: boolean } {
  if (dinhTre(c.waitingSince, now, slaPhut)) return { key: "dinh_tre", label: "Đình trệ", gap: true };
  if (chuaDoc(c)) return { key: "chua_doc", label: "Chưa đọc", gap: true };
  if (chuaTraLoi(c)) return { key: "chua_tra_loi", label: "Chưa trả lời", gap: true };
  if (sanSang(c)) return { key: "san_sang", label: "Đang chờ khách", gap: false };
  return { key: "tat_ca", label: "Đang mở", gap: false };
}

/* ------------------------------------------------------------------ */
/* Nhãn hội thoại                                                       */
/* ------------------------------------------------------------------ */

export const TAG_COLORS = ["slate", "brand", "green", "amber", "red", "violet"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_COLOR_VI: Record<TagColor, string> = {
  slate: "Xám", brand: "Xanh thương hiệu", green: "Xanh lá", amber: "Vàng", red: "Đỏ", violet: "Tím",
};
/** Lớp CSS dùng chung cho chip nhãn — để mọi màn hiện giống nhau */
export const TAG_COLOR_CLASS: Record<TagColor, string> = {
  slate: "bg-slate-100 text-slate-700",
  brand: "bg-brand-100 text-brand-700",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  violet: "bg-violet-100 text-violet-700",
};

export const TAG_MAX_LEN = 40;
/** Tối đa mấy nhãn trên một hội thoại — nhiều hơn là không ai đọc nữa */
export const TAG_MAX_PER_CONV = 8;

export function validateTag(name: string): string[] {
  const t = name.trim();
  if (t.length < 2) return ["Tên nhãn quá ngắn"];
  if (t.length > TAG_MAX_LEN) return [`Tên nhãn tối đa ${TAG_MAX_LEN} ký tự`];
  return [];
}

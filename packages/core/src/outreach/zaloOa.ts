/**
 * SỰ KIỆN WEBHOOK CỦA ZALO OA — đọc nguyên văn payload thành việc cần làm.
 *
 * Trước đây hệ thống chỉ đọc `user_send_*` (tin khách nhắn) và bỏ hết phần còn lại, mất bốn thứ:
 *
 * | Sự kiện | Vì sao cần |
 * |---|---|
 * | `follow` / `unfollow` | Biết ai còn quan tâm OA. Người đã quan tâm thì nhắn theo `user_id` (miễn phí trong 48 giờ); người rời OA chỉ còn ZNS (tính phí) — không biết thì cứ tưởng tin đã tới |
 * | `user_submit_info` | Khách bấm nút "chia sẻ thông tin" và **tự gửi tên + số điện thoại**: một hội thoại ẩn danh thành lead có SĐT, có đồng ý, không phải hỏi tay |
 * | `user_received_message` | ZNS đã tới máy khách. Thiếu nó thì `sent` chỉ có nghĩa "Zalo đã nhận", không đối soát được chi phí |
 *
 * Hàm ở đây thuần tuý (không chạm CSDL) để kiểm thử được bằng payload thật.
 */

export type SuKienOaLoai = "tin_den" | "quan_tam" | "bo_quan_tam" | "gui_thong_tin" | "da_nhan_zns" | "bo_qua";

export interface SuKienOa {
  loai: SuKienOaLoai;
  /** `user_id` của khách trên OA */
  nguoiId: string | null;
  tinId: string | null;
  noiDung: string;
  /** Tên khách tự gửi qua nút "chia sẻ thông tin" */
  ten: string | null;
  /** SĐT khách tự gửi, đã chuẩn hoá 84xxxxxxxxx */
  sdt: string | null;
  /** Mã tin ZNS mà sự kiện `user_received_message` báo đã tới */
  znsTinId: string | null;
  luc: Date;
  /** `timestamp` nguyên văn — dùng lại cho kiểm tra chữ ký khi chạy lại */
  timestamp: string | null;
}

type Obj = Record<string, unknown>;
const laObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function lay(goc: Obj, duongDan: readonly string[]): string | null {
  for (const dd of duongDan) {
    let cur: unknown = goc;
    for (const khuc of dd.split(".")) {
      if (!laObj(cur)) { cur = undefined; break; }
      cur = cur[khuc];
    }
    if (typeof cur === "string" && cur.trim()) return cur.trim();
    if (typeof cur === "number" && Number.isFinite(cur)) return String(cur);
  }
  return null;
}

function sdt84(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (/^84\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `84${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `84${d}`;
  return null;
}

/**
 * Khách tự gửi thông tin: Zalo đóng gói trong `message.text` dạng JSON
 * (`{"name":"…","phone":"…"}`) hoặc trải thẳng ở `info` / `user_info`.
 */
function docThongTinTuGui(b: Obj): { ten: string | null; sdt: string | null } {
  const truc = { ten: lay(b, ["info.name", "user_info.name", "message.name", "name"]), sdt: lay(b, ["info.phone", "user_info.phone", "message.phone", "phone"]) };
  if (truc.ten || truc.sdt) return { ten: truc.ten, sdt: sdt84(truc.sdt) };
  const text = lay(b, ["message.text", "message.content", "text"]);
  if (text && text.trim().startsWith("{")) {
    try {
      const j = JSON.parse(text) as Obj;
      return { ten: lay(j, ["name", "ten"]), sdt: sdt84(lay(j, ["phone", "sdt", "phone_number"])) };
    } catch { /* không phải JSON — bỏ qua, coi như không có thông tin */ }
  }
  return { ten: null, sdt: null };
}

/** Đọc một sự kiện webhook Zalo OA. Trả `null` khi payload không phải đối tượng. */
export function docSuKienZaloOa(body: unknown, bayGio: Date = new Date()): SuKienOa | null {
  if (!laObj(body)) return null;
  const ten = (lay(body, ["event_name", "event", "eventName"]) ?? "").toLowerCase();
  const ts = lay(body, ["timestamp"]);
  const luc = ts && /^\d+$/.test(ts) ? new Date(Number(ts) < 1e11 ? Number(ts) * 1000 : Number(ts)) : bayGio;
  const nguoiId = lay(body, ["sender.id", "follower.id", "user_id", "recipient.id"]);
  const chung = { nguoiId, tinId: null as string | null, noiDung: "", ten: null as string | null, sdt: null as string | null, znsTinId: null as string | null, luc, timestamp: ts };

  if (ten === "user_submit_info" || ten === "user_info") {
    const tt = docThongTinTuGui(body);
    return { ...chung, loai: "gui_thong_tin", ten: tt.ten, sdt: tt.sdt, tinId: lay(body, ["message.msg_id", "msg_id"]), noiDung: "Khách tự chia sẻ thông tin liên hệ" };
  }
  if (ten === "follow") return { ...chung, loai: "quan_tam", noiDung: "Khách quan tâm OA" };
  if (ten === "unfollow") return { ...chung, loai: "bo_quan_tam", noiDung: "Khách bỏ quan tâm OA" };
  if (ten === "user_received_message") {
    return { ...chung, loai: "da_nhan_zns", znsTinId: lay(body, ["message.msg_id", "msg_id", "message_id"]) };
  }
  if (ten.startsWith("user_send_")) {
    const tinId = lay(body, ["message.msg_id", "msg_id"]);
    if (!nguoiId || !tinId) return { ...chung, loai: "bo_qua" };
    return {
      ...chung, loai: "tin_den", tinId,
      noiDung: lay(body, ["message.text"]) ?? `[${ten.replace("user_send_", "")}]`,
    };
  }
  return { ...chung, loai: "bo_qua" };
}

/** Nội dung mặc định của nút "Xin thông tin" (tin Tư vấn mẫu `request_user_info` của Zalo) */
export const XIN_THONG_TIN = {
  title: "Trung tâm xin phép lưu thông tin liên hệ",
  subtitle: "Bấm chia sẻ để tư vấn viên gọi lại và giữ chỗ lớp cho con. Thông tin chỉ dùng để liên hệ tư vấn.",
} as const;

/** Nhãn tiếng Việt của các sự kiện — dùng ở nhật ký webhook và hội thoại */
export const SU_KIEN_OA_VI: Record<SuKienOaLoai, string> = {
  tin_den: "Khách nhắn tin",
  quan_tam: "Khách quan tâm OA",
  bo_quan_tam: "Khách bỏ quan tâm OA",
  gui_thong_tin: "Khách chia sẻ tên + SĐT",
  da_nhan_zns: "Tin ZNS đã tới máy khách",
  bo_qua: "Sự kiện không dùng",
};

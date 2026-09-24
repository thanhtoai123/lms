/**
 * KÊNH CHAT NGOÀI (ZCRM / Zalo cá nhân) — đọc sự kiện webhook.
 *
 * Vì sao có tệp này: trung tâm đang chat với phụ huynh bằng **nick Zalo cá nhân** qua một công cụ
 * riêng (ZCRM). Công cụ đó có webhook, nên hệ thống không cần — và KHÔNG NÊN — tự chạy thư viện Zalo
 * không chính thức: rủi ro khoá nick phải nằm ngoài máy chủ học vụ. Việc của ta chỉ là **đọc** sự
 * kiện đổ về, biến thành hội thoại/lead để sổ sách không phụ thuộc vào cái nick ấy còn sống hay không.
 *
 * Tên trường trong payload mỗi bản ZCRM một khác (và có thể đổi sau khi nâng cấp), nên hàm đọc ở đây
 * cố ý **dễ tính**: thử lần lượt các tên hay gặp thay vì khoá cứng một tên. Payload gốc luôn được ghi
 * vào `webhook_events`, sai thì mở ra xem rồi bổ sung tên trường — không mất sự kiện.
 */

/** Loại sự kiện ta quan tâm; mọi thứ khác là "bo_qua" (vẫn ghi nhật ký, không xử lý) */
export type SuKienKenhLoai = "tin_den" | "tin_di" | "khach_moi" | "ket_noi" | "mat_ket_noi" | "bo_qua";

export interface SuKienKenh {
  loai: SuKienKenhLoai;
  /** Định danh khách phía Zalo (thread/user id) — khoá để gom hội thoại */
  nguoiId: string | null;
  tenHienThi: string | null;
  /** SĐT đã chuẩn hoá 84xxxxxxxxx nếu công cụ có gửi kèm */
  sdt: string | null;
  noiDung: string;
  tinId: string | null;
  luc: Date;
  tepDinhKem: { type: string; url: string }[];
  /** Nick Zalo của trung tâm (tài khoản gửi/nhận) nếu payload có nêu */
  nickId: string | null;
}

const LOAI_THEO_TEN: Record<string, SuKienKenhLoai> = {
  "message.received": "tin_den",
  message_received: "tin_den",
  "message.in": "tin_den",
  "message.sent": "tin_di",
  message_sent: "tin_di",
  "message.out": "tin_di",
  "contact.created": "khach_moi",
  contact_created: "khach_moi",
  "zalo.connected": "ket_noi",
  zalo_connected: "ket_noi",
  "zalo.disconnected": "mat_ket_noi",
  zalo_disconnected: "mat_ket_noi",
};

type Obj = Record<string, unknown>;
const laObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lấy chuỗi đầu tiên không rỗng trong danh sách đường dẫn "a.b.c" */
function chuoi(goc: Obj, duongDan: readonly string[]): string | null {
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

/** Thời điểm: nhận mili-giây, giây, hoặc chuỗi ISO */
function thoiDiem(goc: Obj, duongDan: readonly string[], macDinh: Date): Date {
  const s = chuoi(goc, duongDan);
  if (!s) return macDinh;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = n < 1e11 ? n * 1000 : n; // < ~2001 tính bằng mili-giây thì chắc chắn là giây
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? macDinh : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? macDinh : d;
}

/** SĐT Việt Nam → 84xxxxxxxxx (trùng quy tắc với ZNS) */
function sdt84(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (/^84\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `84${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `84${d}`;
  return null;
}

function tepDinhKem(goc: Obj): { type: string; url: string }[] {
  const ds = goc.attachments ?? goc.files ?? goc.media;
  if (!Array.isArray(ds)) return [];
  const out: { type: string; url: string }[] = [];
  for (const a of ds) {
    if (!laObj(a)) continue;
    const url = chuoi(a, ["url", "src", "link", "payload.url"]);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    out.push({ type: chuoi(a, ["type", "kind", "mime"]) ?? "file", url });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Đọc một sự kiện webhook của ZCRM.
 * Trả `null` khi payload không phải JSON đối tượng; trả `loai: "bo_qua"` khi là sự kiện ta chưa dùng.
 */
export function docSuKienZcrm(body: unknown, bayGio: Date = new Date()): SuKienKenh | null {
  if (!laObj(body)) return null;
  const ten = (chuoi(body, ["event", "type", "event_name", "eventName", "action"]) ?? "").toLowerCase();
  const loai = LOAI_THEO_TEN[ten] ?? "bo_qua";
  const d = laObj(body.data) ? body.data : laObj(body.payload) ? body.payload : body;

  const nguoiId = chuoi(d, [
    "zaloId", "zalo_id", "threadId", "thread_id", "senderId", "sender_id", "userId", "user_id",
    "contact.zaloId", "contact.zalo_id", "contact.id", "customer.zaloId", "customer.zalo_id",
    "from.id", "from.zaloId", "conversation.zaloId", "conversation.threadId",
  ]);
  const noiDungTho = chuoi(d, ["content", "text", "body", "message.text", "message.content", "message"]) ?? "";
  const tep = tepDinhKem(laObj(d.message) ? { ...d, ...d.message } : d);

  return {
    loai,
    nguoiId,
    tenHienThi: chuoi(d, ["name", "displayName", "display_name", "senderName", "contact.name", "contact.displayName", "customer.name", "from.name"]),
    sdt: sdt84(chuoi(d, ["phone", "phoneNumber", "phone_number", "contact.phone", "contact.phoneNumber", "customer.phone"])),
    noiDung: noiDungTho.slice(0, 4000),
    tinId: chuoi(d, ["messageId", "message_id", "msgId", "msg_id", "message.id", "id"]),
    luc: thoiDiem(d, ["timestamp", "time", "sentAt", "sent_at", "createdAt", "created_at", "message.timestamp"], bayGio),
    tepDinhKem: tep,
    nickId: chuoi(d, ["accountId", "account_id", "zaloAccountId", "zalo_account_id", "account.id", "account.zaloId", "ownerId"]),
  };
}

/** Sự kiện có đủ dữ liệu để ghi thành tin nhắn không */
export function duDeGhiTin(s: SuKienKenh): boolean {
  return (s.loai === "tin_den" || s.loai === "tin_di") && !!s.nguoiId && (!!s.noiDung.trim() || s.tepDinhKem.length > 0);
}

/* ------------------------------------------------------------------ */
/* Hạn mức nick — giữ nick sống là việc của hệ thống, không phải của người */
/* ------------------------------------------------------------------ */

/** Hạn mức mặc định mỗi nick/ngày. ZCRM tự chặn ở ~200; ta đặt thấp hơn cho an toàn. */
export const HAN_MUC_NICK_NGAY = 180;

export interface TrangThaiNick {
  /** Đã gửi trong ngày hôm nay */
  daGui: number;
  hanMuc: number;
  /** Lần cuối công cụ báo còn kết nối */
  thayLuc: Date | null;
  online: boolean;
}

/** Còn gửi được bao nhiêu tin hôm nay (không âm) */
export function conLaiTrongNgay(t: Pick<TrangThaiNick, "daGui" | "hanMuc">): number {
  return Math.max(0, t.hanMuc - t.daGui);
}

/** Nick coi như mất kết nối khi quá ngần này không có tín hiệu (phút) */
export const NICK_IM_LANG_PHUT = 30;

export function nickImLang(thayLuc: Date | null, bayGio: Date): boolean {
  if (!thayLuc) return true;
  return bayGio.getTime() - thayLuc.getTime() > NICK_IM_LANG_PHUT * 60_000;
}

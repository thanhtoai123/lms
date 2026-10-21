/**
 * META CONVERSIONS API — sự kiện "Lead" gửi từ MÁY CHỦ, khớp với sự kiện Pixel trên trình duyệt bằng cùng `event_id`
 * (Meta khử trùng lặp khi trùng tên sự kiện + event_id, trong 48 giờ). Bù cho trình duyệt chặn Pixel.
 *
 * CHỈ gửi khi phụ huynh đã bấm "Đồng ý" đo lường quảng cáo trên website (Luật BVDLCN 91/2025 Điều 28 khoản 3):
 * route /api/public/leads kiểm `adsConsent`. Số điện thoại được chuẩn hoá về 84xxxxxxxxx rồi băm SHA-256 — Meta không
 * nhận số gốc. Thuần: không gọi mạng ở đây.
 */

/** 0971 29 30 31 / +84971293031 → "84971293031"; số không hợp lệ → "" */
export function normalizeVnPhoneE164Digits(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  const local = d.startsWith("84") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  return /^[35789]\d{8}$/.test(local) ? `84${local}` : "";
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CapiLeadInput {
  eventId: string;
  eventTimeSec: number;
  url: string;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  phone?: string | null;
  /** Chuyên ngành quan tâm (content_name) */
  interest?: string | null;
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").slice(0, n);

export async function metaCapiLeadEvent(i: CapiLeadInput): Promise<Record<string, unknown>> {
  const ph = i.phone ? normalizeVnPhoneE164Digits(i.phone) : "";
  const user: Record<string, unknown> = {};
  if (ph) user.ph = [await sha256Hex(ph)];
  if (i.ip && i.ip !== "unknown") user.client_ip_address = clip(i.ip, 64);
  if (i.userAgent) user.client_user_agent = clip(i.userAgent, 400);
  if (i.fbp && /^fb\.\d\.\d+\.\d+$/.test(i.fbp)) user.fbp = i.fbp;
  if (i.fbc && /^fb\.\d\.\d+\.[A-Za-z0-9_-]+$/.test(i.fbc)) user.fbc = clip(i.fbc, 500);
  user.country = [await sha256Hex("vn")];
  return {
    event_name: "Lead",
    event_time: Math.floor(i.eventTimeSec),
    event_id: clip(i.eventId, 100),
    action_source: "website",
    event_source_url: clip(i.url, 500),
    user_data: user,
    custom_data: { content_name: clip(i.interest || "Học trải nghiệm 1:1", 100), content_category: "trial" },
  };
}

/** _fbc từ fbclid trên đường dẫn (khi trình duyệt chưa có cookie _fbc) */
export function fbcFromUrl(url: string, nowMs: number): string | null {
  try {
    const id = new URL(url).searchParams.get("fbclid");
    return id && /^[A-Za-z0-9_-]{10,500}$/.test(id) ? `fb.1.${nowMs}.${id}` : null;
  } catch { return null; }
}

"use client";

/**
 * FORM GỌN 4 Ô CHO LANDING QUẢNG CÁO: Họ tên phụ huynh · SĐT/Zalo · Lớp của con · Chuyên ngành quan tâm (+ đồng ý xử lý dữ liệu).
 *
 * - Gửi vào CRM qua /api/public/leads (cùng đường với form đầy đủ): UTM, trang đích (đủ query: gclid, fbclid, utm_term,
 *   utm_content…), trang giới thiệu, mã sự kiện quảng cáo. Chuyên ngành ghi vào ghi chú của lead.
 * - Gửi thành công → bắn chuyển đổi cho các thẻ đã cài (Meta Pixel "Lead", GA4 "generate_lead", Google Ads conversion)
 *   với cùng `eventID` để sau này khớp với Conversions API phía máy chủ, không đếm trùng.
 * - Ô điện thoại kiểm số Việt Nam ngay trên trình duyệt; máy chủ vẫn chuẩn hoá và chống trùng.
 */
import { useId, useRef, useState } from "react";
import { LEAD_INTERESTS, TH_REGISTER_BLOCK } from "@satarobo/core";
import { anonId, track } from "@/components/site-tracker";

type Utm = { utm_source: string; utm_medium: string; utm_campaign: string; ref?: string };
type W = Window & {
  fbq?: (...a: unknown[]) => void;
  gtag?: (...a: unknown[]) => void;
  __thAds?: { googleAdsId?: string | null; googleAdsLeadLabel?: string | null };
};

const VN_PHONE = /^(0|\+?84)(3|5|7|8|9)\d{8}$/;
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

function fireConversion(eventId: string, interest: string) {
  const w = window as W;
  try { w.fbq?.("track", "Lead", { content_name: interest || "Học trải nghiệm 1:1", content_category: "trial" }, { eventID: eventId }); } catch { /* bỏ qua */ }
  try {
    w.gtag?.("event", "generate_lead", { event_id: eventId, lead_source: "landing", interest: interest || "chua-ro" });
    const aw = w.__thAds;
    if (aw?.googleAdsId && aw.googleAdsLeadLabel) w.gtag?.("event", "conversion", { send_to: `${aw.googleAdsId}/${aw.googleAdsLeadLabel}`, transaction_id: eventId });
  } catch { /* bỏ qua */ }
}

export function LeadForm({ utm, thankYou, interest, submitLabel }: { utm: Utm; thankYou?: string; interest?: string; submitLabel?: string }) {
  const uid = useId();
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const started = useRef(false);
  const onStart = () => { if (!started.current) { started.current = true; track("form_start"); } };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("sdt") ?? "").replace(/[\s.-]/g, "");
    if (!VN_PHONE.test(phone)) { setPhoneErr("Số điện thoại chưa đúng (10 số, ví dụ 0971 29 30 31)"); return; }
    setPhoneErr(null);
    setState("sending");
    const pick = String(fd.get("quanTam") ?? "");
    const lop = String(fd.get("lop") ?? "");
    const url = new URL(window.location.href);
    const eventId = url.searchParams.get("fbclid") ?? url.searchParams.get("gclid") ?? `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      website: String(fd.get("website") ?? ""),
      hoTenPh: String(fd.get("hoTenPh") ?? "").trim(),
      sdt: phone,
      ...(lop ? { lop: Number(lop) } : {}),
      ghiChu: [pick ? `Quan tâm: ${pick}` : "", url.searchParams.get("utm_term") ? `Từ khoá: ${url.searchParams.get("utm_term")}` : ""].filter(Boolean).join(" · ") || undefined,
      consent: fd.get("consent") ? "on" : "",
      ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v)),
      landingPage: url.href.slice(0, 500),
      referrer: document.referrer ? document.referrer.slice(0, 500) : null,
      eventId: eventId.slice(0, 100),
      source: "web-form",
      anonId: anonId(),
    };
    try {
      const r = await fetch("/api/public/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as { ok: boolean; error?: string; duplicated?: boolean };
      if (j.ok) {
        fireConversion(eventId, pick);
        setState("done");
        setMsg(j.duplicated ? "Trung tâm đã nhận thông tin của ba mẹ trước đó và sẽ liên hệ sớm." : thankYou || TH_REGISTER_BLOCK.thankYou);
      } else { setState("error"); setMsg(j.error ?? "Có lỗi, ba mẹ vui lòng thử lại."); }
    } catch {
      setState("error"); setMsg("Không gửi được — kiểm tra kết nối mạng rồi thử lại, hoặc gọi hotline.");
    }
  }

  if (state === "done") {
    return (
      <div className="lp-lead-done" role="status">
        <p className="lp-lead-done-title">Đã nhận đăng ký!</p>
        <p>{msg}</p>
        <ul>
          <li>Giáo viên tư vấn gọi lại trong giờ làm việc (ba mẹ để ý cuộc gọi hoặc tin nhắn Zalo).</li>
          <li>Hẹn giờ học trải nghiệm 1:1 qua ClassIn cho con.</li>
          <li>Chuẩn bị máy tính có camera, tai nghe có micro.</li>
        </ul>
      </div>
    );
  }

  const f = (n: string) => `${uid}-${n}`;
  return (
    <form onSubmit={submit} onFocus={onStart} className="lp-lead-form" noValidate={false}>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="lp-hp" aria-hidden />
      <div className="lp-f">
        <label htmlFor={f("ten")}>Họ tên phụ huynh</label>
        <input id={f("ten")} name="hoTenPh" required minLength={2} maxLength={120} autoComplete="name" placeholder="Ví dụ: Nguyễn Thị Lan" />
      </div>
      <div className="lp-f">
        <label htmlFor={f("sdt")}>Số điện thoại / Zalo</label>
        <input id={f("sdt")} name="sdt" required type="tel" inputMode="tel" autoComplete="tel" maxLength={16} placeholder="09xx xxx xxx" aria-invalid={phoneErr ? true : undefined} aria-describedby={phoneErr ? f("sdt-err") : undefined} onChange={() => phoneErr && setPhoneErr(null)} />
        {phoneErr && <p id={f("sdt-err")} className="lp-f-err">{phoneErr}</p>}
      </div>
      <div className="lp-f-row">
        <div className="lp-f">
          <label htmlFor={f("lop")}>Con đang học lớp</label>
          <select id={f("lop")} name="lop" required defaultValue="">
            <option value="" disabled>Chọn lớp</option>
            {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
        </div>
        <div className="lp-f">
          <label htmlFor={f("qt")}>Con quan tâm</label>
          <select id={f("qt")} name="quanTam" defaultValue={interest && LEAD_INTERESTS.some((x) => x.value === interest) ? interest : ""} required>
            <option value="" disabled>Chọn chuyên ngành</option>
            {LEAD_INTERESTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <label className="lp-consent"><input type="checkbox" name="consent" required /> <span>Tôi đồng ý để TH STEAM Academy liên hệ tư vấn và xử lý thông tin theo <a href="/chinh-sach/bao-mat" target="_blank" rel="noopener">chính sách bảo mật</a>.</span></label>
      {state === "error" && <p className="lp-f-err" role="alert">{msg}</p>}
      <button className="lp-btn lp-btn-primary lp-submit" disabled={state === "sending"}>{state === "sending" ? "Đang gửi…" : submitLabel ?? "Đăng ký học thử 1:1"}</button>
      <p className="lp-privacy">Thông tin chỉ dùng để tư vấn khóa học cho con.</p>
    </form>
  );
}

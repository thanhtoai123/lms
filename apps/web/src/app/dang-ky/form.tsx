"use client";

import { useRef, useState } from "react";
import { anonId, track } from "@/components/site-tracker";

export function TrialForm({ utm, thankYou }: { utm: { utm_source: string; utm_medium: string; utm_campaign: string; ref?: string }; thankYou?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const started = useRef(false);
  const onStart = () => { if (!started.current) { started.current = true; track("form_start"); } };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    // Nguồn & theo dõi: trang đích, trang giới thiệu, id sự kiện quảng cáo (IP và trình duyệt do máy chủ tự ghi)
    const url = new URL(window.location.href);
    const tracking = {
      landingPage: url.href.slice(0, 500),
      referrer: document.referrer ? document.referrer.slice(0, 500) : null,
      eventId: url.searchParams.get("fbclid") ?? url.searchParams.get("gclid") ?? url.searchParams.get("event_id") ?? null,
    };
    const r = await fetch("/api/public/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v)), ...tracking, source: "web-form", anonId: anonId() }) });
    const j = (await r.json()) as { ok: boolean; error?: string; duplicated?: boolean };
    if (j.ok) { setState("done"); setMsg(j.duplicated ? "Chúng tôi đã nhận thông tin của bạn trước đó và sẽ liên hệ sớm." : thankYou || "Sata Robo sẽ gọi lại cho bạn trong 15 phút (giờ làm việc)."); }
    else { setState("error"); setMsg(j.error ?? "Có lỗi, vui lòng thử lại."); }
  }

  if (state === "done") return <div className="card p-6 text-center"><div className="text-3xl">🎉</div><h2 className="font-bold mt-2">Đã nhận đăng ký!</h2><p className="text-sm text-ink-600 mt-1">{msg}</p></div>;

  return (
    <form onSubmit={submit} onFocus={onStart} className="card p-5 space-y-3">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />{/* honeypot */}
      <div><label className="label">Họ tên phụ huynh *</label><input name="hoTenPh" className="input" required minLength={2} /></div>
      <div><label className="label">Số điện thoại *</label><input name="sdt" className="input" required inputMode="tel" placeholder="09xx xxx xxx" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Tên con</label><input name="hoTenCon" className="input" /></div>
        <div><label className="label">Lớp</label><input name="lop" type="number" min={1} max={8} className="input" /></div>
      </div>
      <div><label className="label">Trường</label><input name="truong" className="input" /></div>
      <div><label className="label">Ghi chú</label><textarea name="ghiChu" className="input" placeholder="Con thích gì, học buổi nào tiện…" /></div>
      <label className="flex items-start gap-2 text-xs text-ink-600"><input type="checkbox" name="consent" required className="mt-0.5" /> Tôi đồng ý để Sata Robo liên hệ và xử lý thông tin theo <a className="underline" href="https://satarobo.vn/chinh-sach-bao-mat" target="_blank" rel="noreferrer">chính sách bảo mật</a>.</label>
      <label className="flex items-start gap-2 text-xs text-ink-600"><input type="checkbox" name="marketingConsent" className="mt-0.5" /> Tôi muốn nhận thông tin ưu đãi, sự kiện của Sata Robo (có thể huỷ bất cứ lúc nào).</label>
      {state === "error" && <p className="text-sm text-danger">{msg}</p>}
      <button className="btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Đang gửi…" : "Đặt buổi học thử miễn phí"}</button>
    </form>
  );
}

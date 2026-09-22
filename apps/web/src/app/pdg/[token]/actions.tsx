"use client";

import { useState } from "react";
import { CalendarCheck, Phone, Printer } from "lucide-react";

/**
 * Khối hành động cho phụ huynh ngay trên phiếu:
 *  - "Đăng ký tư vấn lộ trình" → ghi nhận vào lead (mỗi link một lần), báo tư vấn phụ trách;
 *  - "Gọi cho cơ sở" → `tel:` số của cơ sở;
 *  - "Lưu PDF" → hộp thoại in của trình duyệt (chọn "Lưu dưới dạng PDF").
 */
export function ParentActions({ token, phone, responded }: { token: string; phone: string | null; responded: boolean }) {
  const [done, setDone] = useState<string | null>(responded ? "Trung tâm đã nhận yêu cầu tư vấn của anh/chị." : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const request = async () => {
    if (busy || done) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/public/pdg/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; already?: boolean; message?: string; error?: string };
      if (j.ok) setDone(j.already ? "Trung tâm đã nhận yêu cầu của anh/chị trước đó. Tư vấn viên sẽ sớm liên hệ." : j.message ?? "Trung tâm đã nhận yêu cầu.");
      else setErr(j.error ?? "Chưa gửi được yêu cầu, anh/chị thử lại sau ít phút.");
    } catch {
      setErr("Mất kết nối mạng, anh/chị thử lại sau ít phút.");
    } finally {
      setBusy(false);
    }
  };

  const tel = phone ? phone.replace(/[^\d+]/g, "") : "";

  return (
    <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-brand-50 to-accent-50 p-4" aria-label="Bước tiếp theo">
      <h2 className="text-base font-extrabold text-foreground">Anh/chị muốn tìm hiểu lộ trình cho bé?</h2>
      <p className="mt-0.5 text-sm text-foreground/75">Tư vấn viên Sata Robo sẽ gọi lại để trao đổi chi tiết lịch học và lộ trình phù hợp.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {done ? (
          <div role="status" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-bold text-green-800 ring-1 ring-green-200">
            <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden /> {done}
          </div>
        ) : (
          <button type="button" onClick={() => void request()} disabled={busy} aria-busy={busy} className="btn-primary min-h-12 !rounded-xl !text-base">
            <CalendarCheck className="h-5 w-5" aria-hidden /> {busy ? "Đang gửi…" : "Đăng ký tư vấn lộ trình"}
          </button>
        )}
        {tel && (
          <a href={`tel:${tel}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-accent-500 bg-card px-4 py-2 text-base font-bold text-accent-700 transition hover:bg-accent-50">
            <Phone className="h-5 w-5" aria-hidden /> Gọi cho cơ sở
          </a>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
      <button type="button" onClick={() => window.print()} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary-soft">
        <Printer className="h-4 w-4" aria-hidden /> Lưu PDF / In phiếu
      </button>
    </section>
  );
}

"use client";

import { useState } from "react";

export function ApplyForm({ slug, consentText, deadline }: { slug: string; consentText: string; deadline: string | null }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const fd = new FormData(e.currentTarget);
    const cv = fd.get("cv");
    if (cv instanceof File && cv.size > 5 * 1024 * 1024) { setState("error"); setMsg("CV tối đa 5MB"); return; }
    try {
      const r = await fetch(`/api/public/jobs/${slug}`, { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; error?: string; duplicated?: boolean };
      if (j.ok) { setState("done"); setMsg(j.duplicated ? "Chúng tôi đã có hồ sơ của bạn cho vị trí này và đã cập nhật." : "Bộ phận nhân sự sẽ liên hệ trong 3–5 ngày làm việc nếu hồ sơ phù hợp."); }
      else { setState("error"); setMsg(j.error ?? "Có lỗi, vui lòng thử lại."); }
    } catch { setState("error"); setMsg("Không gửi được, kiểm tra kết nối mạng."); }
  }
  if (state === "done") return <div className="card p-5 text-center"><div className="text-3xl">✅</div><h2 className="mt-2 font-bold">Đã nhận hồ sơ</h2><p className="mt-1 text-sm text-ink-600">{msg}</p></div>;
  return (
    <form onSubmit={submit} className="card space-y-3 p-4 text-sm">
      <h2 className="font-semibold">Ứng tuyển{deadline ? ` (hạn ${deadline.split("-").reverse().join("/")})` : ""}</h2>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="block">Họ tên *<input name="fullName" className="input mt-1" required minLength={2} /></label>
      <label className="block">Số điện thoại *<input name="phone" className="input mt-1" required inputMode="tel" /></label>
      <label className="block">Email<input name="email" type="email" className="input mt-1" /></label>
      <label className="block">Giới thiệu ngắn<textarea name="note" className="input mt-1" rows={3} maxLength={2000} /></label>
      <label className="block">CV (PDF/DOCX, ≤ 5MB)<input name="cv" type="file" accept=".pdf,.docx" className="mt-1 block w-full text-xs" /></label>
      <label className="flex items-start gap-2 text-xs text-ink-600"><input type="checkbox" name="consent" value="1" required className="mt-0.5" /> {consentText}</label>
      {state === "error" && <p className="text-red-700">{msg}</p>}
      <button className="btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Đang gửi…" : "Nộp hồ sơ"}</button>
    </form>
  );
}

"use client";

import { useId, useState } from "react";

export function ApplyForm({ slug, consentText, deadline }: { slug: string; consentText: string; deadline: string | null }) {
  const uid = useId();
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
  if (state === "done") return <div className="lp-ok" role="status"><strong>Đã nhận hồ sơ</strong>{msg}</div>;
  const f = (n: string) => `${uid}-${n}`;
  return (
    <>
      <h2>Ứng tuyển vị trí này</h2>
      <p className="lp-apply-sub">{deadline ? `Hạn nộp ${deadline.split("-").reverse().join("/")} · ` : ""}Điền thông tin, đính kèm CV nếu có.</p>
      <form onSubmit={submit}>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="lp-hp" aria-hidden />
        <div className="lp-f"><label htmlFor={f("ten")}>Họ tên *</label><input id={f("ten")} name="fullName" required minLength={2} autoComplete="name" /></div>
        <div className="lp-f"><label htmlFor={f("sdt")}>Số điện thoại *</label><input id={f("sdt")} name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="09xx xxx xxx" /></div>
        <div className="lp-f"><label htmlFor={f("email")}>Email</label><input id={f("email")} name="email" type="email" autoComplete="email" /></div>
        <div className="lp-f"><label htmlFor={f("note")}>Giới thiệu ngắn</label><textarea id={f("note")} name="note" rows={3} maxLength={2000} placeholder="Kinh nghiệm dạy, môn / công cụ bạn dạy tốt, thời gian có thể dạy…" /></div>
        <div className="lp-f"><label htmlFor={f("cv")}>CV (PDF hoặc DOCX, tối đa 5MB)</label><input id={f("cv")} name="cv" type="file" accept=".pdf,.docx" /></div>
        <label className="lp-consent"><input type="checkbox" name="consent" value="1" required /> <span>{consentText}</span></label>
        {state === "error" && <p className="lp-f-err" role="alert">{msg}</p>}
        <button className="lp-btn lp-btn-primary lp-submit" disabled={state === "sending"}>{state === "sending" ? "Đang gửi…" : "Nộp hồ sơ"}</button>
      </form>
    </>
  );
}

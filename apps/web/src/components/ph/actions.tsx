"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Copy, Share2, Undo2 } from "lucide-react";
import { SESSION_REACTION_VI, SESSION_REACTIONS, REACTION_NOTE_MAX, type SessionReaction } from "@satarobo/core";
import { BottomSheet, phPost } from "./sheet";

const REASONS = ["Con bị ốm", "Việc gia đình", "Trùng lịch học ở trường", "Đi xa"];

/**
 * "Xin nghỉ buổi này" — hai chạm: mở bảng → chọn "Gửi · cần học bù" hoặc "Gửi · không cần học bù".
 * Lý do là tuỳ chọn (chạm chip hoặc gõ). Tạo yêu cầu nghỉ sẵn có (parent_requests loại absence, kênh App PH).
 */
export function AbsenceButton({ studentId, sessionId, when, childName, variant = "light" }: { studentId: string; sessionId: string; when: string; childName: string; variant?: "light" | "solid" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (needsMakeup: boolean) => {
    setBusy(true);
    setMsg(null);
    const r = await phPost<{ ok: boolean; error?: string; code?: string }>("/api/ph/requests", { action: "create", kind: "absence", studentId, sessionId, needsMakeup, reason });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: `Đã gửi yêu cầu${"code" in r && r.code ? ` ${r.code}` : ""}. Trung tâm sẽ xác nhận sớm.` });
      router.refresh();
    } else setMsg({ ok: false, text: r.error ?? "Không gửi được" });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setMsg(null); }}
        className={variant === "solid" ? "btn-primary min-h-11 w-full text-[15px]" : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[15px] font-bold text-primary shadow-sm hover:bg-white/90"}
      >
        <CalendarPlus className="h-5 w-5" aria-hidden /> Xin nghỉ buổi này
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Xin nghỉ buổi học">
        {msg?.ok ? (
          <div className="space-y-3 pb-2 text-[15px]">
            <p className="flex items-start gap-2 rounded-2xl bg-green-50 p-3 text-green-900"><Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{msg.text}</p>
            <button type="button" className="btn-ghost min-h-11 w-full" onClick={() => setOpen(false)}>Xong</button>
          </div>
        ) : (
          <div className="space-y-4 text-[15px]">
            <p className="text-ink-600">{childName} · <b className="text-foreground">{when}</b></p>
            <div>
              <div className="mb-2 font-semibold">Lý do <span className="font-normal text-ink-600">(không bắt buộc)</span></div>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((x) => (
                  <button key={x} type="button" aria-pressed={reason === x} onClick={() => setReason(reason === x ? "" : x)}
                    className={`min-h-11 rounded-full border px-4 text-[15px] ${reason === x ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-white"}`}>
                    {x}
                  </button>
                ))}
              </div>
              <label className="mt-2 block">
                <span className="sr-only">Lý do khác</span>
                <input className="input min-h-11 text-[15px]" maxLength={300} value={REASONS.includes(reason) ? "" : reason} onChange={(e) => setReason(e.target.value)} placeholder="Hoặc gõ lý do khác…" />
              </label>
            </div>
            <div>
              <div className="mb-2 font-semibold">Con có cần học bù buổi này không?</div>
              <div className="grid gap-2">
                <button type="button" disabled={busy} onClick={() => send(true)} className="btn-primary min-h-12 text-[15px]">Gửi · cần xếp học bù</button>
                <button type="button" disabled={busy} onClick={() => send(false)} className="btn-ghost min-h-12 text-[15px]">Gửi · không cần học bù</button>
              </div>
            </div>
            {msg && !msg.ok && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{msg.text}</p>}
            <p className="text-[13px] text-ink-600">Trung tâm nhận ngay trên hệ thống; anh/chị theo dõi ở mục “Yêu cầu”.</p>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

/** "Xin học bù" cho buổi con đã vắng (trong hạn) */
export function MakeupButton({ studentId, sessionId, when }: { studentId: string; sessionId: string; when: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true);
    const r = await phPost<{ ok: boolean; error?: string; code?: string }>("/api/ph/requests", { action: "create", kind: "makeup", studentId, sessionId, reason: note });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: `Đã gửi yêu cầu học bù${"code" in r && r.code ? ` ${r.code}` : ""}. Trung tâm sẽ xếp buổi và báo lại.` }); router.refresh(); }
    else setMsg({ ok: false, text: r.error ?? "Không gửi được" });
  };
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-primary/30 bg-white px-3 text-[14px] font-bold text-primary">
        Xin học bù
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Xin học bù">
        {msg?.ok ? (
          <div className="space-y-3 pb-2 text-[15px]">
            <p className="flex items-start gap-2 rounded-2xl bg-green-50 p-3 text-green-900"><Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{msg.text}</p>
            <button type="button" className="btn-ghost min-h-11 w-full" onClick={() => setOpen(false)}>Xong</button>
          </div>
        ) : (
          <div className="space-y-3 text-[15px]">
            <p>Buổi con đã vắng: <b>{when}</b></p>
            <label className="block">
              <span className="mb-1 block font-semibold">Khung giờ tiện cho gia đình <span className="font-normal text-ink-600">(không bắt buộc)</span></span>
              <input className="input min-h-11 text-[15px]" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: chiều thứ Bảy hoặc tối thứ Tư" />
            </label>
            <button type="button" disabled={busy} onClick={send} className="btn-primary min-h-12 w-full text-[15px]">Gửi yêu cầu học bù</button>
            {msg && !msg.ok && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{msg.text}</p>}
          </div>
        )}
      </BottomSheet>
    </>
  );
}

/** Huỷ yêu cầu do chính phụ huynh gửi (khi trung tâm chưa xử lý) */
export function CancelRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await phPost<{ ok: boolean; error?: string }>("/api/ph/requests", { action: "cancel", id });
    setBusy(false);
    if (r.ok) router.refresh(); else setErr(r.error ?? "Không huỷ được");
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirm ? (
        <>
          <button type="button" disabled={busy} onClick={go} className="min-h-11 rounded-xl bg-red-600 px-3 text-[14px] font-bold text-white">Xác nhận huỷ</button>
          <button type="button" onClick={() => setConfirm(false)} className="min-h-11 rounded-xl px-3 text-[14px] font-semibold text-ink-600">Không</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[14px] font-semibold text-red-700">
          <Undo2 className="h-4 w-4" aria-hidden /> Huỷ yêu cầu
        </button>
      )}
      {err && <span role="alert" className="text-[13px] text-red-700">{err}</span>}
    </span>
  );
}

/**
 * Phản hồi sau buổi — MỘT chạm: 👍 Rất vui / 🙂 Ổn / 😟 Cần trao đổi (gửi ngay).
 * Sau đó có ô ghi chú ngắn tuỳ chọn; "Cần trao đổi" → trung tâm gọi lại trong 24 giờ.
 */
export function ReactionBar({ studentId, sessionId, initial }: {
  studentId: string; sessionId: string;
  initial: { value: SessionReaction; note: string | null; editable: boolean } | null;
}) {
  const [value, setValue] = useState<SessionReaction | null>(initial?.value ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState<string | null>(initial ? "Đã gửi" : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const editable = initial ? initial.editable : true;
  const send = async (r: SessionReaction, withNote: string) => {
    setBusy(true);
    setErr("");
    const prev = value;
    setValue(r);
    const res = await phPost<{ ok: boolean; error?: string }>("/api/ph/react", { studentId, sessionId, reaction: r, note: withNote });
    setBusy(false);
    if (res.ok) setSaved(withNote.trim() ? "Đã gửi cảm xúc và ghi chú" : "Đã gửi");
    else { setValue(prev); setErr(res.error ?? "Không gửi được"); }
  };
  if (!editable && initial) {
    const v = SESSION_REACTION_VI[initial.value];
    return <p className="rounded-2xl bg-muted px-3 py-2 text-[14px] text-ink-600">Trung tâm đã ghi nhận ý kiến của gia đình về buổi này: <span aria-hidden>{v.emoji}</span> {v.label}</p>;
  }
  return (
    <div className="space-y-2" aria-label="Phản hồi sau buổi học">
      <div className="text-[15px] font-semibold">Con thấy buổi học thế nào?</div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Chọn cảm xúc">
        {SESSION_REACTIONS.map((r) => {
          const v = SESSION_REACTION_VI[r];
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              disabled={busy}
              aria-pressed={on}
              onClick={() => send(r, note)}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 text-[14px] font-semibold transition ${on ? (r === "concern" ? "border-accent-500 bg-accent-50 text-accent-700" : "border-primary bg-primary-soft text-primary") : "border-border bg-white hover:border-primary/40"}`}
            >
              <span className="text-[24px] leading-none" aria-hidden>{v.emoji}</span>
              {v.label}
            </button>
          );
        })}
      </div>
      {value && (
        <div className="space-y-2">
          {value === "concern" && <p className="rounded-xl bg-accent-50 px-3 py-2 text-[14px] text-accent-700">Trung tâm sẽ gọi lại cho anh/chị trong 24 giờ. Anh/chị có thể ghi thêm điều muốn trao đổi.</p>}
          <label className="block">
            <span className="sr-only">Ghi chú cho thầy cô</span>
            <textarea className="input min-h-[72px] text-[15px]" maxLength={REACTION_NOTE_MAX} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={value === "concern" ? "Điều anh/chị muốn trao đổi…" : "Ghi chú ngắn cho thầy cô (tuỳ chọn)"} />
          </label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-ink-600" aria-live="polite">{saved ?? ""}</span>
            <button type="button" disabled={busy || !note.trim()} onClick={() => send(value, note)} className="btn-ghost min-h-11 text-[14px]">Gửi ghi chú</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-[14px] text-red-700">{err}</p>}
    </div>
  );
}

/** Chia sẻ link xác thực giấy chứng nhận: bảng chia sẻ của điện thoại, không có thì sao chép */
export function ShareLinkButton({ path, title, label = "Chia sẻ link xác thực" }: { path: string; title: string; label?: string }) {
  const [done, setDone] = useState("");
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title, url }); return; }
    } catch { /* người dùng đóng bảng chia sẻ */ return; }
    try { await navigator.clipboard.writeText(url); setDone("Đã sao chép link"); }
    catch { setDone(url); }
  };
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-border bg-white px-3 text-[14px] font-bold">
        {done ? <Copy className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />} {label}
      </button>
      {done && <span className="mt-1 break-all text-[12px] text-ink-600" aria-live="polite">{done}</span>}
    </span>
  );
}

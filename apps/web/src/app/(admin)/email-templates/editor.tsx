"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type T = RouterOutputs["admin"]["emailTemplates"]["items"][number];

export function TemplateEditor({ t, canEdit }: { t: T; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [active, setActive] = useState(t.isActive);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pv = useMutation(trpc.admin.previewEmail.mutationOptions());
  const save = useMutation(trpc.admin.saveEmailTemplate.mutationOptions({ onSuccess: () => { setMsg({ ok: true, text: "Đã lưu" }); router.refresh(); }, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const reset = useMutation(trpc.admin.resetEmailTemplate.mutationOptions({ onSuccess: () => { setSubject(t.defaultSubject); setBody(t.defaultBody); setMsg({ ok: true, text: "Đã về mặc định" }); router.refresh(); }, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const test = useMutation(trpc.admin.testEmail.mutationOptions({ onSuccess: (r) => setMsg({ ok: r.status === "sent", text: r.status === "sent" ? "Đã gửi email thử" : `Email thử: ${r.status}${r.error ? ` — ${r.error}` : ""}` }), onError: (e) => setMsg({ ok: false, text: e.message }) }));
  return (
    <section className="card p-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span><b>{t.label}</b> <span className="font-mono text-xs text-ink-400">{t.eventKey}</span>{t.custom && <span className="chip ml-2 bg-brand-100 text-brand-800">Đã tuỳ chỉnh</span>}{!t.isActive && <span className="chip ml-1 bg-slate-100 text-slate-600">Tắt → dùng mặc định</span>}</span>
        <span className="text-sm text-ink-400">{open ? "Thu gọn" : "Mở"}</span>
      </button>
      {!open && <div className="mt-1 truncate text-sm text-ink-600">{t.subject}</div>}
      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <input className="input" disabled={!canEdit} value={subject} onChange={(e) => { setSubject(e.target.value); pv.reset(); }} />
            <textarea className="input h-48 font-mono text-xs" disabled={!canEdit} value={body} onChange={(e) => { setBody(e.target.value); pv.reset(); }} />
            <div className="flex flex-wrap gap-1 text-xs">Biến: {t.vars.map((v) => <button key={v} type="button" disabled={!canEdit} className="chip bg-black/5" onClick={() => setBody((b) => `${b}{${v}}`)}>{`{${v}}`}</button>)}</div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Dùng mẫu này</label>
                <button className="btn-primary !py-1" disabled={save.isPending} onClick={() => { setMsg(null); save.mutate({ eventKey: t.eventKey, subject, body, isActive: active }); }}>Lưu</button>
                <button className="btn-ghost !py-1" onClick={() => pv.mutate({ eventKey: t.eventKey, subject, body })}>Xem trước</button>
                {t.custom && <button className="btn-ghost !py-1" disabled={reset.isPending} onClick={() => reset.mutate({ eventKey: t.eventKey })}>Về mặc định</button>}
              </div>
            )}
            {t.updatedAt && <div className="text-xs text-ink-400">Sửa lần cuối {new Date(t.updatedAt).toLocaleString("vi-VN")} · {t.updatedBy}</div>}
          </div>
          <div className="space-y-2">
            {pv.data ? (
              <div className="rounded-xl border border-black/10 p-3 text-sm">
                {pv.data.errors.length > 0 && <div className="mb-2 text-red-700">{pv.data.errors.join("; ")}</div>}
                <div className="text-xs text-ink-400">Tiêu đề</div><div className="font-semibold">{pv.data.subject}</div>
                <div className="mt-2 text-xs text-ink-400">Nội dung (dữ liệu mẫu)</div><pre className="whitespace-pre-wrap font-sans">{pv.data.body}</pre>
              </div>
            ) : <div className="rounded-xl bg-black/[0.03] p-3 text-sm text-ink-400">Bấm "Xem trước" để xem email với dữ liệu mẫu.</div>}
            {canEdit && (
              <div className="flex gap-1">
                <input className="input !py-1 text-sm" placeholder="Gửi thử tới email…" value={to} onChange={(e) => setTo(e.target.value)} />
                <button className="btn-ghost !py-1 text-sm" disabled={!to || test.isPending} onClick={() => test.mutate({ to, eventKey: t.eventKey })}>Gửi thử</button>
              </div>
            )}
            {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
          </div>
        </div>
      )}
    </section>
  );
}

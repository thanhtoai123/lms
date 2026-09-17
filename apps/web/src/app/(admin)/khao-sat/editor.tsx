"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { QUESTION_TYPES, QUESTION_TYPE_VI, SURVEY_TRIGGERS, SURVEY_TRIGGER_VI, type QuestionType, type SurveyQuestion, type SurveyTrigger } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export type SurveyDraft = { id?: string; title: string; description: string; centerId: string; trigger: SurveyTrigger; triggerValue: number; questions: SurveyQuestion[] };

export const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  { id: "nps", type: "nps", label: "Anh/chị sẵn sàng giới thiệu Sata Robo cho bạn bè, người thân ở mức nào?", required: true },
  { id: "gv", type: "rating", label: "Anh/chị hài lòng với giáo viên của bé ở mức nào?", required: true },
  { id: "gopy", type: "text", label: "Anh/chị muốn Sata Robo cải thiện điều gì?", required: false },
];

export function SurveyEditor({ initial, centers, locked }: { initial: SurveyDraft; centers: { id: string; code: string }[]; locked: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const save = useMutation(trpc.care.upsertSurvey.mutationOptions({
    onSuccess: (r) => { setErr(null); setOk(true); if (!f.id) router.push(`/khao-sat/${r.id}`); router.refresh(); },
    onError: (e) => setErr(e.message),
  }));
  const setQ = (i: number, patch: Partial<SurveyQuestion>) => setF((x) => ({ ...x, questions: x.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const move = (i: number, d: -1 | 1) => setF((x) => { const qs = [...x.questions]; const [q] = qs.splice(i, 1); qs.splice(i + d, 0, q!); return { ...x, questions: qs }; });
  const add = (type: QuestionType) => setF((x) => ({ ...x, questions: [...x.questions, { id: `${type}${Date.now().toString(36).slice(-4)}`.replace(/[^a-z0-9_]/g, ""), type, label: "", required: false, ...(type === "choice" ? { options: ["", ""] } : {}) }] }));
  const L = "text-xs text-ink-600";
  return (
    <div className="space-y-3">
      <section className="card grid gap-2 p-4 md:grid-cols-2">
        <label className={`${L} md:col-span-2`}>Tiêu đề<input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className={`${L} md:col-span-2`}>Lời mở đầu<input className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className={L}>Phạm vi<select className="input mt-1" disabled={!!f.id} value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}><option value="">Toàn hệ thống</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
        <div className="flex gap-2">
          <label className={`${L} flex-1`}>Gửi khi<select className="input mt-1" value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value as SurveyTrigger })}>{SURVEY_TRIGGERS.map((t) => <option key={t} value={t}>{SURVEY_TRIGGER_VI[t]}</option>)}</select></label>
          {f.trigger === "session_n" && <label className={`${L} w-24`}>Buổi N<input type="number" min={1} className="input mt-1" value={f.triggerValue} onChange={(e) => setF({ ...f, triggerValue: Number(e.target.value) })} /></label>}
        </div>
      </section>
      {locked && <p className="text-xs text-amber-700">Khảo sát đã chạy: chỉ sửa được câu chữ, không đổi loại câu hỏi / lựa chọn (để giữ kết quả so sánh được).</p>}
      {f.questions.map((q, i) => (
        <section key={q.id} className="card space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <b>Câu {i + 1}</b><span className="chip bg-black/5">{QUESTION_TYPE_VI[q.type]}</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={q.required} disabled={locked} onChange={(e) => setQ(i, { required: e.target.checked })} /> bắt buộc</label>
            <span className="flex-1" />
            {!locked && <><button disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button disabled={i === f.questions.length - 1} onClick={() => move(i, 1)}>↓</button><button className="text-red-700" onClick={() => setF((x) => ({ ...x, questions: x.questions.filter((_, j) => j !== i) }))}>Xoá</button></>}
          </div>
          <input className="input" placeholder="Nội dung câu hỏi" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
          {q.type === "choice" && (
            <div className="space-y-1">
              {(q.options ?? []).map((o, k) => (
                <div key={k} className="flex gap-1"><input className="input !py-1 text-sm" disabled={locked} placeholder={`Lựa chọn ${k + 1}`} value={o} onChange={(e) => setQ(i, { options: (q.options ?? []).map((x, j) => (j === k ? e.target.value : x)) })} />{!locked && <button className="text-xs text-red-700" onClick={() => setQ(i, { options: (q.options ?? []).filter((_, j) => j !== k) })}>×</button>}</div>
              ))}
              {!locked && <button className="text-xs text-brand-600" onClick={() => setQ(i, { options: [...(q.options ?? []), ""] })}>+ Lựa chọn</button>}
            </div>
          )}
        </section>
      ))}
      {!locked && <div className="flex flex-wrap gap-1 text-xs">Thêm câu: {QUESTION_TYPES.map((t) => <button key={t} className="btn-ghost !py-1 text-xs" onClick={() => add(t)}>{QUESTION_TYPE_VI[t]}</button>)}</div>}
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={save.isPending} onClick={() => { setOk(false); save.mutate({ id: f.id, title: f.title, description: f.description || null, centerId: f.centerId || null, trigger: f.trigger, triggerValue: f.trigger === "session_n" ? f.triggerValue : null, questions: f.questions }); }}>{f.id ? "Lưu" : "Tạo khảo sát (nháp)"}</button>
        {ok && <span className="text-sm text-green-700">Đã lưu</span>}
        {err && <span className="text-sm text-red-700">{err}</span>}
      </div>
    </div>
  );
}

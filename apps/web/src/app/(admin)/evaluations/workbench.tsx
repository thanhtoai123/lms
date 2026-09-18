"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  EVAL_FORM_TYPES, EVAL_FORM_TYPE_VI, EVAL_QUESTION_TYPES, EVAL_QUESTION_TYPE_VI, EVAL_ROUND_ACTION_VI, EVAL_TYPES_WITH_OPTIONS,
  EVAL_IMAGE_ONLY_FORM, EVAL_MAX_QUESTIONS, evalQuestionIssues, validateEvalForm,
  type EvalFormType, type EvalQuestionType, type EvalRoundAction, type EvalRoundStatus,
} from "@satarobo/core";

type FormRow = {
  id: string; title: string; description: string | null; type: EvalFormType; typeLabel: string;
  centerId: string | null; centerCode: string | null; isActive: boolean;
  questionCount: number; roundCount: number; responseCount: number; canEdit: boolean;
};
type RoundRow = {
  id: string; title: string; formId: string; formTitle: string; formTypeLabel: string;
  centerId: string | null; centerCode: string | null; startDate: string; endDate: string;
  status: EvalRoundStatus; statusLabel: string; responses: number; avgRating: number | null; running: boolean; canEdit: boolean;
};
type Center = { id: string; code: string; name: string };
type QDraft = { type: EvalQuestionType; label: string; criteriaGroup: string; options: string; required: boolean };

const EMPTY_Q: QDraft = { type: "rating", label: "", criteriaGroup: "", options: "", required: false };
const splitOptions = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function EvalWorkbench({ forms, rounds, centers, canCreateForm, canCreateRound, canCreateGlobal }: {
  forms: FormRow[]; rounds: RoundRow[]; centers: Center[]; canCreateForm: boolean; canCreateRound: boolean;
  /** Chỉ Hội sở mới tạo được phiếu / đợt dùng chung toàn hệ thống */
  canCreateGlobal: boolean;
}) {
  const [tab, setTab] = useState<"forms" | "rounds">("forms");
  return (
    <div className="space-y-3">
      <nav className="flex gap-1 border-b border-black/10 text-sm">
        {([["forms", `Phiếu đánh giá (${forms.length})`], ["rounds", `Đợt khảo sát (${rounds.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-2 ${tab === k ? "border-b-2 border-brand-500 font-semibold" : "text-ink-600"}`}>{l}</button>
        ))}
      </nav>
      {tab === "forms"
        ? <FormsTab forms={forms} centers={centers} canCreate={canCreateForm} canCreateGlobal={canCreateGlobal} />
        : <RoundsTab rounds={rounds} forms={forms} centers={centers} canCreate={canCreateRound} canCreateGlobal={canCreateGlobal} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trình dựng phiếu                                                    */
/* ------------------------------------------------------------------ */

function FormsTab({ forms, centers, canCreate, canCreateGlobal }: { forms: FormRow[]; centers: Center[]; canCreate: boolean; canCreateGlobal: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [head, setHead] = useState<{ title: string; description: string; type: EvalFormType; centerId: string }>({ title: "", description: "", type: "teacher_eval", centerId: "" });
  const [qs, setQs] = useState<QDraft[]>([{ ...EMPTY_Q }]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useMutation(trpc.care.upsertEvalForm.mutationOptions({
    onSuccess: () => { setOpen(false); setEditId(null); setError(null); setNotice("Đã lưu phiếu đánh giá"); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  const toggleActive = useMutation(trpc.care.setEvalFormActive.mutationOptions({ onSuccess: () => router.refresh(), onError: (e) => setError(e.message) }));
  // Chỉ nạp câu hỏi khi thật sự bấm Sửa — danh sách không cần dữ liệu này
  const loaded = useQuery({ ...trpc.care.evalForm.queryOptions({ id: editId ?? "" }), enabled: !!editId });

  useEffect(() => {
    const f = loaded.data;
    if (!editId || !f) return;
    setHead({ title: f.title, description: f.description ?? "", type: f.type, centerId: f.centerId ?? "" });
    setQs(f.questions.length
      ? f.questions.map((q) => ({ type: q.type, label: q.label, criteriaGroup: q.criteriaGroup ?? "", options: (q.options ?? []).join("\n"), required: q.required }))
      : [{ ...EMPTY_Q }]);
  }, [editId, loaded.data]);

  const startEdit = (id: string) => { setEditId(id); setError(null); setNotice(null); setOpen(true); };

  const draftQuestions = qs.map((q) => ({ type: q.type, label: q.label, criteriaGroup: q.criteriaGroup || null, options: splitOptions(q.options), required: q.required }));
  const issues = validateEvalForm({ title: head.title, type: head.type, questions: draftQuestions });

  const startNew = () => {
    setEditId(null);
    setHead({ title: "", description: "", type: "teacher_eval", centerId: canCreateGlobal ? "" : centers[0]?.id ?? "" });
    setQs([{ ...EMPTY_Q }]);
    setError(null); setNotice(null); setOpen(true);
  };

  const setQ = (i: number, patch: Partial<QDraft>) => setQs((arr) => arr.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, dir: -1 | 1) => setQs((arr) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });

  const submit = () => {
    setError(null);
    if (issues.length) return setError(issues.join("; "));
    save.mutate({
      id: editId, title: head.title.trim(), description: head.description.trim() || null, type: head.type,
      centerId: head.centerId || null,
      questions: draftQuestions.map((q) => ({ ...q, options: q.options.length ? q.options : null })),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Phiếu để trống cơ sở là phiếu dùng chung toàn hệ thống (chỉ Hội sở tạo). Phiếu đã có lượt trả lời thì không sửa câu hỏi nữa — tạo phiếu mới.</p>
        {canCreate && !open && <button type="button" className="btn-primary" onClick={startNew}>+ Tạo phiếu đánh giá</button>}
      </div>
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}

      {open && (
        <section className="card space-y-3 p-4">
          <h3 className="font-bold">{editId ? "Sửa phiếu" : "Phiếu đánh giá mới"}{editId && loaded.isLoading ? " — đang tải…" : ""}</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-ink-600 sm:col-span-2">Tiêu đề *
              <input className="input mt-1" value={head.title} maxLength={200} onChange={(e) => setHead({ ...head, title: e.target.value })} placeholder="VD: Phiếu đánh giá giáo viên học kỳ I" />
            </label>
            <label className="text-xs text-ink-600">Loại phiếu *
              <select className="input mt-1" value={head.type} disabled={!!editId} onChange={(e) => setHead({ ...head, type: e.target.value as EvalFormType })}>
                {EVAL_FORM_TYPES.map((t) => <option key={t} value={t}>{EVAL_FORM_TYPE_VI[t]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Phạm vi
              <select className="input mt-1" value={head.centerId} onChange={(e) => setHead({ ...head, centerId: e.target.value })}>
                <option value="" disabled={!canCreateGlobal}>Dùng chung (mọi cơ sở){canCreateGlobal ? "" : " — chỉ Hội sở"}</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600 sm:col-span-4">Mô tả (tuỳ chọn)
              <input className="input mt-1" value={head.description} maxLength={1000} onChange={(e) => setHead({ ...head, description: e.target.value })} />
            </label>
          </div>

          {head.type !== EVAL_IMAGE_ONLY_FORM && (
            <p className="text-xs text-ink-400">Câu hỏi “{EVAL_QUESTION_TYPE_VI.image}” chỉ dùng cho phiếu {EVAL_FORM_TYPE_VI[EVAL_IMAGE_ONLY_FORM]}.</p>
          )}

          <ol className="space-y-2">
            {qs.map((q, i) => {
              const bad = evalQuestionIssues({ type: q.type, label: q.label, criteriaGroup: q.criteriaGroup || null, options: splitOptions(q.options) }, head.type);
              const hasOptions = EVAL_TYPES_WITH_OPTIONS.includes(q.type);
              return (
                <li key={i} className={`rounded-xl border p-3 ${bad.length ? "border-red-200 bg-red-50/40" : "border-black/5 bg-black/[0.02]"}`}>
                  <div className="grid gap-2 sm:grid-cols-6">
                    <label className="text-xs text-ink-600 sm:col-span-3">Câu {i + 1} — nội dung *
                      <input className="input mt-1" value={q.label} maxLength={500} onChange={(e) => setQ(i, { label: e.target.value })} placeholder="VD: Thầy cô giảng bài dễ hiểu" />
                    </label>
                    <label className="text-xs text-ink-600">Loại câu hỏi
                      <select className="input mt-1" value={q.type} onChange={(e) => setQ(i, { type: e.target.value as EvalQuestionType })}>
                        {EVAL_QUESTION_TYPES.map((t) => (
                          <option key={t} value={t} disabled={t === "image" && head.type !== EVAL_IMAGE_ONLY_FORM}>{EVAL_QUESTION_TYPE_VI[t]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-ink-600">Nhóm tiêu chí
                      <input className="input mt-1" value={q.criteriaGroup} maxLength={100} onChange={(e) => setQ(i, { criteriaGroup: e.target.value })} placeholder="VD: Kiến thức" title="Để trống nếu không nhóm" />
                    </label>
                    <div className="flex items-end justify-end gap-2 text-xs">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Bắt buộc</label>
                      <button type="button" className="text-ink-400 hover:text-ink-600" onClick={() => move(i, -1)} disabled={i === 0} title="Lên">↑</button>
                      <button type="button" className="text-ink-400 hover:text-ink-600" onClick={() => move(i, 1)} disabled={i === qs.length - 1} title="Xuống">↓</button>
                      <button type="button" className="text-red-700" onClick={() => setQs((a) => a.filter((_, j) => j !== i))} disabled={qs.length === 1}>Xoá</button>
                    </div>
                    {hasOptions && (
                      <label className="text-xs text-ink-600 sm:col-span-6">Lựa chọn — mỗi dòng một lựa chọn (tối thiểu 2)
                        <textarea className="input mt-1 h-20 text-xs" value={q.options} onChange={(e) => setQ(i, { options: e.target.value })} placeholder={"Rất hài lòng\nHài lòng\nChưa hài lòng"} />
                      </label>
                    )}
                  </div>
                  {bad.length > 0 && <p className="pt-1 text-xs text-red-700">{bad.join(" · ")}</p>}
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn-ghost text-xs" disabled={qs.length >= EVAL_MAX_QUESTIONS} onClick={() => setQs((a) => [...a, { ...EMPTY_Q }])}>+ Thêm câu hỏi</button>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {!error && issues.length > 0 && <div className="text-xs text-amber-800">{issues.join(" · ")}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setEditId(null); }}>Huỷ</button>
            <button type="button" className="btn-primary" disabled={save.isPending || issues.length > 0} onClick={submit}>Lưu phiếu</button>
          </div>
        </section>
      )}

      {forms.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink-400">Chưa có phiếu đánh giá nào. Tạo phiếu rồi mở đợt khảo sát.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Phiếu</th><th className="p-3">Loại</th><th className="p-3">Phạm vi</th><th className="p-3 text-right">Câu hỏi</th><th className="p-3 text-right">Đợt</th><th className="p-3 text-right">Trả lời</th><th className="p-3">Trạng thái</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {forms.map((f) => (
                <tr key={f.id}>
                  <td className="p-3"><span className="font-medium">{f.title}</span>{f.description && <div className="text-xs text-ink-400">{f.description}</div>}</td>
                  <td className="p-3 text-xs">{f.typeLabel}</td>
                  <td className="p-3 text-xs">{f.centerCode ?? "Toàn hệ thống"}</td>
                  <td className="p-3 text-right tabular-nums">{f.questionCount}</td>
                  <td className="p-3 text-right tabular-nums">{f.roundCount}</td>
                  <td className="p-3 text-right tabular-nums">{f.responseCount}</td>
                  <td className="p-3">
                    <span className={`chip ${f.isActive ? "bg-green-100 text-green-800" : "bg-black/5 text-ink-600"}`}>{f.isActive ? "Đang dùng" : "Đã tắt"}</span>
                    {f.canEdit && (
                      <>
                        <button type="button" className="ml-2 text-xs text-brand-700 underline" onClick={() => startEdit(f.id)} title={f.responseCount ? "Phiếu đã có lượt trả lời — chỉ sửa được tiêu đề" : undefined}>Sửa</button>
                        <button type="button" className="ml-2 text-xs text-brand-700 underline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate({ id: f.id, isActive: !f.isActive })}>
                          {f.isActive ? "Tắt" : "Bật"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Đợt khảo sát                                                        */
/* ------------------------------------------------------------------ */

function RoundsTab({ rounds, forms, centers, canCreate, canCreateGlobal }: { rounds: RoundRow[]; forms: FormRow[]; centers: Center[]; canCreate: boolean; canCreateGlobal: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", formId: "", centerId: "", startDate: "", endDate: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useMutation(trpc.care.upsertEvalRound.mutationOptions({
    onSuccess: () => { setOpen(false); setError(null); setNotice("Đã tạo đợt khảo sát (đang ở trạng thái Nháp — bấm Mở đợt để bắt đầu nhận phản hồi)"); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  const move = useMutation(trpc.care.transitionEvalRound.mutationOptions({
    onSuccess: (r) => { setError(null); setNotice(`Đợt chuyển sang “${r.statusLabel}”`); router.refresh(); },
    onError: (e) => setError(e.message),
  }));

  const usable = forms.filter((f) => f.isActive);
  const actionsOf = (r: RoundRow): EvalRoundAction[] =>
    r.status === "draft" ? ["open", "archive"] : r.status === "open" ? ["close"] : r.status === "closed" ? ["open", "archive"] : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Đợt nhận phản hồi khi <b>đang mở</b> và hôm nay nằm trong khoảng thời gian. Đóng đợt rồi mới lưu trữ được; đợt đã lưu trữ không thao tác lại.</p>
        {canCreate && !open && <button type="button" className="btn-primary" disabled={usable.length === 0} title={usable.length ? undefined : "Tạo phiếu đánh giá trước"} onClick={() => { setDraft({ title: "", formId: usable[0]?.id ?? "", centerId: canCreateGlobal ? "" : centers[0]?.id ?? "", startDate: "", endDate: "", note: "" }); setError(null); setNotice(null); setOpen(true); }}>+ Tạo đợt khảo sát</button>}
      </div>
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}

      {open && (
        <form
          className="card grid gap-2 p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ title: draft.title.trim(), formId: draft.formId, centerId: draft.centerId || null, startDate: draft.startDate, endDate: draft.endDate, note: draft.note.trim() || null });
          }}
        >
          <h3 className="font-bold sm:col-span-4">Đợt khảo sát mới</h3>
          <label className="text-xs text-ink-600 sm:col-span-2">Tiêu đề đợt *
            <input className="input mt-1" required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="VD: Đánh giá GV học kỳ I 2026" />
          </label>
          <label className="text-xs text-ink-600 sm:col-span-2">Phiếu đánh giá *
            <select className="input mt-1" required value={draft.formId} onChange={(e) => setDraft({ ...draft, formId: e.target.value })}>
              <option value="">— Chọn phiếu —</option>
              {usable.map((f) => <option key={f.id} value={f.id}>{f.title} ({f.typeLabel}{f.centerCode ? ` · ${f.centerCode}` : ""})</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600">Phạm vi cơ sở
            <select className="input mt-1" value={draft.centerId} onChange={(e) => setDraft({ ...draft, centerId: e.target.value })}>
              <option value="" disabled={!canCreateGlobal}>Mọi cơ sở{canCreateGlobal ? "" : " — chỉ Hội sở"}</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600">Từ ngày *<input className="input mt-1" type="date" required value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Đến ngày *<input className="input mt-1" type="date" required value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Ghi chú<input className="input mt-1" maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-4">{error}</div>}
          <div className="flex justify-end gap-2 sm:col-span-4">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
            <button className="btn-primary" disabled={save.isPending}>Tạo đợt</button>
          </div>
        </form>
      )}

      {rounds.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink-400">Chưa có đợt khảo sát nào.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Đợt</th><th className="p-3">Phiếu</th><th className="p-3">Phạm vi</th><th className="p-3">Thời gian</th><th className="p-3 text-right">Trả lời</th><th className="p-3 text-right">Điểm sao</th><th className="p-3">Trạng thái</th><th className="p-3">Thao tác</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rounds.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-medium">{r.title}</td>
                  <td className="p-3 text-xs">{r.formTitle}<div className="text-ink-400">{r.formTypeLabel}</div></td>
                  <td className="p-3 text-xs">{r.centerCode ?? "Mọi cơ sở"}</td>
                  <td className="p-3 whitespace-nowrap text-xs">{dmy(r.startDate)} – {dmy(r.endDate)}{r.running && <div className="text-green-700">đang nhận phản hồi</div>}</td>
                  <td className="p-3 text-right tabular-nums">{r.responses}</td>
                  <td className="p-3 text-right tabular-nums">{r.avgRating ?? "—"}</td>
                  <td className="p-3"><span className={`chip ${STATUS_CHIP[r.status]}`}>{r.statusLabel}</span></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {r.canEdit && actionsOf(r).map((a) => (
                        <button key={a} type="button" className="text-brand-700 underline" disabled={move.isPending} onClick={() => move.mutate({ id: r.id, action: a })}>{EVAL_ROUND_ACTION_VI[a]}</button>
                      ))}
                      {!r.canEdit && <span className="text-ink-400">chỉ xem</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && !open && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}

const STATUS_CHIP: Record<EvalRoundStatus, string> = {
  draft: "bg-black/5 text-ink-600",
  open: "bg-green-100 text-green-800",
  closed: "bg-amber-100 text-amber-800",
  archived: "bg-slate-100 text-slate-600",
};
const dmy = (d: string) => d.split("-").reverse().join("/");

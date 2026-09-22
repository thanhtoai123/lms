"use client";

/**
 * KHỐI "PHIẾU NHẬN XÉT BUỔI HỌC" trên màn buổi học (app giáo viên /teacher/sessions/[id], cũng là màn
 * nhân sự quản trị mở từ lưới điểm danh / danh sách buổi). Không thêm tab: nằm ngay dưới điểm danh.
 *
 * Mỗi học viên có mặt: hàng tiêu chí × 4 nút mức (chạm một lần), 3 nút mục tiêu bài, thẻ nổi bật,
 * ô "Sản phẩm", ô nhận xét cho phụ huynh (chính là nhận xét của buổi — không nhập hai lần), ảnh đã duyệt.
 * Lưu nháp TỰ ĐỘNG sau mỗi thay đổi; khi hoàn tất buổi, phiếu đủ tiêu chí được phát hành cùng lúc.
 * Phiếu đã phát hành chỉ sửa được bằng "Sửa phiếu" kèm lý do.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, Copy, Printer, Sparkles, Target } from "lucide-react";
import {
  OBJECTIVE_RESULTS, OBJECTIVE_RESULT_SHORT, OBJECTIVE_RESULT_VI, isEvaluableAttendance, type ObjectiveResult, type AttendanceStatus,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Board = RouterOutputs["academics"]["evaluations"]["board"];
type Item = Board["items"][number];

interface Form {
  scores: Record<string, number | null>;
  objectiveResult: ObjectiveResult | null;
  highlights: string[];
  productNote: string;
  remark: string;
  mediaIds: string[];
}

const formOf = (it: Item): Form => ({
  scores: { ...(it.evaluation?.scores ?? {}) },
  objectiveResult: it.evaluation?.objectiveResult ?? null,
  highlights: [...(it.evaluation?.highlights ?? [])],
  productNote: it.evaluation?.productNote ?? "",
  remark: it.evaluation?.remark ?? it.remark ?? "",
  mediaIds: [...(it.evaluation?.mediaIds ?? [])],
});

/** Màu nút khi chọn: nấc thấp cam nhấn, nấc cao tím thương hiệu */
const LEVEL_ON = ["border-accent-500 bg-accent-500 text-white", "border-brand-300 bg-brand-300 text-white", "border-brand-400 bg-brand-400 text-white", "border-primary bg-primary text-white"] as const;
const OBJ_ON: Record<ObjectiveResult, string> = {
  achieved: "border-primary bg-primary text-white",
  partial: "border-brand-400 bg-brand-400 text-white",
  not_yet: "border-accent-500 bg-accent-500 text-white",
};

export function EvaluationPanel({
  sessionId, attendance, sessionDone, disabled = false,
}: {
  sessionId: string;
  /** Trạng thái điểm danh đang hiển thị trên màn (kể cả chưa lưu) — HV vắng không có phiếu */
  attendance: Record<string, AttendanceStatus | undefined>;
  /** Buổi đã hoàn tất: phiếu chỉ còn xem / sửa có lý do */
  sessionDone: boolean;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.academics.evaluations.board.queryOptions({ sessionId }));
  const board = q.data;
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nạp form từ máy chủ cho em chưa sửa dở (giữ nguyên em đang gõ)
  useEffect(() => {
    if (!board) return;
    setForms((prev) => {
      const next: Record<string, Form> = {};
      for (const it of board.items) next[it.enrollmentId] = dirty.has(it.enrollmentId) && prev[it.enrollmentId] ? prev[it.enrollmentId]! : formOf(it);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: trpc.academics.evaluations.board.queryKey({ sessionId }) });
    qc.invalidateQueries({ queryKey: trpc.academics.sessions.get.queryKey({ id: sessionId }) });
  }, [qc, trpc, sessionId]);

  const save = useMutation(trpc.academics.evaluations.save.mutationOptions({
    onSuccess: (r) => {
      const at = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      setStatus(r.skipped.length ? { tone: "info", text: `Đã lưu nháp lúc ${at} · bỏ qua: ${r.skipped.map((s) => s.reason).join("; ")}` } : { tone: "ok", text: `Đã lưu nháp lúc ${at}` });
      invalidate();
    },
    onError: (e) => setStatus({ tone: "err", text: e.message }),
  }));

  const present = useMemo(
    () => (board?.items ?? []).filter((it) => {
      const st = attendance[it.enrollmentId] ?? it.attendanceStatus ?? "present";
      return isEvaluableAttendance(st);
    }),
    [board, attendance],
  );

  const flush = useCallback((ids?: string[]) => {
    const list = ids ?? [...dirty];
    if (!list.length || !board?.canWrite) return;
    const items = list
      .map((id) => ({ id, f: forms[id], it: board.items.find((x) => x.enrollmentId === id) }))
      .filter((x): x is { id: string; f: Form; it: Item } => !!x.f && !!x.it && x.it.evaluation?.status !== "published")
      .map(({ id, f }) => ({
        enrollmentId: id, scores: f.scores, objectiveResult: f.objectiveResult, highlights: f.highlights,
        productNote: f.productNote.trim() || null, remark: f.remark.trim() || null, mediaIds: f.mediaIds,
      }));
    setDirty((d) => { const n = new Set(d); for (const id of list) n.delete(id); return n; });
    if (items.length) save.mutate({ sessionId, items });
  }, [dirty, forms, board, save, sessionId]);

  // Lưu nháp tự động 1,2 giây sau lần sửa cuối
  useEffect(() => {
    if (!dirty.size) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 1200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, forms, flush]);

  const update = (id: string, patch: Partial<Form>) => {
    setForms((f) => ({ ...f, [id]: { ...(f[id] ?? emptyForm()), ...patch } }));
    setDirty((d) => new Set(d).add(id));
  };

  const copyToAll = (fromId: string) => {
    const src = forms[fromId];
    if (!src || !board) return;
    const targets = present.filter((it) => it.enrollmentId !== fromId && it.evaluation?.status !== "published").map((it) => it.enrollmentId);
    setForms((f) => {
      const n = { ...f };
      for (const id of targets) n[id] = { ...(n[id] ?? emptyForm()), scores: { ...src.scores }, objectiveResult: src.objectiveResult };
      return n;
    });
    setDirty((d) => { const n = new Set(d); for (const id of targets) n.add(id); return n; });
    setStatus({ tone: "info", text: `Đã chép mức cho ${targets.length} học viên — chỉnh riêng vài em khác biệt, hệ thống tự lưu nháp.` });
  };

  if (q.isLoading) return <section className="card p-4 text-sm text-ink-400">Đang tải phiếu nhận xét…</section>;
  if (!board) return <section className="card p-4 text-sm text-red-700">{q.error?.message ?? "Không tải được phiếu nhận xét buổi học"}</section>;

  const done = (it: Item) => {
    const f = forms[it.enrollmentId];
    if (it.evaluation?.status === "published") return true;
    if (!f) return false;
    return board.criteria.every((c) => f.scores[c.key] != null) && !!f.objectiveResult;
  };
  const readyCount = present.filter(done).length;
  const canEdit = board.canWrite && !disabled;

  return (
    <section id="phieu-nhan-xet" className="card scroll-mt-20 space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Phiếu nhận xét buổi học <span className="text-sm font-normal text-ink-400">({readyCount}/{present.length} đủ tiêu chí)</span></h2>
          <p className="text-xs text-ink-600">Chạm mức cho từng tiêu chí · tự lưu nháp · phát hành khi <b>hoàn tất buổi</b>, phụ huynh xem trong hồ sơ học tập.</p>
        </div>
        {status && <span className={`text-xs ${status.tone === "err" ? "text-red-700" : status.tone === "info" ? "text-amber-800" : "text-green-700"}`}>{save.isPending ? "Đang lưu…" : status.text}</span>}
      </div>

      {(board.lesson.title || board.lesson.objectives) && (
        <div className="rounded-xl bg-brand-50/70 p-3 text-sm">
          <div className="font-semibold">{board.lesson.title ?? "Bài học"}</div>
          {board.lesson.objectives && <p className="mt-0.5 flex gap-1.5 text-xs text-ink-600"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" aria-hidden />{board.lesson.objectives}</p>}
        </div>
      )}

      {!board.canWrite && <p className="text-xs text-ink-600">Bạn chỉ có quyền xem phiếu của buổi này.</p>}
      {present.length === 0 && <p className="text-sm text-ink-400">Chưa có học viên có mặt — điểm danh trước rồi chấm phiếu.</p>}

      <ul className="divide-y divide-black/5">
        {present.map((it) => {
          const f = forms[it.enrollmentId] ?? formOf(it);
          const published = it.evaluation?.status === "published";
          const isOpen = open === it.enrollmentId;
          const ok = done(it);
          // Buổi đã hoàn tất mà còn phiếu nháp (cấu hình cho phép hoàn tất khi thiếu): điền xong là phát hành ngay
          const editable = canEdit && !published;
          return (
            <li key={it.enrollmentId} className="py-2">
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : it.enrollmentId)} aria-expanded={isOpen}>
                <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : "!"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{it.fullName}</span>
                  <span className="flex gap-0.5" aria-hidden>
                    {board.criteria.map((c) => {
                      const v = f.scores[c.key];
                      return <span key={c.key} className={`h-1.5 w-5 rounded-full ${v ? LEVEL_ON[Math.min(3, Math.max(0, v - 1))]!.split(" ")[1] : "bg-black/10"}`} />;
                    })}
                  </span>
                </span>
                <span className={`chip shrink-0 ${published ? "bg-green-100 text-green-800" : ok ? "bg-brand-50 text-primary" : "bg-amber-50 text-amber-800"}`}>
                  {published ? `Đã phát hành${(it.evaluation?.revision ?? 1) > 1 ? ` · sửa ${(it.evaluation?.revision ?? 1) - 1}` : ""}` : ok ? "Sẵn sàng" : "Còn thiếu"}
                </span>
                {isOpen ? <ChevronUp className="h-4 w-4 text-ink-400" aria-hidden /> : <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden />}
              </button>

              {isOpen && (
                <div className="mt-2 space-y-3 rounded-xl border border-black/5 bg-black/[0.015] p-3">
                  {published && it.evaluation ? (
                    <AmendBlock item={it} board={board} canAmend={board.canWrite && !disabled} onDone={invalidate} />
                  ) : (
                    <EvaluationForm board={board} form={f} editable={editable} media={it.media} onChange={(p) => update(it.enrollmentId, p)} onBlur={() => flush([it.enrollmentId])} />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {editable && present.length > 1 && (
                      <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => copyToAll(it.enrollmentId)} disabled={!Object.values(f.scores).some((v) => v != null)}>
                        <Copy className="h-3.5 w-3.5" aria-hidden /> Chép mức của bé này cho cả lớp
                      </button>
                    )}
                    {it.evaluation?.id && (
                      <Link href={`/phieu-buoi/${it.evaluation.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <Printer className="h-3.5 w-3.5" aria-hidden /> Xem / in phiếu
                      </Link>
                    )}
                    {editable && (() => {
                      const idx = present.findIndex((x) => x.enrollmentId === it.enrollmentId);
                      const nextIt = present[idx + 1];
                      return nextIt ? (
                        <button type="button" className="btn-primary !px-3 !py-1 text-xs" onClick={() => { flush([it.enrollmentId]); setOpen(nextIt.enrollmentId); }}>Tiếp theo: {nextIt.fullName.split(/\s+/).slice(-1)[0]}</button>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {board.readiness.message && !sessionDone && (
        <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">{board.readiness.message}</p>
      )}
    </section>
  );
}

function emptyForm(): Form {
  return { scores: {}, objectiveResult: null, highlights: [], productNote: "", remark: "", mediaIds: [] };
}

function EvaluationForm({
  board, form, editable, media, onChange, onBlur,
}: {
  board: Board;
  form: Form;
  editable: boolean;
  media: Item["media"];
  onChange: (p: Partial<Form>) => void;
  onBlur: () => void;
}) {
  return (
    <>
      <div className="space-y-2.5">
        {board.criteria.map((c) => {
          const v = form.scores[c.key] ?? null;
          const chosen = c.levels.find((l) => l.value === v);
          return (
            <div key={c.key}>
              <div className="text-sm font-semibold">{c.label}{c.description && <span className="ml-1 text-xs font-normal text-ink-400">— {c.description}</span>}</div>
              <div className="mt-1 grid grid-cols-4 gap-1" role="radiogroup" aria-label={c.label}>
                {c.levels.map((l, i) => (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={v === l.value}
                    disabled={!editable}
                    title={l.hint}
                    onClick={() => onChange({ scores: { ...form.scores, [c.key]: v === l.value ? null : l.value } })}
                    className={`min-h-11 rounded-lg border-2 px-1 text-[11px] font-bold leading-tight transition ${v === l.value ? LEVEL_ON[i] ?? LEVEL_ON[3] : "border-black/10 bg-white text-ink-600 hover:border-brand-300"} disabled:opacity-60`}
                  >
                    <span className="block text-sm">{l.value}</span>{l.label}
                  </button>
                ))}
              </div>
              {chosen && <p className="mt-0.5 text-[11px] italic text-ink-600">{chosen.hint}</p>}
            </div>
          );
        })}
      </div>

      <div>
        <div className="text-xs font-semibold text-ink-600">Mục tiêu bài học</div>
        <div className="mt-1 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Mục tiêu bài học">
          {OBJECTIVE_RESULTS.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={form.objectiveResult === o} disabled={!editable} title={OBJECTIVE_RESULT_VI[o]}
              onClick={() => onChange({ objectiveResult: form.objectiveResult === o ? null : o })}
              className={`min-h-10 rounded-lg border-2 text-xs font-bold ${form.objectiveResult === o ? OBJ_ON[o] : "border-black/10 bg-white text-ink-600"} disabled:opacity-60`}>
              {OBJECTIVE_RESULT_SHORT[o]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1 text-xs font-semibold text-ink-600"><Sparkles className="h-3.5 w-3.5 text-accent-500" aria-hidden /> Điểm nổi bật</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {board.highlightOptions.map((h) => {
            const on = form.highlights.includes(h);
            return (
              <button key={h} type="button" disabled={!editable} aria-pressed={on}
                onClick={() => onChange({ highlights: on ? form.highlights.filter((x) => x !== h) : [...form.highlights, h] })}
                className={`chip cursor-pointer px-3 py-1.5 ${on ? "bg-accent-500 text-white" : "bg-black/5 text-ink-600"} disabled:opacity-60`}>
                {h}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-ink-600">Sản phẩm — bé làm được gì trong buổi</span>
        <input className="input mt-1 text-sm" maxLength={1000} disabled={!editable} value={form.productNote} placeholder="Xe robot dò line chạy trọn sa bàn…"
          onChange={(e) => onChange({ productNote: e.target.value })} onBlur={onBlur} />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-ink-600">Nhận xét cho phụ huynh</span>
        <textarea className="input mt-1 min-h-16 text-sm" maxLength={1000} disabled={!editable} value={form.remark} placeholder="Hôm nay con tự sửa được lỗi chương trình…"
          onChange={(e) => onChange({ remark: e.target.value })} onBlur={onBlur} />
      </label>

      {media.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-ink-600">Ảnh đã duyệt có bé (phụ huynh đồng ý đăng ảnh)</div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {media.map((m) => {
              const on = form.mediaIds.includes(m.id);
              return (
                <button key={m.id} type="button" disabled={!editable} aria-pressed={on}
                  onClick={() => onChange({ mediaIds: on ? form.mediaIds.filter((x) => x !== m.id) : [...form.mediaIds, m.id] })}
                  className={`overflow-hidden rounded-lg border-2 ${on ? "border-primary" : "border-transparent opacity-70"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.caption ?? "Ảnh buổi học"} className="h-16 w-full object-cover" loading="lazy" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** Phiếu đã phát hành: xem tóm tắt + "Sửa phiếu" bắt buộc lý do (tăng số lần sửa, ghi nhật ký) */
function AmendBlock({ item, board, canAmend, onDone }: { item: Item; board: Board; canAmend: boolean; onDone: () => void }) {
  const trpc = useTRPC();
  const ev = item.evaluation!;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(() => formOf(item));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const amend = useMutation(trpc.academics.evaluations.amend.mutationOptions({
    onSuccess: () => { setEditing(false); setReason(""); setErr(null); onDone(); },
    onError: (e) => setErr(e.message),
  }));
  const labels = ev.criteria ?? board.criteria.map((c) => ({ key: c.key, label: c.label }));
  if (!editing) {
    return (
      <div className="space-y-1 text-sm">
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {labels.map((c) => <li key={c.key} className="flex justify-between gap-2"><span>{c.label}</span><b className="text-primary">{ev.scores[c.key] ?? "—"}/4</b></li>)}
        </ul>
        {ev.objectiveResult && <div className="text-xs">{OBJECTIVE_RESULT_VI[ev.objectiveResult]}</div>}
        {ev.remark && <p className="text-xs text-ink-600">“{ev.remark}”</p>}
        {canAmend && <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(true)}>Sửa phiếu (cần lý do)</button>}
      </div>
    );
  }
  // Sửa theo bản chụp đã phát hành: dùng tiêu chí trong phiếu, không lấy tiêu chí mới của khoá
  const snapBoard: Board = { ...board, criteria: board.criteria.filter((c) => labels.some((l) => l.key === c.key)) };
  return (
    <div className="space-y-2">
      <EvaluationForm board={snapBoard} form={form} editable media={[]} onChange={(p) => setForm((f) => ({ ...f, ...p }))} onBlur={() => undefined} />
      <input className="input text-sm" placeholder="Lý do sửa phiếu đã gửi phụ huynh * (tối thiểu 5 ký tự)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <p className="text-xs text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={amend.isPending || reason.trim().length < 5}
          onClick={() => amend.mutate({
            id: ev.id, reason: reason.trim(), scores: form.scores, objectiveResult: form.objectiveResult ?? undefined,
            highlights: form.highlights, productNote: form.productNote.trim() || null, remark: form.remark.trim() || null,
          })}>
          {amend.isPending ? "Đang lưu…" : "Lưu bản sửa"}
        </button>
        <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setEditing(false)}>Huỷ</button>
      </div>
    </div>
  );
}

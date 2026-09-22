"use client";

/**
 * KHỐI "BUỔI NÀY CẦN HOÀN THIỆN" — đầu màn buổi học (app GV /teacher/sessions/[id], cũng là màn nhân sự mở từ /sessions).
 * Gọn, thu gọn / mở được (nhớ trạng thái trên máy, localStorage bọc try/catch):
 *  - Bài học: số thứ tự, tên bài, mục tiêu bài, học cụ; hạn hoàn thiện phiếu theo chuẩn của cơ sở.
 *  - Tiêu chí đánh giá của buổi (trọng tâm trước) kèm MÔ TẢ 4 MỨC — bảng rubric nhỏ để chấm nhất quán.
 *  - Danh mục việc cần xong (tự tính, cập nhật ngay khi GV chấm): x/y và tên học viên còn thiếu — bấm để cuộn tới.
 * Chỉ hiển thị / điều hướng: điều kiện phát hành + chặn hoàn tất nằm ở máy chủ (sessionEvaluations.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, CircleCheck, CircleDashed, Clock, Star, Target, Wrench } from "lucide-react";
import { sessionTodoList, deadlineLabel, fmtDeadlineVi, RUBRIC_LEVELS, type ObjectiveResult, type TodoItem } from "@satarobo/core";
import type { RouterOutputs } from "@/lib/trpc/types";

type Board = RouterOutputs["academics"]["evaluations"]["board"];

/** Nội dung phiếu đang hiển thị (kể cả chưa lưu) — do khối phiếu nhận xét báo lên */
export interface LiveSheet {
  scores: Record<string, number | null>;
  objectiveResult: ObjectiveResult | null;
  productNote: string;
  remark: string;
  mediaIds: string[];
}

const STORE_KEY = "sr-buoi-can-hoan-thien";
function readOpen(): boolean {
  try { return localStorage.getItem(STORE_KEY) !== "0"; } catch { return true; }
}
function writeOpen(v: boolean) {
  try { localStorage.setItem(STORE_KEY, v ? "1" : "0"); } catch { /* trình duyệt chặn lưu trữ — chỉ không nhớ trạng thái */ }
}

export function SessionTodo({
  board, sheets, roster, hasSessionNote, onJump,
}: {
  board: Board;
  /** Phiếu đang hiển thị theo ghi danh */
  sheets: Record<string, LiveSheet>;
  /** Sĩ số: trạng thái điểm danh đang hiển thị + đã lưu hay chưa */
  roster: { enrollmentId: string; name: string; status: string | null; saved: boolean }[];
  hasSessionNote: boolean;
  onJump: (target: TodoItem["target"], enrollmentId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showRubric, setShowRubric] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setOpen(readOpen()); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const toggle = () => setOpen((o) => { writeOpen(!o); return !o; });

  const items = useMemo(() => {
    const byEnr = new Map(board.items.map((it) => [it.enrollmentId, it]));
    return sessionTodoList({
      students: roster.map((r) => {
        const it = byEnr.get(r.enrollmentId);
        const f = sheets[r.enrollmentId];
        const ev = it?.evaluation ?? null;
        return {
          id: r.enrollmentId,
          name: r.name,
          attendance: r.status,
          attendanceSaved: r.saved,
          published: ev?.status === "published",
          scores: f?.scores ?? ev?.scores ?? {},
          objectiveResult: f?.objectiveResult ?? ev?.objectiveResult ?? null,
          remark: f?.remark ?? ev?.remark ?? it?.remark ?? "",
          productNote: f?.productNote ?? ev?.productNote ?? "",
          mediaCount: (f?.mediaIds ?? ev?.mediaIds ?? []).length,
        };
      }),
      criteriaKeys: board.criteria.map((c) => c.key),
      hasSessionNote,
      standard: board.standard,
    });
  }, [board, sheets, roster, hasSessionNote]);

  const pending = items.filter((i) => !i.ok);
  const deadline = new Date(board.deadline);
  const late = now > deadline.getTime();
  const allDone = pending.length === 0;

  return (
    <section id="can-hoan-thien" className="card scroll-mt-20 p-4" aria-label="Buổi này cần hoàn thiện">
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={toggle} aria-expanded={open}>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 font-bold">
            Buổi này cần hoàn thiện
            {allDone
              ? <span className="chip bg-green-100 text-green-800">Đã đủ</span>
              : <span className="chip bg-amber-100 text-amber-800">Còn {pending.length} mục</span>}
          </span>
          <span className={`mt-0.5 flex items-center gap-1 text-xs ${late && !allDone ? "text-red-700" : "text-ink-600"}`}>
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Hạn hoàn thiện phiếu: {fmtDeadlineVi(deadline)} ({deadlineLabel(deadline, new Date(now))})
          </span>
        </span>
        {open ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Bài học */}
          <div className="rounded-xl bg-brand-50/70 p-3 text-sm">
            <div className="flex items-start gap-1.5 font-semibold">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{board.lesson.sequenceNo ? `Bài ${board.lesson.sequenceNo}: ` : ""}{board.lesson.title ?? "Chưa gắn bài học"}</span>
            </div>
            {board.lesson.objectives
              ? <p className="mt-1 flex gap-1.5 whitespace-pre-wrap text-xs text-ink-600"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" aria-hidden /><span><b>Mục tiêu bài:</b> {board.lesson.objectives}</span></p>
              : <p className="mt-1 text-xs text-ink-400">Bài chưa khai mục tiêu — Đào tạo cập nhật ở Giáo trình → Tiêu chí đánh giá.</p>}
            {board.lesson.materials && <p className="mt-1 flex gap-1.5 text-xs text-ink-600"><Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><b>Học cụ:</b> {board.lesson.materials}</span></p>}
          </div>

          {/* Danh mục việc cần xong */}
          <ul className="space-y-1.5" aria-label="Danh mục việc cần xong">
            {items.map((it) => (
              <li key={it.key} className="text-sm">
                <div className="flex items-start gap-2">
                  {it.ok
                    ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden />
                    : <CircleDashed className={`mt-0.5 h-4 w-4 shrink-0 ${it.required ? "text-amber-600" : "text-ink-400"}`} aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className={`text-left ${it.ok ? "text-green-800" : "text-ink-900 hover:text-brand-600"}`}
                      onClick={() => onJump(it.target, it.missing[0]?.id ?? null)}
                    >
                      {it.label}
                      {it.key !== "note" && <span className="ml-1 tabular-nums text-xs font-semibold">{it.done}/{it.total}</span>}
                      {!it.required && <span className="ml-1 text-[11px] text-ink-400">(tính vào tỷ lệ đạt chuẩn)</span>}
                      {it.hint && <span className="ml-1 text-[11px] text-ink-400">· {it.hint}</span>}
                    </button>
                    {!it.ok && it.missing.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {it.missing.slice(0, 12).map((m) => (
                          <button key={m.id} type="button" onClick={() => onJump(it.target, m.id)} className="chip cursor-pointer bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100">
                            {m.name}
                          </button>
                        ))}
                        {it.missing.length > 12 && <span className="text-[11px] text-ink-400">và {it.missing.length - 12} học viên khác</span>}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Tiêu chí đánh giá + mô tả 4 mức */}
          <div className="border-t border-black/5 pt-2">
            <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setShowRubric((v) => !v)} aria-expanded={showRubric}>
              <span>Tiêu chí đánh giá của buổi ({board.criteria.length}){board.criteria.some((c) => c.focus) && <span className="ml-1 text-xs font-normal text-ink-600">· trọng tâm của bài xếp trước</span>}</span>
              {showRubric ? <ChevronUp className="h-4 w-4 text-ink-400" aria-hidden /> : <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden />}
            </button>
            {!showRubric && (
              <div className="mt-1 flex flex-wrap gap-1">
                {board.criteria.map((c) => (
                  <span key={c.key} className={`chip ${c.focus ? "bg-accent-500 text-white" : "bg-black/5 text-ink-600"}`}>
                    {c.focus && <Star className="mr-0.5 inline h-3 w-3" aria-hidden />}{c.label}
                  </span>
                ))}
              </div>
            )}
            {showRubric && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="text-left text-ink-400">
                      <th className="w-40 p-1.5">Tiêu chí</th>
                      {RUBRIC_LEVELS.map((l) => <th key={l.value} className="p-1.5">{l.value}. {l.label}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 align-top">
                    {board.criteria.map((c) => (
                      <tr key={c.key} className={c.focus ? "bg-accent-500/5" : ""}>
                        <td className="p-1.5">
                          <div className="font-semibold">{c.focus && <Star className="mr-0.5 inline h-3 w-3 text-accent-500" aria-label="Trọng tâm" />}{c.label}</div>
                          {c.group && <div className="text-[11px] text-ink-400">{c.group}</div>}
                          {c.description && <div className="text-[11px] text-ink-600">{c.description}</div>}
                        </td>
                        {c.levels.map((l) => <td key={l.value} className="p-1.5 text-ink-600">{l.hint}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11px] text-ink-400">Chuẩn hồ sơ của cơ sở: {board.standardLines.join(" · ")}.</p>
        </div>
      )}
    </section>
  );
}

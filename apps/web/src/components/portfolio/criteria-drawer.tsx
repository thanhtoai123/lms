"use client";

/**
 * DRAWER "TIÊU CHÍ ĐÁNH GIÁ" — gắn vào trang Khoá học và trang Giáo trình (không thêm tab).
 *  - Theo khoá: sửa tiêu chí (tên, nhóm, mô tả, 4 ô MÔ TẢ HÀNH VI cho từng mức), sắp thứ tự, ngưng dùng;
 *    khoá chưa có tiêu chí → "Áp dụng bộ mẫu" robotics / lập trình (8 tiêu chí, mô tả 4 mức viết sẵn).
 *  - Theo bài của giáo trình: mục tiêu bài + chọn TIÊU CHÍ TRỌNG TÂM (tối đa 4; phiếu buổi đánh dấu và xếp lên đầu).
 * Phiếu đã phát hành giữ bản chụp riêng — sửa ở đây chỉ áp cho phiếu mới.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListChecks, Plus, Star } from "lucide-react";
import { RUBRIC_LEVELS, CRITERION_GROUP_SUGGESTIONS, validateCriterion } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { Drawer } from "@/components/drawer";

type BoardData = RouterOutputs["portfolio"]["criteria"]["board"];
type Crit = BoardData["criteria"][number];
type Lesson = BoardData["lessons"][number];

interface Draft { id?: string; name: string; groupName: string; description: string; levels: string[]; isActive: boolean }
const blank = (): Draft => ({ name: "", groupName: "", description: "", levels: ["", "", "", ""], isActive: true });
const draftOf = (c: Crit): Draft => ({
  id: c.id, name: c.name, groupName: c.groupName ?? "", description: c.description ?? "",
  levels: c.levelDescriptors ? [...c.levelDescriptors] : ["", "", "", ""], isActive: c.isActive,
});

export function CriteriaButton({ courseId, courseLabel, curriculumId = null, variant = "link" }: {
  courseId: string;
  courseLabel: string;
  /** Mở sẵn bài học của giáo trình này (trang Giáo trình) */
  curriculumId?: string | null;
  variant?: "link" | "button";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={variant === "button" ? "btn-ghost" : "text-xs font-semibold text-brand-600"}>
        {variant === "button" && <ListChecks className="h-4 w-4" aria-hidden />} Tiêu chí đánh giá
      </button>
      {open && <CriteriaDrawer courseId={courseId} courseLabel={courseLabel} curriculumId={curriculumId} onClose={() => setOpen(false)} />}
    </>
  );
}

function CriteriaDrawer({ courseId, courseLabel, curriculumId, onClose }: { courseId: string; courseLabel: string; curriculumId: string | null; onClose: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [cur, setCur] = useState<string | null>(curriculumId);
  const q = useQuery(trpc.portfolio.criteria.board.queryOptions({ courseId, curriculumId: cur }));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.portfolio.criteria.board.queryKey() });
  const onError = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const save = useMutation(trpc.portfolio.criteria.save.mutationOptions({ onSuccess: () => { setEdit(null); setMsg({ ok: true, text: "Đã lưu tiêu chí — áp dụng cho phiếu mới." }); refresh(); }, onError }));
  const reorder = useMutation(trpc.portfolio.criteria.reorder.mutationOptions({ onSuccess: () => { setMsg(null); refresh(); }, onError }));
  const apply = useMutation(trpc.portfolio.criteria.applyTemplate.mutationOptions({ onSuccess: (r) => { setMsg({ ok: true, text: `Đã áp dụng bộ mẫu: ${r.created} tiêu chí. Sửa lại cho phù hợp khoá nếu cần.` }); refresh(); }, onError }));
  const d = q.data;

  const move = (i: number, dir: -1 | 1) => {
    if (!d) return;
    const ids = d.criteria.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate({ courseId, ids });
  };
  const errs = edit ? validateCriterion({ name: edit.name, groupName: edit.groupName, description: edit.description, levelDescriptors: edit.levels }) : [];

  return (
    <Drawer open onClose={onClose} width="lg" title={`Tiêu chí đánh giá · ${courseLabel}`}
      desc="Mỗi tiêu chí có mô tả hành vi quan sát được cho 4 mức — giáo viên chấm nhất quán. Sửa ở đây áp cho phiếu mới; phiếu đã phát hành giữ nguyên.">
      {q.isLoading && <p className="text-sm text-ink-400">Đang tải…</p>}
      {q.error && <p className="text-sm text-red-700">{q.error.message}</p>}
      {msg && <p className={`mb-3 rounded-xl p-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      {d && (
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Tiêu chí của khoá ({d.criteria.length})</h3>
              {d.canEdit && !edit && <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setEdit(blank())}><Plus className="inline h-3.5 w-3.5" aria-hidden /> Thêm tiêu chí</button>}
            </div>

            {d.criteria.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/15 p-3 text-sm">
                <p>Khoá chưa có tiêu chí — phiếu buổi đang dùng bộ mặc định 4 tiêu chí (không có mô tả mức riêng).</p>
                <p className="mt-1 text-xs text-ink-600">Bộ mẫu gợi ý robotics / lập trình: {d.template.map((t) => t.name).join(" · ")}.</p>
                {d.canEdit && (
                  <button type="button" className="btn-primary mt-2" disabled={apply.isPending} onClick={() => apply.mutate({ courseId })}>
                    {apply.isPending ? "Đang áp dụng…" : `Áp dụng bộ mẫu (${d.template.length} tiêu chí)`}
                  </button>
                )}
              </div>
            )}

            {edit && !edit.id && <CriterionEditor draft={edit} setDraft={setEdit} errs={errs} pending={save.isPending} onSave={() => save.mutate({ courseId, id: edit.id, name: edit.name, groupName: edit.groupName || null, description: edit.description || null, levelDescriptors: edit.levels, isActive: edit.isActive })} onCancel={() => setEdit(null)} />}

            <ol className="space-y-2">
              {d.criteria.map((c, i) => (
                <li key={c.id} className={`rounded-xl border border-black/10 p-3 ${c.isActive ? "" : "opacity-60"}`}>
                  {edit?.id === c.id ? (
                    <CriterionEditor draft={edit} setDraft={setEdit} errs={errs} pending={save.isPending} onSave={() => save.mutate({ courseId, id: edit.id, name: edit.name, groupName: edit.groupName || null, description: edit.description || null, levelDescriptors: edit.levels, isActive: edit.isActive })} onCancel={() => setEdit(null)} />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{i + 1}. {c.name}{!c.isActive && <span className="chip ml-1 bg-slate-100 text-slate-600">Ngưng dùng</span>}</div>
                          <div className="text-xs text-ink-400">{[c.groupName, c.description].filter(Boolean).join(" · ") || "Chưa có nhóm / mô tả"}</div>
                        </div>
                        {d.canEdit && (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" className="btn-ghost !px-2 !py-1" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label="Lên"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                            <button type="button" className="btn-ghost !px-2 !py-1" disabled={i === d.criteria.length - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label="Xuống"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                            <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(draftOf(c))}>Sửa</button>
                          </div>
                        )}
                      </div>
                      <ol className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                        {c.effectiveLevels.map((h, k) => (
                          <li key={k} className="rounded-lg bg-black/[0.03] p-1.5"><b>{k + 1}. {RUBRIC_LEVELS[k]?.label}:</b> {h}</li>
                        ))}
                      </ol>
                      {!c.levelDescriptors && <p className="mt-1 text-[11px] text-amber-800">Chưa khai mô tả mức riêng — đang dùng mô tả mặc định theo tên tiêu chí.</p>}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2 border-t border-black/5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Bài học: mục tiêu & tiêu chí trọng tâm</h3>
              {d.curricula.length > 1 && (
                <select className="input max-w-xs text-sm" value={d.curriculumId ?? ""} onChange={(e) => setCur(e.target.value || null)} aria-label="Giáo trình">
                  {d.curricula.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              )}
            </div>
            <p className="text-xs text-ink-600">Tiêu chí trọng tâm (tối đa 4) được đánh dấu và xếp lên đầu phiếu buổi của bài đó. Bài không chọn thì phiếu dùng toàn bộ tiêu chí của khoá.</p>
            {d.lessons.length === 0 && <p className="text-sm text-ink-400">Khoá chưa có giáo trình / bài học.</p>}
            <ol className="divide-y divide-black/5">
              {d.lessons.map((l) => <LessonRow key={l.id} lesson={l} criteria={d.criteria.filter((c) => c.isActive)} curriculumId={d.curriculumId} canEdit={d.canEditLessons} onDone={refresh} onError={onError} />)}
            </ol>
          </section>
        </div>
      )}
    </Drawer>
  );
}

function CriterionEditor({ draft, setDraft, errs, pending, onSave, onCancel }: {
  draft: Draft; setDraft: (d: Draft) => void; errs: string[]; pending: boolean; onSave: () => void; onCancel: () => void;
}) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-600">Tên tiêu chí *<input className="input mt-1" maxLength={120} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Nhóm
          <input className="input mt-1" maxLength={60} list="nhom-tieu-chi" value={draft.groupName} onChange={(e) => set({ groupName: e.target.value })} placeholder="Thái độ & kỹ năng mềm" />
          <datalist id="nhom-tieu-chi">{CRITERION_GROUP_SUGGESTIONS.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
      </div>
      <label className="block text-xs text-ink-600">Mô tả ngắn<input className="input mt-1" maxLength={500} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        {RUBRIC_LEVELS.map((lv, i) => (
          <label key={lv.value} className="text-xs text-ink-600">Mức {lv.value} · {lv.label}
            <textarea className="input mt-1 min-h-16 text-sm" maxLength={300} value={draft.levels[i] ?? ""} placeholder="Hành vi quan sát được ở mức này…"
              onChange={(e) => set({ levels: draft.levels.map((v, k) => (k === i ? e.target.value : v)) })} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-ink-400">Mô tả điều bé LÀM ĐƯỢC ở mỗi mức, ngôn từ tích cực. Để trống cả 4 ô thì dùng mô tả mặc định theo tên tiêu chí.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng (bỏ chọn = ngưng, phiếu mới không có tiêu chí này)</label>
      {errs.length > 0 && <ul className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">{errs.map((e) => <li key={e}>• {e}</li>)}</ul>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={pending || errs.length > 0} onClick={onSave}>{pending ? "Đang lưu…" : "Lưu tiêu chí"}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Thôi</button>
      </div>
    </div>
  );
}

function LessonRow({ lesson, criteria, curriculumId, canEdit, onDone, onError }: {
  lesson: Lesson; criteria: Crit[]; curriculumId: string | null; canEdit: boolean; onDone: () => void; onError: (e: { message: string }) => void;
}) {
  const trpc = useTRPC();
  const [focus, setFocus] = useState<string[]>(lesson.focusIds);
  const [obj, setObj] = useState(lesson.objectives ?? "");
  useEffect(() => { setFocus(lesson.focusIds); setObj(lesson.objectives ?? ""); }, [lesson.focusIds, lesson.objectives]);
  const setF = useMutation(trpc.portfolio.criteria.setFocus.mutationOptions({ onSuccess: onDone, onError: (e) => { setFocus(lesson.focusIds); onError(e); } }));
  const saveObj = useMutation(trpc.catalog.upsertLesson.mutationOptions({ onSuccess: onDone, onError }));
  const toggle = (id: string) => {
    const next = focus.includes(id) ? focus.filter((x) => x !== id) : [...focus, id];
    if (next.length > 4) { onError({ message: "Chọn tối đa 4 tiêu chí trọng tâm cho một bài" }); return; }
    setFocus(next);
    setF.mutate({ lessonId: lesson.id, criterionIds: next });
  };
  return (
    <li className="space-y-1.5 py-2">
      <div className="text-sm"><span className="mr-1 font-mono text-xs text-ink-400">#{lesson.sequenceNo}</span><b>{lesson.title}</b>{lesson.isReportCardMilestone && <span className="chip ml-1 bg-violet-100 text-violet-800">Mốc học bạ</span>}</div>
      {canEdit && curriculumId ? (
        <div className="flex items-start gap-2">
          <textarea className="input min-h-12 flex-1 text-xs" placeholder="Mục tiêu bài học (GV thấy ở đầu màn buổi dạy)" value={obj} onChange={(e) => setObj(e.target.value)} />
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" disabled={saveObj.isPending || obj === (lesson.objectives ?? "")}
            onClick={() => saveObj.mutate({ id: lesson.id, curriculumId, title: lesson.title, objectives: obj.trim() || null, materials: lesson.materials, isReportCardMilestone: lesson.isReportCardMilestone })}>
            Lưu
          </button>
        </div>
      ) : (
        lesson.objectives ? <p className="whitespace-pre-wrap text-xs text-ink-600">{lesson.objectives}</p> : <p className="text-xs text-amber-800">Chưa có mục tiêu bài.</p>
      )}
      <div className="flex flex-wrap gap-1" role="group" aria-label={`Tiêu chí trọng tâm bài ${lesson.sequenceNo}`}>
        {criteria.map((c) => {
          const on = focus.includes(c.id);
          return (
            <button key={c.id} type="button" disabled={!canEdit || setF.isPending} aria-pressed={on} onClick={() => toggle(c.id)}
              className={`chip px-2 py-1 ${on ? "bg-accent-500 text-white" : "bg-black/5 text-ink-600"} ${canEdit ? "cursor-pointer" : ""} disabled:opacity-70`}>
              {on && <Star className="mr-0.5 inline h-3 w-3" aria-hidden />}{c.name}
            </button>
          );
        })}
        {criteria.length === 0 && <span className="text-xs text-ink-400">Thêm tiêu chí cho khoá để chọn trọng tâm.</span>}
      </div>
    </li>
  );
}

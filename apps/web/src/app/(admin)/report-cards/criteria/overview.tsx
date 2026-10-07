"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { CriteriaButton } from "@/components/portfolio/criteria-drawer";

type Course = {
  id: string; code: string; name: string; level: string | null; nextCourseId: string | null; milestones: number[];
  activeCount: number; pausedCount: number; groups: string[]; names: string[]; customLevels: number; sheetsPublished: number;
};

/** Một chương trình: tóm tắt bộ tiêu chí + mở hộp cấu hình + chọn khoá học tiếp theo */
export function CourseCriteriaCard({ course: c, allCourses, canEdit, canSetNext }: {
  course: Course; allCourses: { id: string; code: string; name: string }[]; canEdit: boolean; canSetNext: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const next = useMutation(trpc.learning.setNextCourse.mutationOptions({ onSuccess: () => { setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));
  const configured = c.activeCount > 0;
  const needsLevels = configured && c.customLevels < c.activeCount;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{c.name}</div>
          <div className="text-xs text-ink-400">{c.code}{c.level ? ` · ${c.level}` : ""} · mốc học bạ: buổi {c.milestones.join(", ")}</div>
        </div>
        {configured ? <span className="chip whitespace-nowrap bg-green-50 text-green-800">{c.activeCount} tiêu chí</span> : <span className="chip whitespace-nowrap bg-amber-50 text-amber-900">Dùng bộ mặc định</span>}
      </div>

      {configured ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {c.names.map((n) => <span key={n} className="chip bg-black/[0.05] text-ink-600">{n}</span>)}
          </div>
          <p className="text-xs text-ink-600">
            {c.groups.length > 0 ? `${c.groups.length} nhóm: ${c.groups.join(" · ")}. ` : ""}
            {c.customLevels}/{c.activeCount} tiêu chí có mô tả 4 mức riêng{c.pausedCount ? ` · ${c.pausedCount} ngưng dùng` : ""}.
          </p>
          {needsLevels && <p className="text-xs text-amber-900">Tiêu chí chưa có mô tả mức đang dùng mô tả mặc định theo tên — nên viết mô tả riêng để giáo viên chấm nhất quán.</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-600">Chưa cấu hình tiêu chí cho chương trình này — phiếu buổi dùng 4 tiêu chí chung (Lắp ráp & thiết kế, Tư duy lập trình, Giải quyết vấn đề, Hợp tác & trình bày).</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-400">{c.sheetsPublished > 0 ? `${c.sheetsPublished} phiếu buổi đã phát hành` : "Chưa có phiếu buổi"}</span>
        <CriteriaButton variant="button" courseId={c.id} courseLabel={`${c.code} — ${c.name}`} />
      </div>
      {!canEdit && configured && <p className="text-[11px] text-ink-400">Mở để xem mô tả 4 mức của từng tiêu chí.</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 text-sm">
        <span className="whitespace-nowrap text-ink-600">Khoá tiếp theo gợi ý:</span>
        <select className="input !w-auto !py-1 text-sm" disabled={!canSetNext || next.isPending} value={c.nextCourseId ?? ""} onChange={(e) => next.mutate({ courseId: c.id, nextCourseId: e.target.value || null })} aria-label={`Khoá tiếp theo của ${c.code}`}>
          <option value="">— Không —</option>
          {allCourses.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}
        </select>
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </section>
  );
}

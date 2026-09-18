"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { TRIAL_CLASS_STATUS_VI, TRIAL_ENROLLMENT_STATUS_VI } from "@satarobo/core";
import { fmtDate } from "@/components/admin-ui";

/**
 * Khối "Xếp vào lớp trải nghiệm" trên trang chi tiết lead:
 * chọn lớp đang mở cùng cơ sở (hiển thị số chỗ còn lại), xếp từng con vào lớp
 * (có nhánh vượt sĩ số cho người có quyền) và xem lịch sử học thử của từng con.
 */
export function LeadTrialClassesBlock({ leadId, legacyChildName, onChanged }: { leadId: string; legacyChildName: string | null; onChanged: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.trials.classOptionsForLead.queryOptions({ leadId }));
  const [pick, setPick] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enroll = useMutation(trpc.admissions.trials.enrollToClass.mutationOptions({
    onSuccess: () => {
      setError(null);
      setNotice("Đã xếp vào lớp trải nghiệm — em học toàn bộ buổi của lớp, kể cả buổi tạo sau.");
      qc.invalidateQueries({ queryKey: trpc.admissions.trials.classOptionsForLead.queryKey({ leadId }) });
      onChanged();
    },
    onError: (e) => { setNotice(null); setError(e.message); },
  }));

  if (q.isLoading) return <section className="card p-4 text-sm text-ink-400">Đang tải lớp trải nghiệm…</section>;
  if (q.error || !q.data) return null;
  const d = q.data;

  // Mỗi con một dòng; lead chưa tách con thì dùng tên con (cũ) trên lead
  type ChildRow = { key: string; childId: string | null; name: string };
  const rows: ChildRow[] = d.children.length
    ? d.children.map((c) => ({ key: c.id, childId: c.id, name: c.fullName }))
    : [{ key: "legacy", childId: null, name: d.childName ?? legacyChildName ?? "(chưa có tên bé)" }];

  const historyOf = (childId: string | null) => d.history.filter((h) => h.childId === childId);

  const doEnroll = (childId: string | null, key: string) => {
    const classId = pick[key];
    if (!classId) return setError("Chọn lớp trải nghiệm trước");
    const cls = d.classes.find((c) => c.id === classId);
    const over = !!cls && cls.seatsLeft <= 0;
    if (over && !d.perms.overrideCapacity) return setError("Lớp đã đủ sĩ số — thêm nữa cần quyền vượt sĩ số.");
    if (over && !window.confirm("Lớp đã đủ sĩ số. Bạn có quyền vượt sĩ số — vẫn xếp?")) return;
    enroll.mutate({ trialClassId: classId, leadId, childId, override: over || undefined });
  };

  return (
    <section className="card space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Xếp vào lớp trải nghiệm</h2>
        <Link href="/lop-trial" className="text-xs text-brand-600 hover:underline">Quản lý lớp trải nghiệm →</Link>
      </div>
      <p className="text-xs text-ink-600">Lớp trải nghiệm nhiều buổi cùng cơ sở với khách. Xếp một em vào lớp = em đó học toàn bộ buổi của lớp, kể cả buổi tạo sau.</p>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      {notice && !error && <div className="rounded-xl border border-green-200 bg-green-50 p-2 text-xs text-green-800">{notice}</div>}

      {d.classes.length === 0 && (
        <p className="rounded-xl bg-black/[0.03] p-2 text-xs text-ink-600">
          Chưa có lớp trải nghiệm đang mở (cùng cơ sở). Tạo lớp ở mục <Link href="/lop-trial" className="font-semibold text-brand-600 hover:underline">Lớp Trial</Link>.
        </p>
      )}

      <ul className="divide-y divide-black/5">
        {rows.map((r) => {
          const hist = historyOf(r.childId);
          const inOpenClass = hist.find((h) => h.status === "enrolled" && h.classStatus !== "cancelled");
          return (
            <li key={r.key} className="space-y-1 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.name}</span>
                {d.perms.manage && d.classes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input !w-auto !py-1 text-xs"
                      value={pick[r.key] ?? ""}
                      onChange={(e) => { setPick({ ...pick, [r.key]: e.target.value }); setError(null); }}
                    >
                      <option value="">— Chọn lớp trải nghiệm —</option>
                      {d.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.enrolled}/{c.capacity}{c.seatsLeft > 0 ? ` · còn ${c.seatsLeft} chỗ` : " · đã đủ"}{c.sessionCount ? ` · ${c.sessionCount} buổi` : " · chưa xếp buổi"})
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost !px-2 !py-1 text-xs" disabled={enroll.isPending} onClick={() => doEnroll(r.childId, r.key)}>
                      {inOpenClass ? "Sửa lớp" : "Xếp vào lớp"}
                    </button>
                  </div>
                )}
              </div>
              {hist.length === 0 ? (
                <div className="text-[11px] text-ink-400">Chưa học thử lớp trải nghiệm nào.</div>
              ) : (
                <ul className="space-y-0.5 text-[11px] text-ink-600">
                  {hist.map((h) => (
                    <li key={h.enrollmentId}>
                      <Link href={`/lop-trial/${h.trialClassId}`} className="text-brand-600 hover:underline">{h.className}</Link>
                      {" · "}{TRIAL_ENROLLMENT_STATUS_VI[h.status]}
                      {" · "}lớp {TRIAL_CLASS_STATUS_VI[h.classStatus]}
                      {" · "}đã học {h.attended}/{h.sessionCount} buổi{h.absent > 0 ? ` · vắng ${h.absent}` : ""}
                      {" · "}xếp {fmtDate(h.joinedAt)}
                      {h.withdrawReason ? ` · rút: ${h.withdrawReason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

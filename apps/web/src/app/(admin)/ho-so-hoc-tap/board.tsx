"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { BellRing, TriangleAlert } from "lucide-react";
import { COMPLIANCE_WARN_PCT } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Data = RouterOutputs["portfolio"]["standard"]["board"];
type Group = Data["byTeacher"][number];

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Card({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`card p-4 ${warn ? "border-amber-300 bg-amber-50/60" : ""}`}>
      <div className="text-xs text-ink-600">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${warn ? "text-amber-800" : ""}`}>{value}</div>
      <div className="text-xs text-ink-400">{sub}</div>
    </div>
  );
}

export function ComplianceBoard({ data }: { data: Data }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [view, setView] = useState<"teacher" | "class">("teacher");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const remind = useMutation(trpc.portfolio.standard.remind.mutationOptions({
    onSuccess: (r) => {
      const parts = [r.sent.length ? `Đã nhắc ${r.sent.map((x) => `${x.name} (${x.sessions} buổi)`).join(", ")}` : "Chưa gửi được nhắc nào"];
      if (r.skipped.length) parts.push(`bỏ qua: ${r.skipped.join("; ")}`);
      setMsg({ ok: r.sent.length > 0, text: parts.join(" — ") });
      setPicked(new Set());
      router.refresh();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const c = data.cards;
  const rows: Group[] = view === "teacher" ? data.byTeacher : data.byClass;
  const issueBySession = useMemo(() => new Map(data.sessionIssues.map((x) => [x.sessionId, x.message])), [data.sessionIssues]);
  const pickedSessions = useMemo(() => [...new Set(data.violations.filter((v) => picked.has(v.key)).map((v) => v.sessionId))], [data.violations, picked]);
  const allPicked = data.violations.length > 0 && data.violations.every((v) => picked.has(v.key));
  const detailHref = (g: Group) => {
    const p = new URLSearchParams();
    if (data.filter.from) p.set("from", data.filter.from);
    if (data.filter.to) p.set("to", data.filter.to);
    if (data.filter.centerId) p.set("center", data.filter.centerId);
    if (data.filter.courseId) p.set("course", data.filter.courseId);
    if (g.id) p.set(view === "teacher" ? "teacher" : "class", g.id);
    return `/ho-so-hoc-tap?${p.toString()}#vi-pham`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Tỷ lệ phiếu đúng hạn" value={fmtPct(c.onTimeRate)} sub={`${c.onTime}/${c.due} phiếu tới hạn · hạn ${data.standard.sheetDeadlineHours} giờ sau buổi`} warn={c.onTimeRate != null && c.onTimeRate < COMPLIANCE_WARN_PCT} />
        <Card label="Tỷ lệ phiếu đủ chuẩn" value={fmtPct(c.contentRate)} sub={`${c.contentOk}/${c.due} phiếu · ${c.pending} phiếu còn trong hạn`} warn={c.contentRate != null && c.contentRate < COMPLIANCE_WARN_PCT} />
        <Card label="Học bạ mốc quá hạn" value={String(c.milestoneOverdue)} sub={`trên ${c.milestoneDue} học bạ tới hạn · hạn ${data.standard.milestoneDeadlineDays} ngày sau buổi mốc`} warn={c.milestoneOverdue > 0} />
        <Card label="Hồ sơ đạt chuẩn" value={fmtPct(c.profileRate)} sub={`${c.profilesOk}/${c.profiles} học viên có ≥ ${data.standard.profileMinSheetPct}% phiếu đủ chuẩn`} warn={c.profileRate != null && c.profileRate < COMPLIANCE_WARN_PCT} />
      </div>
      <p className="text-xs text-ink-400">
        Khoảng {dm(data.filter.from)}–{dm(data.filter.to)} · {c.sessions} buổi · {c.expected} phiếu kỳ vọng (mỗi học viên có mặt mỗi buổi).
        Phiếu đủ chuẩn = đã phát hành, đủ tiêu chí{data.standard.requireObjectiveResult ? ", có kết quả mục tiêu bài" : ""}{data.standard.remarkMinLength > 0 ? `, nhận xét ≥ ${data.standard.remarkMinLength} ký tự` : ""}{data.standard.requireProductNote ? ", có sản phẩm" : ""}.
        {data.overrides > 0 ? ` ${data.overrides} cơ sở có chuẩn riêng.` : ""}
      </p>

      {msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 p-3">
          <div className="flex gap-1" role="group" aria-label="Xem theo">
            {(["teacher", "class"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`chip cursor-pointer px-3 py-1.5 ${view === k ? "bg-primary text-white" : "bg-black/5 text-ink-600"}`}>
                {k === "teacher" ? `Theo giáo viên (${data.byTeacher.length})` : `Theo lớp (${data.byClass.length})`}
              </button>
            ))}
          </div>
          <span className="text-xs text-ink-400">Sắp xếp: tỷ lệ thấp trước · dưới {COMPLIANCE_WARN_PCT}% tô cảnh báo</span>
        </div>
        {rows.length === 0 ? <p className="p-4 text-sm text-ink-400">Chưa có buổi nào có học viên có mặt trong khoảng lọc.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr>
                  <th className="p-3">{view === "teacher" ? "Giáo viên" : "Lớp"}</th>
                  <th className="p-3 text-right">Buổi dạy</th>
                  <th className="p-3 text-right">Đủ chuẩn / tới hạn</th>
                  <th className="p-3 text-right">Trễ hạn</th>
                  <th className="p-3 text-right">Tỷ lệ</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((g) => (
                  <tr key={g.id ?? "none"} className={g.warn ? "bg-amber-50/70" : ""}>
                    <td className="p-3">
                      <div className="font-medium">{g.warn && <TriangleAlert className="mr-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Dưới ngưỡng" />}{view === "class" && g.code ? <span className="font-mono text-xs">{g.code}</span> : g.name}</div>
                      {view === "class" && <div className="text-xs text-ink-400">{g.name}</div>}
                      {g.missing > 0 && <div className="text-xs text-amber-800">{g.missing} phiếu chưa phát hành</div>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{g.sessions}</td>
                    <td className="p-3 text-right tabular-nums">{g.contentOk}/{g.due}</td>
                    <td className="p-3 text-right tabular-nums">{g.late}</td>
                    <td className={`p-3 text-right font-semibold tabular-nums ${g.warn ? "text-amber-800" : ""}`}>{fmtPct(g.rate)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={detailHref(g)} className="text-xs text-brand-600 hover:underline">Chi tiết</Link>
                        {data.canRemind && g.badSessions.length > 0 && (
                          <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={remind.isPending} onClick={() => remind.mutate({ sessionIds: g.badSessions })}>
                            <BellRing className="h-3.5 w-3.5" aria-hidden /> Nhắc GV
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="vi-pham" className="card scroll-mt-20 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 p-3">
          <h2 className="font-semibold">Vi phạm cụ thể <span className="text-sm font-normal text-ink-400">({data.violations.length}{data.violationsTruncated ? "+" : ""})</span></h2>
          {data.canRemind && (
            <button type="button" className="btn-primary !py-1.5 text-sm" disabled={remind.isPending || pickedSessions.length === 0} onClick={() => remind.mutate({ sessionIds: pickedSessions })}>
              <BellRing className="h-4 w-4" aria-hidden /> {remind.isPending ? "Đang gửi…" : `Nhắc hàng loạt${pickedSessions.length ? ` (${pickedSessions.length} buổi)` : ""}`}
            </button>
          )}
        </div>
        {data.sessionIssues.length > 0 && (
          <p className="border-b border-black/5 bg-amber-50/60 p-3 text-xs text-amber-900">{data.sessionIssues.length} buổi chưa đạt tỷ lệ bằng chứng (ảnh / sản phẩm) — đánh dấu ở cột Vi phạm.</p>
        )}
        {data.violations.length === 0 ? <p className="p-4 text-sm text-ink-400">Không có vi phạm trong khoảng lọc — mọi phiếu tới hạn đều đủ chuẩn và đúng hạn.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr>
                  {data.canRemind && (
                    <th className="p-3"><input type="checkbox" aria-label="Chọn tất cả" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set(data.violations.map((v) => v.key)) : new Set())} /></th>
                  )}
                  <th className="p-3">Buổi</th>
                  <th className="p-3">Học viên</th>
                  <th className="p-3">Vi phạm</th>
                  <th className="p-3">Hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 align-top">
                {data.violations.map((v) => (
                  <tr key={v.key}>
                    {data.canRemind && (
                      <td className="p-3"><input type="checkbox" aria-label={`Chọn ${v.studentName}`} checked={picked.has(v.key)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(v.key); else n.delete(v.key); return n; })} /></td>
                    )}
                    <td className="p-3">
                      <Link href={`/teacher/sessions/${v.sessionId}#can-hoan-thien`} className="font-mono text-xs text-brand-600 hover:underline">{v.classCode}</Link>
                      <div className="text-xs text-ink-600">{v.label} · {dm(v.date)}</div>
                      <div className="text-xs text-ink-400">{v.teacherName ?? "Chưa gán GV"}</div>
                    </td>
                    <td className="p-3"><Link href={`/ho-so-hoc-tap/${v.studentId}`} className="hover:underline">{v.studentName}</Link></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {v.codes.map((code) => <span key={code} className={`chip ${code === "late" || code === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-900"}`}>{data.violationLabels[code]}</span>)}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-600">{v.messages.join(" · ")}</div>
                      {issueBySession.get(v.sessionId) && <div className="mt-0.5 text-xs text-amber-800">Cả buổi: {issueBySession.get(v.sessionId)}</div>}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs tabular-nums">{v.deadlineLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

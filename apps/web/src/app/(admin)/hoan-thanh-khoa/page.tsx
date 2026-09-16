import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { CompleteForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoàn thành khoá" };

export default async function CompletionPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const opts = (await caller.schedule.classOptions()).filter((c) => c.status === "running" || c.status === "finished");
  const classId = sp.class && opts.some((c) => c.id === sp.class) ? sp.class : undefined;
  const [cand, list] = await Promise.all([classId ? caller.learning.completionCandidates({ classId }) : Promise.resolve(null), caller.learning.completions({})]);
  return (
    <div className="space-y-4">
      <PageHeader title="Hoàn thành khoá & chứng chỉ" desc="Xếp loại gợi ý từ điểm học bạ đã duyệt. Hoàn thành → cấp số chứng chỉ, gợi ý khoá tiếp theo, tạo việc tư vấn tái tục." />
      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Hoàn thành khoá hàng loạt theo lớp</h2>
        <form className="flex gap-2">
          <select name="class" defaultValue={classId ?? ""} className="input max-w-lg">
            <option value="">— Chọn lớp —</option>
            {opts.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} — {c.name}</option>)}
          </select>
          <button className="btn-ghost">Chọn</button>
        </form>
        {cand && <CompleteForm items={cand.items.map((i) => ({ enrollmentId: i.enrollmentId, studentId: i.studentId, fullName: i.fullName, code: i.code, consumed: i.consumed, packageSessions: i.packageSessions, avg: i.avg, suggestedGrade: i.suggestedGrade, ok: i.ok && !i.completed, errors: i.completed ? ["Đã có chứng chỉ"] : i.errors, warnings: i.warnings }))} />}
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">Chứng chỉ đã cấp</h2>
        {list.length === 0 ? <Empty>Chưa cấp chứng chỉ nào.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Khoá · lớp</th><th className="p-3">Xếp loại</th><th className="p-3">Khoá tiếp theo</th><th className="p-3">Ngày</th><th className="p-3">Chứng chỉ</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3"><Link href={`/students/${c.studentId}`} className="font-medium text-brand-600">{c.studentName}</Link><div className="font-mono text-[11px] text-ink-400">{c.studentCode}</div></td>
                    <td className="p-3">{c.courseCode}<div className="text-xs text-ink-400">{c.classCode} · {c.centerCode}</div></td>
                    <td className="p-3">{c.grade}{c.averageScore ? <div className="text-xs text-ink-400">TB {c.averageScore}</div> : null}</td>
                    <td className="p-3">{c.nextCourseCode ?? "—"}</td>
                    <td className="p-3 text-xs">{fmtDate(c.issuedAt)}</td>
                    <td className="p-3"><Link href={`/hoan-thanh-khoa/chung-chi/${c.id}`} className="font-mono text-xs text-brand-600 underline">{c.certificateNo}</Link></td>
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

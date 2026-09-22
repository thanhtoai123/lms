import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, ReportCardChip, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { StudentChooser } from "./chooser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bạ" };

export default async function StudentBookPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const book = sp.student && /^[0-9a-f-]{36}$/.test(sp.student) ? await caller.learning.studentReportBook({ studentId: sp.student }) : null;
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Học bạ học viên" desc="Toàn bộ học bạ theo mốc và chứng nhận hoàn thành khoá của một học viên. Học bạ mới tổng hợp từ phiếu nhận xét từng buổi (thang 4 mức); học bạ cũ giữ thang 5." />
      {book && <p className="text-sm"><Link href={`/ho-so-hoc-tap/${book.student.id}`} className="font-semibold text-brand-600">Mở hồ sơ học tập đầy đủ (phiếu từng buổi, biểu đồ tiến bộ, in / chia sẻ) →</Link></p>}
      <StudentChooser current={book ? { id: book.student.id, fullName: book.student.fullName, code: book.student.code, grade: book.student.grade } : null} />
      {!book ? null : (
        <>
          {book.completions.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 font-bold">Chứng nhận</h2>
              <div className="flex flex-wrap gap-2">
                {book.completions.map((c) => (
                  <Link key={c.id} href={`/hoan-thanh-khoa/chung-nhan/${c.id}`} className="rounded-xl border border-brand-600/30 bg-brand-50 px-3 py-2 text-sm">
                    <div className="font-semibold">{c.courseName}</div>
                    <div className="text-xs text-ink-600">{c.grade} · {c.certificateNo} · {fmtDate(c.issuedAt)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {book.cards.length === 0 ? <Empty>Học viên chưa có học bạ nào.</Empty> : book.cards.map((c) => (
            <section key={c.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/report-cards/${c.enrollmentId}/${c.seq}`} className="font-semibold text-brand-600">{c.label}</Link>
                  <div className="text-xs text-ink-400">{c.className} · {c.classCode} · {c.courseCode}{c.authorName ? ` · ${c.authorName}` : ""}{c.publishedAt ? ` · gửi PH ${fmtDate(c.publishedAt)}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">{c.averageScore && <span className="text-sm font-bold text-brand-700">TB {c.averageScore}/{c.rubricScale}</span>}
                  <Link href={`/hoc-ba-moc/${c.id}`} className="text-xs text-brand-600">In</Link><ReportCardChip status={c.status} /></div>
              </div>
              {c.scores.length > 0 && (
                <div className="grid gap-1 sm:grid-cols-2">
                  {c.scores.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-2 py-1 text-sm">
                      <span>{s.name}</span>
                      <span className="flex gap-0.5" title={`${s.score ?? "—"}/${c.rubricScale}`}>{Array.from({ length: c.rubricScale }, (_, i) => i + 1).map((n) => <span key={n} className={`h-2 w-4 rounded-sm ${s.score && n <= s.score ? "bg-brand-600" : "bg-black/10"}`} />)}</span>
                    </div>
                  ))}
                </div>
              )}
              {c.teacherComment && <p className="whitespace-pre-line text-sm">{c.teacherComment}</p>}
              {(c.strengths || c.improvements) && (
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {c.strengths && <div><div className="label">Điểm mạnh</div>{c.strengths}</div>}
                  {c.improvements && <div><div className="label">Cần cải thiện</div>{c.improvements}</div>}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

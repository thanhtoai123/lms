import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, ReportCardChip, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { StudentChooser } from "./student-chooser";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chip "Tra cứu học viên" của trang Học bạ & hồ sơ học tập (trước đây là trang /hoc-ba "Học bạ" —
 * đường cũ chuyển hướng 308 về đây, giữ nguyên ?student=).
 *
 * Giữ phần CÒN GIÁ TRỊ của trang cũ: danh sách học bạ ở MỌI trạng thái (nháp, chờ duyệt, trả lại… — hồ sơ học tập
 * chỉ hiện học bạ đã gửi phụ huynh) kèm lối vào viết / duyệt / in, và chứng nhận. Bỏ phần đã được hồ sơ học tập
 * thay thế: thanh điểm từng tiêu chí + nhận xét (xem đầy đủ, có biểu đồ tiến bộ, trong hồ sơ học tập).
 */
export async function LookupView({ student }: { student?: string }) {
  const { caller } = await getServerCaller();
  const book = student && UUID.test(student) ? await caller.learning.studentReportBook({ studentId: student }) : null;
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="Tra cứu học viên"
        desc="Chọn một học viên để xem mọi học bạ mốc (kể cả đang viết / chờ duyệt), chứng nhận hoàn thành khoá và mở hồ sơ học tập đầy đủ — phiếu từng buổi, biểu đồ tiến bộ, in / lưu PDF, chia sẻ cho phụ huynh."
      />
      <StudentChooser current={book ? { id: book.student.id, fullName: book.student.fullName, code: book.student.code, grade: book.student.grade } : null} />
      {book && (
        <>
          <section className="card flex flex-wrap items-center justify-between gap-3 border-brand-600/30 bg-brand-50 p-4">
            <div>
              <div className="font-semibold">{book.student.fullName}{book.student.code ? <span className="ml-2 font-mono text-xs text-ink-400">{book.student.code}</span> : null}</div>
              <div className="text-xs text-ink-600">{book.cards.length} học bạ mốc · {book.completions.length} chứng nhận</div>
            </div>
            <Link href={`/ho-so-hoc-tap/${book.student.id}`} className="btn-primary">Mở hồ sơ học tập →</Link>
          </section>
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
          {book.cards.length === 0 ? <Empty>Học viên chưa có học bạ nào.</Empty> : (
            <section className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-400">
                  <tr><th className="p-3">Học bạ</th><th className="p-3">Lớp</th><th className="p-3">Người viết</th><th className="p-3 text-right">Điểm TB</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {book.cards.map((c) => (
                    <tr key={c.id}>
                      <td className="p-3"><Link href={`/report-cards/${c.enrollmentId}/${c.seq}`} className="font-semibold text-brand-600">{c.label}</Link>{c.publishedAt ? <div className="text-[11px] text-ink-400">gửi PH {fmtDate(c.publishedAt)}</div> : null}</td>
                      <td className="p-3 text-xs">{c.className}<div className="font-mono text-[10px] text-ink-400">{c.classCode} · {c.courseCode}</div></td>
                      <td className="p-3 text-xs">{c.authorName ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums">{c.averageScore ? `${c.averageScore}/${c.rubricScale}` : "—"}</td>
                      <td className="p-3"><ReportCardChip status={c.status} /></td>
                      <td className="p-3 text-right"><Link href={`/hoc-ba-moc/${c.id}`} className="text-xs text-brand-600">In</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

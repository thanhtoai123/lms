import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { StudentStatusChip, GENDER_VI, RELATION_VI, ParentAccountChip, fmtDate } from "@/components/admin-ui";
import { ATT_LABEL } from "@/components/ui";
import { EnrollmentCard, AddGuardian } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ học viên" };

const EVENT_VI: Record<string, string> = { created: "Ghi danh", activate: "Chuyển chính thức", pause: "Bảo lưu", resume: "Học lại", withdraw: "Nghỉ học", complete: "Hoàn thành", transfer_out: "Chuyển đi", transfer_in: "Chuyển đến", package_change: "Đổi số buổi" };

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const s = await caller.students.get({ id });
  const age = s.dateOfBirth ? Math.floor((Date.now() - new Date(s.dateOfBirth).getTime()) / (365.25 * 86_400_000)) : null;

  return (
    <div className="space-y-4">
      <Link href="/students" className="text-sm text-ink-600">← Học viên</Link>
      <header className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-600/10 text-xl font-bold text-brand-600">{s.fullName.split(/\s+/).slice(-1)[0]?.[0] ?? "?"}</div>
          <div>
            <h1 className="text-xl font-bold">{s.fullName}{s.nickname ? <span className="ml-2 text-sm font-normal text-ink-400">({s.nickname})</span> : null}</h1>
            <div className="text-sm text-ink-600"><span className="font-mono">{s.code}</span> · {s.center?.code ?? "—"} · {s.grade ? `Lớp ${s.grade}` : "chưa rõ lớp"}{s.school ? ` · ${s.school}` : ""}</div>
            <div className="mt-1 text-xs text-ink-400">{fmtDate(s.dateOfBirth)}{age !== null ? ` (${age} tuổi)` : ""}{s.gender ? ` · ${GENDER_VI[s.gender]}` : ""}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StudentStatusChip status={s.status} />
          <div className="flex gap-2">
            <Link href={`/enrollments/new?studentId=${s.id}`} className="btn-primary !py-1.5 text-xs">+ Ghi danh</Link>
            <Link href={`/chuyen-lop?studentId=${s.id}`} className="btn-ghost !py-1.5 text-xs">Chuyển lớp</Link>
            <Link href={`/students/${s.id}/edit`} className="btn-ghost !py-1.5 text-xs">Sửa</Link>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="space-y-3">
            <h2 className="font-bold">Đăng ký học ({s.enrollments.length})</h2>
            {s.enrollments.length === 0 && <div className="card p-4 text-sm text-ink-400">Chưa ghi danh lớp nào.</div>}
            {s.enrollments.map((e) => (
              <EnrollmentCard key={e.id} e={{ ...e, enrolledAt: e.enrolledAt.toISOString(), endedAt: e.endedAt?.toISOString() ?? null, rate: e.summary.rate, pendingMakeup: e.summary.pendingMakeup }} />
            ))}
          </section>

          <section className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-bold">Điểm danh gần đây</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="px-4 py-2">Ngày</th><th className="px-4 py-2">Lớp · buổi</th><th className="px-4 py-2">Trạng thái</th><th className="px-4 py-2">Nhận xét</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {s.recentAttendance.map((a, i) => (
                  <tr key={i}><td className="px-4 py-2 text-xs">{fmtDate(a.date)}</td><td className="px-4 py-2 text-xs">{a.classCode} · {a.seq}</td><td className="px-4 py-2">{ATT_LABEL[a.status]}</td><td className="px-4 py-2 text-xs text-ink-600">{a.remark ?? ""}</td></tr>
                ))}
                {s.recentAttendance.length === 0 && <tr><td colSpan={4} className="px-4 py-3 text-ink-400">Chưa có dữ liệu.</td></tr>}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Phụ huynh</h2>
            {s.guardians.map((g) => (
              <div key={g.parentId} className="rounded-xl border border-black/5 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{g.fullName}</span><span className="text-xs text-ink-400">{RELATION_VI[g.relation] ?? g.relation}{g.isPrimary ? " · chính" : ""}</span></div>
                <div className="font-mono text-xs">{g.phone}</div>
                {g.email && <div className="text-xs text-ink-600">{g.email}</div>}
                <div className="mt-1 flex flex-wrap gap-1"><ParentAccountChip status={g.accountStatus} />{g.mediaConsent ? <span className="chip bg-green-50 text-green-700">Đồng ý đăng ảnh</span> : <span className="chip bg-black/5 text-ink-600">Không đăng ảnh</span>}</div>
              </div>
            ))}
            <AddGuardian studentId={s.id} />
          </section>

          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-bold">Sức khoẻ & ghi chú</h2>
            <div><div className="label">Sức khoẻ, dị ứng</div><p className="whitespace-pre-line">{s.healthNotes || "—"}</p></div>
            <div><div className="label">Sở thích</div><p>{s.interests || "—"}</p></div>
            <div><div className="label">Ghi chú</div><p className="whitespace-pre-line">{s.notes || "—"}</p></div>
          </section>

          {s.care.length > 0 && (
            <section className="card space-y-2 p-4 text-sm">
              <h2 className="font-bold">Chăm sóc</h2>
              {s.care.map((c) => <div key={c.id} className="flex justify-between gap-2"><span>{c.title}</span><span className="text-xs text-ink-400">{c.status}</span></div>)}
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-2 font-bold">Lịch sử ghi danh</h2>
            <ol className="space-y-2 text-sm">
              {s.events.map((ev) => (
                <li key={ev.id} className="border-l-2 border-black/10 pl-3">
                  <div className="text-[11px] text-ink-400">{ev.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>
                  <div><span className="font-medium">{EVENT_VI[ev.type] ?? ev.type}</span>{ev.reason ? <span className="text-ink-600"> — {ev.reason}</span> : null}</div>
                </li>
              ))}
              {s.events.length === 0 && <li className="text-ink-400">—</li>}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

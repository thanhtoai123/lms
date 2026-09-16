import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, TEACHER_GRADE_VI, TEACHER_STATUS_VI, CONTRACT_TYPE_VI, CLASS_STATUS_VI, type Actor, type TeacherGrade, type TeacherStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, fmtDate } from "@/components/admin-ui";
import { WEEKDAY_VI, StatusChip } from "@/components/ui";
import { LOAD_CHIP, TSTATUS_CHIP } from "../chips";
import { TeacherActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ giáo viên" };

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "teacher:read")) return <NoAccess title="Giáo viên" perm="teacher:read" />;
  const t = await caller.catalog.teacher({ id }).catch(() => null);
  if (!t) notFound();
  const [ref, courses, accounts] = t.canEdit
    ? await Promise.all([caller.academics.classes.referenceData(), caller.catalog.courseOptions(), caller.catalog.linkableAccounts({ teacherId: id })])
    : [null, [], []];
  const maxWeek = Math.max(t.maxLoadPerWeek, ...t.weeks.map((w) => w.load), 1);
  return (
    <div className="space-y-4">
      <Link href="/teachers" className="text-sm text-ink-600">← Giáo viên</Link>
      <PageHeader
        title={t.fullName}
        desc={[t.code, t.title, t.center ? `${t.center.code} — ${t.center.name}` : "Hội sở", t.grade ? TEACHER_GRADE_VI[t.grade as TeacherGrade] : null, CONTRACT_TYPE_VI[t.contractType]].filter(Boolean).join(" · ")}
        actions={<span className={`chip ${TSTATUS_CHIP[t.workStatus] ?? "bg-black/5"}`}>{TEACHER_STATUS_VI[t.workStatus as TeacherStatus] ?? t.workStatus}</span>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-4"><div className="text-xs text-ink-400">Lớp đang phụ trách</div><div className="text-2xl font-bold">{t.classes.length}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Tải tuần này</div><div className="text-2xl font-bold">{t.weeks.find((w) => w.current)?.load ?? 0}<span className="text-sm text-ink-400">/{t.maxLoadPerWeek}</span></div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Buổi sắp dạy</div><div className="text-2xl font-bold">{t.upcomingCount}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Chuyên cần lớp (90 ngày)</div><div className="text-2xl font-bold">{t.attendanceRate90}%</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Điểm dự giờ TB</div><div className="text-2xl font-bold">{t.avgScore ?? "—"}{t.avgScore ? " ★" : ""}</div><div className="text-xs text-ink-400">{t.evaluations.length} lượt</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-2 p-4">
          <h2 className="font-semibold">Thông tin</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-400">Email</dt><dd>{t.email ?? "—"}</dd>
            <dt className="text-ink-400">Điện thoại</dt><dd>{t.phone ?? "—"}</dd>
            <dt className="text-ink-400">Ngày vào làm</dt><dd>{fmtDate(t.hiredAt)}</dd>
            <dt className="text-ink-400">Tài khoản</dt><dd>{t.account ? `${t.account.email}${t.account.isActive ? "" : " (đã khoá)"}` : "Chưa gắn"}</dd>
            <dt className="text-ink-400">Khoá được dạy</dt><dd className="flex flex-wrap gap-1">{t.courses.length ? t.courses.map((c) => <span key={c.id} className="chip bg-brand-50 text-brand-700" title={c.name}>{c.code}</span>) : <span className="text-ink-400">chưa khai báo</span>}</dd>
            {t.notes && <><dt className="text-ink-400">Ghi chú</dt><dd className="whitespace-pre-wrap">{t.notes}</dd></>}
          </dl>
        </section>
        <section className="card space-y-2 p-4">
          <h2 className="font-semibold">Tải dạy theo tuần <span className="text-xs font-normal text-ink-400">(định mức {t.maxLoadPerWeek} buổi)</span></h2>
          <div className="flex h-32 items-end gap-1">
            {t.weeks.map((w) => (
              <div key={w.week} className="flex flex-1 flex-col items-center gap-1" title={`Tuần ${fmtDate(w.week)}: ${w.load} buổi`}>
                <span className="text-[10px] tabular-nums text-ink-600">{w.load || ""}</span>
                <div className={`w-full rounded-t ${w.level === "over" ? "bg-red-400" : w.level === "high" ? "bg-amber-400" : "bg-brand-500"} ${w.current ? "ring-2 ring-brand-100" : ""}`} style={{ height: `${Math.round((w.load / maxWeek) * 90)}px` }} />
                <span className={`text-[9px] ${w.current ? "font-bold text-brand-700" : "text-ink-400"}`}>{w.week.slice(8, 10)}/{w.week.slice(5, 7)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-ink-600">
            {t.taughtByMonth.length ? t.taughtByMonth.map((m) => <span key={m.month} className="chip bg-black/5">T{Number(m.month.slice(5))}/{m.month.slice(0, 4)}: {m.n} buổi đã dạy</span>) : <span className="text-ink-400">Chưa có buổi hoàn tất gần đây.</span>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Lớp phụ trách</h2>
          {t.classes.length === 0 ? <p className="text-sm text-ink-400">Chưa phụ trách lớp nào.</p> : (
            <ul className="divide-y divide-black/5 text-sm">
              {t.classes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span><Link href={`/classes/${c.id}`} className="font-medium text-brand-600">{c.code}</Link> <span className="text-ink-600">{c.name}</span></span>
                  <span className="flex gap-1"><span className={`chip ${c.role === "lead" ? "bg-brand-100 text-brand-700" : "bg-black/5"}`}>{c.role === "lead" ? "GV chính" : "Trợ giảng"}</span><span className="chip bg-black/5">{CLASS_STATUS_VI[c.status]}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Lịch dạy tuần này</h2>
          {t.thisWeek.length === 0 ? <p className="text-sm text-ink-400">Không có buổi nào.</p> : (
            <ul className="divide-y divide-black/5 text-sm">
              {t.thisWeek.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span><b>{WEEKDAY_VI[new Date(s.date + "T00:00:00Z").getUTCDay() || 7]}</b> {fmtDate(s.date)} {s.startTime.slice(0, 5)} · <Link href={`/teacher/sessions/${s.id}`} className="hover:underline">{s.classCode} · {s.label}</Link></span>
                  <StatusChip status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TeacherActions
        teacher={{ id: t.id, workStatus: t.workStatus, canEdit: t.canEdit, canEvaluate: t.canEvaluate, today: t.today }}
        evaluations={t.evaluations.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
        form={t.canEdit && ref ? {
          initial: {
            id: t.id, fullName: t.fullName, email: t.email ?? "", phone: t.phone ?? "", title: t.title ?? "", centerId: t.centerId ?? "", grade: t.grade ?? "",
            contractType: t.contractType, maxLoadPerWeek: t.maxLoadPerWeek, hiredAt: t.hiredAt ?? "", notes: t.notes ?? "", userId: t.account?.id ?? "", courseIds: t.courses.map((c) => c.id),
          },
          centers: ref.centers, courses, accounts: [...(t.account ? [{ id: t.account.id, email: t.account.email, fullName: t.fullName }] : []), ...accounts],
        } : null}
      />
    </div>
  );
}

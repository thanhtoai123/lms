import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { StudentStatusChip, GENDER_VI, RELATION_VI, ParentAccountChip, fmtDate } from "@/components/admin-ui";
import { ATT_LABEL } from "@/components/ui";
import { BLOOD_TYPE_VI, type BloodType } from "@satarobo/core";
import { EnrollmentCard, AddGuardian, StudentLifecycle, RevealPrivate } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ học viên" };

const EVENT_VI: Record<string, string> = { created: "Ghi danh", activate: "Chuyển chính thức", pause: "Bảo lưu", resume: "Học lại", withdraw: "Nghỉ học", complete: "Hoàn thành", transfer_out: "Chuyển đi", transfer_in: "Chuyển đến", package_change: "Đổi số buổi" };

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  const s = await caller.students.get({ id });
  const actor = ctx.actor as Actor | null;
  const coins = actor && hasPermission(actor, "coin:read") ? await caller.coin.student({ id }).catch(() => null) : null;
  const kitMoves = actor && hasPermission(actor, "inventory:read") ? await caller.inventory.movements({ studentId: id }).catch(() => null) : null;
  const homework = actor && hasPermission(actor, "assignment:read") ? await caller.content.studentHomework({ studentId: id }).catch(() => null) : null;
  const rents = actor && hasPermission(actor, "inventory:read") ? await caller.inventory.rentals({ studentId: id, status: "out" }).catch(() => []) : [];
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
            <div className="mt-1 text-xs text-ink-400">
              {fmtDate(s.dateOfBirth)}{age !== null ? ` (${age} tuổi)` : ""}{s.gender ? ` · ${GENDER_VI[s.gender]}` : ""}
              {s.phone ? ` · SĐT ${s.phone}` : ""}{s.email ? ` · ${s.email}` : ""}
            </div>
            <div className="mt-1 text-xs text-ink-400">
              Đăng ký lần đầu: {fmtDate(s.firstEnrolledOn)}{s.preferredCenter ? ` · Đơn vị mong muốn: ${s.preferredCenter.code}` : ""}
            </div>
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
          <StudentLifecycle
            studentId={s.id}
            name={s.fullName}
            actions={s.lifecycle.actions}
            maxPauseMonths={s.lifecycle.maxPauseMonths}
            openPause={s.lifecycle.openPause ? { id: s.lifecycle.openPause.id, fromDate: s.lifecycle.openPause.fromDate, expectedReturn: s.lifecycle.openPause.expectedReturn, reason: s.lifecycle.openPause.reason } : null}
            activeEnrollments={s.enrollments.filter((e) => e.status === "active").map((e) => ({ id: e.id, label: `${e.className} (${e.classCode})` }))}
          />

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
                {g.nationalIdMasked && <div className="text-xs text-ink-600">CCCD: <span className="font-mono">{g.nationalIdMasked}</span></div>}
                <div className="mt-1 flex flex-wrap gap-1"><ParentAccountChip status={g.accountStatus} />{g.mediaConsent ? <span className="chip bg-green-50 text-green-700">Đồng ý đăng ảnh</span> : <span className="chip bg-black/5 text-ink-600">Không đăng ảnh</span>}</div>
              </div>
            ))}
            {s.canUpdate && s.guardians.some((g) => g.hasNationalId) && <RevealPrivate studentId={s.id} />}
            <AddGuardian studentId={s.id} />
          </section>

          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-bold">Sức khoẻ & ghi chú</h2>
            <div><div className="label">Nhóm máu</div><p>{s.bloodType ? BLOOD_TYPE_VI[s.bloodType as BloodType] : "—"}</p></div>
            <div><div className="label">Dị ứng</div><p>{s.allergies?.length ? s.allergies.join(" · ") : "—"}</p></div>
            <div><div className="label">Lưu ý sức khoẻ</div><p className="whitespace-pre-line">{s.healthNotes || "—"}</p></div>
            <div><div className="label">Sở thích</div><p>{s.interests || "—"}</p></div>
            <div><div className="label">Ghi chú</div><p className="whitespace-pre-line">{s.notes || "—"}</p></div>
            {s.canUpdate && (
              <div><div className="label">Địa chỉ</div><p>{s.address && [s.address.address, s.address.ward, s.address.district, s.address.city].filter(Boolean).length ? [s.address.address, s.address.ward, s.address.district, s.address.city].filter(Boolean).join(", ") : "—"}</p></div>
            )}
          </section>

          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-bold">Lịch sử bảo lưu</h2>
            {s.pauses.length === 0 ? (
              <p className="text-ink-400">Chưa có lần bảo lưu nào.</p>
            ) : (
              <ol className="space-y-2">
                {s.pauses.map((p) => (
                  <li key={p.id} className={`border-l-2 pl-3 ${p.endedAt ? "border-black/10" : "border-amber-400"}`}>
                    <div>
                      Từ <b>{fmtDate(p.fromDate)}</b> → {p.expectedReturn ? <>dự kiến trở lại <b>{fmtDate(p.expectedReturn)}</b></> : "chưa hẹn ngày"}
                      {p.endedAt ? <span className="text-ink-600"> · kết thúc {fmtDate(p.endedAt)}{p.endKind === "withdraw" ? " (nghỉ học)" : ""}</span> : <span className="chip ml-1 bg-amber-100 text-amber-800">đang bảo lưu</span>}
                    </div>
                    <div className="text-xs text-ink-600">{p.classCodes.length ? `${p.classCodes.join(", ")} · ` : ""}{p.reason}{p.endNote ? ` — ${p.endNote}` : ""}</div>
                    <div className="text-[11px] text-ink-400">{p.createdByName ?? "hệ thống"} · {p.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {coins && (
            <section className="card space-y-1 p-4 text-sm">
              <div className="flex items-center justify-between"><h2 className="font-bold">SataCoin</h2><Link href={`/satacoin?student=${id}`} className="text-xs text-brand-600">Chi tiết →</Link></div>
              <p><span className="text-2xl font-bold text-amber-600">{coins.balance}</span> xu · hạng {coins.tier.label}</p>
              <p className="text-xs text-ink-400">Tích luỹ {coins.earned}{coins.held ? ` · đang giữ ${coins.held} cho đổi quà` : ""}</p>
            </section>
          )}

          {homework && homework.items.length > 0 && (
            <section className="card space-y-1 p-4 text-sm">
              <h2 className="font-bold">Bài tập về nhà</h2>
              <p className="text-xs text-ink-600">Đã nộp {homework.stats.turnedIn}/{homework.stats.total} ({homework.stats.rate}%){homework.stats.avg !== null ? ` · điểm TB ${homework.stats.avg}/10` : ""}{homework.stats.missing ? ` · ${homework.stats.missing} bài không nộp` : ""}</p>
              {homework.items.slice(0, 6).map((h) => <div key={h.assignmentId} className="flex justify-between gap-2"><Link href={`/assignments/${h.assignmentId}`} className="truncate hover:underline">{h.title}</Link><span className="shrink-0 text-xs text-ink-600">{h.status === "graded" ? `${h.score}/${h.maxScore}` : h.statusLabel}</span></div>)}
            </section>
          )}

          {kitMoves && (kitMoves.items.length > 0 || rents.length > 0) && (
            <section className="card space-y-1 p-4 text-sm">
              <h2 className="font-bold">Học cụ & đồ thuê</h2>
              {rents.map((r) => <div key={r.id} className={r.overdueDays ? "text-red-700" : ""}>Đang thuê {r.itemName} × {r.qty} — hạn {r.dueDate.split("-").reverse().join("/")}{r.overdueDays ? ` (quá ${r.overdueDays} ngày)` : ""}</div>)}
              {kitMoves.items.slice(0, 8).map((m) => <div key={m.id} className="flex justify-between gap-2"><span>{m.typeLabel}: {m.itemName}</span><span className={`tabular-nums ${m.qty < 0 ? "text-ink-600" : "text-green-700"}`}>{-m.qty > 0 ? `nhận ${-m.qty}` : `trả ${m.qty}`}</span></div>)}
            </section>
          )}

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

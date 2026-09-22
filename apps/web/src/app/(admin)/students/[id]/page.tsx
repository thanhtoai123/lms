import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { StudentStatusChip, GENDER_VI, RELATION_VI, ParentAccountChip, fmtDate } from "@/components/admin-ui";
import { ATT_LABEL } from "@/components/ui";
import { BLOOD_TYPE_VI, type BloodType } from "@satarobo/core";
import { EnrollmentCard, AddGuardian, StudentLifecycle, RevealPrivate } from "./actions";
import { ProfileDrawer, type ProfileExtras } from "./profile-drawer";
import { PortfolioBlock } from "@/components/portfolio/portfolio-block";

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
  const dt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const addr = s.address ? [s.address.address, s.address.ward, s.address.district, s.address.city].filter(Boolean).join(", ") : "";

  // Phần tra cứu của hồ sơ — dựng sẵn chuỗi ở server rồi đưa vào panel trượt phải
  const extras: ProfileExtras = {
    health: [
      { label: "Nhóm máu", value: s.bloodType ? BLOOD_TYPE_VI[s.bloodType as BloodType] : "—" },
      { label: "Dị ứng", value: s.allergies?.length ? s.allergies.join(" · ") : "—" },
      { label: "Lưu ý sức khoẻ", value: s.healthNotes || "—" },
      { label: "Sở thích", value: s.interests || "—" },
      { label: "Ghi chú", value: s.notes || "—" },
      ...(s.canUpdate ? [{ label: "Địa chỉ", value: addr || "—" }] : []),
    ],
    pauses: s.pauses.map((p) => ({
      id: p.id,
      line: `Từ ${fmtDate(p.fromDate)} → ${p.expectedReturn ? `dự kiến trở lại ${fmtDate(p.expectedReturn)}` : "chưa hẹn ngày"}${p.endedAt ? ` · kết thúc ${fmtDate(p.endedAt)}${p.endKind === "withdraw" ? " (nghỉ học)" : ""}` : ""}`,
      sub: `${p.classCodes.length ? `${p.classCodes.join(", ")} · ` : ""}${p.reason}${p.endNote ? ` — ${p.endNote}` : ""}`,
      meta: `${p.createdByName ?? "hệ thống"} · ${dt(p.createdAt)}`,
      open: !p.endedAt,
    })),
    coin: coins
      ? { balance: coins.balance, tierLabel: coins.tier.label, note: `Tích luỹ ${coins.earned}${coins.held ? ` · đang giữ ${coins.held} cho đổi quà` : ""}`, href: `/satacoin?student=${id}` }
      : null,
    homework: homework && homework.items.length > 0
      ? {
        summary: `Đã nộp ${homework.stats.turnedIn}/${homework.stats.total} (${homework.stats.rate}%)${homework.stats.avg !== null ? ` · điểm TB ${homework.stats.avg}/10` : ""}${homework.stats.missing ? ` · ${homework.stats.missing} bài không nộp` : ""}`,
        items: homework.items.slice(0, 8).map((h) => ({ id: h.assignmentId, title: h.title, right: h.status === "graded" ? `${h.score}/${h.maxScore}` : h.statusLabel, href: `/assignments/${h.assignmentId}` })),
      }
      : null,
    kits: kitMoves && (kitMoves.items.length > 0 || rents.length > 0)
      ? [
        ...rents.map((r) => ({ overdue: r.overdueDays > 0, text: `Đang thuê ${r.itemName} × ${r.qty} — hạn ${r.dueDate.split("-").reverse().join("/")}${r.overdueDays ? ` (quá ${r.overdueDays} ngày)` : ""}` })),
        ...kitMoves.items.slice(0, 8).map((m) => ({ overdue: false, text: `${m.typeLabel}: ${m.itemName} — ${-m.qty > 0 ? `nhận ${-m.qty}` : `trả ${m.qty}`}` })),
      ]
      : null,
    care: s.care.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    events: s.events.map((ev) => ({ id: ev.id, when: dt(ev.createdAt), title: EVENT_VI[ev.type] ?? ev.type, reason: ev.reason })),
  };

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
          <div className="flex flex-wrap justify-end gap-2">
            <Link href={`/enrollments/new?studentId=${s.id}`} className="btn-primary !py-1.5 text-xs">+ Ghi danh</Link>
            <Link href={`/chuyen-lop?studentId=${s.id}`} className="btn-ghost !py-1.5 text-xs">Chuyển lớp</Link>
            <Link href={`/students/${s.id}/edit`} className="btn-ghost !py-1.5 text-xs">Sửa</Link>
            <ProfileDrawer name={s.fullName} extras={extras} />
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
          {/* Hồ sơ học tập: phiếu nhận xét từng buổi, học bạ mốc, in / chia sẻ (drawer, không thêm tab) */}
          <PortfolioBlock studentId={s.id} studentName={s.fullName} />

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

          <p className="px-1 text-xs text-muted-foreground">
            Sức khoẻ, bảo lưu, xu thưởng, bài tập, học cụ, chăm sóc và lịch sử ghi danh nằm trong
            {" "}<b>Hồ sơ đầy đủ</b> ở đầu trang.
          </p>
        </aside>
      </div>
    </div>
  );
}

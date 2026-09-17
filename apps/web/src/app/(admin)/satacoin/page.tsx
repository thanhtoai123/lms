import Link from "next/link";
import { hasPermission, COIN_REASONS, COIN_REASON_VI, REDEMPTION_STATUSES, REDEMPTION_STATUS_VI, type Actor, type CoinReason, type RedemptionStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { LeaderTable, SessionAward, StudentPanel, RedemptionActions, RewardForm } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "SataCoin" };

type SP = { tab?: string; center?: string; class?: string; q?: string; page?: string; student?: string; reason?: string; rstatus?: string };
const TIER_CHIP: Record<string, string> = { bronze: "bg-orange-100 text-orange-800", silver: "bg-slate-200 text-slate-700", gold: "bg-amber-100 text-amber-800", diamond: "bg-sky-100 text-sky-800" };

export default async function SataCoinPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "coin:read")) return <NoAccess title="SataCoin" perm="coin:read" />;
  const canSeeRedeem = hasPermission(actor, "coin:redeem") || hasPermission(actor, "coin:approve");
  const tab = sp.tab === "log" || sp.tab === "rewards" || (sp.tab === "redeem" && canSeeRedeem) ? sp.tab : "board";
  const page = Math.max(1, Number(sp.page) || 1);
  const lb = await caller.coin.leaderboard({ centerId: sp.center || undefined, classId: sp.class || undefined, q: sp.q || undefined, page: tab === "board" ? page : 1 });
  const student = sp.student ? await caller.coin.student({ id: sp.student }).catch(() => null) : null;
  const rewards = student?.canRedeem || tab === "rewards" ? await caller.coin.rewards({ includeInactive: tab === "rewards" }) : null;
  const link = (patch: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = u.toString();
    return `/satacoin${s ? `?${s}` : ""}`;
  };
  const tabs: [string, string][] = [["board", "Bảng xu"], ["log", "Lịch sử"], ...(canSeeRedeem ? [["redeem", `Đổi quà${lb.kpi.pendingRedemptions ? ` (${lb.kpi.pendingRedemptions})` : ""}`] as [string, string]] : []), ["rewards", "Danh mục quà"]];
  return (
    <div className="space-y-4">
      <PageHeader title="SataCoin" desc={`Sổ xu thưởng chỉ thêm (không sửa / xoá): thưởng theo hạn mức vai trò (GV ≤ ${lb.limits.teacher.perAward} xu/lần, ${lb.limits.teacher.perStudentDay} xu/HV/ngày), thu hồi / điều chỉnh cần lý do, đổi quà qua duyệt.`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Xu đã thưởng 30 ngày" value={lb.kpi.issued30.toLocaleString("vi-VN")} tone="good" hint={lb.teacherOnly ? "do bạn thưởng" : undefined} />
        <Kpi label="Xu đã đổi quà 30 ngày" value={lb.kpi.spent30.toLocaleString("vi-VN")} />
        <Kpi label="Giao dịch 30 ngày" value={lb.kpi.tx30} />
        <Kpi label="Đổi quà đang chờ" value={lb.kpi.pendingRedemptions} tone={lb.kpi.pendingRedemptions ? "warn" : "default"} />
      </div>
      {student && (
        <StudentPanel
          data={{ ...student, history: student.history.map((h) => ({ id: h.id, createdAt: h.createdAt.toISOString(), amount: h.amount, balanceAfter: h.balanceAfter, reasonLabel: h.reasonLabel, note: h.note, byName: h.byName, classCode: h.classCode, revoked: h.revoked, revokeBlock: h.revokeBlock })),
            redemptions: student.redemptions.map((r) => ({ id: r.id, code: r.code, rewardName: r.rewardName, cost: r.cost, statusLabel: r.statusLabel, createdAt: r.createdAt.toISOString() })) }}
          rewards={(rewards?.items ?? []).filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name, cost: r.cost, stock: r.stock }))}
          closeHref={link({ student: undefined })}
          tierClass={TIER_CHIP[student.tier.key] ?? ""}
        />
      )}
      <div className="flex gap-1 border-b border-black/10 text-sm">
        {tabs.map(([k, label]) => <Link key={k} href={link({ tab: k === "board" ? undefined : k })} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600"}`}>{label}</Link>)}
      </div>

      {tab === "board" && (
        <>
          <form className="flex flex-wrap gap-2" action="/satacoin">
            {lb.centers.length > 1 && <select name="center" defaultValue={sp.center ?? ""} className="input"><option value="">Mọi cơ sở</option>{lb.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>}
            <select name="class" defaultValue={sp.class ?? ""} className="input"><option value="">{lb.teacherOnly ? "Chọn lớp để thưởng" : "Mọi lớp"}</option>{lb.classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
            <input name="q" defaultValue={sp.q} placeholder="Tên / mã học viên" className="input w-48" />
            <button className="btn-ghost">Lọc</button>
          </form>
          {sp.class && lb.recentSessions.length > 0 && <SessionAward sessions={lb.recentSessions.map((s) => ({ id: s.id, label: `Buổi ${s.sequenceNo} · ${s.date.split("-").reverse().join("/")}`, awarded: s.awarded }))} />}
          {lb.items.length === 0 ? <Empty>{lb.teacherOnly ? "Chưa có học viên trong các lớp bạn dạy." : "Không có học viên."}</Empty> : (
            <LeaderTable
              classId={sp.class ?? null}
              needClass={lb.teacherOnly && !sp.class}
              rows={lb.items.map((r) => ({ id: r.id, rank: r.rank, fullName: r.fullName, code: r.code, centerCode: r.centerCode, balance: r.balance, available: r.available, held: r.held, earned: r.earned, tier: r.tier.label, tierClass: TIER_CHIP[r.tier.key] ?? "", href: link({ student: r.id }) }))}
            />
          )}
          <Pager basePath="/satacoin" params={sp} page={lb.page} pageSize={lb.pageSize} total={lb.total} />
        </>
      )}

      {tab === "log" && <Ledger sp={sp} caller={caller} link={link} />}
      {tab === "redeem" && <Redemptions sp={sp} caller={caller} />}
      {tab === "rewards" && rewards && (
        <div className="space-y-3">
          {rewards.canEdit && <RewardForm inventoryOptions={rewards.inventoryOptions.map((o) => ({ id: o.id, label: `${o.sku} — ${o.name}` }))} />}
          {rewards.items.length === 0 ? <Empty>Chưa có quà.</Empty> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rewards.items.map((r) => (
                <div key={r.id} className={`card p-4 ${r.isActive ? "" : "opacity-50"}`}>
                  <div className="text-2xl font-bold text-amber-600">{r.cost.toLocaleString("vi-VN")} <span className="text-sm font-normal">xu</span></div>
                  <div className="font-semibold">{r.name}</div>
                  {r.description && <p className="text-xs text-ink-600">{r.description}</p>}
                  <p className="text-xs text-ink-400">{r.sku ? `Kho: ${r.sku} · còn ${r.stock ?? 0}` : "Không trừ kho"}{r.isActive ? "" : " · ngừng áp dụng"}</p>
                  {rewards.canEdit && <RewardForm reward={{ id: r.id, name: r.name, description: r.description, cost: r.cost, inventoryItemId: r.inventoryItemId, isActive: r.isActive, sortOrder: r.sortOrder }} inventoryOptions={rewards.inventoryOptions.map((o) => ({ id: o.id, label: `${o.sku} — ${o.name}` }))} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Caller = Awaited<ReturnType<typeof getServerCaller>>["caller"];

async function Ledger({ sp, caller, link }: { sp: SP; caller: Caller; link: (p: Partial<SP>) => string }) {
  const reason = COIN_REASONS.includes(sp.reason as CoinReason) ? (sp.reason as CoinReason) : undefined;
  const d = await caller.coin.ledger({ centerId: sp.center || undefined, reason, page: Math.max(1, Number(sp.page) || 1) });
  return (
    <div className="space-y-3">
      <form className="flex gap-2" action="/satacoin">
        <input type="hidden" name="tab" value="log" />
        <select name="reason" defaultValue={reason ?? ""} className="input"><option value="">Mọi lý do</option>{COIN_REASONS.map((r) => <option key={r} value={r}>{COIN_REASON_VI[r]}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {d.items.length === 0 ? <Empty>Chưa có giao dịch.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian</th><th className="p-3">Học viên</th><th className="p-3">Lý do</th><th className="p-3 text-right">Xu</th><th className="p-3 text-right">Số dư</th><th className="p-3">Người thực hiện</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((t) => (
                <tr key={t.id}>
                  <td className="p-3 text-xs">{dtVN(t.createdAt)}</td>
                  <td className="p-3"><Link className="hover:underline" href={link({ student: t.studentId, tab: "log" })}>{t.studentName}</Link><div className="font-mono text-xs text-ink-400">{t.studentCode} · {t.centerCode}</div></td>
                  <td className="p-3 text-xs">{t.reasonLabel}{t.classCode && <span className="text-ink-400"> · {t.classCode}</span>}{t.note && <div className="text-ink-400">{t.note}</div>}</td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${t.amount < 0 ? "text-red-700" : "text-green-700"}`}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                  <td className="p-3 text-right tabular-nums">{t.balanceAfter}</td>
                  <td className="p-3 text-xs">{t.byName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/satacoin" params={{ ...sp, tab: "log" }} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}

async function Redemptions({ sp, caller }: { sp: SP; caller: Caller }) {
  const status = REDEMPTION_STATUSES.includes(sp.rstatus as RedemptionStatus) ? (sp.rstatus as RedemptionStatus) : undefined;
  const d = await caller.coin.redemptions({ status, centerId: sp.center || undefined });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/satacoin?tab=redeem" className={`chip ${!status ? "bg-brand-600 text-white" : "bg-black/5"}`}>Đang xử lý ({(d.counts?.requested ?? 0) + (d.counts?.approved ?? 0)})</Link>
        {REDEMPTION_STATUSES.map((s) => <Link key={s} href={`/satacoin?tab=redeem&rstatus=${s}`} className={`chip ${status === s ? "bg-brand-600 text-white" : "bg-black/5"}`}>{REDEMPTION_STATUS_VI[s]}</Link>)}
      </div>
      {d.items.length === 0 ? <Empty>Không có yêu cầu.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Yêu cầu</th><th className="p-3">Học viên</th><th className="p-3">Quà</th><th className="p-3">Trạng thái</th><th className="p-3">Xử lý</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 text-xs"><span className="font-mono">{r.code}</span><div className="text-ink-400">{dtVN(r.createdAt)} · {r.byName ?? "—"}</div>{r.note && <div>{r.note}</div>}</td>
                  <td className="p-3"><Link className="hover:underline" href={`/satacoin?student=${r.studentId}&tab=redeem`}>{r.studentName}</Link><div className="font-mono text-xs text-ink-400">{r.studentCode} · {r.centerCode}</div></td>
                  <td className="p-3">{r.rewardName}<div className="text-xs text-amber-700">{r.cost} xu</div></td>
                  <td className="p-3 text-xs">{r.statusLabel}{r.decisionNote && <div className="text-ink-400">{r.decisionNote}</div>}</td>
                  <td className="p-3"><RedemptionActions id={r.id} canDecide={r.canDecide} canDeliver={r.canDeliver} canCancel={r.canCancel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

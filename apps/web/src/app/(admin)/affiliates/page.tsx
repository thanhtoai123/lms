import Link from "next/link";
import { hasPermission, REWARD_STATUSES, REWARD_STATUS_VI, type Actor, type RewardStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { dtVN } from "@/components/care-ui";
import { AffiliateForm, RewardButtons } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nguồn giới thiệu" };

export default async function AffiliatesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; rstatus?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "affiliate:read")) return <NoAccess title="Nguồn giới thiệu" perm="affiliate:read" />;
  const tab = sp.tab === "rewards" ? "rewards" : "list";
  const d = await caller.affiliate.list({ q: sp.q || undefined });
  const rstatus = REWARD_STATUSES.includes(sp.rstatus as RewardStatus) ? (sp.rstatus as RewardStatus) : undefined;
  const rw = tab === "rewards" ? await caller.affiliate.rewards({ status: rstatus }) : null;
  const leads = d.items.reduce((a, x) => a + x.leads, 0);
  const enrolled = d.items.reduce((a, x) => a + x.enrolled, 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Nguồn giới thiệu" desc="Phụ huynh, trường học, đối tác giới thiệu học viên qua mã riêng (/dang-ky?ref=MÃ). Khi đơn học phí đầu tiên của học viên được giới thiệu thu đủ, hệ thống tạo khoản thưởng chờ duyệt; quản lý duyệt → kế toán chi (người duyệt không tự chi). Đơn huỷ / hoàn tiền tự huỷ thưởng; không thưởng khi tự giới thiệu."
        actions={d.canCreate ? <AffiliateForm centers={d.centers} globalCreate={d.globalCreate} nextSeq={d.nextSeq} /> : null} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Nguồn đang hoạt động" value={d.items.filter((x) => x.isActive).length} />
        <Kpi label="Lead được giới thiệu" value={leads} tone="brand" />
        <Kpi label="Đã đăng ký" value={enrolled} tone="good" hint={leads ? `${Math.round((enrolled / leads) * 100)}%` : undefined} />
        <Kpi label="Thưởng chờ duyệt / chờ chi" value={`${d.rewards.pending} / ${d.rewards.approved}`} tone={d.rewards.pending ? "warn" : "default"} />
        <Kpi label="Tổng phải trả" value={vnd(d.rewards.owed)} />
      </div>
      <div className="flex gap-1 border-b border-black/10 text-sm">
        <Link href="/affiliates" className={`px-3 py-2 ${tab === "list" ? "border-b-2 border-brand-500 font-semibold" : "text-ink-600"}`}>Danh sách</Link>
        <Link href="/affiliates?tab=rewards" className={`px-3 py-2 ${tab === "rewards" ? "border-b-2 border-brand-500 font-semibold" : "text-ink-600"}`}>Thưởng giới thiệu</Link>
      </div>
      {tab === "list" ? (
        <Section title="Nguồn giới thiệu" actions={<div className="flex gap-2"><form><input name="q" defaultValue={sp.q} placeholder="Tên / mã" className="input !py-1.5 w-40" /></form><CsvButton filename="nguon-gioi-thieu" headers={["Mã", "Tên", "Loại", "Cơ sở", "Lead", "Đăng ký", "Tỉ lệ %", "Chờ trả", "Đã trả"]} rows={d.items.map((x) => [x.code, x.name, x.typeLabel, x.centerCode ?? "", x.leads, x.enrolled, x.closeRate, x.owed, x.paid])} /></div>}>
          {d.items.length === 0 ? <div className="p-4"><Empty>Chưa có nguồn giới thiệu.</Empty></div> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Nguồn</th><th className={th}>Loại</th><th className={th}>Thưởng</th><th className={th}>Lead</th><th className={th}>Đăng ký</th><th className={th}>Chờ trả</th><th className={th}>Đã trả</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {d.items.map((x) => (
                  <tr key={x.id} className={x.isActive ? "" : "opacity-60"}>
                    <td className="p-3"><Link href={`/affiliates/${x.id}`} className="font-medium text-brand-600">{x.name}</Link><div className="font-mono text-[11px] text-ink-400">{x.code} · {x.centerCode ?? "toàn hệ thống"}{x.isActive ? "" : " · ngừng"}</div></td>
                    <td className="p-3 text-xs">{x.typeLabel}</td>
                    <td className="p-3 text-xs">{x.rule.kind === "fixed" ? vnd(x.rule.value) : `${x.rule.value}%${x.rule.cap ? ` (tối đa ${vnd(x.rule.cap)})` : ""}`}</td>
                    <td className={td}>{x.leads}</td>
                    <td className={td}>{x.enrolled} <span className="text-xs text-ink-400">({x.closeRate}%)</span></td>
                    <td className={td}>{vnd(x.owed)}</td>
                    <td className={td}>{vnd(x.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      ) : (
        <Section title="Thưởng giới thiệu" actions={<div className="flex flex-wrap gap-1 text-xs"><Link href="/affiliates?tab=rewards" className="chip bg-slate-100">Đang mở</Link>{REWARD_STATUSES.map((s) => <Link key={s} href={`/affiliates?tab=rewards&rstatus=${s}`} className={`chip ${rstatus === s ? "bg-brand-100 text-brand-700" : "bg-slate-100"}`}>{REWARD_STATUS_VI[s]}</Link>)}</div>}>
          {!rw || rw.items.length === 0 ? <div className="p-4"><Empty>Không có khoản thưởng.</Empty></div> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Nguồn</th><th className={th}>Học viên được giới thiệu</th><th className={th}>Đơn</th><th className={th}>Thưởng</th><th className={th}>Trạng thái</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-black/5 align-top">
                {rw.items.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3"><span className="font-medium">{r.affiliate}</span><div className="font-mono text-[11px] text-ink-400">{r.code}</div>{r.payoutInfo && <div className="text-[11px] text-ink-600">{r.payoutInfo}</div>}</td>
                    <td className="p-3 text-xs">{r.lead}<div className="text-ink-400">{dtVN(r.createdAt)}</div></td>
                    <td className="p-3 text-xs">{r.order ?? "—"}<div className="text-ink-400">{vnd(r.base)}</div></td>
                    <td className={`${td} font-semibold`}>{vnd(r.amount)}</td>
                    <td className="p-3 text-xs">{r.statusLabel}{r.paymentRef ? <div className="text-ink-400">CT {r.paymentRef}</div> : null}{r.cancelReason ? <div className="text-ink-400">{r.cancelReason}</div> : null}</td>
                    <td className="p-3"><RewardButtons id={r.id} can={r.can} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
    </div>
  );
}

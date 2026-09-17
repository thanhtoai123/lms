import Link from "next/link";
import { notFound } from "next/navigation";
import type { AffiliateType } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Section, th, td } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { dtVN } from "@/components/care-ui";
import { AffiliateForm, CopyLink } from "../client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nguồn giới thiệu" };

export default async function AffiliateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  const [a, list] = await Promise.all([caller.affiliate.get({ id }), caller.affiliate.list({})]);
  return (
    <div className="space-y-4">
      <PageHeader title={a.name} desc={`${a.code} · ${a.typeLabel} · ${a.centerCode ?? "toàn hệ thống"}${a.isActive ? "" : " · ngừng hoạt động"}`}
        actions={<div className="flex gap-2"><Link href="/affiliates" className="btn-ghost">← Danh sách</Link>{a.canEdit && <AffiliateForm centers={list.centers} globalCreate={list.globalCreate} nextSeq={list.nextSeq} aff={{ id: a.id, name: a.name, code: a.code, type: a.type as AffiliateType, phone: a.phone, email: a.email, centerId: a.centerId, rule: { kind: a.rule.kind, value: a.rule.value, cap: a.rule.cap ?? null }, payoutInfo: a.payoutInfo, notes: a.notes, isActive: a.isActive, staffId: a.staffId }} />}</div>} />
      <div className="card space-y-2 p-4 text-sm">
        <div>Liên kết đăng ký có mã:</div>
        <CopyLink path={a.link} />
        <div className="text-xs text-ink-600">Thưởng: {a.rule.kind === "fixed" ? `${vnd(a.rule.value)} / học viên` : `${a.rule.value}% đơn học phí đầu${a.rule.cap ? `, tối đa ${vnd(a.rule.cap)}` : ""}`} · SĐT {a.phone ?? "—"} · Nhận thưởng: {a.payoutInfo ?? "—"}</div>
        {a.notes && <p className="text-xs">{a.notes}</p>}
      </div>
      <Section title={`Lead được giới thiệu (${a.leads.length})`}>
        {a.leads.length === 0 ? <div className="p-4"><Empty>Chưa có lead.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Phụ huynh</th><th className={th}>Trạng thái</th><th className={th}>Tư vấn</th><th className={th}>Ngày</th></tr></thead>
            <tbody className="divide-y divide-black/5">{a.leads.map((l) => <tr key={l.id}><td className="p-3"><Link href={`/leads/${l.id}`} className="text-brand-600">{l.name}</Link><div className="text-xs text-ink-400">{l.phone}</div></td><td className="p-3 text-xs">{l.statusLabel}</td><td className="p-3 text-xs">{l.owner ?? "—"}</td><td className="p-3 text-xs">{dtVN(l.createdAt)}</td></tr>)}</tbody>
          </table>
        )}
      </Section>
      <Section title="Khoản thưởng">
        {a.rewards.length === 0 ? <div className="p-4"><Empty>Chưa có khoản thưởng.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Học viên</th><th className={th}>Đơn</th><th className={th}>Thưởng</th><th className={th}>Trạng thái</th><th className={th}>Duyệt</th></tr></thead>
            <tbody className="divide-y divide-black/5">{a.rewards.map((r) => <tr key={r.id}><td className="p-3">{r.lead}</td><td className="p-3 text-xs">{r.order ?? "—"} · {vnd(r.base)}</td><td className={td}>{vnd(r.amount)}</td><td className="p-3 text-xs">{r.statusLabel}</td><td className="p-3 text-xs">{r.approver ?? "—"}</td></tr>)}</tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

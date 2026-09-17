import Link from "next/link";
import { authorizeGlobal, hasPermission, DSR_STATUSES, DSR_STATUS_VI, DSR_SLA_DAYS, INCIDENT_NOTIFY_HOURS, type Actor, type DsrStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { CreateRequestForm, LinkSubject, RequestActions, ExportButton, ConsentToggle, EraseForm, RetentionRun, ExtendForm, ReportIncidentForm, IncidentActions } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tuân thủ dữ liệu cá nhân" };

type SP = { id?: string; status?: string; all?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const fmtDT = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }) : "—");

const SLA_CHIP: Record<string, { cls: string; label: string }> = {
  overdue: { cls: "bg-red-100 text-red-700", label: "Quá hạn" },
  due_soon: { cls: "bg-amber-100 text-amber-800", label: "Sắp đến hạn" },
  ok: { cls: "bg-green-100 text-green-800", label: "Trong hạn" },
  done: { cls: "bg-slate-100 text-ink-600", label: "Đã đóng" },
};
const STATUS_CHIP: Record<DsrStatus, string> = {
  received: "bg-blue-100 text-blue-800", verifying: "bg-amber-100 text-amber-800", in_progress: "bg-violet-100 text-violet-800",
  completed: "bg-green-100 text-green-800", rejected: "bg-slate-100 text-ink-600",
};
const EVENT_VI: Record<string, string> = { extend: "Gia hạn", received: "Tiếp nhận", verify: "Xác minh", start: "Bắt đầu xử lý", complete: "Hoàn tất", reject: "Từ chối", link: "Liên kết hồ sơ", export: "Xuất dữ liệu", consent: "Đồng ý", erase: "Ẩn danh hoá" };

export default async function CompliancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || (!hasPermission(actor, "compliance:read") && !hasPermission(actor, "compliance:create"))) return <NoAccess title="Tuân thủ dữ liệu" perm="compliance:read" />;
  if (sp.id && UUID.test(sp.id)) return <RequestDetail id={sp.id} />;
  const globalRead = authorizeGlobal(actor, "compliance:read") || authorizeGlobal(actor, "compliance:update");
  const status = DSR_STATUSES.includes(sp.status as DsrStatus) ? (sp.status as DsrStatus) : undefined;
  const list = await caller.compliance.requests({ status, open: sp.all ? false : undefined });
  const ov = globalRead ? await caller.compliance.overview() : null;
  const inc = await caller.compliance.incidents();
  const c = list.counts;
  const tabs = [{ key: "", label: "Đang mở" }, ...DSR_STATUSES.map((s) => ({ key: s, label: DSR_STATUS_VI[s] }))];
  return (
    <div className="space-y-4">
      <PageHeader title="Tuân thủ dữ liệu cá nhân" desc="Theo Luật Bảo vệ dữ liệu cá nhân 2025 & Nghị định 356/2025: tiếp nhận và xử lý yêu cầu của phụ huynh (xem, sửa, xoá, rút đồng ý…), lịch sử đồng ý, thời hạn lưu giữ, nhật ký truy cập dữ liệu."
        actions={list.canCreate ? <CreateRequestForm centers={list.centers} globalCreate={list.globalCreate} /> : null} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Yêu cầu đang mở" value={c?.open ?? 0} tone={c?.open ? "brand" : "default"} />
        <Kpi label="Quá hạn xử lý" value={c?.overdue ?? 0} tone={c?.overdue ? "bad" : "good"} hint={`Xem/sửa ${DSR_SLA_DAYS.access} ngày · rút đồng ý ${DSR_SLA_DAYS.withdraw_consent} · xoá ${DSR_SLA_DAYS.delete}`} />
        <Kpi label="Đã hoàn tất" value={c?.completed ?? 0} hint={c?.completed ? `${Math.round(((c.onTime ?? 0) / c.completed) * 100)}% đúng hạn` : undefined} />
        {ov ? <Kpi label="Lead quá hạn lưu giữ" value={ov.retention.due} tone={ov.retention.due ? "warn" : "default"} hint={`> ${ov.retention.months} tháng không tương tác`} /> : <Kpi label="Người xử lý" value="Quản trị hệ thống" />}
      </div>
      <Section title="Yêu cầu của chủ thể dữ liệu" desc={list.canProcess ? "Bạn là người xử lý: xác minh danh tính trước khi cung cấp hoặc xoá dữ liệu." : "Bạn có thể ghi nhận và theo dõi; bộ phận bảo vệ dữ liệu (quản trị) xử lý."}
        actions={<div className="flex flex-wrap gap-1 text-xs">{tabs.map((t) => <Link key={t.key} href={t.key ? `/compliance?status=${t.key}` : "/compliance"} className={`rounded-full border px-2.5 py-1 ${(status ?? "") === t.key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-black/10 hover:bg-black/5"}`}>{t.label}</Link>)}</div>}>
        {list.items.length === 0 ? <div className="p-4"><Empty>Không có yêu cầu.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Mã</th><th className={th}>Loại</th><th className={th}>Người yêu cầu</th><th className={th}>Cơ sở</th><th className={th}>Trạng thái</th><th className={th}>Hạn</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {list.items.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/compliance?id=${r.id}`} className="font-mono text-xs font-semibold text-brand-600">{r.code}</Link><div className="text-[11px] text-ink-400">{fmtDT(r.receivedAt)}</div></td>
                  <td className="p-3 text-xs">{r.typeLabel}</td>
                  <td className="p-3 text-xs">{r.requesterName}<div className="text-ink-400">{r.requesterPhone}</div></td>
                  <td className="p-3 text-xs">{r.centerCode ?? "—"}</td>
                  <td className="p-3"><span className={`chip ${STATUS_CHIP[r.status as DsrStatus]}`}>{r.statusLabel}</span></td>
                  <td className="p-3 text-xs"><span className={`chip ${SLA_CHIP[r.sla]!.cls}`}>{SLA_CHIP[r.sla]!.label}</span>{r.ackOverdue && <span className="chip ml-1 bg-red-100 text-red-700">chưa phản hồi tiếp nhận</span>}<div className="text-ink-400">{fmtDT(r.dueAt)}{r.extendedAt ? " (đã gia hạn)" : ""}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Sổ sự cố dữ liệu cá nhân" desc={`Lộ, mất, gửi nhầm dữ liệu… phải ghi nhận ngay. Sự cố mức trung bình / nghiêm trọng: thông báo cơ quan chuyên trách (Cục A05) trong ${INCIDENT_NOTIFY_HOURS} giờ kể từ khi phát hiện.`}
        actions={inc.canReport ? <ReportIncidentForm centers={list.centers} globalCreate={list.globalCreate} /> : null}>
        {inc.items.length === 0 ? <div className="p-4"><Empty>Chưa có sự cố nào được ghi nhận.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Mã</th><th className={th}>Sự cố</th><th className={th}>Mức độ</th><th className={th}>Hạn thông báo</th><th className={th}>Trạng thái</th>{inc.canProcess && <th className={th}></th>}</tr></thead>
            <tbody className="divide-y divide-black/5">
              {inc.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="p-3 font-mono text-xs font-semibold">{i.code}<div className="font-sans font-normal text-ink-400">{i.centerCode ?? "Toàn hệ thống"}</div></td>
                  <td className="p-3 text-xs"><div className="font-medium text-ink-900">{i.title}</div><div className="text-ink-600">{i.description}</div><div className="text-ink-400">{i.affectedCount} người · {i.dataTypes ?? "—"} · báo bởi {i.byName ?? "—"}</div>{i.containment && <div className="mt-1 text-green-800">Khắc phục: {i.containment}</div>}</td>
                  <td className="p-3"><span className={`chip ${i.severity === "high" ? "bg-red-100 text-red-700" : i.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-ink-600"}`}>{i.severityLabel}</span></td>
                  <td className="p-3 text-xs">{fmtDT(i.notifyDueAt)}{i.notifyOverdue && <div className="chip mt-1 bg-red-100 text-red-700">quá hạn thông báo</div>}<div className="text-ink-400">{i.notifiedAuthorityAt ? `Đã báo A05 ${fmtDT(i.notifiedAuthorityAt)}` : "Chưa báo A05"}{i.notifiedSubjectsAt ? ` · đã báo người bị ảnh hưởng` : ""}</div></td>
                  <td className="p-3 text-xs">{i.statusLabel}</td>
                  {inc.canProcess && <td className="p-3">{i.status !== "closed" && <IncidentActions id={i.id} severity={i.severity} notifiedAuthority={!!i.notifiedAuthorityAt} notifiedSubjects={!!i.notifiedSubjectsAt} containment={i.containment} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      {ov && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Đồng ý & lưu giữ" desc={`Lead không chuyển đổi, không tương tác quá ${ov.retention.months} tháng (trước ${ov.retention.cutoff}) sẽ được ẩn danh tự động hằng ngày.`}>
            <div className="space-y-3 p-4 text-sm">
              <ul className="grid grid-cols-2 gap-2">
                <li className="rounded bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Lead chưa có đồng ý</div><div className="text-lg font-semibold tabular-nums">{ov.consent.leadsNoConsent}</div></li>
                <li className="rounded bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Từ chối tiếp thị</div><div className="text-lg font-semibold tabular-nums">{ov.consent.marketingOptOut}</div></li>
                <li className="rounded bg-black/[0.03] p-2"><div className="text-xs text-ink-400">PH đồng ý đăng ảnh</div><div className="text-lg font-semibold tabular-nums">{ov.consent.mediaConsent}/{ov.consent.parents}</div></li>
                <li className="rounded bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Lead đến hạn ẩn danh</div><div className="text-lg font-semibold tabular-nums">{ov.retention.due}</div></li>
              </ul>
              {ov.canProcess && <RetentionRun due={ov.retention.due} />}
            </div>
          </Section>
          <Section title="Truy cập dữ liệu cá nhân (30 ngày)" desc="Mỗi lần hiện đầy đủ SĐT / địa chỉ / xuất dữ liệu đều phải ghi lý do.">
            <div className="p-4 text-sm">
              {ov.piiReveals.length === 0 ? <Empty>Chưa có lượt truy cập.</Empty> : (
                <ul className="mb-3 flex flex-wrap gap-2">{ov.piiReveals.map((r) => <li key={r.entity} className="chip bg-slate-100">{r.entity}: {r.n} lượt · {r.users} người</li>)}</ul>
              )}
              <ul className="divide-y divide-black/5 text-xs">
                {ov.recentReveals.map((r, i) => <li key={i} className="py-1.5"><span className="font-medium">{r.byName ?? "—"}</span> · {r.entity} · <span className="text-ink-400">{fmtDT(r.createdAt)}</span><div className="text-ink-600">{r.reason ?? "—"}</div></li>)}
              </ul>
              <Link href="/audit-log?action=PII_REVEAL" className="mt-2 inline-block text-xs text-brand-600">Xem nhật ký →</Link>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

async function RequestDetail({ id }: { id: string }) {
  const { caller } = await getServerCaller();
  const d = await caller.compliance.request({ id });
  const s = d.subject;
  const sla = SLA_CHIP[d.sla]!;
  return (
    <div className="space-y-4">
      <PageHeader title={`Yêu cầu ${d.code}`} desc={d.typeLabel} actions={<Link href="/compliance" className="btn-ghost">← Danh sách</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2 p-4 text-sm lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${STATUS_CHIP[d.status as DsrStatus]}`}>{d.statusLabel}</span>
            <span className={`chip ${sla.cls}`}>{sla.label}</span>
            <span className="text-xs text-ink-400">Nhận {fmtDT(d.receivedAt)} · phản hồi tiếp nhận trước {fmtDT(d.ackDueAt)}{d.acknowledgedAt ? " ✓" : ""} · hạn thực hiện {fmtDT(d.dueAt)} ({d.extendedAt ? `đã gia hạn: ${d.extensionReason}` : `${d.slaDays} ngày`})</span>
          </div>
          <div><span className="text-ink-400">Người yêu cầu:</span> {d.requesterName} · {d.requesterPhone} · kênh {d.channel}</div>
          <p className="whitespace-pre-wrap rounded bg-black/[0.03] p-3">{d.details}</p>
          {d.resolution && <div><span className="text-ink-400">Kết quả:</span> {d.resolution}</div>}
          {d.can.process && <div className="border-t border-black/5 pt-3"><RequestActions id={d.id} status={d.status} /></div>}
          {d.can.extend && <div className="border-t border-black/5 pt-3"><ExtendForm id={d.id} /></div>}
        </div>
        <div className="card p-4 text-sm">
          <h3 className="mb-2 font-semibold">Diễn tiến</h3>
          <ol className="space-y-2 text-xs">
            {d.events.map((e) => <li key={e.id}><div><span className="font-medium">{EVENT_VI[e.action] ?? e.action}</span> · {e.byName ?? "—"}</div><div className="text-ink-400">{fmtDT(e.createdAt)}</div>{e.note && <div className="text-ink-600">{e.note}</div>}</li>)}
          </ol>
        </div>
      </div>
      <Section title="Hồ sơ chủ thể dữ liệu">
        <div className="space-y-3 p-4 text-sm">
          {!s ? (d.can.link ? <><p className="text-ink-600">Chưa liên kết hồ sơ. Tìm theo SĐT của phụ huynh:</p><LinkSubject id={d.id} /></> : <Empty>Chưa liên kết hồ sơ.</Empty>) : (
            <>
              <div>
                <span className="chip bg-slate-100">{s.type === "lead" ? "Lead" : "Phụ huynh"}</span> <span className="font-medium">{s.name}</span> · {s.phone}
                {s.anonymized && <span className="chip ml-2 bg-slate-200">đã ẩn danh</span>}
                {s.type === "lead" ? <Link href={`/leads/${s.id}`} className="ml-2 text-xs text-brand-600">Mở hồ sơ →</Link> : null}
              </div>
              {s.note && <p className="text-xs text-amber-700">{s.note}</p>}
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Mục đích</th><th className={th}>Hiện trạng</th><th className={th}>Ghi nhận lúc</th>{d.can.consent && <th className={th}></th>}</tr></thead>
                <tbody className="divide-y divide-black/5">
                  {s.consents.map((c) => (
                    <tr key={c.purpose}>
                      <td className="p-3">{c.label}</td>
                      <td className="p-3">{c.granted === null ? <span className="text-ink-400">chưa ghi nhận</span> : c.granted ? <span className="chip bg-green-100 text-green-800">đồng ý</span> : <span className="chip bg-red-100 text-red-700">không đồng ý</span>}</td>
                      <td className="p-3 text-xs text-ink-400">{fmtDT(c.at)}</td>
                      {d.can.consent && <td className="p-3 text-right"><ConsentToggle id={d.id} purpose={c.purpose} granted={c.granted} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.can.export && <div className="border-t border-black/5 pt-3"><ExportButton id={d.id} existingUrl={d.exportUrl} /></div>}
              {d.type === "delete" && !s.anonymized && (
                <div className="border-t border-black/5 pt-3">
                  <h4 className="font-semibold">Xoá dữ liệu</h4>
                  {!s.erasure.allowed ? <ul className="list-disc pl-5 text-xs text-red-700">{s.erasure.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : (
                    <>
                      {s.erasure.reasons.map((r) => <p key={r} className="text-xs text-amber-700">{r}</p>)}
                      {d.can.erase && d.status === "in_progress" ? <EraseForm id={d.id} code={d.code} mode={s.erasure.mode} /> : d.can.erase ? <p className="text-xs text-ink-600">Chuyển sang “Đang xử lý” sau khi xác minh để thực hiện.</p> : null}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Section>
    </div>
  );
}

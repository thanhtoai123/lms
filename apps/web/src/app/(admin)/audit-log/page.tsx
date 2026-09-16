import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { fmtDateTime } from "@/components/lead-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Log" };

type SP = { module?: string; entity?: string; action?: string; actor?: string; entityId?: string; from?: string; to?: string; q?: string; page?: string };

const MODULE_VI: Record<string, string> = { academics: "Đào tạo", admissions: "Tuyển sinh", system: "Hệ thống", engagement: "Chăm sóc", finance: "Tài chính", students: "Học viên", learning: "Học bạ", org: "Tổ chức" };
const ACTION_CHIP: Record<string, string> = { CREATE: "bg-green-100 text-green-800", UPDATE: "bg-sky-100 text-sky-800", DELETE: "bg-red-100 text-red-700", TRANSITION: "bg-violet-100 text-violet-800", PII_REVEAL: "bg-amber-100 text-amber-800" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** So sánh trước/sau: chỉ hiện khoá thay đổi */
function diff(before: unknown, after: unknown) {
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === "object" ? (after as Record<string, unknown>) : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const show = (v: unknown) => (v === undefined ? "∅" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k])).map((k) => ({ k, from: k in b ? show(b[k]) : null, to: k in a ? show(a[k]) : null }));
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "audit:read")) return <NoAccess title="Audit Log" perm="audit:read" />;
  const [opts, data] = await Promise.all([
    caller.system.auditOptions(),
    caller.system.audit({
      module: sp.module || undefined, entity: sp.entity || undefined, action: sp.action || undefined,
      actorId: sp.actor && UUID.test(sp.actor) ? sp.actor : undefined, entityId: sp.entityId && UUID.test(sp.entityId) ? sp.entityId : undefined,
      from: sp.from && DATE.test(sp.from) ? sp.from : undefined, to: sp.to && DATE.test(sp.to) ? sp.to : undefined, q: sp.q || undefined, page: Number(sp.page) || 1,
    }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" desc="Nhật ký thao tác bất biến (không sửa, không xoá được). Mỗi dòng: ai, lúc nào, làm gì, trên dữ liệu nào, trước → sau và lý do." />
      <form className="card flex flex-wrap items-end gap-2 p-3">
        <label className="text-xs text-ink-600">Phân hệ
          <select name="module" defaultValue={sp.module ?? ""} className="input mt-1 !py-1.5">
            <option value="">Tất cả</option>
            {opts.modules.map((m) => <option key={m} value={m}>{MODULE_VI[m] ?? m}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Đối tượng
          <select name="entity" defaultValue={sp.entity ?? ""} className="input mt-1 !py-1.5">
            <option value="">Tất cả</option>
            {[...new Set(opts.entities.map((e) => e.v))].map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Hành động
          <select name="action" defaultValue={sp.action ?? ""} className="input mt-1 !py-1.5">
            <option value="">Tất cả</option>
            {opts.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Người thực hiện
          <select name="actor" defaultValue={sp.actor ?? ""} className="input mt-1 !py-1.5">
            <option value="">Tất cả</option>
            {opts.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Từ<input type="date" name="from" defaultValue={sp.from} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">Đến<input type="date" name="to" defaultValue={sp.to} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">Tìm trong lý do / dữ liệu<input name="q" defaultValue={sp.q} className="input mt-1 !py-1.5" /></label>
        {sp.entityId && <input type="hidden" name="entityId" value={sp.entityId} />}
        <button className="btn-primary !py-1.5">Lọc</button>
        <Link href="/audit-log" className="btn-ghost !py-1.5">Xoá lọc</Link>
      </form>
      {sp.entityId && <div className="text-xs text-ink-600">Đang xem theo bản ghi <code className="font-mono">{sp.entityId}</code> · <Link className="underline" href="/audit-log">bỏ</Link></div>}
      <div className="text-sm text-ink-600">{data.total} dòng</div>
      {data.items.length === 0 ? <Empty>Không có dòng nhật ký phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời điểm</th><th className="p-3">Người</th><th className="p-3">Hành động</th><th className="p-3">Thay đổi</th><th className="p-3">Lý do</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {data.items.map((r) => {
                const changes = diff(r.before, r.after);
                return (
                  <tr key={r.id}>
                    <td className="p-3 whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}{r.ip ? <div className="text-ink-400">{r.ip}</div> : null}</td>
                    <td className="p-3 text-xs">{r.actorId ? <Link href={`/audit-log?actor=${r.actorId}`} className="font-medium hover:underline">{r.actorName ?? "?"}</Link> : <span className="text-ink-400">Hệ thống</span>}</td>
                    <td className="p-3">
                      <span className={`chip ${ACTION_CHIP[r.action] ?? "bg-black/5"}`}>{r.action}</span>
                      <div className="mt-1 text-xs">{MODULE_VI[r.module] ?? r.module} · <span className="font-mono">{r.entity}</span></div>
                      {r.entityId && <Link href={`/audit-log?entityId=${r.entityId}`} className="font-mono text-[10px] text-ink-400 hover:underline">{r.entityId.slice(0, 8)}…</Link>}
                    </td>
                    <td className="p-3 text-xs">
                      {changes.length === 0 ? <span className="text-ink-400">—</span> : (
                        <ul className="space-y-0.5">
                          {changes.slice(0, 8).map((c) => (
                            <li key={c.k} className="break-all"><span className="font-mono text-ink-600">{c.k}</span>: {c.from !== null && <span className="text-red-700 line-through">{c.from.slice(0, 80)}</span>}{c.from !== null && c.to !== null && " → "}{c.to !== null && <span className="text-green-700">{c.to.slice(0, 80)}</span>}</li>
                          ))}
                          {changes.length > 8 && <li className="text-ink-400">+{changes.length - 8} trường khác</li>}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 text-xs text-ink-600">{r.reason ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/audit-log" params={sp} page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}

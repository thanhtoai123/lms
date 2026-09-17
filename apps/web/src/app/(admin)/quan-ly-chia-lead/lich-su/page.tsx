import Link from "next/link";
import { POOL_ACTION_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, Pager } from "@/components/admin-ui";
import { fmtDateTime } from "@/components/lead-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch sử thay đổi pool" };

function describe(v: Record<string, unknown> | null) {
  if (!v) return "—";
  const parts: string[] = [];
  if (v.isAvailable !== undefined) parts.push(v.isAvailable ? "đang nhận" : "tạm nghỉ");
  if (v.rounds !== undefined && v.rounds !== null) parts.push(`lượt ${String(v.rounds)}`);
  if (v.weight !== undefined) parts.push(`trọng số ${String(v.weight)}`);
  return parts.join(" · ") || "—";
}

export default async function PoolHistoryPage({ searchParams }: { searchParams: Promise<{ center?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const centerId = sp.center ?? ref.centers[0]?.id ?? null;
  const h = await caller.admissions.leads.poolHistory({ centerId, page });
  return (
    <div className="space-y-4">
      <Link href={`/quan-ly-chia-lead${centerId ? `?center=${centerId}` : ""}`} className="text-sm text-ink-600">← Quản lý chia lead</Link>
      <PageHeader title="Lịch sử thay đổi pool" desc="Ai bật/tắt ai, chỉnh lượt bao nhiêu, vì sao — mới nhất trước." />
      <form className="flex items-center gap-2">
        <select name="center" defaultValue={centerId ?? ""} className="input max-w-xs">
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Xem</button>
      </form>
      {h.items.length === 0 ? <Empty>Chưa có thay đổi nào.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Thời gian</th><th className="p-3">Người bị tác động</th><th className="p-3">Thao tác</th><th className="p-3">Trước</th><th className="p-3">Sau</th><th className="p-3">Lý do</th><th className="p-3">Người thực hiện</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {h.items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap p-3 text-xs">{fmtDateTime(e.createdAt)}</td>
                  <td className="p-3">{e.userName ?? "—"}{e.centerCode ? <span className="text-xs text-ink-400"> · {e.centerCode}</span> : null}</td>
                  <td className="p-3">{POOL_ACTION_VI[e.action]}</td>
                  <td className="p-3 text-xs">{describe(e.before)}</td>
                  <td className="p-3 text-xs">{describe(e.after)}</td>
                  <td className="p-3 text-xs">{e.reason ?? "—"}</td>
                  <td className="p-3">{e.actorName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/quan-ly-chia-lead/lich-su" params={{ center: centerId ?? undefined }} page={h.page} pageSize={h.pageSize} total={h.total} />
    </div>
  );
}

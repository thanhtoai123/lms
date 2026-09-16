import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { LeadChip, fmtDateTime } from "@/components/lead-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
const KIND_VI: Record<string, string> = { handover: "Bàn giao", center_transfer: "Chuyển cơ sở", redistribute: "Chia lại" };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ month?: string; kind?: string }> }) {
  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const kind = (["handover", "center_transfer", "redistribute"] as const).find((k) => k === sp.kind);
  const { caller } = await getServerCaller();
  const rows = await caller.admissions.leads.transfersReport({ month, kind });
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Chuyển lead liên cơ sở</h1><p className="text-sm text-ink-600">Bàn giao giữa sale và chuyển lead liên cơ sở theo tháng — ai chuyển, cho ai, lý do, kết quả hiện tại.</p></div>
      <form className="flex gap-2 items-center">
        <input type="month" name="month" defaultValue={month} className="input max-w-[180px]" />
        <select name="kind" defaultValue={kind ?? ""} className="input max-w-[200px]"><option value="">Mọi loại</option>{Object.entries(KIND_VI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-ghost">Xem</button>
      </form>
      {rows.length === 0 ? <Empty>Không có giao dịch chuyển lead trong tháng này.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Ngày</th><th className="p-3">Lead</th><th className="p-3">Loại</th><th className="p-3">Từ → Đến</th><th className="p-3">Người chuyển</th><th className="p-3">Lý do</th><th className="p-3">Kết quả</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                  <td className="p-3"><Link href={`/leads/${r.leadId}`} className="text-brand-700 font-medium">{r.parentName}</Link></td>
                  <td className="p-3"><span className="chip bg-black/5">{KIND_VI[r.kind] ?? r.kind}</span></td>
                  <td className="p-3 text-xs">{r.kind === "center_transfer" ? `${r.fromCenter ?? "?"} → ${r.toCenter ?? "?"}` : `${r.fromUser ?? "—"} → ${r.toUser ?? "—"}`}{r.kind === "center_transfer" && r.toUser ? <div className="text-ink-400">giao {r.toUser}</div> : null}</td>
                  <td className="p-3 text-xs">{r.actor ?? "Hệ thống"}</td>
                  <td className="p-3 text-xs max-w-xs">{r.reason ?? "—"}</td>
                  <td className="p-3"><LeadChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

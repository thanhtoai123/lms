import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, Pager, StatTabs, ParentAccountChip, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { AccountActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài khoản phụ huynh" };

const ST = ["none", "pending_activation", "active", "locked"] as const;
type St = (typeof ST)[number];

export default async function ParentAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = ST.includes(sp.status as St) ? (sp.status as St) : undefined;
  const { caller } = await getServerCaller();
  const d = await caller.students.parentAccounts({ q: sp.q || undefined, status, page: Number(sp.page) || 1 });
  const all = d.counts ? d.counts.none + d.counts.pending + d.counts.active + d.counts.locked : 0;
  return (
    <div className="space-y-4">
      <PageHeader title="Tài khoản phụ huynh" desc="Sau khi chốt, tài khoản PH ở trạng thái chờ kích hoạt. Cấp mã kích hoạt tại quầy (hiệu lực 72 giờ) để PH tự đặt mật khẩu." />
      <StatTabs
        basePath="/students/tai-khoan"
        params={sp}
        active={status}
        tabs={[
          { key: "", label: "Tất cả", count: all },
          { key: "pending_activation", label: "Chờ kích hoạt", count: d.counts?.pending },
          { key: "active", label: "Đang hoạt động", count: d.counts?.active },
          { key: "none", label: "Chưa cấp", count: d.counts?.none },
          { key: "locked", label: "Đã khoá", count: d.counts?.locked },
        ]}
      />
      <form className="flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Tên hoặc SĐT phụ huynh…" className="input max-w-xs" />
        <button className="btn-ghost">Tìm</button>
      </form>
      {d.items.length === 0 ? <Empty>Không có tài khoản phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Phụ huynh</th><th className="p-3">SĐT</th><th className="p-3">Con</th><th className="p-3">Trạng thái</th><th className="p-3">Yêu cầu / kích hoạt</th><th className="p-3">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="p-3 font-medium">{p.fullName}<div className="text-xs font-normal text-ink-400">{p.email ?? ""}</div></td>
                  <td className="p-3 font-mono text-xs">{p.phone}</td>
                  <td className="p-3 text-xs">{p.children ?? "—"}</td>
                  <td className="p-3"><ParentAccountChip status={p.accountStatus} />{p.accountStatus === "pending_activation" && <div className="mt-1 text-[11px] text-ink-400">{p.codeValid ? `Mã còn hạn đến ${p.activationCodeExpiresAt?.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : "Chưa có mã còn hạn"}</div>}</td>
                  <td className="p-3 text-xs">{p.activatedAt ? `Kích hoạt ${fmtDate(p.activatedAt)}` : p.activationRequestedAt ? `Yêu cầu ${fmtDate(p.activationRequestedAt)}` : "—"}</td>
                  <td className="p-3"><AccountActions parentId={p.id} status={p.accountStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/students/tai-khoan" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}

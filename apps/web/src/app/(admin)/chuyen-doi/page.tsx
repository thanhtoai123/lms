import Link from "next/link";
import { hasPermission, RECON_METRICS, RECON_METRIC_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { StudentImporter, EnrollmentImporter, ReconForm, CompareStudents } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển đổi dữ liệu" };
type SP = { tab?: string; center?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const MONEY = new Set(["debtTotal", "collectedMonth"]);
const fmt = (m: string, v: number | null | undefined) => (v === null || v === undefined ? "—" : MONEY.has(m) ? vnd(v) : v.toLocaleString("vi-VN"));
const dt = (d: Date | string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, string> = { legacy_students: "Học viên + phụ huynh", legacy_enrollments: "Ghi danh", legacy_payments: "Phiếu thu cũ" };

export default async function MigrationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "migration:read")) return <NoAccess title="Chuyển đổi dữ liệu" perm="migration:read" />;
  const b = await caller.migration.batches();
  const tabs = [["hoc-vien", "1. Học viên + phụ huynh"], ["ghi-danh", "2. Ghi danh"], ["giao-dich", "3. Phiếu thu cũ"], ["doi-soat", "4. Đối soát"], ["lich-su", "Lịch sử nhập"]] as const;
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : b.canRun ? "hoc-vien" : "doi-soat";
  const centerId = sp.center && UUID.test(sp.center) ? sp.center : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Chuyển đổi dữ liệu" desc="Đưa dữ liệu từ admin.satarobo.vn sang hệ mới theo thứ tự: tạo cơ sở / khoá / lớp → nhập học viên + phụ huynh → nhập ghi danh (số buổi đã học mang sang) → nhập phiếu thu cũ → đối soát. Mỗi file được kiểm tra trước; chạy lại cùng file không nhân bản." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Học viên đã chuyển" value={b.refs.students} />
        <Kpi label="Ghi danh đã chuyển" value={b.refs.enrollments} />
        <Kpi label="Lô nhập" value={b.items.length} />
        <Kpi label="Quyền nhập" value={b.canRun ? "Có" : "Chỉ xem"} tone={b.canRun ? "good" : "default"} />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-black/10 text-sm">{tabs.map(([k, l]) => <Link key={k} href={`/chuyen-doi?tab=${k}`} className={`whitespace-nowrap px-3 py-2 ${tab === k ? "border-b-2 border-brand-500 font-semibold" : "text-ink-600"}`}>{l}</Link>)}</nav>
      {tab === "hoc-vien" && (b.canRun ? <StudentImporter /> : <Empty>Chỉ quản trị Hội sở được nhập.</Empty>)}
      {tab === "ghi-danh" && (b.canRun ? <EnrollmentImporter /> : <Empty>Chỉ quản trị Hội sở được nhập.</Empty>)}
      {tab === "giao-dich" && (
        <Section title="Phiếu thu cũ" desc="Dùng trang Nhập giao dịch cũ (mã HV + mã lớp hoặc mã đơn, số phiếu cũ chống trùng).">
          <div className="p-4"><Link href="/nhap-giao-dich-cu" className="btn-primary">Mở Nhập giao dịch cũ</Link></div>
        </Section>
      )}
      {tab === "doi-soat" && <Recon centerId={centerId} />}
      {tab === "lich-su" && (
        b.items.length === 0 ? <Empty>Chưa có lô nhập.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Thời gian</th><th className={th}>Loại</th><th className={th}>File / ghi chú</th><th className={th}>Nhập / tổng dòng</th><th className={th}>Kết quả</th><th className={th}>Người nhập</th></tr></thead>
              <tbody className="divide-y divide-black/5">{b.items.map((x) => (
                <tr key={x.id}><td className="p-3 text-xs">{dt(x.createdAt)}</td><td className="p-3">{KIND[x.kind] ?? x.kind}</td><td className="p-3 text-xs">{x.fileName ?? "—"}<div className="text-ink-400">{x.note}</div></td>
                  <td className={td}>{x.okRows}/{x.totalRows}</td><td className="p-3 text-xs">{Object.entries(x.summary ?? {}).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k}: ${v}`).join(" · ")}</td><td className="p-3 text-xs">{x.by ?? "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

async function Recon({ centerId }: { centerId: string | null }) {
  const { caller } = await getServerCaller();
  const r = await caller.migration.recon({ centerId });
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="doi-soat" />
        <select name="center" defaultValue={centerId ?? ""} className="input max-w-xs">
          <option value="">Tất cả cơ sở được xem</option>
          {r.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Xem</button>
      </form>
      <Section title="Số liệu tổng" desc="Nhập số liệu xem ở hệ cũ cùng thời điểm; hệ thống so với số liệu hệ mới. Số đếm phải khớp tuyệt đối, tiền lệch tối đa 1.000đ.">
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Chỉ số</th><th className={th}>Hệ mới hiện tại</th></tr></thead>
            <tbody className="divide-y divide-black/5">{RECON_METRICS.map((m) => <tr key={m}><td className="p-3">{RECON_METRIC_VI[m]}</td><td className={td}>{fmt(m, r.current[m])}</td></tr>)}</tbody>
          </table>
          {r.canSave ? <ReconForm centerId={centerId} /> : <p className="text-sm text-ink-600">{centerId ? "Bạn chỉ có quyền xem." : "Chọn một cơ sở để ghi đối soát (quản lý cơ sở), hoặc đăng nhập Hội sở để đối soát toàn hệ thống."}</p>}
        </div>
      </Section>
      <Section title="Lịch sử đối soát">
        {r.history.length === 0 ? <div className="p-4"><Empty>Chưa có lần đối soát.</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Thời gian</th><th className={th}>Cơ sở</th><th className={th}>Kết quả</th><th className={th}>Lệch</th><th className={th}>Người ghi</th></tr></thead>
              <tbody className="divide-y divide-black/5">{r.history.map((h) => (
                <tr key={h.id}><td className="p-3 text-xs">{dt(h.createdAt)}</td><td className="p-3">{h.centerCode ?? "Toàn hệ thống"}</td>
                  <td className="p-3">{h.ok ? <span className="chip bg-green-100 text-green-800">Khớp ({h.result.compared} chỉ số)</span> : <span className="chip bg-red-100 text-red-700">Lệch</span>}</td>
                  <td className="p-3 text-xs">{h.result.rows.filter((x) => x.ok === false).map((x) => `${x.label}: cũ ${fmt(x.metric, x.legacy)} / mới ${fmt(x.metric, x.current)}`).join(" · ") || "—"}{h.note && <div className="text-ink-400">{h.note}</div>}</td>
                  <td className="p-3 text-xs">{h.by ?? "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
      <CompareStudents centerId={centerId} />
    </div>
  );
}

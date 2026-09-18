import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { TrialClassList } from "./classes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp Trial" };

type SP = { scope?: string; center?: string; q?: string };

export default async function TrialClassesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "open";
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "trials:view")) return <NoAccess title="Lớp Trial" perm="trials:view" />;
  const [ref, data] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.admissions.trials.classes({ scope, centerId: sp.center || undefined, q: sp.q || undefined }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Lớp Trial"
        desc="Lớp trải nghiệm nhiều buổi: tạo lớp → thêm buổi → xếp học viên → điểm danh. Tên lớp hệ thống tự đặt; ngày / giờ / phòng / giáo viên chọn theo từng buổi. Thêm học viên vào lớp là em đó học toàn bộ buổi của lớp, kể cả buổi tạo sau."
        actions={<Link href="/lop-trial/buoi-le" className="btn-ghost">Học thử buổi lẻ →</Link>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-ink-400">Lớp đang mở</div><div className="text-2xl font-bold text-brand-600">{data.stats.open}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Lớp hiển thị</div><div className="text-2xl font-bold">{data.stats.total}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Học viên đang học thử</div><div className="text-2xl font-bold text-green-700">{data.stats.students}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Lớp chưa xếp buổi</div><div className={`text-2xl font-bold ${data.stats.noSession ? "text-amber-700" : ""}`}>{data.stats.noSession}</div></div>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-600">Cơ sở
          <select name="center" defaultValue={sp.center ?? ""} className="input mt-1 !py-1.5">
            <option value="">Mọi cơ sở</option>
            {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Tìm<input name="q" defaultValue={sp.q} placeholder="Tên lớp hoặc mã lớp" className="input mt-1 !py-1.5" /></label>
        {scope === "all" && <input type="hidden" name="scope" value="all" />}
        <button className="btn-ghost !py-1.5">Lọc</button>
      </form>
      <nav className="flex gap-1 overflow-x-auto border-b border-black/5 text-sm">
        {([{ key: "", label: "Đang mở" }, { key: "all", label: "Tất cả" }] as const).map((t) => {
          const u = new URLSearchParams();
          if (sp.center) u.set("center", sp.center);
          if (sp.q) u.set("q", sp.q);
          if (t.key) u.set("scope", t.key);
          const qs = u.toString();
          const active = (scope === "all" ? "all" : "") === t.key;
          return (
            <Link key={t.key || "open"} href={qs ? `/lop-trial?${qs}` : "/lop-trial"} className={`whitespace-nowrap border-b-2 px-3 py-2 ${active ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      <TrialClassList
        items={data.items}
        canManage={data.perms.manage}
        centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        courses={ref.courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
      />
    </div>
  );
}

import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { DistributionBoard } from "./board";
import { DistributionLogTab } from "./so-chia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý chia lead" };

export default async function DistributionPage({ searchParams }: { searchParams: Promise<{ center?: string; region?: string; tab?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  // Lọc khu vực: thu hẹp danh sách cơ sở theo khu vực đã chọn
  const regionId = ref.regions.some((r) => r.id === sp.region) ? sp.region! : null;
  const centerOptions = regionId ? ref.centers.filter((c) => c.regionId === regionId) : ref.centers;
  const centerId = centerOptions.some((c) => c.id === sp.center) ? sp.center! : centerOptions[0]?.id ?? null;
  const tab = sp.tab === "so-chia" ? "so-chia" : "pool";
  const assignees = centerId && tab === "so-chia" ? await caller.admissions.leads.assigneeOptions({ centerId }) : [];
  const href = (t: string) => `/quan-ly-chia-lead?${new URLSearchParams({ ...(regionId ? { region: regionId } : {}), ...(centerId ? { center: centerId } : {}), ...(t !== "pool" ? { tab: t } : {}) }).toString()}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản lý chia lead</h1>
          <p className="text-sm text-ink-600">Ai đang nhận lead tự động, và vòng chia đã chia cho ai. Tắt một người → thôi nhận lead mới, lead đang giữ nguyên, bộ đếm lượt đóng băng. Bật lại → lượt về mức thấp nhất của những người đang nhận (không bị dồn lead bù).</p>
        </div>
        {centerId && <Link href={`/quan-ly-chia-lead/lich-su?center=${centerId}`} className="btn-ghost">Lịch sử thay đổi pool</Link>}
      </div>
      <form className="flex flex-wrap items-center gap-2">
        {ref.regions.length > 0 && (
          <select name="region" defaultValue={regionId ?? ""} className="input max-w-[220px]" aria-label="Khu vực">
            <option value="">Mọi khu vực</option>
            {ref.regions.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
          </select>
        )}
        <select name="center" defaultValue={centerId ?? ""} className="input max-w-xs" aria-label="Cơ sở">
          {centerOptions.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        {tab !== "pool" && <input type="hidden" name="tab" value={tab} />}
        <button className="btn-ghost">Xem</button>
      </form>
      <nav className="flex gap-1 border-b border-black/5 text-sm">
        {[{ key: "pool", label: "Cấu hình pool" }, { key: "so-chia", label: "Sổ chia lead" }].map((t) => (
          <Link key={t.key} href={href(t.key)} className={`border-b-2 px-3 py-2 ${tab === t.key ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"}`}>{t.label}</Link>
        ))}
      </nav>
      {centerId && (tab === "pool"
        ? <DistributionBoard centerId={centerId} />
        : <DistributionLogTab centerId={centerId} sales={[...new Map(assignees.map((a) => [a.id, { id: a.id, fullName: a.fullName }] as const)).values()]} />)}
    </div>
  );
}

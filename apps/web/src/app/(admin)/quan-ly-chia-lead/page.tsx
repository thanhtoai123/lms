import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { DistributionBoard } from "./board";
import { DistributionLogTab } from "./so-chia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý chia lead" };

export default async function DistributionPage({ searchParams }: { searchParams: Promise<{ center?: string; tab?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const centerId = sp.center ?? ref.centers[0]?.id ?? null;
  const tab = sp.tab === "so-chia" ? "so-chia" : "pool";
  const assignees = centerId && tab === "so-chia" ? await caller.admissions.leads.assigneeOptions({ centerId }) : [];
  const href = (t: string) => `/quan-ly-chia-lead?${new URLSearchParams({ ...(centerId ? { center: centerId } : {}), ...(t !== "pool" ? { tab: t } : {}) }).toString()}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản lý chia lead</h1>
          <p className="text-sm text-ink-600">Ai đang nhận lead tự động, và vòng chia đã chia cho ai. Tắt một người → thôi nhận lead mới, lead đang giữ nguyên, bộ đếm lượt đóng băng. Bật lại → lượt về mức thấp nhất của những người đang nhận (không bị dồn lead bù).</p>
        </div>
        {centerId && <Link href={`/quan-ly-chia-lead/lich-su?center=${centerId}`} className="btn-ghost">Lịch sử thay đổi pool</Link>}
      </div>
      <form className="flex items-center gap-2">
        <select name="center" defaultValue={centerId ?? ""} className="input max-w-xs">
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
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

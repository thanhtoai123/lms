import { getServerCaller } from "@/lib/trpc/server";
import { LeadSubnav } from "@/components/lead-ui";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const centerId = sp.center === "global" ? null : (sp.center ?? ref.centers[0]?.id ?? null);
  return (
    <div className="space-y-4">
      <LeadSubnav active="/ops/leads/settings" />
      <div>
        <h1 className="text-2xl font-bold">SLA & tham số tuyển sinh</h1>
        <p className="text-sm text-ink-600">SLA theo phút cho từng trạng thái, khử trùng SĐT, trần số buổi học thử, ngưỡng "lâu chưa chăm". Cơ sở không cấu hình sẽ kế thừa mặc định toàn hệ thống.</p>
      </div>
      <form className="flex gap-2 items-center">
        <select name="center" defaultValue={centerId ?? "global"} className="input max-w-xs">
          <option value="global">Mặc định toàn hệ thống</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Xem</button>
      </form>
      <SettingsForm centerId={centerId} />
    </div>
  );
}

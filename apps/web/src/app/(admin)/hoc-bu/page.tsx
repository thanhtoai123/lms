import { MAKEUP_STATUSES, type MakeupStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, StatTabs } from "@/components/admin-ui";
import { MakeupBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bù" };

export default async function MakeupPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const tab = sp.status === "pending" || !sp.status ? "pending" : MAKEUP_STATUSES.includes(sp.status as MakeupStatus) ? (sp.status as MakeupStatus) : "pending";
  const { caller } = await getServerCaller();
  const [absences, list] = await Promise.all([
    caller.schedule.pendingAbsences({}),
    caller.schedule.makeups({ status: tab === "pending" ? undefined : tab }),
  ]);
  const c = list.counts;
  return (
    <div className="space-y-4">
      <PageHeader title="Học bù" desc="Buổi vắng trong 30 ngày → tạo yêu cầu → xếp vào buổi cùng bài ở lớp khác (còn chỗ, ưu tiên cùng cơ sở) → ghi nhận đã học bù." />
      <StatTabs
        basePath="/hoc-bu"
        params={sp}
        active={tab}
        tabs={[
          { key: "pending", label: "Buổi vắng chưa xử lý", count: absences.length },
          { key: "requested", label: "Chờ xếp", count: c?.requested },
          { key: "approved", label: "Đã xếp buổi bù", count: c?.approved },
          { key: "done", label: "Đã học bù", count: c?.done },
          { key: "rejected", label: "Từ chối", count: c?.rejected },
        ]}
      />
      <MakeupBoard tab={tab} absences={absences} items={tab === "pending" ? [] : list.items} />
    </div>
  );
}

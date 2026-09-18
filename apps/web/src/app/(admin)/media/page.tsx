import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, StatTabs } from "@/components/admin-ui";
import { MEDIA_STATUSES, type MediaStatus } from "@satarobo/core";
import { MediaUploader } from "./uploader";
import { MediaGallery } from "./gallery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ảnh lớp học" };

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ class?: string; status?: string }> }) {
  const sp = await searchParams;
  const status = MEDIA_STATUSES.includes(sp.status as MediaStatus) ? (sp.status as MediaStatus) : undefined;
  const { caller } = await getServerCaller();
  const opts = (await caller.schedule.classOptions()).filter((c) => c.status === "running" || c.status === "recruiting" || c.status === "finished");
  const classId = sp.class && opts.some((c) => c.id === sp.class) ? sp.class : undefined;
  const [ctxData, items] = await Promise.all([
    classId ? caller.learning.uploadContext({ classId }) : Promise.resolve(null),
    caller.learning.media({ classId, status, limit: 300 }),
  ]);
  const c = ctxData?.counts;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Ảnh lớp học"
        desc="Hai tầng: giáo viên tải ảnh vào kho của lớp (phụ huynh chưa thấy) → gắn thẻ học viên hoặc đánh dấu ảnh chung cả lớp → Gửi duyệt. Ảnh lưu kín, chỉ xem qua liên kết có hạn; ảnh có học viên chưa được phụ huynh đồng ý đăng ảnh sẽ không duyệt được."
      />
      <form className="flex gap-2">
        <select name="class" defaultValue={classId ?? ""} className="input max-w-lg">
          <option value="">— Mọi lớp —</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.centerCode} · {o.code} — {o.name}</option>)}
        </select>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Chọn</button>
      </form>
      {ctxData && classId ? (
        <MediaUploader sessions={ctxData.sessions} roster={ctxData.roster} />
      ) : (
        <div className="card p-4 text-sm text-ink-400">Chọn lớp để tải ảnh vào kho.</div>
      )}
      <StatTabs
        basePath="/media"
        params={sp}
        active={status}
        tabs={[
          { key: "", label: `Tất cả (${items.length})` },
          { key: "library", label: "Trong kho (GV chưa gửi)", count: c?.library },
          { key: "pending", label: "Chờ duyệt", count: c?.pending },
          { key: "approved", label: "Đã duyệt", count: c?.approved },
          { key: "rejected", label: "Từ chối", count: c?.rejected },
        ]}
      />
      <MediaGallery roster={ctxData?.roster ?? []} items={items} />
    </div>
  );
}

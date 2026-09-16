import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, StatTabs } from "@/components/admin-ui";
import { MediaUploader } from "./uploader";
import { MediaGallery } from "./gallery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ảnh lớp học" };

const ST = ["pending", "approved", "rejected"] as const;
type St = (typeof ST)[number];

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ class?: string; status?: string }> }) {
  const sp = await searchParams;
  const status = ST.includes(sp.status as St) ? (sp.status as St) : undefined;
  const { caller } = await getServerCaller();
  const opts = (await caller.schedule.classOptions()).filter((c) => c.status === "running" || c.status === "recruiting" || c.status === "finished");
  const classId = sp.class && opts.some((c) => c.id === sp.class) ? sp.class : undefined;
  const [ctxData, items] = await Promise.all([
    classId ? caller.learning.uploadContext({ classId }) : Promise.resolve(null),
    caller.learning.media({ classId, status }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Ảnh lớp học" desc="Ảnh lưu kín, chỉ xem qua liên kết có hạn. Ảnh có học viên chưa được phụ huynh đồng ý đăng ảnh sẽ không duyệt được." />
      <form className="flex gap-2">
        <select name="class" defaultValue={classId ?? ""} className="input max-w-lg">
          <option value="">— Mọi lớp —</option>
          {opts.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} — {c.name}</option>)}
        </select>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Chọn</button>
      </form>
      {ctxData && classId ? (
        <MediaUploader sessions={ctxData.sessions} roster={ctxData.roster} />
      ) : (
        <div className="card p-4 text-sm text-ink-400">Chọn lớp để đăng ảnh.</div>
      )}
      <StatTabs basePath="/media" params={sp} active={status} tabs={[{ key: "", label: `Thư viện (${items.length})` }, { key: "pending", label: "Chờ duyệt" }, { key: "approved", label: "Đã duyệt" }, { key: "rejected", label: "Từ chối" }]} />
      <MediaGallery items={items.map((m) => ({ id: m.id, url: m.url, caption: m.caption, status: m.status, classCode: m.classCode, sequenceNo: m.sequenceNo, sessionDate: m.sessionDate, uploaderName: m.uploaderName, tagged: m.tagged, consentOk: m.consentOk, overdue: m.overdue, rejectReason: m.rejectReason }))} />
    </div>
  );
}

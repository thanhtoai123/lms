import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { MediaGallery } from "../media/gallery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyệt ảnh lớp học" };

const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export default async function MediaReviewPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const days = await caller.learning.mediaReviewDays();
  const sessionId = sp.session && /^[0-9a-f-]{36}$/.test(sp.session) ? sp.session : days[0]?.classes[0]?.sessionId;
  const items = sessionId ? await caller.learning.media({ sessionId, status: "pending" }) : [];
  return (
    <div className="space-y-4">
      <PageHeader title="Duyệt ảnh lớp học" desc="Ảnh chờ duyệt nhóm theo ngày học. Quá 24 giờ chưa duyệt bị đánh dấu quá hạn. Duyệt xong phụ huynh của các học viên trong ảnh được thông báo." />
      {days.length === 0 ? <Empty>Không có ảnh nào chờ duyệt. 🎉</Empty> : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-2">
            {days.map((d) => {
              const dt = new Date(d.date + "T00:00:00");
              return (
                <div key={d.date} className={`card p-3 ${d.overdue ? "border-red-200" : ""}`}>
                  <div className="flex items-center justify-between text-sm font-semibold"><span>{WD[dt.getDay()]}, {d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>{d.overdue && <span className="chip bg-red-100 text-red-700">Quá hạn</span>}</div>
                  <div className="text-xs text-ink-400">{d.classes.length} lớp chờ duyệt · {d.photos} ảnh</div>
                  <div className="mt-2 space-y-1">
                    {d.classes.map((c) => (
                      <Link key={c.sessionId} href={`/duyet-media?session=${c.sessionId}`} className={`flex justify-between rounded-lg px-2 py-1 text-xs ${c.sessionId === sessionId ? "bg-brand-600 text-white" : "bg-black/[0.03] hover:bg-black/5"}`}>
                        <span>{c.classCode} · B{c.sequenceNo}</span><span>{c.n}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </aside>
          <MediaGallery reviewMode items={items.map((m) => ({ id: m.id, url: m.url, caption: m.caption, status: m.status, classCode: m.classCode, sequenceNo: m.sequenceNo, sessionDate: m.sessionDate, uploaderName: m.uploaderName, tagged: m.tagged, consentOk: m.consentOk, overdue: m.overdue, rejectReason: m.rejectReason }))} />
        </div>
      )}
    </div>
  );
}

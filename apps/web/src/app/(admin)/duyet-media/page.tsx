import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { MediaGallery } from "../media/gallery";
import { NoMediaButton } from "./actions";
import { RememberFilters } from "@/components/remember-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyệt ảnh lớp học" };

const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export default async function MediaReviewPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const days = await caller.learning.mediaReviewDays();
  const all = days.flatMap((d) => d.classes);
  const sessionId = sp.session && all.some((c) => c.sessionId === sp.session) ? sp.session : all[0]?.sessionId;
  const current = all.find((c) => c.sessionId === sessionId) ?? null;
  const items = sessionId && current?.kind === "pending" ? await caller.learning.media({ sessionId, status: "pending", limit: 300 }) : [];
  return (
    <div className="space-y-4">
      <RememberFilters storageKey="duyet-media" ignore={["page"]} />
      <PageHeader
        title="Duyệt ảnh lớp học"
        desc="Ảnh giáo viên đã gửi duyệt, nhóm theo ngày học. Quá 24 giờ chưa duyệt bị đánh dấu quá hạn. Duyệt xong phụ huynh của các học viên trong ảnh được thông báo; ảnh bị loại còn khôi phục trong 7 ngày. Buổi đã qua mà không có ảnh thì ghi nhận “Buổi này không có ảnh” để hết cảnh báo."
      />
      {days.length === 0 ? <Empty>Không còn buổi nào chờ xử lý ảnh. 🎉</Empty> : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-2">
            {days.map((d) => {
              const dt = new Date(d.date + "T00:00:00");
              return (
                <div key={d.date} className={`card p-3 ${d.overdue ? "border-red-200" : ""}`}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{WD[dt.getDay()]}, {d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
                    {d.overdue && <span className="chip bg-red-100 text-red-700">Quá hạn</span>}
                  </div>
                  <div className="text-xs text-ink-400">{d.photos} ảnh chờ duyệt{d.missing ? ` · ${d.missing} buổi chưa có ảnh` : ""}</div>
                  <div className="mt-2 space-y-1">
                    {d.classes.map((c) => (
                      <Link key={c.sessionId} href={`/duyet-media?session=${c.sessionId}`} className={`flex justify-between gap-2 rounded-lg px-2 py-1 text-xs ${c.sessionId === sessionId ? "bg-brand-600 text-white" : "bg-black/[0.03] hover:bg-black/5"}`}>
                        <span>{c.classCode} · B{c.sequenceNo}</span>
                        <span>{c.kind === "missing" ? "chưa có ảnh" : c.n}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </aside>
          <div className="space-y-3">
            {current && (
              <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="text-sm">
                  <div className="font-semibold">{current.classCode} · buổi {current.sequenceNo} — {current.className}</div>
                  <div className="text-xs text-ink-400">{current.centerCode} · {current.date.split("-").reverse().join("/")}</div>
                </div>
                {current.kind === "missing" && <NoMediaButton sessionId={current.sessionId} marked={false} label={`buổi ${current.sequenceNo}`} />}
              </div>
            )}
            {current?.kind === "missing"
              ? <Empty>Buổi này chưa có ảnh nào. Nhắc giáo viên tải ảnh, hoặc ghi nhận “Buổi này không có ảnh”.</Empty>
              : <MediaGallery reviewMode items={items} />}
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty, fmtDate } from "@/components/ui";
import { ClassTabs } from "@/components/teacher/class-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ảnh lớp của tôi" };

const STATUS: Record<string, { label: string; cls: string }> = {
  library: { label: "Trong kho", cls: "bg-black/5 text-ink-600" },
  pending: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Đã duyệt", cls: "bg-green-100 text-green-800" },
  rejected: { label: "Bị loại", cls: "bg-red-100 text-red-700" },
};

/**
 * ẢNH LỚP CỦA TÔI — ảnh các buổi mình dạy trong 60 ngày, gom theo buổi: ảnh nào đang chờ duyệt, đã duyệt (vào phiếu / học bạ
 * của em được gắn), bị loại kèm lý do để chụp lại. Muốn thêm ảnh: mở buổi dạy → "Chụp & gắn ảnh".
 */
export default async function MyPhotosPage() {
  const { caller } = await getServerCaller();
  const d = await caller.teacher.myPhotos().catch(() => null);
  return (
    <div className="space-y-4">
      <ClassTabs active="anh-lop" />
      <div>
        <h1 className="page-title">Ảnh lớp của tôi</h1>
        <p className="text-[14px] text-ink-600">Ảnh các buổi bạn dạy trong 60 ngày qua. Muốn thêm ảnh: mở buổi dạy → “Chụp &amp; gắn ảnh”.</p>
      </div>
      {!d || d.sessions.length === 0 ? <Empty>Chưa có ảnh nào. Sau buổi dạy, mở buổi → “Chụp &amp; gắn ảnh” để thêm ảnh cho phụ huynh xem.</Empty> : (
        <>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {(["pending", "approved", "rejected", "library"] as const).map((k) => d.totals[k] > 0 && <span key={k} className={`chip ${STATUS[k]!.cls}`}>{d.totals[k]} {STATUS[k]!.label.toLowerCase()}</span>)}
          </div>
          {d.sessions.map((g) => (
            <section key={g.sessionId} className="card space-y-2 p-4" aria-label={`${g.classCode} ${g.label}`}>
              <Link href={`/teacher/sessions/${g.sessionId}`} className="flex min-h-11 items-center justify-between gap-2">
                <span className="min-w-0"><span className="block truncate font-semibold">{g.className} · {g.label}</span><span className="block text-[13px] text-ink-600">{fmtDate(g.date)} · {g.photos.length} ảnh</span></span>
                <span className="shrink-0 text-[14px] font-semibold text-brand-600">Mở buổi →</span>
              </Link>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {g.photos.map((p) => (
                  <li key={p.id} className="overflow-hidden rounded-xl border border-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption ?? (p.classWide ? "Ảnh cả lớp" : "Ảnh gắn thẻ học viên")} className="h-28 w-full object-cover" loading="lazy" />
                    <div className="space-y-1 p-2 text-[12px]">
                      <div className="flex flex-wrap gap-1">
                        <span className={`chip ${STATUS[p.status]?.cls ?? "bg-black/5"}`}>{STATUS[p.status]?.label ?? p.status}</span>
                        <span className="chip bg-black/5 text-ink-600">{p.classWide ? "Cả lớp" : p.taggedCount > 0 ? `${p.taggedCount} em` : "Chưa gắn thẻ"}</span>
                      </div>
                      {p.status === "rejected" && p.rejectReason && <p className="text-red-700">Lý do: {p.rejectReason}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

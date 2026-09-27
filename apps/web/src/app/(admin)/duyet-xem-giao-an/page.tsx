import { CalendarClock, TriangleAlert } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty, fmtDate } from "@/components/ui";
import { DecideButtons, RevokeButton } from "./actions";

export const metadata = { title: "Duyệt xem giáo án" };
export const dynamic = "force-dynamic";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—");
const TONE: Record<string, string> = {
  approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-700", revoked: "bg-amber-100 text-amber-900",
  cancelled: "bg-black/5 text-ink-600", expired: "bg-black/5 text-ink-600", pending: "bg-amber-100 text-amber-900",
};

/**
 * DUYỆT XEM GIÁO ÁN — giáo viên chỉ xem giáo án trong ca dạy bài đó; ngoài ca phải xin, quản lý cơ sở
 * duyệt ở đây thì được xem đúng bài đó trong 2 giờ kể từ lúc duyệt (thu hồi sớm được).
 * Không ai tự duyệt yêu cầu của mình. Mọi thao tác ghi nhật ký; lượt mở giáo án ghi ở nhật ký tài liệu.
 */
export default async function PlanAccessApprovals({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const q = await caller.content.planAccessQueue();
  const now = Date.now();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Duyệt xem giáo án"
        desc={`Giáo viên chỉ mở được giáo án trong ca dạy bài đó (30 phút trước giờ vào lớp đến 15 phút sau giờ tan). Ngoài ca phải gửi yêu cầu kèm lý do; duyệt thì được xem đúng bài đó trong ${q.grantMinutes / 60} giờ.`}
      />

      <section className="space-y-3" aria-labelledby="cho-duyet">
        <h2 id="cho-duyet" className="font-bold">Đang chờ duyệt <span className="chip ml-1 bg-amber-100 text-amber-900">{q.pending.length}</span></h2>
        {q.pending.length === 0 ? <Empty>Không có yêu cầu nào đang chờ.</Empty> : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {q.pending.map((p) => (
              <li key={p.id} id={p.id} className={`card space-y-3 p-4 ${sp.id === p.id ? "ring-2 ring-brand-300" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.requester}</div>
                    <div className="text-sm text-ink-600">{p.lesson}</div>
                  </div>
                  <span className="text-xs text-ink-600">{p.centerCode} · gửi {dt(p.createdAt)}</span>
                </div>
                <blockquote className="rounded-lg bg-black/[0.03] px-3 py-2 text-sm">“{p.reason}”</blockquote>
                {p.upcoming ? (
                  <p className="flex items-center gap-1.5 text-sm text-ink-600"><CalendarClock className="h-4 w-4" aria-hidden />Có buổi dạy bài này: {fmtDate(p.upcoming.date)} {p.upcoming.start} · lớp {p.upcoming.classCode}</p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-amber-800"><TriangleAlert className="h-4 w-4" aria-hidden />Giáo viên không có buổi nào dạy bài này trong 14 ngày tới — cân nhắc lý do.</p>
                )}
                <DecideButtons id={p.id} grantMinutes={q.grantMinutes} disabled={p.mine} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="da-xu-ly">
        <h2 id="da-xu-ly" className="font-bold">Đã xử lý 14 ngày gần đây</h2>
        {q.recent.length === 0 ? <Empty>Chưa có.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase text-ink-600">
                <tr><th className="p-3">Giáo viên · bài</th><th className="p-3">Lý do</th><th className="p-3">Kết quả</th><th className="p-3">Người xử lý</th><th className="p-3" /></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {q.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3"><div className="font-medium">{r.requester}</div><div className="text-xs text-ink-600">{r.lesson} · {r.centerCode}</div></td>
                    <td className="max-w-xs p-3 text-xs">{r.reason}{r.decisionNote && <div className="text-ink-600">↳ {r.decisionNote}</div>}</td>
                    <td className="p-3"><span className={`chip ${TONE[r.status] ?? "bg-black/5"}`}>{r.statusLabel}</span>{r.status === "approved" && r.expiresAt && <div className="text-xs text-ink-600">đến {dt(r.expiresAt)}</div>}</td>
                    <td className="p-3 text-xs">{r.decider ?? "—"}<div className="text-ink-600">{dt(r.decidedAt)}</div></td>
                    <td className="p-3 text-right">{r.status === "approved" && r.expiresAt && new Date(r.expiresAt).getTime() > now && <RevokeButton id={r.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

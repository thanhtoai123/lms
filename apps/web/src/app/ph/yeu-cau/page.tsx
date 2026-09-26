import Link from "next/link";
import { CalendarPlus, MessageCircle, RefreshCw } from "lucide-react";
import { getDb } from "@satarobo/db";
import { hubRequests } from "@satarobo/api";
import { pickChild } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, PhMain, PhTwoCol, PhSection, dtPh } from "@/components/ph-ui";
import { CancelRequestButton } from "@/components/ph/actions";
import { AskForm } from "../tin-nhan/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu của tôi — Sata Robo", robots: { index: false } };

const STATUS_STYLE: Record<string, string> = {
  new: "bg-primary-soft text-primary",
  in_progress: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-black/5 text-ink-600",
};
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/**
 * YÊU CẦU CỦA TÔI — xin nghỉ, xin học bù, hỏi đáp: theo dõi trạng thái từng yêu cầu của các con
 * (kể cả yêu cầu CSKH ghi nhận hộ qua điện thoại / Zalo). Chỉ hiện mốc trạng thái, không hiện ghi chú nội bộ.
 */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ con?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const d = await hubRequests(getDb(), p.id);
  const kid = pickChild(d.children, sp.con);
  const open = d.items.filter((x) => x.status === "new" || x.status === "in_progress" || x.status === "approved");
  const closed = d.items.filter((x) => !open.includes(x));

  return (
    <>
      <PhHeader title="Yêu cầu của tôi" />
      <PhMain className="space-y-5">
        <PhTwoCol
          main={<>
        <nav aria-label="Gửi yêu cầu mới" className="grid grid-cols-3 gap-2">
          <Link href={`/ph/lich${kid ? `?con=${kid.id}` : ""}`} className="card flex min-h-[88px] flex-col items-center justify-center gap-1 p-2 text-center text-[14px] font-semibold">
            <CalendarPlus className="h-6 w-6 text-primary" aria-hidden />Xin nghỉ
          </Link>
          <Link href={`/ph/lich${kid ? `?con=${kid.id}` : ""}`} className="card flex min-h-[88px] flex-col items-center justify-center gap-1 p-2 text-center text-[14px] font-semibold">
            <RefreshCw className="h-6 w-6 text-primary" aria-hidden />Xin học bù
          </Link>
          <a href="#hoi-dap" className="card flex min-h-[88px] flex-col items-center justify-center gap-1 p-2 text-center text-[14px] font-semibold">
            <MessageCircle className="h-6 w-6 text-primary" aria-hidden />Hỏi đáp
          </a>
        </nav>
        <p className="px-1 text-[14px] text-ink-600">Xin nghỉ / học bù: mở <b>Lịch học</b>, chạm vào buổi cần xin — trung tâm nhận ngay trên hệ thống.</p>

        <PhSection title={`Đang xử lý (${open.length})`}>
          {open.length === 0 ? <div className="card p-4 text-ink-600">Không có yêu cầu nào đang chờ.</div> : <RequestList items={open} />}
        </PhSection>

        {closed.length > 0 && (
          <PhSection title="Đã xong">
            <RequestList items={closed.slice(0, 20)} />
          </PhSection>
        )}
          </>}
          side={
        <PhSection title="Hỏi trung tâm" id="hoi-dap" action={{ href: "/ph/tin-nhan", label: "Tin nhắn" }}>
          {kid ? (
            <div className="card p-4">
              <p className="mb-2 text-[14px] text-ink-600">Về con: <b className="text-foreground">{kid.fullName}</b>{d.children.length > 1 ? " (đổi con ở trang Hôm nay)" : ""}</p>
              <AskForm studentId={kid.id} />
            </div>
          ) : <div className="card p-4 text-ink-600">Chưa có học viên gắn với tài khoản này.</div>}
        </PhSection>
          }
        />
      </PhMain>
      <PhNav />
    </>
  );
}

type Item = Awaited<ReturnType<typeof hubRequests>>["items"][number];

function RequestList({ items }: { items: Item[] }) {
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold">{r.typeLabel}</div>
              <div className="text-[13px] text-ink-600">{r.code} · {r.studentName} · gửi {dtPh(r.createdAt)}{r.viaApp ? "" : " · qua trung tâm"}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_STYLE[r.status] ?? "bg-black/5"}`}>{r.statusLabel}</span>
          </div>
          {(r.sessionDate || r.missedDate) && <p className="mt-1 text-[14px]">{r.sessionDate ? `Buổi xin nghỉ: ${dmy(r.sessionDate)}` : `Buổi đã vắng: ${dmy(r.missedDate)}`}</p>}
          <p className="mt-1 text-[14px] text-ink-600">{r.content}</p>
          {r.resolution && <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-[14px] text-green-900"><b>Trung tâm:</b> {r.resolution}</p>}
          {r.timeline.length > 1 && (
            <ol className="mt-2 flex flex-wrap items-center gap-1 text-[12px] text-ink-600" aria-label="Tiến trình">
              {r.timeline.map((t, i) => <li key={i} className="inline-flex items-center gap-1">{i > 0 && <span aria-hidden>→</span>}{t.label} <span className="text-black/40">{dtPh(t.at)}</span></li>)}
            </ol>
          )}
          {r.canCancel && <div className="mt-2"><CancelRequestButton id={r.id} /></div>}
        </li>
      ))}
    </ul>
  );
}

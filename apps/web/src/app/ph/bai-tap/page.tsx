import { getDb } from "@satarobo/db";
import { hubHomework } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhPageHead, dtPh } from "@/components/ph-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài tập — Sata Robo" };

const NHAN_TRANG_THAI: Record<string, { text: string; style: string }> = {
  assigned: { text: "Cần làm", style: "bg-amber-100 text-amber-900" },
  returned: { text: "Cần làm lại", style: "bg-red-100 text-red-800" },
  submitted: { text: "Đã nộp", style: "bg-slate-200 text-slate-800" },
  graded: { text: "Đã chấm", style: "bg-green-100 text-green-800" },
};

/**
 * BÀI TẬP — gom bài của tất cả các con vào một chỗ: bài đang chờ lên đầu, rồi đến bài đã nộp.
 * Bấm vào bài là mở đúng trang nộp bài của học viên (`/bt/<mã>`), không phải chép lại đường dẫn.
 */
export default async function HomeworkPage() {
  const p = await requireParent();
  const d = await hubHomework(getDb(), p.id);
  const cho = d.items.filter((x) => x.dangCho);
  const xong = d.items.filter((x) => !x.dangCho);
  const nhieuCon = d.children.length > 1;

  const Bang = ({ items }: { items: typeof d.items }) => (
    <ul className="card divide-y divide-black/5">
      {items.map((h, i) => {
        const n = NHAN_TRANG_THAI[h.status] ?? { text: h.status, style: "bg-slate-200 text-slate-800" };
        return (
          <li key={`${h.link}-${i}`}>
            <a href={h.link} className="flex min-h-14 items-center justify-between gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-primary">{h.title}</span>
                <span className="block truncate text-[13px] text-ink-600">
                  {nhieuCon ? `${h.studentName} · ` : ""}{h.className ?? ""}
                  {h.dueAt ? ` · hạn ${dtPh(h.dueAt)}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${n.style}`}>{n.text}</span>
                {h.status === "graded" && h.score !== null && (
                  <span className="mt-0.5 block text-[13px] font-bold tabular-nums">{h.score}{h.maxScore ? `/${h.maxScore}` : ""}</span>
                )}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <PhMain className="space-y-5">
      <PhPageHead title="Bài tập" desc="Bài thầy cô giao cho con — bài đang chờ xếp lên đầu." />

      <section className="space-y-2" aria-label="Đang chờ làm">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-600">Đang chờ làm ({cho.length})</h3>
        {cho.length === 0 ? <Empty>Không có bài nào đang chờ. </Empty> : <Bang items={cho} />}
      </section>

      {xong.length > 0 && (
        <section className="space-y-2" aria-label="Đã nộp">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-600">Đã nộp</h3>
          <Bang items={xong.slice(0, 50)} />
        </section>
      )}
    </PhMain>
  );
}

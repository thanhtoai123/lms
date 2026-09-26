import { Sparkles } from "lucide-react";
import { getDb } from "@satarobo/db";
import { familyChildren, hubSheets } from "@satarobo/api";
import { childShortName, pickChild } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhPageHead, ChildChips, dayPh, todayPh } from "@/components/ph-ui";
import { LevelMeter } from "@/components/ph/bits";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhận xét — Sata Robo" };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * NHẬN XÉT — mọi phiếu nhận xét thầy cô đã gửi cho gia đình, mới nhất trước.
 * Trang chủ chỉ hiện phiếu gần nhất; ở đây phụ huynh đọc lại cả chặng để thấy con tiến ra sao.
 */
export default async function SheetsPage({ searchParams }: { searchParams: Promise<{ con?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const db = getDb();
  const kids = await familyChildren(db, p.id);
  const kid = pickChild(kids, sp.con && UUID.test(sp.con) ? sp.con : null);
  const today = todayPh();

  if (!kid) {
    return (
      <PhMain>
        <div className="card p-5 text-ink-600">Chưa có học viên gắn với tài khoản này.</div>
      </PhMain>
    );
  }

  const d = await hubSheets(db, p.id, kid.id);
  const items = d?.items ?? [];

  return (
    <PhMain className="space-y-4">
      <PhPageHead title={`Nhận xét của ${childShortName(kid)}`} desc="Phiếu thầy cô gửi sau mỗi buổi học — mới nhất ở trên." />
      <ChildChips kids={kids} activeId={kid.id} hrefFor={(id) => `/ph/nhan-xet?con=${id}`} />

      {items.length === 0 ? (
        <Empty>Chưa có phiếu nhận xét nào. Sau mỗi buổi, thầy cô gửi phiếu tại đây.</Empty>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {items.map((s) => (
            <li key={s.id} className="card space-y-3 p-4">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold">{s.label}</div>
                  <div className="text-[13px] text-ink-600">{dayPh(s.date, today)}{s.teacherName ? ` · GV ${s.teacherName}` : ""}</div>
                  {s.lessonTitle && <div className="text-[13px] text-ink-600">Bài: {s.lessonTitle}</div>}
                </div>
                {s.glance.average !== null && (
                  <div className="shrink-0 rounded-2xl bg-primary-soft px-3 py-2 text-center text-primary">
                    <div className="text-[20px] font-extrabold leading-none">{s.glance.average}</div>
                    <div className="text-[11px] font-semibold">/ 4</div>
                  </div>
                )}
              </header>

              {s.glance.rated > 0 && (
                <p className="text-[14px]">
                  Đạt {s.glance.reached}/{s.glance.rated} tiêu chí
                  {s.glance.best ? <> · mạnh nhất: <b>{s.glance.best}</b></> : null}
                  {s.glance.practice ? <> · luyện thêm: <b className="text-accent-700">{s.glance.practice}</b></> : null}
                </p>
              )}

              <ul className="space-y-1.5">
                {s.criteria.map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-[14px]">
                      <span className="block truncate">{c.label}</span>
                      {c.level && <span className="block text-[12px] text-ink-600">{c.level}</span>}
                    </span>
                    <LevelMeter value={c.value} label={c.label} />
                  </li>
                ))}
              </ul>

              {s.objective && <p className="rounded-xl bg-muted px-3 py-2 text-[13px]">{s.objective}</p>}
              {s.remark && <blockquote className="border-l-4 border-primary/30 pl-3 text-[14px] italic">“{s.remark}”</blockquote>}
              {s.productNote && <p className="text-[14px]"><b>Sản phẩm:</b> {s.productNote}</p>}
              {s.highlights.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Điểm nổi bật">
                  {s.highlights.map((h) => (
                    <li key={h} className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1 text-[12px] font-semibold text-accent-700">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />{h}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </PhMain>
  );
}

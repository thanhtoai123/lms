/**
 * HỌC BẠ MỐC — thẻ hiển thị dùng chung (hồ sơ học tập, cổng phụ huynh, trang in riêng một học bạ).
 * Học bạ mới (thang 4) kèm số liệu tổng hợp từ phiếu buổi: chuyên cần, tỷ lệ đạt mục tiêu bài,
 * xu hướng từng tiêu chí, thẻ nổi bật. Học bạ cũ (thang 5) vẫn hiển thị như trước.
 */
import { Award, CalendarCheck, Sparkles, Sprout, Target, Heart } from "lucide-react";
import { type MilestoneCardView } from "@satarobo/core";
import { BrandHeader, RubricBar, TrendChip, fmtDay, num1, pct } from "./parts";

export function MilestoneCard({ card, standalone = false }: { card: MilestoneCardView; standalone?: boolean }) {
  const a = card.aggregate;
  const judged = a ? a.objective.achieved + a.objective.partial + a.objective.notYet : 0;
  const title = `Học bạ · ${card.label}`;
  return (
    <article className="hs-milestone hs-avoid overflow-hidden rounded-2xl border-2 border-primary/20 bg-card">
      {standalone ? (
        <BrandHeader title={title} sub={<><span>{card.studentName}</span>{card.courseName && <span>{card.courseName}</span>}{card.className && <span>{card.className}</span>}{card.publishedAt && <span>Gửi phụ huynh {fmtDay(card.publishedAt)}</span>}</>} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-primary to-primary-dark px-4 py-2.5 text-white">
          <div className="flex items-center gap-2 font-extrabold"><Award className="h-4 w-4 text-accent-200" aria-hidden /> {title}</div>
          <div className="text-xs text-white/85">{card.publishedAt ? `Gửi PH ${fmtDay(card.publishedAt)}` : ""}</div>
        </div>
      )}

      <div className="space-y-3 p-4 print:space-y-2 print:p-3">
        {a && (
          <section className="hs-avoid grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Tổng hợp giai đoạn">
            <Stat icon={CalendarCheck} label="Chuyên cần" value={`${a.attendance.attended}/${a.attendance.total}`} sub={`buổi ${a.period.fromSeq}–${a.period.toSeq}`} />
            <Stat icon={Target} label="Đạt mục tiêu bài" value={judged ? `${a.objective.achieved}/${judged}` : "—"} sub={pct(a.objective.rate)} />
            <Stat icon={Sparkles} label="Điểm TB giai đoạn" value={a.overall.average != null ? `${num1(a.overall.average)}/4` : "—"} sub={<TrendChip trend={a.overall.trend} small />} />
            <Stat icon={Sprout} label="Phiếu buổi" value={String(a.sessions)} sub="đã tổng hợp" />
          </section>
        )}

        <section className="hs-avoid grid gap-x-5 sm:grid-cols-2 print:grid-cols-2" aria-label="Điểm theo tiêu chí">
          {card.scores.map((s) => (
            <RubricBar
              key={s.label}
              label={s.label}
              value={s.score}
              scale={card.scale}
              hint={false}
              extra={<>{s.average != null && <span className="text-[11px] text-muted-foreground">TB buổi {num1(s.average)}</span>}<TrendChip trend={s.trend} small /></>}
            />
          ))}
        </section>
        {card.average != null && (
          <p className="text-right text-xs text-muted-foreground">Điểm trung bình tiêu chí: <b className="text-primary">{num1(card.average)}/{card.scale}</b></p>
        )}

        {a && a.topHighlights.length > 0 && (
          <section className="hs-avoid flex flex-wrap items-center gap-1.5 text-sm" aria-label="Điểm nổi bật trong giai đoạn">
            <span className="text-xs font-bold text-muted-foreground">Nổi bật trong giai đoạn:</span>
            {a.topHighlights.map((h) => <span key={h.label} className="chip bg-accent-100 font-semibold text-accent-700">{h.label} × {h.count}</span>)}
          </section>
        )}

        {card.teacherComment && (
          <section className="hs-avoid rounded-xl border-l-4 border-accent-500 bg-accent-50/60 p-3">
            <div className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Heart className="h-4 w-4 text-primary" aria-hidden /> Nhận xét của giáo viên</div>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{card.teacherComment}</p>
          </section>
        )}
        {(card.strengths || card.improvements) && (
          <section className="hs-avoid grid gap-2 text-sm sm:grid-cols-2 print:grid-cols-2">
            {card.strengths && <div className="rounded-lg bg-brand-50 p-2.5"><div className="text-xs font-bold text-primary">Điểm mạnh</div><p className="whitespace-pre-line">{card.strengths}</p></div>}
            {card.improvements && <div className="rounded-lg bg-green-50 p-2.5"><div className="text-xs font-bold text-green-800">Con có thể phát triển thêm</div><p className="whitespace-pre-line">{card.improvements}</p></div>}
          </section>
        )}
        {card.authorName && <div className="text-right text-[11px] text-muted-foreground">Giáo viên: {card.authorName}</div>}
      </div>
    </article>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Award; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-brand-50/70 p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5 text-brand-400" aria-hidden /> {label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-primary print:text-base">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

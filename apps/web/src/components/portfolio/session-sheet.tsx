/**
 * PHIẾU NHẬN XÉT MỘT BUỔI HỌC — dùng chung cho hồ sơ học tập (màn hình + bản in 2 phiếu / trang A4),
 * trang in riêng một phiếu (khổ A5) và cổng phụ huynh. Không hook → render được ở máy chủ.
 *
 * Nội dung lấy từ BẢN CHỤP lúc phát hành (tiêu chí, mô tả mức, bài học, GV…) — in lại lúc nào cũng
 * giống hệt lúc phát hành.
 */
import { BookOpen, CalendarDays, Camera, Puzzle, Sparkles, Target, UserRound, Heart } from "lucide-react";
import { OBJECTIVE_RESULT_VI, type ObjectiveResult, type SessionSheetView } from "@satarobo/core";
import { BrandHeader, CenterFooter, RubricBar, fmtWeekday, num1 } from "./parts";

const OBJ_TONE: Record<ObjectiveResult, string> = {
  achieved: "bg-primary text-white",
  partial: "bg-brand-100 text-primary",
  not_yet: "bg-accent-100 text-accent-700",
};

export function SessionSheet({
  sheet, variant = "full", showFooter = true,
}: {
  sheet: SessionSheetView;
  /** full: phiếu riêng (có đầu phiếu thương hiệu); compact: trong hồ sơ (2 phiếu / trang A4) */
  variant?: "full" | "compact";
  showFooter?: boolean;
}) {
  const c = sheet.snapshot.context;
  const compact = variant === "compact";
  const draft = sheet.status !== "published";
  const meta = (
    <>
      <span>{fmtWeekday(c.date)}</span>
      <span>{c.label}</span>
      {c.makeup && <span className="rounded-full bg-accent-500 px-2 font-bold text-white">Học bù</span>}
    </>
  );
  return (
    <article className={`hs-sheet hs-avoid overflow-hidden rounded-2xl border border-border bg-card ${compact ? "" : "shadow-sm print:rounded-none print:border-0 print:shadow-none"}`}>
      {compact ? (
        <div className="hs-avoid flex flex-wrap items-center justify-between gap-2 border-b border-border bg-brand-50/70 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-primary">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden /> {fmtWeekday(c.date)} · {c.label}
          </div>
          <div className="flex items-center gap-1.5">
            {c.makeup && <span className="chip bg-accent-500 font-bold text-white">Học bù</span>}
            {sheet.average != null && <span className="chip bg-primary/10 font-bold text-primary">TB {num1(sheet.average)}/4</span>}
          </div>
        </div>
      ) : (
        <BrandHeader
          title="Phiếu nhận xét buổi học"
          sub={meta}
          right={draft ? <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">Bản nháp</span> : sheet.revision > 1 ? <span className="text-[11px] text-white/80">Đã chỉnh sửa lần {sheet.revision - 1}</span> : null}
        />
      )}

      <div className={compact ? "space-y-2.5 p-4 print:space-y-1.5 print:p-3" : "space-y-3 p-4 sm:p-5 print:space-y-2 print:p-3"}>
        {!compact && (
          <section className="hs-avoid grid gap-2 rounded-xl bg-brand-50/60 p-3 text-sm sm:grid-cols-2">
            <Info icon={UserRound} label="Học viên" value={`${c.studentName}${c.studentCode ? ` · ${c.studentCode}` : ""}`} strong />
            <Info icon={BookOpen} label="Khoá / lớp" value={[c.courseName, c.classCode].filter(Boolean).join(" · ") || null} />
            <Info icon={UserRound} label="Giáo viên" value={c.teacherName} />
            <Info icon={CalendarDays} label="Buổi học" value={`${c.label}${c.startTime ? ` · ${c.startTime.slice(0, 5)}` : ""}`} />
          </section>
        )}

        {/* Bài học + mục tiêu bài + kết quả */}
        <section className="hs-avoid rounded-xl border border-border p-3 print:p-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bài học</div>
              <div className="font-bold text-foreground">{c.lessonTitle ?? "—"}</div>
            </div>
            {sheet.objectiveResult && <span className={`chip px-3 py-1 text-xs font-bold ${OBJ_TONE[sheet.objectiveResult]}`}>{OBJECTIVE_RESULT_VI[sheet.objectiveResult]}</span>}
          </div>
          {c.lessonObjectives && (
            <p className="mt-1 flex gap-1.5 text-sm text-foreground/80"><Target className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" aria-hidden /><span className="whitespace-pre-line">{c.lessonObjectives}</span></p>
          )}
        </section>

        {/* Tiêu chí — thanh 4 nấc */}
        <section className={`hs-avoid grid gap-x-5 ${compact ? "sm:grid-cols-2 print:grid-cols-2" : "sm:grid-cols-2 print:grid-cols-2"}`} aria-label="Đánh giá theo tiêu chí">
          {sheet.snapshot.criteria.map((cr) => (
            <RubricBar key={cr.key} label={cr.label} value={cr.value} levels={cr.levels} dense={compact} hint={!compact} />
          ))}
        </section>

        {sheet.highlights.length > 0 && (
          <section className="hs-avoid flex flex-wrap items-center gap-1.5" aria-label="Điểm nổi bật">
            <Sparkles className="h-4 w-4 text-accent-500" aria-hidden />
            {sheet.highlights.map((h) => <span key={h} className="chip bg-accent-100 font-semibold text-accent-700">{h}</span>)}
          </section>
        )}

        {sheet.productNote && (
          <Block icon={Puzzle} title="Sản phẩm của bé" text={sheet.productNote} tint="bg-accent-100 text-accent-700" />
        )}
        {sheet.remark && (
          <Block icon={Heart} title="Nhận xét của giáo viên" text={sheet.remark} tint="bg-primary/10 text-primary" />
        )}

        {sheet.media.length > 0 && (
          <section className="hs-avoid" aria-label="Ảnh sản phẩm">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Camera className="h-3.5 w-3.5" aria-hidden /> Hình ảnh trong buổi</div>
            <div className="grid grid-cols-2 gap-2">
              {sheet.media.slice(0, compact ? 2 : 4).map((m) => (
                <figure key={m.id} className="overflow-hidden rounded-lg border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.caption ?? "Ảnh buổi học"} className={`w-full object-cover ${compact ? "h-24 print:h-20" : "h-36 print:h-28"}`} loading="lazy" />
                  {m.caption && !compact && <figcaption className="truncate px-2 py-1 text-[11px] text-muted-foreground">{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        {compact && c.teacherName && <div className="text-right text-[11px] text-muted-foreground">GV: {c.teacherName}{sheet.revision > 1 ? ` · đã chỉnh sửa lần ${sheet.revision - 1}` : ""}</div>}
      </div>
      {!compact && showFooter && <CenterFooter center={sheet.center} />}
    </article>
  );
}

function Info({ icon: Icon, label, value, strong }: { icon: typeof UserRound; label: string; value: string | null; strong?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`break-words ${strong ? "font-bold text-foreground" : "text-foreground"}`}>{value}</div>
      </div>
    </div>
  );
}

function Block({ icon: Icon, title, text, tint }: { icon: typeof UserRound; title: string; text: string; tint: string }) {
  return (
    <section className="hs-avoid flex gap-2.5">
      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tint}`} aria-hidden><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0">
        <div className="text-xs font-bold text-foreground">{title}</div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{text}</p>
      </div>
    </section>
  );
}

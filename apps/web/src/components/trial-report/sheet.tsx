/**
 * PHIẾU ĐÁNH GIÁ BUỔI HỌC THỬ — component hiển thị DÙNG CHUNG cho:
 *  - trang phụ huynh `/pdg/[token]` (máy chủ render),
 *  - khung "Xem trước" trong drawer quản trị (trình duyệt render),
 *  - trang in nội bộ `/phieu-danh-gia/[id]`.
 *
 * Không dùng hook, không import mã chỉ-máy-chủ → dùng được ở cả hai phía.
 * Thiết kế mobile-first; khi in: khổ A4 một trang (xem `TrialReportPrintStyle`),
 * giữ màu nền, không cắt khối ngang trang, ẩn nút bấm.
 */
import {
  CalendarDays, Cake, CircleCheck, Circle, GraduationCap, Hash, Heart, Lightbulb, MapPin, Phone, Puzzle, Route, Sparkles, Sprout, Trophy, UserRound,
} from "lucide-react";
import {
  TRIAL_READINESS_VI, TRIAL_READINESS_HINT, summarizeLevels, levelIndex,
  type TrialReportView, type TrialReportAnswerCriterion, type TrialReadiness,
} from "@satarobo/core";

const TZ = "Asia/Ho_Chi_Minh";

function fmtDay(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+07:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtSession(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const day = d.toLocaleDateString("vi-VN", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  return `${time} · ${day.charAt(0).toUpperCase()}${day.slice(1)}`;
}

/** Màu theo nấc: nấc thấp dùng cam nhấn (tích cực, không đỏ), nấc cao dùng tím thương hiệu */
const LEVEL_FILL = ["bg-accent-500", "bg-brand-400", "bg-primary"] as const;
const LEVEL_TEXT = ["text-accent-700", "text-brand-500", "text-primary"] as const;
const READINESS_TONE: Record<TrialReadiness, { box: string; badge: string }> = {
  ready: { box: "border-primary/30 bg-gradient-to-br from-brand-50 to-white", badge: "bg-primary text-white" },
  one_more_trial: { box: "border-accent-200 bg-gradient-to-br from-accent-50 to-white", badge: "bg-accent-500 text-white" },
  not_yet: { box: "border-border bg-muted/60", badge: "bg-foreground/80 text-white" },
};

function tone(idx: number, n: number) {
  // Quy mọi thang về 3 màu: thấp nhất / giữa / cao nhất
  if (idx < 0) return 0;
  if (n <= 1) return 2;
  return Math.round((idx / (n - 1)) * 2);
}

/** Thanh nấc tô màu cho một tiêu chí; mức đã chọn in đậm */
function LevelBar({ c, icon }: { c: TrialReportAnswerCriterion; icon?: "heart" }) {
  const idx = levelIndex(c);
  const t = tone(idx, c.levels.length);
  return (
    <div className="pdg-block py-2.5 print:py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{c.label}</span>
        <span className={`shrink-0 text-sm font-bold ${idx >= 0 ? LEVEL_TEXT[t] : "text-muted-foreground"}`}>
          {idx >= 0 ? c.levels[idx]!.label : "Chưa đánh giá"}
        </span>
      </div>
      <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${c.levels.length}, minmax(0, 1fr))` }} role="img" aria-label={`${c.label}: ${idx >= 0 ? c.levels[idx]!.label : "chưa đánh giá"} (${idx + 1}/${c.levels.length})`}>
        {c.levels.map((l, i) => (
          <div key={l.value} className="min-w-0">
            <div className={`flex h-2.5 items-center justify-center rounded-full ${i <= idx ? LEVEL_FILL[t] : "bg-brand-100/70"}`}>
              {icon === "heart" && i <= idx && <Heart className="h-2 w-2 fill-white text-white" aria-hidden />}
            </div>
            <div className={`mt-1 truncate text-center text-[11px] leading-tight ${i === idx ? `font-bold ${LEVEL_TEXT[t]}` : "text-muted-foreground"}`}>{l.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, strong }: { icon: typeof Hash; label: string; value: string | null; strong?: boolean }) {
  if (!value) return null; // Ẩn trường không có dữ liệu — phiếu không bao giờ in chữ giữ chỗ
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`break-words ${strong ? "text-lg font-bold text-foreground print:text-base" : "text-sm font-medium text-foreground"}`}>{value}</div>
      </div>
    </div>
  );
}

function Comment({ icon: Icon, title, text, tint }: { icon: typeof Hash; title: string; text: string | null; tint: string }) {
  if (!text?.trim()) return null;
  return (
    <div className="pdg-block flex gap-3">
      <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tint}`} aria-hidden><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-foreground">{title}</div>
        <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90 print:text-sm">{text.trim()}</p>
      </div>
    </div>
  );
}

export function TrialReportSheet({
  report, actions, preview = false,
}: {
  report: TrialReportView;
  /** Khối hành động cho phụ huynh (nút đăng ký tư vấn / gọi cơ sở) — tự ẩn khi in */
  actions?: React.ReactNode;
  /** Xem trước / bản nháp: hiện dấu "BẢN NHÁP" và chỗ trống gợi ý */
  preview?: boolean;
}) {
  const summary = summarizeLevels(report.answers);
  const skillGroups = report.answers.groups.filter((g) => g.kind === "skill");
  const interest = report.answers.groups.filter((g) => g.kind === "interest").flatMap((g) => g.criteria);
  const issued = fmtDay(report.issuedAt);
  const session = fmtSession(report.sessionAt);
  const hasComments = !!(report.strengths?.trim() || report.growth?.trim() || report.productNote?.trim());
  const draft = report.status !== "published";
  const tone3 = report.readiness ? READINESS_TONE[report.readiness] : null;

  return (
    <article className="pdg-sheet mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      {/* Đầu phiếu */}
      <header className="pdg-block relative bg-gradient-to-br from-primary to-primary-darker px-5 pb-5 pt-4 text-white print:px-4 print:pb-3 print:pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-xl bg-white/10" />
            <span className="text-lg font-extrabold tracking-tight">Sata Robo</span>
          </div>
          {draft && (
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">
              {report.status === "revoked" ? "Đã thu hồi" : "Bản nháp"}
            </span>
          )}
        </div>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight print:mt-2 print:text-xl">Phiếu đánh giá buổi học thử</h1>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/80">
          <span>Mã phiếu <b className="font-mono text-white">{report.code}</b></span>
          {issued && <span>Ngày {issued}</span>}
        </div>
        <div className="absolute -bottom-3 right-5 hidden h-6 w-24 rounded-full bg-accent-500/90 sm:block print:hidden" aria-hidden />
      </header>

      <div className="space-y-4 p-4 sm:p-6 print:space-y-2.5 print:p-3">
        {/* Thông tin bé */}
        <section className="pdg-block rounded-xl border border-border bg-brand-50/60 p-4 print:p-3" aria-label="Thông tin học sinh">
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-3 print:gap-2">
            <div className="sm:col-span-2 print:col-span-3">
              <InfoRow icon={UserRound} label="Họ tên học sinh" value={report.childName} strong />
            </div>
            <InfoRow icon={Cake} label="Ngày sinh" value={fmtDay(report.dateOfBirth)} />
            {report.studentCode
              ? <InfoRow icon={Hash} label="Mã học sinh" value={report.studentCode} />
              : <InfoRow icon={Hash} label="Mã phiếu" value={report.code} />}
            <InfoRow icon={GraduationCap} label="Bộ môn trải nghiệm" value={report.courseName} />
            <InfoRow icon={CalendarDays} label="Thời gian trải nghiệm" value={session} />
            <InfoRow icon={UserRound} label="Giáo viên nhận xét" value={report.teacherName} />
          </div>
        </section>

        {/* Nhận xét của giáo viên — phần phụ huynh đọc nhiều nhất nên đặt ngay sau thông tin */}
        {(hasComments || preview) && (
          <section className="pdg-block rounded-xl border-l-4 border-accent-500 bg-accent-50/60 p-4 print:p-3" aria-label="Nhận xét của giáo viên">
            <h2 className="mb-3 text-base font-extrabold text-foreground print:mb-1.5">Nhận xét của giáo viên</h2>
            {hasComments ? (
              <div className="space-y-3 print:space-y-1.5">
                <Comment icon={Sparkles} title="Điểm nổi bật của bé" text={report.strengths} tint="bg-primary/10 text-primary" />
                <Comment icon={Sprout} title="Bé có thể phát triển thêm" text={report.growth} tint="bg-green-100 text-green-700" />
                <Comment icon={Puzzle} title="Sản phẩm bé làm được trong buổi" text={report.productNote} tint="bg-accent-100 text-accent-700" />
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">Giáo viên chưa viết nhận xét.</p>
            )}
          </section>
        )}

        {/* Tóm tắt nhanh */}
        {summary.answered > 0 && (
          <section className="pdg-block flex flex-wrap items-center gap-3 rounded-xl bg-primary px-4 py-3 text-white print:py-2" aria-label="Tóm tắt">
            <Lightbulb className="h-5 w-5 shrink-0 text-accent-200" aria-hidden />
            <div className="min-w-0 flex-1 text-[15px] font-bold print:text-sm">{summary.headline}</div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/20 sm:w-40" aria-hidden>
              {summary.byLevel.map((n, i) => n > 0 && (
                <div key={i} className={i === summary.byLevel.length - 1 ? "bg-white" : i === 0 ? "bg-accent-500" : "bg-brand-300"} style={{ width: `${(n / Math.max(1, summary.total)) * 100}%` }} />
              ))}
            </div>
          </section>
        )}

        {/* Hai nhóm tiêu chí */}
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-2.5">
          {skillGroups.map((g) => (
            <section key={g.key} className="pdg-block rounded-xl border border-border p-4 print:p-3" aria-label={g.title}>
              <h2 className="text-base font-extrabold text-foreground">{g.title}</h2>
              <div className="divide-y divide-border">
                {g.criteria.map((c) => <LevelBar key={c.key} c={c} />)}
              </div>
            </section>
          ))}
        </div>

        {/* Mức độ yêu thích + kết quả */}
        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr] print:grid-cols-[1fr_1.4fr] print:gap-2.5">
          {interest.length > 0 && (
            <section className="pdg-block rounded-xl border border-border p-4 print:p-3" aria-label="Mức độ yêu thích">
              <h2 className="flex items-center gap-1.5 text-base font-extrabold text-foreground"><Heart className="h-4 w-4 fill-accent-500 text-accent-500" aria-hidden /> Mức độ yêu thích</h2>
              {interest.map((c) => <LevelBar key={c.key} c={c} icon="heart" />)}
            </section>
          )}

          <section className={`pdg-block rounded-xl border-2 p-4 print:p-3 ${tone3?.box ?? "border-dashed border-border"}`} aria-label="Kết quả đánh giá">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Kết quả đánh giá</h2>
            {report.readiness ? (
              <>
                <div className={`mt-1.5 inline-flex rounded-full px-3 py-1 text-sm font-bold ${tone3?.badge ?? ""}`}>{TRIAL_READINESS_VI[report.readiness]}</div>
                <p className="mt-1.5 text-sm text-foreground/80">{TRIAL_READINESS_HINT[report.readiness]}</p>
              </>
            ) : (
              <p className="mt-1 text-sm italic text-muted-foreground">Chưa có kết quả.</p>
            )}
            {report.recommendedCourseName && (
              <div className="mt-3 rounded-lg bg-card/80 p-3 ring-1 ring-primary/15 print:mt-2 print:p-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"><Route className="h-3.5 w-3.5" aria-hidden /> Khoá học đề xuất</div>
                <div className="mt-0.5 text-lg font-extrabold text-foreground print:text-base">{report.recommendedCourseName}</div>
                {report.recommendedLevel && <div className="text-sm text-foreground/80">Cấp độ bắt đầu: <b>{report.recommendedLevel}</b></div>}
                {report.recommendationNote && <p className="mt-1 text-sm text-foreground/80">{report.recommendationNote}</p>}
              </div>
            )}
          </section>
        </div>

        {/* Đề xuất thêm */}
        <section className="pdg-block grid gap-2 sm:grid-cols-2 print:grid-cols-2" aria-label="Đề xuất thêm">
          <Flag on={report.pathway} icon={Route} yes="Định hướng lộ trình Pathway lấy chứng chỉ quốc tế" no="Chưa cần định hướng lộ trình Pathway ở thời điểm này" />
          <Flag on={report.competitionPotential} icon={Trophy} yes="Có tiềm năng tham gia đội tuyển thi đấu quốc tế" no="Chưa cần tham gia đội tuyển thi đấu ở thời điểm này" />
        </section>

        {actions && <div className="pdg-noprint print:hidden">{actions}</div>}
      </div>

      {/* Chân phiếu — thông tin cơ sở lấy từ bảng centers */}
      <footer className="pdg-block border-t border-border bg-muted/50 px-5 py-4 text-sm print:px-4 print:py-2">
        <div className="font-bold text-foreground">Sata Robo · {report.center.name}</div>
        <div className="mt-1 flex flex-col gap-1 text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4 print:flex-row print:gap-x-4">
          {report.center.address && <span className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{report.center.address}</span>}
          {report.center.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{report.center.phone}</span>}
        </div>
      </footer>
    </article>
  );
}

function Flag({ on, icon: Icon, yes, no }: { on: boolean; icon: typeof Hash; yes: string; no: string }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 print:p-2 ${on ? "border-primary/25 bg-primary-soft" : "border-border bg-card"}`}>
      {on ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/60" aria-hidden />}
      <div className="min-w-0">
        <div className={`text-sm ${on ? "font-bold text-foreground" : "text-muted-foreground"}`}>{on ? yes : no}</div>
      </div>
      <Icon className={`ml-auto mt-0.5 h-4 w-4 shrink-0 ${on ? "text-accent-500" : "text-muted-foreground/40"}`} aria-hidden />
    </div>
  );
}

/**
 * CSS in cho trang có phiếu: khổ A4 lề 12mm, co cỡ chữ gốc để vừa MỘT trang,
 * giữ màu nền, không cắt khối ngang trang. Chỉ render trên trang phiếu nên không ảnh hưởng trang khác.
 * (CSP của dự án cho phép style nội tuyến — xem packages/core/src/security/headers.ts.)
 */
export function TrialReportPrintStyle() {
  return <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />;
}

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html { font-size: 11.5px; background: #fff; }
  body { background: #fff !important; }
  .pdg-sheet, .pdg-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pdg-block { break-inside: avoid; page-break-inside: avoid; }
  .pdg-noprint { display: none !important; }
}`;

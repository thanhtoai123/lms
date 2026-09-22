/**
 * HỒ SƠ HỌC TẬP — tài liệu nhiều trang dùng chung cho: trang quản trị, cổng phụ huynh, link chia sẻ
 * `/hs/<token>`, trang in nội bộ (và bộ xuất PDF phía máy chủ).
 *
 * Bố cục in A4 (xem `PortfolioPrintStyle`):
 *   1. Trang bìa: logo + "Hồ sơ học tập", tên bé, mã HV, giai đoạn, cơ sở.
 *   2. Trang tóm tắt: lộ trình các khoá (dòng thời gian), biểu đồ tiến bộ, chuyên cần, chứng chỉ.
 *   3. Mỗi khoá (sang trang mới): tổng quan khoá + mạng nhện năng lực, học bạ mốc, rồi phiếu buổi 2 phiếu / trang.
 *   4. Trang sản phẩm: ảnh đã duyệt (phụ huynh đồng ý đăng ảnh).
 * Không hook, không mã chỉ-máy-chủ → render được ở cả hai phía.
 */
import { Award, CalendarCheck, GraduationCap, Image as ImageIcon, MapPin, Route, School, Sparkles } from "lucide-react";
import { pairSheets, type PortfolioView, type PortfolioAttendance } from "@satarobo/core";
import { CenterFooter, fmtDay, num1, pct } from "./parts";
import { ProgressLine, RadarChart } from "./charts";
import { SessionSheet } from "./session-sheet";
import { MilestoneCard } from "./milestone-card";

export function PortfolioDocument({ view, actions }: { view: PortfolioView; actions?: React.ReactNode }) {
  const period = view.period.from && view.period.to ? `${fmtDay(view.period.from)} – ${fmtDay(view.period.to)}` : null;
  const empty = view.totals.sheets === 0 && view.totals.milestones === 0 && view.certificates.length === 0;
  return (
    <div className="hs-doc mx-auto w-full max-w-3xl space-y-5 print:max-w-none print:space-y-0">
      {/* 1. Trang bìa */}
      <section className="hs-page hs-cover relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-dark to-primary-darker p-6 text-white shadow-md sm:p-10 print:rounded-none print:shadow-none" aria-label="Trang bìa">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent-500/25" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl bg-white/10" />
          <div>
            <div className="text-2xl font-extrabold tracking-tight">Sata Robo</div>
            <div className="text-xs text-white/75">Giáo dục STEM · Robotics</div>
          </div>
        </div>
        <div className="relative mt-10 sm:mt-16 print:mt-24">
          <div className="text-sm font-bold uppercase tracking-[0.2em] text-accent-200">Hồ sơ học tập</div>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl print:text-5xl">{view.student.fullName}</h1>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 print:mt-10 print:text-base">
            {view.student.code && <CoverRow label="Mã học viên" value={view.student.code} />}
            {view.student.grade != null && <CoverRow label="Lớp (trường phổ thông)" value={`Lớp ${view.student.grade}`} />}
            <CoverRow label="Phạm vi" value={view.scopeLabel} />
            {period && <CoverRow label="Giai đoạn" value={period} />}
            {view.center && <CoverRow label="Cơ sở" value={view.center.name} />}
            <CoverRow label="Lập ngày" value={fmtDay(view.generatedAt) ?? ""} />
          </dl>
        </div>
        <div className="relative mt-8 grid grid-cols-3 gap-2 text-center print:mt-24">
          <CoverStat value={String(view.totals.courses)} label="khoá học" />
          <CoverStat value={String(view.totals.sheets)} label="phiếu nhận xét buổi" />
          <CoverStat value={String(view.certificates.length)} label="chứng chỉ" />
        </div>
        {actions && <div className="relative mt-6 print:hidden">{actions}</div>}
      </section>

      {empty && (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground print:hidden">
          Chưa có phiếu nhận xét buổi học nào được phát hành trong phạm vi này. Phiếu được phát hành khi giáo viên hoàn tất buổi học.
        </p>
      )}

      {/* 2. Tóm tắt */}
      <section className="hs-page hs-break space-y-4 rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0" aria-label="Tóm tắt">
        <SectionTitle icon={Route} title="Lộ trình học tập" />
        <ol className="relative space-y-3 border-l-2 border-brand-200 pl-5">
          {view.courses.map((c) => (
            <li key={c.enrollmentId} className="hs-avoid relative">
              <span className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${c.certificate ? "bg-accent-500" : c.status === "active" ? "bg-primary" : "bg-brand-300"}`} aria-hidden />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-bold text-foreground">{c.courseName}{c.courseLevel ? <span className="font-normal text-muted-foreground"> · {c.courseLevel}</span> : null}</div>
                <span className="chip bg-brand-50 text-primary">{c.statusLabel}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {c.classCode} · {c.centerName} · {fmtDay(c.from) ?? "—"}{c.to ? ` → ${fmtDay(c.to)}` : " → nay"}
              </div>
              <div className="mt-0.5 text-xs text-foreground/80">
                {c.sheets.length} phiếu buổi · {c.milestones.length} học bạ · chuyên cần {pct(c.attendance.rate)}{c.average != null ? ` · điểm TB ${num1(c.average)}/4` : ""}
                {c.certificate && <> · <b className="text-accent-700">Chứng chỉ {c.certificate.certificateNo}</b></>}
              </div>
            </li>
          ))}
          {view.courses.length === 0 && <li className="text-sm text-muted-foreground">Chưa có khoá học nào trong phạm vi này.</li>}
        </ol>

        <SectionTitle icon={Sparkles} title="Biểu đồ tiến bộ" />
        <ProgressLine points={view.progress} />

        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div className="hs-avoid">
            <SectionTitle icon={CalendarCheck} title="Chuyên cần" />
            <AttendanceBar a={view.attendance} />
          </div>
          <div className="hs-avoid">
            <SectionTitle icon={Award} title="Chứng chỉ" />
            {view.certificates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có chứng chỉ trong giai đoạn này.</p>
            ) : (
              <ul className="space-y-1.5">
                {view.certificates.map((c) => (
                  <li key={c.certificateNo} className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm">
                    <div className="font-bold">{c.courseName}</div>
                    <div className="text-xs text-foreground/80">{c.grade} · số {c.certificateNo}{c.issuedAt ? ` · ${fmtDay(c.issuedAt)}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* 3. Từng khoá */}
      {view.courses.filter((c) => c.sheets.length || c.milestones.length).map((c) => (
        <section key={c.enrollmentId} className="hs-course hs-break space-y-4" aria-label={`Khoá ${c.courseName}`}>
          <div className="hs-avoid rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-accent-700">Khoá học</div>
                <h2 className="text-2xl font-extrabold text-primary">{c.courseName}</h2>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><School className="h-3.5 w-3.5" aria-hidden /> {c.className} ({c.classCode})</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {c.centerName}</span>
                  <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" aria-hidden /> {c.statusLabel}</span>
                </div>
              </div>
              <div className="text-right text-sm">
                <div>Chuyên cần <b className="text-primary">{pct(c.attendance.rate)}</b></div>
                <div className="text-xs text-muted-foreground">{c.attendance.present + c.attendance.late + c.attendance.makeup}/{c.attendance.total} buổi có mặt</div>
                {c.average != null && <div className="text-xs text-muted-foreground">Điểm TB các buổi {num1(c.average)}/4</div>}
              </div>
            </div>
            {c.radar.length > 0 && (
              <div className="mt-3 grid items-center gap-4 sm:grid-cols-[1fr_1.2fr] print:grid-cols-[1fr_1.2fr]">
                <RadarChart axes={c.radar} />
                <ul className="space-y-1.5 text-sm">
                  {c.radar.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
                      <span>{r.label}</span>
                      <b className="text-primary">{r.value != null ? `${num1(r.value)}/4` : "—"}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {c.milestones.map((m) => <MilestoneCard key={m.id} card={m} />)}

          {c.sheets.length > 0 && (
            <div className="space-y-3 print:space-y-0">
              <h3 className="hs-avoid text-sm font-bold uppercase tracking-wide text-muted-foreground print:hidden">Phiếu nhận xét từng buổi ({c.sheets.length})</h3>
              {pairSheets(c.sheets).map((pair, i) => (
                <div key={i} className="hs-pair space-y-3 print:space-y-3">
                  {pair.map((s) => <SessionSheet key={s.id} sheet={s} variant="compact" />)}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* 4. Sản phẩm */}
      {view.gallery.length > 0 && (
        <section className="hs-break space-y-3 rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0" aria-label="Sản phẩm của bé">
          <SectionTitle icon={ImageIcon} title="Sản phẩm & khoảnh khắc" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {view.gallery.map((g) => (
              <figure key={g.id} className="hs-avoid overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt={g.caption ?? "Sản phẩm của bé"} className="h-32 w-full object-cover print:h-36" loading="lazy" />
                <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                  {g.caption ?? g.courseName}{g.date ? ` · ${fmtDay(g.date)}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-2xl border border-border print:rounded-none print:border-0">
        <CenterFooter center={view.center} />
        <p className="px-5 pb-3 text-[11px] text-muted-foreground print:px-4">
          Mỗi phiếu nhận xét được giáo viên phát hành khi hoàn tất buổi học và không thay đổi sau đó — bản in này giống hệt nội dung đã gửi phụ huynh.
        </p>
      </div>
    </div>
  );
}

function CoverRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function CoverStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-2 py-3">
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-[11px] text-white/75">{label}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Route; title: string }) {
  return (
    <h2 className="hs-avoid flex items-center gap-2 text-base font-extrabold text-foreground">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></span>
      {title}
    </h2>
  );
}

function AttendanceBar({ a }: { a: PortfolioAttendance }) {
  if (!a.total) return <p className="text-sm text-muted-foreground">Chưa có buổi học nào.</p>;
  const parts: { n: number; label: string; cls: string }[] = [
    { n: a.present, label: "Có mặt", cls: "bg-primary" },
    { n: a.late, label: "Đi muộn", cls: "bg-brand-400" },
    { n: a.makeup, label: "Học bù", cls: "bg-brand-300" },
    { n: a.excused, label: "Nghỉ có phép", cls: "bg-accent-200" },
    { n: a.absent, label: "Vắng", cls: "bg-accent-500" },
  ];
  return (
    <div>
      <div className="text-3xl font-extrabold text-primary">{pct(a.rate)}</div>
      <div className="mt-1 flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {parts.filter((p) => p.n > 0).map((p) => <div key={p.label} className={p.cls} style={{ width: `${(p.n / a.total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 rounded-full ${p.cls}`} aria-hidden />{p.label}: <b>{p.n}</b></li>
        ))}
      </ul>
    </div>
  );
}

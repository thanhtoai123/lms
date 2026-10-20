/**
 * HỒ SƠ CÔNG NGHỆ — tài liệu nhiều trang dùng chung cho: trang quản trị, cổng phụ huynh, link chia sẻ
 * `/hs/<token>`, trang in nội bộ (và bộ xuất PDF phía máy chủ). Chuẩn theo khung chương trình TH STEAM:
 *
 *   1. Bìa: logo, ảnh đại diện + tên con, chương trình & năm học, số liệu chính.
 *   2. Năng lực & phẩm chất: 6 năng lực (Tư duy · Kỹ năng số · Bản lĩnh) + 3 phẩm chất, thang Tốt / Đạt / Cần cố gắng,
 *      kèm "con làm được" theo đúng chương trình; biểu đồ năng lực.
 *   3. Lộ trình học tập: chỉ thể hiện LỘ TRÌNH và TIẾN TRÌNH — từng năm học → 3 học phần × 15 buổi (buổi 15 báo cáo
 *      trước phụ huynh): tiến độ, trạng thái, mức của báo cáo học phần, sản phẩm & mục tiêu theo chương trình.
 *      Sản phẩm con làm từng buổi và ảnh nằm ở phần chi tiết (không lặp ở đây).
 *   4. Thầy cô nhận xét (báo cáo học phần mới nhất) · Chuyên cần · Chứng nhận · Biểu đồ tiến bộ.
 *   5. Chi tiết từng khoá: học bạ các buổi báo cáo + phiếu nhận xét từng buổi (bản in 2 phiếu / trang).
 * Không hook, không mã chỉ-máy-chủ → render được ở cả hai phía.
 */
import { Award, BookOpenCheck, CalendarCheck, MessageSquareQuote, Route, School, Sparkles, Star } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { StudentAvatar } from "@/components/student-avatar";
import {
  buildTechProfile, pairSheets, RUBRIC_LEVELS, RUBRIC_SCALE, TECH_MODULE_STATUS_VI, TH_DELIVERY,
  type CompetencyGroup, type PortfolioAttendance, type PortfolioView, type TechCourseView,
} from "@satarobo/core";
import { CenterFooter, LEVEL_TONE, LevelChip, fmtDay, num1, pct } from "./parts";
import { ProgressLine, RadarChart } from "./charts";
import { SessionSheet } from "./session-sheet";
import { MilestoneCard } from "./milestone-card";

export function PortfolioDocument({ view, actions }: { view: PortfolioView; actions?: React.ReactNode }) {
  const tech = buildTechProfile(view);
  const period = view.period.from && view.period.to ? `${fmtDay(view.period.from)} – ${fmtDay(view.period.to)}` : null;
  const empty = view.totals.sheets === 0 && view.totals.milestones === 0 && view.certificates.length === 0;
  const cur = tech.current;
  const radarCourse = [...view.courses].reverse().find((c) => c.radar.some((r) => r.value != null)) ?? null;

  return (
    <div className="hs-doc mx-auto w-full max-w-3xl space-y-5 print:max-w-none print:space-y-0">
      {/* 1. BÌA */}
      <section className="hs-page hs-cover relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-navy-2 to-navy p-6 text-white shadow-md sm:p-10 print:rounded-none print:shadow-none" aria-label="Trang bìa">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[18px] border-accent-500/25" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <BrandLockup height={56} onDark />
          <span className="rounded-full border border-accent-500/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-500">Hồ sơ công nghệ</span>
        </div>

        <div className="relative mt-10 flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left print:mt-20">
          <div className="rounded-full bg-gradient-to-br from-accent-500 to-[#d97706] p-1.5 shadow-lg">
            <StudentAvatar src={view.student.avatarUrl} name={view.student.fullName} nickname={view.student.nickname} seed={view.student.code} size={136} className="ring-4 ring-navy" eager />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-200">Học viên</div>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight sm:text-4xl print:text-5xl">{view.student.fullName}</h1>
            {cur?.programTitle ? (
              <p className="mt-2 text-[15px] font-semibold text-white/90">{cur.programTitle}</p>
            ) : view.courses.length ? (
              <p className="mt-2 text-[15px] font-semibold text-white/90">{view.courses[view.courses.length - 1]!.courseName}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {cur?.yearNo && cur.yearsTotal ? <CoverChip>Năm học {cur.yearNo}/{cur.yearsTotal}</CoverChip> : null}
              {cur?.levelLabel && <CoverChip>{cur.levelLabel}</CoverChip>}
              {cur?.software && <CoverChip>{cur.software}</CoverChip>}
            </div>
          </div>
        </div>

        <dl className="relative mt-8 grid gap-3 text-sm sm:grid-cols-3 print:mt-14 print:text-base">
          {view.student.code && <CoverRow label="Mã học viên" value={view.student.code} />}
          {view.student.grade != null && <CoverRow label="Lớp ở trường" value={`Lớp ${view.student.grade}`} />}
          <CoverRow label="Giai đoạn" value={period ? `${view.scopeLabel} · ${period}` : view.scopeLabel} />
          {view.center && <CoverRow label="Đơn vị" value={view.center.name} />}
          <CoverRow label="Hình thức" value="Online qua ClassIn · 90 phút/buổi" />
          <CoverRow label="Lập ngày" value={fmtDay(view.generatedAt) ?? ""} />
        </dl>
        <div className="relative mt-6 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 print:mt-14">
          <CoverStat value={String(tech.stats.modulesDone)} label="học phần đã báo cáo" />
          <CoverStat value={String(tech.stats.products)} label="sản phẩm đã làm" />
          <CoverStat value={pct(view.attendance.rate)} label="chuyên cần" />
          <CoverStat value={String(tech.stats.certificates)} label="chứng nhận" />
        </div>
        {actions && <div className="relative mt-6 print:hidden">{actions}</div>}
      </section>

      {empty && (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground print:hidden">
          Chưa có phiếu nhận xét buổi học nào được phát hành trong phạm vi này. Phiếu được phát hành khi giáo viên hoàn tất buổi học.
        </p>
      )}

      {/* 2. BỨC TRANH NĂNG LỰC */}
      <section className="hs-page hs-break space-y-4 rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0" aria-label="Năng lực và phẩm chất">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionTitle icon={Star} title="Năng lực & phẩm chất của con" sub="6 năng lực + 3 phẩm chất theo khung TH STEAM (GDPT 2018 · TT 02/2025)" />
          <Legend />
        </div>
        {tech.competency.source ? (
          <p className="text-xs text-muted-foreground">Đánh giá theo: <b className="text-foreground">{tech.competency.source}</b>{tech.competency.sourceDate ? ` · ${fmtDay(tech.competency.sourceDate)}` : ""}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có đánh giá năng lực — sẽ có sau buổi học đầu tiên được giáo viên nhận xét.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {tech.competency.groups.map((g) => <CompetencyCard key={g.name} group={g} />)}
        </div>
        {radarCourse && radarCourse.radar.length >= 3 && (
          <div className="hs-avoid grid items-center gap-4 rounded-2xl bg-[#f8fafc] p-4 sm:grid-cols-[1fr_1.1fr] print:grid-cols-[1fr_1.1fr]">
            <RadarChart axes={radarCourse.radar} />
            <div className="text-sm">
              <div className="font-bold text-foreground">Biểu đồ năng lực</div>
              <p className="mt-1 text-xs text-muted-foreground">Mức trung bình của con ở từng tiêu chí qua các buổi học khoá <b>{radarCourse.courseName}</b> — càng xa tâm càng tốt (1 {RUBRIC_LEVELS[0]!.label} · 2 {RUBRIC_LEVELS[1]!.label} · 3 {RUBRIC_LEVELS[2]!.label}).</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LEVEL_TONE[3]!.chip}`}>{tech.competency.counts.tot} Tốt</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LEVEL_TONE[2]!.chip}`}>{tech.competency.counts.dat} Đạt</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LEVEL_TONE[1]!.chip}`}>{tech.competency.counts.canCoGang} Cần cố gắng</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. LỘ TRÌNH CHƯƠNG TRÌNH */}
      <section className="hs-break space-y-4 rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0" aria-label="Lộ trình học tập">
        <SectionTitle icon={Route} title="Lộ trình học tập" sub="1 năm học = 3 học phần × 15 buổi · buổi 15 con báo cáo trước phụ huynh" />
        {tech.courses.length === 0 && <p className="text-sm text-muted-foreground">Chưa có khoá học nào trong phạm vi này.</p>}
        <ol className="space-y-4">
          {tech.courses.map((c) => <CourseTrack key={c.enrollmentId} c={c} />)}
        </ol>
      </section>

      {/* 4. NHẬN XÉT · CHUYÊN CẦN · CHỨNG NHẬN · TIẾN BỘ */}
      <section className="hs-break space-y-5 rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0" aria-label="Nhận xét, chuyên cần và chứng nhận">
        {tech.teacherNote && (
          <div className="hs-avoid rounded-2xl border-l-4 border-accent-500 bg-[#fffbeb] p-4">
            <SectionTitle icon={MessageSquareQuote} title="Thầy cô nhận xét" sub={`${tech.teacherNote.label}${tech.teacherNote.date ? ` · ${fmtDay(tech.teacherNote.date)}` : ""}`} />
            {tech.teacherNote.comment && <p className="mt-2 text-[15px] leading-relaxed text-foreground">“{tech.teacherNote.comment}”</p>}
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {tech.teacherNote.strengths && <p><b className="text-[#047857]">Điểm mạnh:</b> {tech.teacherNote.strengths}</p>}
              {tech.teacherNote.improvements && <p><b className="text-[#b45309]">Cần luyện thêm:</b> {tech.teacherNote.improvements}</p>}
            </div>
            {tech.teacherNote.authorName && <p className="mt-2 text-right text-xs font-semibold text-muted-foreground">— {tech.teacherNote.authorName}</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div className="hs-avoid">
            <SectionTitle icon={CalendarCheck} title="Chuyên cần" />
            <AttendanceBar a={view.attendance} />
          </div>
          <div className="hs-avoid">
            <SectionTitle icon={Award} title="Giấy chứng nhận" />
            {view.certificates.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Chưa có giấy chứng nhận trong giai đoạn này.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {view.certificates.map((c) => (
                  <li key={c.certificateNo} className={`rounded-xl border px-3 py-2 text-sm ${c.kind === "path" ? "border-accent-500/50 bg-[#fffbeb]" : "border-[#bfdbfe] bg-[#eff6ff]"}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">{c.kind === "path" ? "Hoàn thành lộ trình" : "Hoàn thành khoá học"}</div>
                    <div className="font-bold">{c.courseName}</div>
                    <div className="text-xs text-foreground/80">
                      {[c.grade || null, `số ${c.certificateNo}`, c.issuedAt ? fmtDay(c.issuedAt) : null].filter(Boolean).join(" · ")}
                      {c.verifyPath && <> · <a href={c.verifyPath} className="font-semibold text-primary underline">Xác thực</a></>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="hs-avoid">
          <SectionTitle icon={Sparkles} title="Biểu đồ tiến bộ" />
          <div className="mt-2"><ProgressLine points={view.progress} /></div>
        </div>
      </section>

      {/* 5. CHI TIẾT TỪNG KHOÁ */}
      {view.courses.filter((c) => c.sheets.length || c.milestones.length).map((c) => (
        <section key={c.enrollmentId} className="hs-course hs-break space-y-4" aria-label={`Khoá ${c.courseName}`}>
          <div className="hs-avoid rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-accent-700">Chi tiết khoá học</div>
                <h2 className="text-xl font-extrabold text-primary">{c.courseName}</h2>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><School className="h-3.5 w-3.5" aria-hidden /> {c.className} ({c.classCode})</span>
                  <span className="inline-flex items-center gap-1"><BookOpenCheck className="h-3.5 w-3.5" aria-hidden /> {c.statusLabel}</span>
                </div>
              </div>
              <div className="text-right text-sm">
                <div>Chuyên cần <b className="text-primary">{pct(c.attendance.rate)}</b></div>
                <div className="text-xs text-muted-foreground">{c.attendance.present + c.attendance.late + c.attendance.makeup}/{c.attendance.total} buổi có mặt</div>
                {c.average != null && <div className="text-xs text-muted-foreground">Mức trung bình các buổi {num1(c.average)}/{RUBRIC_SCALE}</div>}
              </div>
            </div>
          </div>

          {c.milestones.map((m) => <MilestoneCard key={m.id} card={m} printSessions={false} />)}

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

      <div className="overflow-hidden rounded-2xl border border-border print:rounded-none print:border-0">
        <CenterFooter center={view.center} />
        <p className="px-5 pb-3 text-[11px] text-muted-foreground print:px-4">
          {TH_DELIVERY}. Mỗi phiếu nhận xét được giáo viên phát hành khi hoàn tất buổi học và không thay đổi sau đó — bản in này giống hệt nội dung đã gửi phụ huynh.
        </p>
      </div>
    </div>
  );
}

function CompetencyCard({ group }: { group: CompetencyGroup }) {
  const pc = group.kind === "pham-chat";
  return (
    <div className={`hs-avoid rounded-2xl border p-4 ${pc ? "border-[#a7f3d0] bg-[#f0fdf4]" : "border-[#bfdbfe] bg-[#f8fafc]"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-foreground">{group.name}</div>
        <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${pc ? "text-[#047857]" : "text-primary"}`}>{pc ? "Phẩm chất" : "Năng lực"}</span>
      </div>
      <ul className="mt-2 space-y-2.5">
        {group.items.map((it) => (
          <li key={it.name}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">{it.name}</span>
              <LevelChip level={it.level} label={it.levelLabel} />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1" aria-hidden>
              {[1, 2, 3].map((n) => <span key={n} className={`h-1.5 rounded-full ${it.level && n <= it.level ? LEVEL_TONE[it.level]!.fill : "bg-[#e2e8f0]"}`} />)}
            </div>
            {it.hint && <p className="mt-1 text-[12px] leading-snug text-foreground/75"><b className="font-semibold">Con làm được:</b> {it.hint}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CourseTrack({ c }: { c: TechCourseView }) {
  const total = c.sessionsTotal ?? 0;
  return (
    <li className="hs-avoid rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent-700">
            {c.kind === "year" && c.yearNo ? `Năm học ${c.yearNo}${c.yearsTotal ? `/${c.yearsTotal}` : ""}` : c.kind === "exam" ? "Luyện thi · tự chọn" : "Khoá học"}
            {c.trackShort ? ` · ${c.trackShort}` : ""}
          </div>
          <div className="text-[16px] font-extrabold text-foreground">{c.courseName}</div>
          <div className="text-xs text-muted-foreground">{[c.levelLabel, c.software].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right">
          <span className="chip bg-[#dbeafe] text-[#1e40af]">{c.certificateNo ? "Đã hoàn thành" : c.statusLabel}</span>
          {total > 0 && <div className="mt-1 text-xs text-muted-foreground">{c.sessionsDone}/{total} buổi</div>}
        </div>
      </div>

      {c.modules.length > 0 ? (
        <ol className="mt-3 grid gap-2 sm:grid-cols-3 print:grid-cols-3">
          {c.modules.map((m) => {
            const pctDone = Math.round((m.sessionsDone / m.sessionsTotal) * 100);
            const tone = m.status === "done" ? "border-[#a7f3d0] bg-[#f0fdf4]" : m.status === "waiting" ? "border-accent-500/50 bg-[#fffbeb]" : m.status === "in_progress" ? "border-[#bfdbfe] bg-[#eff6ff]" : "border-border bg-card";
            return (
              <li key={m.no} className={`hs-avoid flex flex-col rounded-xl border p-3 ${tone}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Học phần {m.no}</span>
                  <span className={`text-[10px] font-bold ${m.status === "done" ? "text-[#047857]" : m.status === "waiting" ? "text-[#b45309]" : m.status === "in_progress" ? "text-primary" : "text-muted-foreground"}`}>{TECH_MODULE_STATUS_VI[m.status]}</span>
                </div>
                <div className="mt-0.5 text-[13px] font-extrabold leading-snug text-foreground">{m.name}</div>
                <div className="text-[11px] text-muted-foreground">{m.difficulty} · buổi {m.fromSeq}–{m.toSeq}</div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]" role="progressbar" aria-label={`Học phần ${m.no}: ${m.sessionsDone}/${m.sessionsTotal} buổi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctDone}>
                  <div className={`h-1.5 rounded-full ${m.status === "done" ? "bg-[#10b981]" : "bg-primary"}`} style={{ width: `${m.status === "done" ? 100 : Math.min(100, pctDone)}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{m.sessionsDone}/{m.sessionsTotal} buổi</span>
                  {m.levelLabel && <LevelChip level={m.level} label={m.levelLabel} />}
                </div>
                <dl className="mt-2 space-y-1 text-[12px] leading-snug">
                  <div><dt className="inline font-semibold text-foreground">Sản phẩm của học phần: </dt><dd className="inline text-foreground/80">{m.product}</dd></div>
                  <div><dt className="inline font-semibold text-foreground">Mục tiêu: </dt><dd className="inline text-foreground/80">{m.canDo}</dd></div>
                </dl>
              </li>
            );
          })}
        </ol>
      ) : total > 0 ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden>
          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((c.sessionsDone / total) * 100))}%` }} />
        </div>
      ) : null}
      {c.certificateNo && <p className="mt-2 text-xs font-semibold text-accent-700">Giấy chứng nhận số {c.certificateNo}</p>}
    </li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Thang đánh giá">
      {[3, 2, 1].map((n) => (
        <span key={n} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${LEVEL_TONE[n]!.chip}`}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_TONE[n]!.dot }} />{RUBRIC_LEVELS.find((l) => l.value === n)?.label}
        </span>
      ))}
    </div>
  );
}

function CoverChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] font-semibold text-white ring-1 ring-white/20">{children}</span>;
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
    <div className="rounded-2xl bg-white/10 px-2 py-3 ring-1 ring-white/10">
      <div className="text-2xl font-extrabold text-accent-500">{value}</div>
      <div className="text-[11px] text-white/75">{label}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, sub }: { icon: typeof Route; title: string; sub?: string }) {
  return (
    <div className="hs-avoid">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-foreground">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#dbeafe] text-primary"><Icon className="h-4 w-4" aria-hidden /></span>
        {title}
      </h2>
      {sub && <p className="ml-9 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AttendanceBar({ a }: { a: PortfolioAttendance }) {
  if (!a.total) return <p className="mt-2 text-sm text-muted-foreground">Chưa có buổi học nào.</p>;
  const parts: { n: number; label: string; cls: string }[] = [
    { n: a.present, label: "Có mặt", cls: "bg-[#10b981]" },
    { n: a.late, label: "Vào muộn", cls: "bg-primary" },
    { n: a.makeup, label: "Học bù", cls: "bg-brand-300" },
    { n: a.excused, label: "Nghỉ có phép", cls: "bg-accent-200" },
    { n: a.absent, label: "Vắng không phép", cls: "bg-accent-500" },
  ];
  return (
    <div className="mt-2">
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

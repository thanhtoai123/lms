import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BadgeCheck, BookOpen, ChevronRight, Coins, FileDown, Printer, Route, ScrollText } from "lucide-react";
import { getDb } from "@satarobo/db";
import { ParentPortal, familyChildren, hubJourney } from "@satarobo/api";
import { childShortName, type JourneyEntry } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhPageHead, ChildChips, PhSection, dtPh } from "@/components/ph-ui";
import { ShareLinkButton } from "@/components/ph/actions";
import { Progress } from "@/components/ph/bits";
import { ProgressLine, RadarChart } from "@/components/portfolio/charts";
import { AskForm } from "../../tin-nhan/client";

export const dynamic = "force-dynamic";

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "Đang học");

/**
 * HÀNH TRÌNH HỌC CỦA CON: dòng thời gian lộ trình (khoá đã / đang học + % buổi, học bạ mốc, giấy chứng nhận có
 * nút in và chia sẻ link xác thực), tiến độ lộ trình, biểu đồ tiến bộ (tái dùng SVG của hồ sơ học tập),
 * bộ sưu tập sản phẩm, "Lưu hồ sơ PDF". Chỉ con của phụ huynh đang đăng nhập.
 */
export default async function ChildJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireParent();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [kids, j, c] = await Promise.all([familyChildren(db, p.id), hubJourney(db, p.id, id), ParentPortal.portalChild(db, p.id, id)]);
  if (!j || !c) notFound();
  const name = childShortName(j.child);
  const v = j.view;
  const current = [...v.courses].reverse().find((x) => x.status === "active" || x.status === "trial") ?? v.courses[v.courses.length - 1] ?? null;
  const certById = new Map(j.certificates.map((x) => [x.id, x]));

  return (
    <>
      <PhMain className="space-y-5">
        <PhPageHead title={`Hành trình của ${name}`} desc="Khoá đã học, học bạ mốc và giấy chứng nhận của con." />
        <ChildChips kids={kids} activeId={j.child.id} hrefFor={(kid) => `/ph/be/${kid}`} />

        {/* Tổng quan */}
        <section aria-label="Tổng quan" className="rounded-3xl bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="text-[20px] font-extrabold text-primary">{j.child.fullName}</div>
          {c.code && <div className="font-mono text-[13px] text-ink-600">{c.code}</div>}
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div><dt className="text-[12px] text-ink-600">Khoá</dt><dd className="text-[20px] font-extrabold">{v.totals.courses}</dd></div>
            <div><dt className="text-[12px] text-ink-600">Phiếu</dt><dd className="text-[20px] font-extrabold">{v.totals.sheets}</dd></div>
            <div><dt className="text-[12px] text-ink-600">TB /4</dt><dd className="text-[20px] font-extrabold">{v.totals.average ?? "—"}</dd></div>
            <div><dt className="text-[12px] text-ink-600">Chuyên cần</dt><dd className="text-[20px] font-extrabold">{v.attendance.rate === null ? "—" : `${Math.round(v.attendance.rate * 100)}%`}</dd></div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={`/ph/be/${j.child.id}/ho-so`} className="btn-primary min-h-11 text-[15px]"><FileDown className="h-5 w-5" aria-hidden /> Lưu hồ sơ PDF</Link>
            <Link href={`/ph/be/${j.child.id}/xu`} className="btn-ghost min-h-11 text-[15px]"><Coins className="h-5 w-5 text-accent-600" aria-hidden /> {c.coins} xu</Link>
          </div>
        </section>

        {/* Lộ trình */}
        {j.paths.length > 0 && (
          <PhSection title="Lộ trình học">
            <ul className="space-y-2">
              {j.paths.map((pth) => (
                <li key={pth.id} className="card space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold"><Route className="h-5 w-5 text-primary" aria-hidden />{pth.name}</span>
                    <span className="text-[14px] font-semibold text-primary">{pth.completed}/{pth.total} khoá</span>
                  </div>
                  <Progress percent={pth.percent} label={`Tiến độ lộ trình ${pth.name}: ${pth.percent}%`} tone={pth.eligible ? "ok" : "primary"} />
                  <ol className="flex flex-wrap gap-1.5">
                    {pth.courses.map((x, i) => (
                      <li key={i} className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${x.state === "completed" ? "bg-green-100 text-green-800" : x.state === "in_progress" ? "bg-primary-soft text-primary" : "bg-black/5 text-ink-600"}`}>
                        {x.name}{x.required ? "" : " (tuỳ chọn)"}
                      </li>
                    ))}
                  </ol>
                  {pth.eligible && <p className="text-[14px] font-semibold text-green-800">Con đã hoàn thành các khoá bắt buộc — trung tâm sẽ cấp giấy chứng nhận lộ trình.</p>}
                </li>
              ))}
            </ul>
          </PhSection>
        )}

        {/* Dòng thời gian */}
        <PhSection title="Dòng thời gian">
          {j.journey.length === 0 ? <div className="card p-4 text-ink-600">Chưa có khoá học nào.</div> : (
            <ol className="relative ml-3 space-y-4 border-l-2 border-primary/20 pl-5">
              {j.journey.map((e) => <TimelineItem key={e.key} e={e} childId={j.child.id} cert={e.kind === "certificate" && e.certificateId ? certById.get(e.certificateId) ?? null : null} />)}
            </ol>
          )}
        </PhSection>

        {/* Biểu đồ tiến bộ */}
        <PhSection title="Tiến bộ theo buổi học">
          <div className="card space-y-4 p-4">
            <ProgressLine points={v.progress} />
            {current && current.radar.length > 0 && (
              <div>
                <div className="mb-1 text-[14px] font-semibold">Năng lực trung bình · {current.courseName}</div>
                <RadarChart axes={current.radar} />
              </div>
            )}
          </div>
        </PhSection>

        {/* Sản phẩm */}
        <PhSection title="Bộ sưu tập sản phẩm">
          {v.gallery.length === 0 ? (
            <div className="card p-4 text-ink-600">Ảnh sản phẩm của {name} (đã được trung tâm duyệt và gia đình đồng ý đăng ảnh) sẽ hiện tại đây.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {v.gallery.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.caption ?? `Sản phẩm của ${name}`} loading="lazy" className="aspect-square w-full object-cover" />
                  <div className="p-2 text-[13px]"><div className="line-clamp-2 font-semibold">{m.caption ?? m.courseName}</div>{m.date && <div className="text-ink-600">{dmy(m.date)}</div>}</div>
                </li>
              ))}
            </ul>
          )}
        </PhSection>

        {c.card && (
          <details className="card p-4">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Thẻ điểm danh QR của con</summary>
            <div className="mx-auto mt-2 w-56 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: c.card.svg }} />
            <p className="text-center text-[14px] text-ink-600">Đưa thẻ (hoặc màn hình này) cho giáo viên quét khi đến lớp.</p>
          </details>
        )}

        {c.homework.length > 0 && (
          <PhSection title="Bài tập">
            <ul className="card divide-y divide-black/5">
              {c.homework.slice(0, 8).map((h, i) => (
                <li key={i} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    {h.link ? <a href={h.link} className="min-h-11 content-center font-semibold text-primary underline">{h.title}</a> : <span className="font-semibold">{h.title}</span>}
                    <span className="shrink-0 text-[13px] text-ink-600">{h.score !== null ? `${h.score}/${h.maxScore}` : `hạn ${dtPh(h.dueAt)}`}</span>
                  </div>
                  {h.feedback && <div className="text-[14px] text-ink-600">{h.feedback}</div>}
                </li>
              ))}
            </ul>
          </PhSection>
        )}

        <PhSection title="Hỏi trung tâm về con">
          <div className="card p-4"><AskForm studentId={j.child.id} /></div>
        </PhSection>
      </PhMain>
    </>
  );
}

function TimelineItem({ e, childId, cert }: { e: JourneyEntry; childId: string; cert: { id: string; title: string; verifyPath: string } | null }) {
  const dot = e.kind === "certificate" ? "bg-accent-500" : e.kind === "milestone" ? "bg-violet-500" : e.state === "done" ? "bg-green-600" : e.state === "active" ? "bg-primary" : "bg-black/30";
  const Icon = e.kind === "certificate" ? Award : e.kind === "milestone" ? ScrollText : BookOpen;
  return (
    <li className="relative">
      <span className={`absolute -left-[31px] top-3 grid h-5 w-5 place-items-center rounded-full ring-4 ring-surface ${dot}`} aria-hidden />
      <div className={`card space-y-2 p-4 ${e.kind === "certificate" ? "border-accent-200 bg-accent-50/60" : ""}`}>
        <div className="flex items-start gap-2">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${e.kind === "certificate" ? "text-accent-700" : "text-primary"}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-bold leading-snug">{e.title}</div>
            <div className="text-[14px] text-ink-600">{e.subtitle}</div>
            <div className="text-[13px] text-ink-600">{e.kind === "course" ? `Bắt đầu ${dmy(e.date)}` : dmy(e.date)}</div>
          </div>
          {e.kind === "milestone" && e.average !== null && <span className="shrink-0 rounded-xl bg-violet-100 px-2 py-1 text-[14px] font-bold text-violet-800">{e.average}</span>}
        </div>
        {e.kind === "course" && e.percent !== null && (
          <div className="space-y-1">
            <Progress percent={e.percent} label={`${e.title}: con đã học ${e.percent}% số buổi`} tone={e.state === "done" ? "ok" : "primary"} />
            <div className="text-[13px] text-ink-600">Con đã học {Math.min(e.sessionsDone, e.sessionsTotal)}/{e.sessionsTotal} buổi</div>
          </div>
        )}
        {e.kind === "milestone" && (
          <Link href={`/ph/be/${childId}/ho-so`} className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-primary">Xem học bạ <ChevronRight className="h-4 w-4" aria-hidden /></Link>
        )}
        {e.kind === "certificate" && (
          <div className="flex flex-wrap gap-2">
            {cert && <Link href={`/ph/be/${childId}/chung-nhan/${cert.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-[14px] font-bold text-white"><Printer className="h-4 w-4" aria-hidden /> Tải / in</Link>}
            {e.verifyPath && <ShareLinkButton path={e.verifyPath} title={e.title} />}
            {e.verifyPath && <a href={e.verifyPath} className="inline-flex min-h-11 items-center gap-1 px-1 text-[14px] font-semibold text-primary"><BadgeCheck className="h-4 w-4" aria-hidden /> Xác thực</a>}
          </div>
        )}
      </div>
    </li>
  );
}

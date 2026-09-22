import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, ClipboardList, Clock, Coins, MapPin, Route, Sparkles, UserRound, Wallet } from "lucide-react";
import { getDb } from "@satarobo/db";
import { hubHome } from "@satarobo/api";
import { childShortName } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, ChildChips, PhSection, vndPh, dtPh, dayPh, todayPh } from "@/components/ph-ui";
import { AbsenceButton, ReactionBar } from "@/components/ph/actions";
import { LevelMeter } from "@/components/ph/bits";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * "HÔM NAY CỦA CON" — trang chủ cổng phụ huynh (docs/PHIA-NGUOI-DUNG.md):
 * buổi học tới (nút xin nghỉ một chạm), phiếu nhận xét buổi gần nhất (+ phản hồi cảm xúc), học phí cần đóng,
 * thông báo chưa đọc, lối tắt. Nhiều con → chip chuyển nhanh (?con=<id>).
 */
export default async function ParentHome({ searchParams }: { searchParams: Promise<{ con?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const d = await hubHome(getDb(), p.id, sp.con && UUID.test(sp.con) ? sp.con : null);
  const today = todayPh();
  const kid = d.child;
  const f = d.focus;
  const name = kid ? childShortName(kid) : "";
  const q = kid ? `?con=${kid.id}` : "";

  return (
    <>
      <PhHeader title="Hôm nay" />
      <main className="flex-1 space-y-5 px-4 pb-28 pt-3">
        <div className="px-1">
          <p className="text-[14px] text-ink-600">Chào anh/chị {p.fullName.split(" ").slice(-1)[0]} 👋</p>
          {kid && <p className="text-[20px] font-extrabold leading-tight">Hôm nay của {name}</p>}
        </div>

        <ChildChips kids={d.children} activeId={kid?.id ?? null} hrefFor={(id) => `/ph?con=${id}`} />

        {!kid && <div className="card p-5">Chưa có học viên gắn với tài khoản này. Anh/chị nhắn trung tâm để được gắn hồ sơ của con.</div>}

        {kid && f && (
          <>
            {/* Buổi học tới */}
            <section aria-label="Buổi học tới" className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-darker p-5 text-white shadow-lg">
              <div className="text-[13px] font-semibold uppercase tracking-wide text-white/75">Buổi học tới</div>
              {f.next ? (
                <>
                  <div className="mt-1 text-[24px] font-extrabold leading-tight">{dayPh(f.next.date, today)}</div>
                  <div className="flex items-center gap-2 text-[18px] font-bold"><Clock className="h-5 w-5" aria-hidden />{f.next.start}–{f.next.end}</div>
                  <ul className="mt-3 space-y-1.5 text-[15px] text-white/90">
                    <li className="flex items-start gap-2"><BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{f.next.className} · {f.next.label}</span></li>
                    <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{f.next.room ? `${f.next.room} · ` : ""}{f.next.center}{f.next.centerAddress ? <span className="block text-[13px] text-white/70">{f.next.centerAddress}</span> : null}</span></li>
                    {f.next.teacher && <li className="flex items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>GV {f.next.teacher}</span></li>}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {f.next.absence ? (
                      <Link href="/ph/yeu-cau" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-4 text-[15px] font-semibold">
                        Đã xin nghỉ · {f.next.absence.code} · {f.next.absence.statusLabel}
                      </Link>
                    ) : (
                      <AbsenceButton studentId={kid.id} sessionId={f.next.sessionId} childName={name} when={`${dayPh(f.next.date, today)} · ${f.next.start}–${f.next.end}`} />
                    )}
                    <Link href={`/ph/lich${q}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[15px] font-semibold text-white/90 hover:bg-white/10">
                      Cả lịch <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                  {f.upcoming.length > 0 && (
                    <ul className="mt-4 space-y-1 border-t border-white/15 pt-3 text-[14px] text-white/80">
                      {f.upcoming.map((u) => <li key={u.sessionId} className="flex justify-between gap-2"><span>{dayPh(u.date, today)} · {u.start}</span><span className="truncate">{u.classCode} · {u.label}</span></li>)}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[16px]">Chưa có buổi học sắp tới.</p>
              )}
            </section>

            {/* Phiếu nhận xét buổi gần nhất */}
            <PhSection title="Nhận xét buổi gần nhất" action={{ href: `/ph/be/${kid.id}/ho-so`, label: "Cả hồ sơ" }}>
              {f.sheet ? (
                <article className="card space-y-3 p-4">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold">{f.sheet.label}{f.sheet.makeup ? " · Học bù" : ""}</div>
                      <div className="text-[14px] text-ink-600">{dayPh(f.sheet.date, today)}{f.sheet.teacherName ? ` · GV ${f.sheet.teacherName}` : ""}</div>
                      {f.sheet.lessonTitle && <div className="text-[14px] text-ink-600">Bài: {f.sheet.lessonTitle}</div>}
                    </div>
                    {f.sheet.glance.average !== null && (
                      <div className="shrink-0 rounded-2xl bg-primary-soft px-3 py-2 text-center text-primary">
                        <div className="text-[20px] font-extrabold leading-none">{f.sheet.glance.average}</div>
                        <div className="text-[11px] font-semibold">/ 4</div>
                      </div>
                    )}
                  </header>
                  {f.sheet.glance.rated > 0 && (
                    <p className="text-[15px]">
                      Đạt {f.sheet.glance.reached}/{f.sheet.glance.rated} tiêu chí
                      {f.sheet.glance.best ? <> · mạnh nhất: <b>{f.sheet.glance.best}</b></> : null}
                      {f.sheet.glance.practice ? <> · luyện thêm: <b className="text-accent-700">{f.sheet.glance.practice}</b></> : null}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {f.sheet.criteria.map((c) => (
                      <li key={c.label} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 text-[15px]"><span className="block truncate">{c.label}</span>{c.level && <span className="block text-[13px] text-ink-600">{c.level}</span>}</span>
                        <LevelMeter value={c.value} label={c.label} />
                      </li>
                    ))}
                  </ul>
                  {f.sheet.objective && <p className="rounded-xl bg-muted px-3 py-2 text-[14px]">{f.sheet.objective}</p>}
                  {f.sheet.remark && <blockquote className="border-l-4 border-primary/30 pl-3 text-[15px] italic">“{f.sheet.remark}”</blockquote>}
                  {f.sheet.productNote && <p className="text-[15px]"><b>Sản phẩm:</b> {f.sheet.productNote}</p>}
                  {f.sheet.highlights.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Điểm nổi bật">
                      {f.sheet.highlights.map((h) => <li key={h} className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1 text-[13px] font-semibold text-accent-700"><Sparkles className="h-3.5 w-3.5" aria-hidden />{h}</li>)}
                    </ul>
                  )}
                  {f.sheet.media.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {f.sheet.media.map((m) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={m.id} src={m.url} alt={m.caption ?? `Ảnh buổi học của ${name}`} loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
                      ))}
                    </div>
                  )}
                  <div className="border-t border-black/5 pt-3">
                    <ReactionBar studentId={kid.id} sessionId={f.sheet.sessionId} initial={f.sheet.reaction} />
                  </div>
                </article>
              ) : (
                <div className="card p-4 text-ink-600">Sau mỗi buổi, thầy cô gửi phiếu nhận xét của {name} tại đây.</div>
              )}
            </PhSection>

            {/* Học phí */}
            {d.fees.total > 0 && d.fees.first && (
              <section aria-label="Học phí cần đóng" className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4">
                <Wallet className="h-7 w-7 shrink-0 text-amber-700" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-amber-900">Học phí cần đóng{d.fees.count > 1 ? ` (${d.fees.count} đơn)` : ""}</div>
                  <div className="text-[20px] font-extrabold text-amber-900">{vndPh(d.fees.total)}</div>
                </div>
                <Link href={`/ph/hoc-phi?don=${d.fees.first.id}#don-${d.fees.first.id}`} className="btn-primary min-h-11 shrink-0 text-[15px]">Thanh toán QR</Link>
              </section>
            )}

            {/* Thông báo chưa đọc */}
            {d.notifications.length > 0 && (
              <PhSection title={`Thông báo mới (${d.unread})`} action={{ href: "/ph/thong-bao", label: "Xem tất cả" }}>
                <ul className="card divide-y divide-black/5">
                  {d.notifications.map((n) => (
                    <li key={n.id}>
                      <Link href={n.link ?? "/ph/thong-bao"} className="flex min-h-11 items-start gap-3 p-3">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{n.title}</span>
                          <span className="line-clamp-2 block text-[14px] text-ink-600">{n.body}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-ink-600">{dtPh(n.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </PhSection>
            )}

            {/* Lối tắt */}
            <nav aria-label="Lối tắt" className="grid grid-cols-2 gap-3">
              {[
                { href: `/ph/lich${q}`, icon: CalendarDays, title: "Lịch học", sub: f.attendance30.rate === null ? "Tháng này" : `Chuyên cần 30 ngày ${f.attendance30.rate}%` },
                { href: `/ph/be/${kid.id}`, icon: Route, title: "Hành trình học", sub: "Khoá, học bạ, chứng nhận" },
                { href: `/ph/be/${kid.id}/xu`, icon: Coins, title: "SataCoin", sub: `${f.coins} xu` },
                { href: "/ph/yeu-cau", icon: ClipboardList, title: "Yêu cầu", sub: "Xin nghỉ, học bù, hỏi đáp" },
              ].map((t) => (
                <Link key={t.title} href={t.href} className="card flex min-h-[88px] flex-col justify-between p-4 transition hover:border-primary/40">
                  <t.icon className="h-6 w-6 text-primary" aria-hidden />
                  <span>
                    <span className="block font-bold">{t.title}</span>
                    <span className="block text-[13px] text-ink-600">{t.sub}</span>
                  </span>
                </Link>
              ))}
            </nav>

            {f.homework.length > 0 && (
              <PhSection title="Bài tập cần làm">
                <ul className="card divide-y divide-black/5">
                  {f.homework.map((h, i) => (
                    <li key={i}>
                      <a href={h.link} className="flex min-h-11 items-center justify-between gap-3 p-3">
                        <span className="min-w-0 truncate font-semibold text-primary">{h.title}</span>
                        <span className="shrink-0 text-[13px] text-ink-600">{h.status === "returned" ? "cần làm lại · " : ""}hạn {dtPh(h.dueAt)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </PhSection>
            )}
          </>
        )}
      </main>
      <PhNav />
    </>
  );
}

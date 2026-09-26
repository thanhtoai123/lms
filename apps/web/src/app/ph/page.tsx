import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, Clock, Coins, MapPin, Route, UserRound } from "lucide-react";
import { getDb } from "@satarobo/db";
import { hubFamily, hubHome } from "@satarobo/api";
import { childShortName, type MucChiSo } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhBlock, vndPh, dtPh, dayPh, todayPh } from "@/components/ph-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tổng quan — Sata Robo" };

const UUID = /^[0-9a-f-]{36}$/i;

/** Màu ô chỉ số: chỉ ba mức, khỏi đoán ngưỡng ở từng chỗ */
const MUC_STYLE: Record<MucChiSo, string> = {
  ok: "text-green-700",
  can_chu_y: "text-amber-700",
  chua_co: "text-ink-400",
};

/**
 * TỔNG QUAN — trang đầu của cổng phụ huynh, dựng theo cổng học viên hệ cũ:
 * thẻ từng con (tiến độ khoá + ba ô Chuyên cần / Bài chờ / Học phí + lối vào hồ sơ),
 * rồi hai cột Lịch học và Thông báo.
 *
 * Khác hệ cũ một điểm có chủ ý: buổi học tới hiện **ngay trên thẻ con**, kèm nút xin nghỉ,
 * vì đó là việc phụ huynh mở cổng để làm nhiều nhất.
 */
export default async function ParentOverview({ searchParams }: { searchParams: Promise<{ con?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const db = getDb();
  const con = sp.con && UUID.test(sp.con) ? sp.con : null;
  const [fam, d] = await Promise.all([hubFamily(db, p.id), hubHome(db, p.id, con)]);
  const today = todayPh();
  const f = d.focus;
  const kidId = d.child?.id ?? null;

  return (
    <PhMain className="space-y-6">
      <div>
        <p className="text-[14px] text-ink-600">Chào anh/chị {p.fullName.split(" ").slice(-1)[0]} 👋</p>
        <h2 className="text-[20px] font-extrabold leading-tight md:text-[24px]">Tổng quan gia đình</h2>
      </div>

      <PhBlock title="Các con của bạn">
        {fam.children.length === 0 ? (
          <div className="card p-5 text-ink-600">Chưa có học viên gắn với tài khoản này. Anh/chị nhắn trung tâm để được gắn hồ sơ của con.</div>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {fam.children.map((k) => {
              const ten = childShortName(k);
              const dangXem = k.id === kidId;
              return (
                <li key={k.id} className={`card p-4 ${dangXem && fam.children.length > 1 ? "ring-2 ring-primary/25" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-500 text-[18px] font-extrabold text-white" aria-hidden>
                      {ten.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* line-clamp thay cho truncate: `truncate` đặt white-space:nowrap nên chiều rộng
                          tối thiểu của thẻ bằng cả dòng chữ — trên điện thoại là tràn ngang cả trang. */}
                      <div className="line-clamp-1 text-[17px] font-extrabold">{k.fullName}</div>
                      <div className="line-clamp-1 text-[13px] text-ink-600">
                        {k.lop ? `${k.lop.courseName ?? k.lop.className} · ${k.lop.classCode}${k.lop.trial ? " · học thử" : ""}` : "Chưa xếp lớp"}
                      </div>
                    </div>
                  </div>

                  {k.tomTat.tienDoNhan && (
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className="text-ink-600">Tiến độ khoá học</span>
                        <span className="font-bold">{k.tomTat.tienDoNhan}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10" role="progressbar" aria-label={`Tiến độ khoá của ${ten}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={k.tomTat.tienDoPhanTram ?? 0}>
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${k.tomTat.tienDoPhanTram ?? 0}%` }} />
                      </div>
                    </div>
                  )}

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {k.tomTat.o.map((x) => (
                      <div key={x.khoa} className="min-w-0 rounded-xl border border-border px-2 py-2">
                        <dd className={`line-clamp-1 text-[15px] font-extrabold ${MUC_STYLE[x.muc]}`}>{x.giaTri}</dd>
                        <dt className="text-[12px] text-ink-600">{x.nhan}</dt>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link href={`/ph/be/${k.id}`} className="btn-ghost min-h-11 min-w-0 text-[14px]">Hồ sơ của con</Link>
                    {dangXem ? (
                      <Link href={`/ph/lich?con=${k.id}`} className="btn-primary min-h-11 min-w-0 text-[14px]">Lịch học</Link>
                    ) : (
                      <Link href={`/ph?con=${k.id}`} className="btn-primary min-h-11 min-w-0 text-[14px]">Xem buổi tới</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PhBlock>

      {kidId && f && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 space-y-6">
            <PhBlock title="Buổi học tới" action={{ href: `/ph/lich?con=${kidId}`, label: "Xem lịch" }}>
              {f.next ? (
                <div className="card overflow-hidden">
                  <div className="bg-gradient-to-br from-primary to-primary-darker p-4 text-white">
                    <div className="text-[22px] font-extrabold leading-tight">{dayPh(f.next.date, today)}</div>
                    <div className="flex items-center gap-2 text-[17px] font-bold"><Clock className="h-5 w-5" aria-hidden />{f.next.start}–{f.next.end}</div>
                    <ul className="mt-2 space-y-1 text-[14px] text-white/90">
                      <li className="flex items-start gap-2"><BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{f.next.className} · {f.next.label}</span></li>
                      <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{f.next.room ? `${f.next.room} · ` : ""}{f.next.center}</span></li>
                      {f.next.teacher && <li className="flex items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>GV {f.next.teacher}</span></li>}
                    </ul>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    {f.next.absence ? (
                      <Link href="/ph/yeu-cau" className="text-[14px] font-semibold text-amber-700">Đã xin nghỉ · {f.next.absence.code} · {f.next.absence.statusLabel}</Link>
                    ) : (
                      <Link href={`/ph/lich?con=${kidId}#ngay-${f.next.date}`} className="text-[14px] font-semibold text-primary">Xin nghỉ buổi này</Link>
                    )}
                    <Link href={`/ph/lich?con=${kidId}`} className="inline-flex items-center gap-1 text-[14px] font-semibold text-ink-600">Cả lịch <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                  </div>
                  {f.upcoming.length > 0 && (
                    <ul className="divide-y divide-black/5 border-t border-border text-[14px]">
                      {f.upcoming.map((u) => (
                        <li key={u.sessionId} className="flex justify-between gap-3 px-3 py-2">
                          <span className="shrink-0 whitespace-nowrap">{dayPh(u.date, today)} · {u.start}</span>
                          <span className="min-w-0 truncate text-right text-ink-600">{u.classCode} · {u.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="card p-4 text-ink-600">Chưa có buổi học sắp tới.</div>
              )}
            </PhBlock>

            {f.sheet && (
              <PhBlock title="Nhận xét mới nhất" action={{ href: "/ph/nhan-xet", label: "Tất cả" }}>
                <article className="card space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold">{f.sheet.label}{f.sheet.makeup ? " · Học bù" : ""}</div>
                      <div className="text-[13px] text-ink-600">{dayPh(f.sheet.date, today)}{f.sheet.teacherName ? ` · GV ${f.sheet.teacherName}` : ""}</div>
                    </div>
                    {f.sheet.glance.average !== null && (
                      <div className="shrink-0 rounded-2xl bg-primary-soft px-3 py-2 text-center text-primary">
                        <div className="text-[20px] font-extrabold leading-none">{f.sheet.glance.average}</div>
                        <div className="text-[11px] font-semibold">/ 4</div>
                      </div>
                    )}
                  </div>
                  {f.sheet.glance.rated > 0 && (
                    <p className="text-[14px]">
                      Đạt {f.sheet.glance.reached}/{f.sheet.glance.rated} tiêu chí
                      {f.sheet.glance.best ? <> · mạnh nhất: <b>{f.sheet.glance.best}</b></> : null}
                      {f.sheet.glance.practice ? <> · luyện thêm: <b className="text-accent-700">{f.sheet.glance.practice}</b></> : null}
                    </p>
                  )}
                  {f.sheet.remark && <blockquote className="border-l-4 border-primary/30 pl-3 text-[14px] italic">“{f.sheet.remark}”</blockquote>}
                  <Link href="/ph/nhan-xet" className="inline-flex min-h-10 items-center text-[14px] font-semibold text-primary">Xem cả phiếu →</Link>
                </article>
              </PhBlock>
            )}
          </div>

          <div className="min-w-0 space-y-6">
            {d.fees.total > 0 && d.fees.first && (
              <PhBlock title="Học phí" action={{ href: "/ph/hoc-phi", label: "Chi tiết" }}>
                <section className="card border-amber-200 bg-amber-50 p-4">
                  <div className="text-[13px] text-amber-900">Cần đóng{d.fees.count > 1 ? ` · ${d.fees.count} đơn` : ""}</div>
                  <div className="text-[22px] font-extrabold text-amber-900">{vndPh(d.fees.total)}</div>
                  <Link href={`/ph/hoc-phi?don=${d.fees.first.id}#don-${d.fees.first.id}`} className="btn-primary mt-2 min-h-11 w-full text-[14px]">Thanh toán QR</Link>
                </section>
              </PhBlock>
            )}

            <PhBlock title="Thông báo" action={{ href: "/ph/thong-bao", label: "Tất cả" }}>
              {d.notifications.length === 0 ? (
                <div className="card p-4 text-[14px] text-ink-600">Chưa có thông báo mới.</div>
              ) : (
                <ul className="card divide-y divide-black/5">
                  {d.notifications.map((n) => (
                    <li key={n.id}>
                      <Link href={n.link ?? "/ph/thong-bao"} className="block p-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{n.title}</div>
                            <div className="line-clamp-2 text-[13px] text-ink-600">{n.body}</div>
                            <div className="mt-0.5 text-[12px] text-ink-400">{dtPh(n.createdAt)}</div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </PhBlock>

            <PhBlock title="Lối tắt">
              <nav aria-label="Lối tắt" className="grid grid-cols-2 gap-3">
                {[
                  { href: `/ph/lich?con=${kidId}`, icon: CalendarDays, title: "Lịch học", sub: f.attendance30.rate === null ? "Tháng này" : `Chuyên cần 30 ngày ${f.attendance30.rate}%` },
                  { href: `/ph/be/${kidId}`, icon: Route, title: "Hành trình học", sub: "Khoá, học bạ, chứng nhận" },
                  { href: `/ph/be/${kidId}/xu`, icon: Coins, title: "SataCoin", sub: `${f.coins} xu` },
                  { href: "/ph/bai-tap", icon: BookOpen, title: "Bài tập", sub: f.homework.length ? `${f.homework.length} bài cần làm` : "Không có bài chờ" },
                ].map((t) => (
                  <Link key={t.title} href={t.href} className="card flex min-h-[88px] flex-col justify-between p-3 transition hover:border-primary/40">
                    <t.icon className="h-5 w-5 text-primary" aria-hidden />
                    <span>
                      <span className="block text-[14px] font-bold">{t.title}</span>
                      <span className="block text-[12px] text-ink-600">{t.sub}</span>
                    </span>
                  </Link>
                ))}
              </nav>
            </PhBlock>
          </div>
        </div>
      )}
    </PhMain>
  );
}

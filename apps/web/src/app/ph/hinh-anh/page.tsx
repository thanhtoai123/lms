import Link from "next/link";
import { getDb } from "@satarobo/db";
import { familyChildren, hubPhotos } from "@satarobo/api";
import { childShortName, pickChild } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhPageHead, ChildChips, dayPh, todayPh } from "@/components/ph-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hình ảnh lớp — Sata Robo" };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * HÌNH ẢNH LỚP — ảnh buổi học đã được trung tâm duyệt, gom theo buổi.
 *
 * Hai hàng rào nằm ở dịch vụ, không ở đây: chỉ ảnh trạng thái *đã duyệt*, và chỉ khi gia đình
 * đã bật đồng ý "Đăng ảnh / video của con" ở màn Tài khoản. Vì vậy màn này có thể trống dù lớp
 * có ảnh — nói rõ điều đó cho phụ huynh thay vì để họ tưởng hệ thống hỏng.
 */
export default async function PhotosPage({ searchParams }: { searchParams: Promise<{ con?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const db = getDb();
  const kids = await familyChildren(db, p.id);
  const kid = pickChild(kids, sp.con && UUID.test(sp.con) ? sp.con : null);
  const today = todayPh();

  if (!kid) {
    return <PhMain><div className="card p-5 text-ink-600">Chưa có học viên gắn với tài khoản này.</div></PhMain>;
  }

  const d = await hubPhotos(db, p.id, kid.id);
  const buoi = d?.buoi ?? [];

  return (
    <PhMain className="space-y-4">
      <PhPageHead title={`Hình ảnh lớp của ${childShortName(kid)}`} desc="Ảnh buổi học đã được trung tâm duyệt." />
      <ChildChips kids={kids} activeId={kid.id} hrefFor={(id) => `/ph/hinh-anh?con=${id}`} />

      {buoi.length === 0 ? (
        <Empty>
          Chưa có ảnh nào. Ảnh chỉ hiện khi trung tâm đã duyệt và gia đình đã bật{" "}
          <Link href="/ph/tai-khoan" className="font-semibold text-primary underline">Đăng ảnh / video của con</Link> ở màn Tài khoản.
        </Empty>
      ) : (
        <div className="space-y-5">
          {buoi.map((b) => (
            <section key={b.sessionId} aria-label={`Ảnh ${b.label}`} className="space-y-2">
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-600">
                {dayPh(b.date, today)} · {b.label} · {b.className}
              </h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {b.anh.map((m) => (
                  <li key={m.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.caption ?? `Ảnh buổi học của ${childShortName(kid)}`} loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
                    {m.caption && <p className="mt-1 line-clamp-2 text-[12px] text-ink-600">{m.caption}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PhMain>
  );
}

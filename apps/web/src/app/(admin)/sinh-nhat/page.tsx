import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { Greet } from "./greet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sinh nhật học viên" };

export default async function BirthdaysPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:read")) return <NoAccess title="Sinh nhật học viên" perm="care:read" />;
  const days = [0, 7, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const d = await caller.care.birthdays({ days });
  return (
    <div className="space-y-4">
      <PageHeader title="Sinh nhật học viên" desc={`Hôm nay ${d.counts.today} bé · 7 ngày tới ${d.counts.week} bé. Gửi lời chúc qua app phụ huynh (mỗi năm một lần, từ hôm trước đến hôm sau sinh nhật).`} />
      <div className="flex gap-1 text-sm">{[[0, "Hôm nay"], [7, "7 ngày tới"], [30, "30 ngày tới"]].map(([n, l]) => <Link key={n} href={`/sinh-nhat?days=${n}`} className={`chip ${days === n ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>{l}</Link>)}</div>
      {d.items.length === 0 ? <Empty>Không có sinh nhật trong khoảng này.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Ngày</th><th className="p-3">Học viên</th><th className="p-3">Lớp</th><th className="p-3">Phụ huynh</th><th className="p-3">Lời chúc</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((s) => (
                <tr key={s.id} className={s.next.daysUntil === 0 ? "bg-amber-50/60" : ""}>
                  <td className="p-3">{s.next.date.split("-").reverse().join("/")}<div className="text-xs text-ink-400">{s.next.daysUntil === 0 ? "Hôm nay 🎂" : `còn ${s.next.daysUntil} ngày`}</div></td>
                  <td className="p-3"><Link href={`/students/${s.id}`} className="text-brand-700">{s.fullName}</Link><div className="text-xs text-ink-400">{s.code} · tròn {s.next.age} tuổi</div></td>
                  <td className="p-3 text-xs">{s.classCodes ?? "—"}<div className="text-ink-400">{s.centerCode}</div></td>
                  <td className="p-3 text-xs">{s.parentName ?? <span className="text-amber-700">Chưa có PH</span>}</td>
                  <td className="p-3">{s.greetedAt ? <span className="text-xs text-green-700">Đã chúc {dtVN(s.greetedAt)} · {s.greetedBy}</span> : s.canGreet ? <Greet studentId={s.id} template={d.template} /> : <span className="text-xs text-ink-400">Gửi vào ngày sinh nhật</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

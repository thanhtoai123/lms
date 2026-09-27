import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ShieldCheck, UserRound } from "lucide-react";
import { teacherMoreGroups } from "@satarobo/core";
import { NavIcon } from "@/components/admin-shell";
import { loadShell } from "@/lib/shell";

export const metadata = { title: "Thêm chức năng" };
export const dynamic = "force-dynamic";

/**
 * THÊM — mọi chức năng giáo viên được dùng ngoài 3 mục chính, lấy từ CHÍNH cây menu đã lọc quyền
 * (packages/core nav/menu.ts): thêm quyền cho vai trò là mục tự hiện ở đây, không phải sửa trang này.
 * Mở mục nào cũng vẫn ở trong khung giáo viên.
 */
export default async function TeacherMore() {
  const s = await loadShell();
  if (!s) redirect("/login");
  const groups = teacherMoreGroups(s.nav);
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold md:text-xl">Thêm chức năng</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.label} className="card p-2" aria-label={g.label}>
            <h2 className="px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-600">{g.label}</h2>
            <ul>
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.04]">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><NavIcon name={i.icon} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{i.label}</span>
                      {i.desc && <span className="line-clamp-1 block text-[13px] text-ink-600">{i.desc}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="card p-2" aria-label="Tài khoản">
          <h2 className="px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-600">Tài khoản</h2>
          <ul>
            <li><Link href="/tai-khoan" className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.04]"><span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-700"><UserRound className="h-4 w-4" aria-hidden /></span><span className="flex-1 font-semibold">Hồ sơ tài khoản</span><ChevronRight className="h-4 w-4 text-ink-600" aria-hidden /></Link></li>
            <li><Link href="/bao-mat" className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.04]"><span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-700"><ShieldCheck className="h-4 w-4" aria-hidden /></span><span className="flex-1 font-semibold">Bảo mật tài khoản</span><ChevronRight className="h-4 w-4 text-ink-600" aria-hidden /></Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Clock, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { trangChinh } from "@/lib/account";

export const metadata = { title: "Hồ sơ tài khoản", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmtDT = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt className="text-sm text-ink-600">{k}</dt>
      <dd className="min-w-0 break-words font-medium">{v}</dd>
    </div>
  );
}

/**
 * HỒ SƠ TÀI KHOẢN — menu tài khoản (góc phải trên) → Hồ sơ tài khoản.
 * Chỉ đọc: thông tin cá nhân do bộ phận nhân sự quản lý trong hồ sơ nhân sự / giáo viên.
 */
export default async function AccountPage() {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login?next=/tai-khoan");
  if (me.auth?.mfa.required && !me.auth.mfa.satisfied) redirect("/bao-mat");
  const p = await caller.auth.myProfile();
  const home = trangChinh(me.assignments.map((a) => a.role));
  const initials = p.fullName.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join("") || "U";

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Hồ sơ tài khoản</h1>
        <Link href={home.href} className="inline-flex min-h-11 items-center text-sm text-brand-600">← {home.label}</Link>
      </div>

      <section className="card flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{initials}</span>
        <div className="min-w-0">
          <div className="text-lg font-bold">{p.fullName}</div>
          <div className="break-all text-sm text-ink-600">{p.email}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.roles.map((r) => <span key={`${r.role}|${r.scope}`} className="chip bg-brand-50 text-brand-700">{r.label} · {r.scope}</span>)}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-6" aria-labelledby="tt-tk">
          <h2 id="tt-tk" className="mb-1 flex items-center gap-2 font-bold"><UserRound className="h-5 w-5 text-brand-600" aria-hidden />Thông tin tài khoản</h2>
          <dl className="divide-y divide-black/5">
            <Row k="Họ tên" v={p.fullName} />
            <Row k="Email đăng nhập" v={<span className="break-all">{p.email}</span>} />
            <Row k="Số điện thoại" v={p.phone ?? "—"} />
            <Row k="Xác thực 2 lớp" v={p.mfaEnabled ? <span className="text-green-700">Đang bật</span> : "Chưa bật"} />
            <Row k="Đăng nhập gần nhất" v={fmtDT(p.lastLoginAt)} />
            <Row k="Tạo tài khoản" v={fmtDT(p.createdAt)} />
          </dl>
        </section>

        <section className="card p-4 sm:p-6" aria-labelledby="tt-hs">
          <h2 id="tt-hs" className="mb-1 flex items-center gap-2 font-bold"><BookOpen className="h-5 w-5 text-brand-600" aria-hidden />Hồ sơ gắn với tài khoản</h2>
          <dl className="divide-y divide-black/5">
            <Row k="Hồ sơ nhân sự" v={p.staff ? `${p.staff.code} · ${p.staff.title} · ${p.staff.department}` : "Chưa gắn"} />
            {p.staff && <Row k="Cơ sở làm việc" v={p.staff.center} />}
            <Row k="Hồ sơ giáo viên" v={p.teacher ? `${p.teacher.code ?? "—"}${p.teacher.title ? ` · ${p.teacher.title}` : ""}` : "Chưa gắn"} />
            {p.teacher && <Row k="Cơ sở dạy" v={p.teacher.center} />}
          </dl>
          <p className="mt-3 text-[13px] text-ink-600">Họ tên, số điện thoại, chức danh do bộ phận nhân sự cập nhật trong hồ sơ nhân sự. Thông tin sai hoặc thiếu hồ sơ — báo nhân sự để sửa.</p>
        </section>
      </div>

      <section className="card p-4 sm:p-6" aria-label="Liên kết nhanh">
        <h2 className="mb-2 font-bold">Tài khoản của tôi</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <li><Link href="/bao-mat" className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-black/5 hover:bg-muted"><ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />Bảo mật &amp; xác thực 2 lớp</Link></li>
          <li><Link href="/quen-mat-khau" className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-black/5 hover:bg-muted"><KeyRound className="h-5 w-5 text-brand-600" aria-hidden />Đổi mật khẩu</Link></li>
          {p.staff && <li><Link href="/cham-cong/lich-ca" className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-black/5 hover:bg-muted"><Clock className="h-5 w-5 text-brand-600" aria-hidden />Ca &amp; công của tôi</Link></li>}
          {p.teacher && <li><Link href="/teacher" className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-black/5 hover:bg-muted"><BookOpen className="h-5 w-5 text-brand-600" aria-hidden />Giao diện giáo viên (lịch dạy, điểm danh)</Link></li>}
        </ul>
        <p className="mt-3"><Link href="/logout" prefetch={false} className="inline-flex min-h-11 items-center text-sm text-red-700 underline">Đăng xuất</Link></p>
      </section>
    </main>
  );
}

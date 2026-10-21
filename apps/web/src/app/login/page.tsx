import { cookies, headers } from "next/headers";
import { getDb } from "@satarobo/db";
import { loginPrecheck, recordLogin, staffBlocked, staffIdleMinutes } from "@satarobo/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@supabase/ssr";
import { devActorAllowed, DEV_ACTOR_HEADER, duongNoiBo } from "@satarobo/core";
import { ACCESS_COOKIE, REFRESH_COOKIE, IDLE_COOKIE, SEEN_COOKIE, clientMeta, cookieOptions, seenCookieOptions } from "@/lib/auth-session";
import { sharedRateLimited } from "@/lib/route-ctx";
import { BrandLockup, BrandName } from "@/components/brand";

export const metadata = { title: "Đăng nhập quản trị" };

const DEV = devActorAllowed(process.env);
const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Chỉ cho quay về đường dẫn nội bộ (chống open redirect) */
function safeNext(v: FormDataEntryValue | string | null | undefined) {
  const s = typeof v === "string" ? v : "";
  return duongNoiBo(s) ?? "/";
}

async function devLogin(formData: FormData) {
  "use server";
  if (!DEV) return;
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  const c = await cookies();
  // Cookie tài khoản mẫu: httpOnly để kịch bản trên trang không đọc/đổi được (chỉ có ở môi trường phát triển)
  c.set(DEV_ACTOR_HEADER, email, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  await recordLogin(getDb(), { email, result: "success", ...clientMeta(await headers()) });
  redirect(safeNext(formData.get("next")));
}

async function supabaseLogin(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const c = await cookies();
  const meta = clientMeta(await headers());
  const db = getDb();
  const back = `&next=${encodeURIComponent(next)}`;
  if (!email || email.length > 200 || !password || password.length > 200) redirect(`/login?error=1${back}`);
  // Trần dùng chung giữa các bản sao, TRƯỚC khi hỏi Supabase — `loginLockDecision` khoá theo tài khoản,
  // còn đây chặn máy dò rải nhiều tài khoản từ một IP. Đụng trần trả đúng màn hình "tạm khoá"
  // như khoá theo tài khoản, để không lộ tài khoản nào có thật.
  const gate = (await sharedRateLimited("staffLoginIp", "ip", meta.ip, "login")) ||
    (await sharedRateLimited("staffLoginEmail", "email", email, "login"));
  if (gate) {
    await recordLogin(db, { email, result: "locked_out", ...meta });
    redirect(`/login?error=locked&wait=15${back}`);
  }
  const pre = await loginPrecheck(db, { email, ip: meta.ip });
  if (!pre.allowed) {
    await recordLogin(db, { email, result: "locked_out", ...meta });
    redirect(`/login?error=locked&wait=${pre.retryAfterMin}${back}`);
  }
  if (await staffBlocked(db, email)) {
    await recordLogin(db, { email, result: "bad_password", ...meta });
    redirect(`/login?error=1${back}`);
  }
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => c.getAll(), setAll: (all) => all.forEach(({ name, value, options }) => c.set(name, value, options)) },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    await recordLogin(db, { email, result: "bad_password", ...meta });
    redirect(`/login?error=1${back}`);
  }
  await recordLogin(db, { email, result: "success", ...meta });
  c.set(ACCESS_COOKIE, data.session.access_token, cookieOptions("access", data.session.expires_in));
  c.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions("refresh"));
  c.set(SEEN_COOKIE, String(Date.now()), seenCookieOptions());
  c.set(IDLE_COOKIE, String(await staffIdleMinutes(db)), seenCookieOptions());
  redirect(next);
}

const DEV_ACCOUNTS = [
  { email: "superadmin@example.test", label: "Quản trị tối cao (toàn hệ thống)" },
  { email: "manager.cs1@example.test", label: "Quản lý trung tâm" },
  { email: "sale1.cs1@example.test", label: "Tư vấn / CSKH" },
  { email: "ketoan.cs1@example.test", label: "Kế toán" },
  { email: "hr.cs1@example.test", label: "Nhân sự" },
  { email: "daotao@example.test", label: "Đào tạo" },
  { email: "marketing@example.test", label: "Marketing" },
  { email: "teacher1@example.test", label: "Giáo viên" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; wait?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="grid min-h-dvh bg-surface lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-navy to-navy-2 px-12 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <div className="relative z-10 flex items-center gap-4">
          <BrandLockup height={60} onDark />
          <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Admin</span>
        </div>

        <div className="relative z-10 my-auto grid max-w-xl gap-8 py-10">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#fcd34d]">Nền tảng vận hành trung tâm</p>
            <h2 className="text-4xl font-extrabold leading-tight">Quản trị <BrandName /> trong một nơi</h2>
            <p className="text-base leading-relaxed text-white/75">Tuyển sinh, lớp học, học viên, tài chính và nhân sự — dữ liệu giới hạn theo cơ sở và vai trò của bạn.</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["#1D4ED8", "Tuyển sinh & CRM", "Lead, học thử, chốt đăng ký"],
              ["#10B981", "Lớp học & điểm danh", "Lịch học, giáo án, học liệu buổi"],
              ["#F59E0B", "Hồ sơ công nghệ", "Nhận xét, năng lực, chứng nhận"],
              ["#4F75E1", "Tài chính & nhân sự", "Học phí, hoá đơn, chấm công"],
            ].map(([c, t, d]) => (
              <li key={t} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <span className="mb-2 block h-1.5 w-8 rounded-full" style={{ background: c }} aria-hidden />
                <span className="block font-semibold text-white">{t}</span>
                <span className="block text-xs text-white/60">{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4 text-xs text-white/55">
          <span>© 2026 <BrandName /> · Dữ liệu cá nhân được bảo vệ theo Luật Bảo vệ dữ liệu cá nhân 2025</span>
          <span className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full" aria-hidden><span className="flex-1 bg-[#1D4ED8]" /><span className="flex-1 bg-[#10B981]" /><span className="flex-1 bg-[#F59E0B]" /></span>
        </div>
        <div className="pointer-events-none absolute -right-28 -top-28 h-[26rem] w-[26rem] rounded-full bg-white/[0.07]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-80 w-80 rounded-full bg-white/[0.04]" aria-hidden />
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] sm:p-10">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden"><BrandLockup height={48} /><span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Admin</span></div>
          <h1 className="text-2xl font-bold">Đăng nhập quản trị</h1>
          <p className="mb-6 mt-1 text-sm text-ink-600">Dùng tài khoản nhân sự được cấp để vào khu quản trị.</p>

          {sp.error === "session" && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Phiên đăng nhập đã hết — vui lòng đăng nhập lại.</p>}
          {sp.error === "idle" && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Bạn đã được đăng xuất do không thao tác trong thời gian dài — vui lòng đăng nhập lại.</p>}
          {sp.error === "locked" && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">Đăng nhập tạm khoá do nhập sai nhiều lần. Thử lại sau khoảng {Math.max(1, Number(sp.wait) || 15)} phút hoặc dùng “Quên mật khẩu?”.</p>}
          {sp.error === "forbidden" && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Tài khoản này không có quyền vào khu quản trị.</p>}

          {hasSupabase ? (
            <form action={supabaseLogin} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required className="input" autoComplete="username" placeholder="ten@thsteam.edu.vn" />
              </div>
              <div>
                <label className="label" htmlFor="password">Mật khẩu</label>
                <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
              </div>
              {sp.error === "1" && <p className="text-sm text-danger" role="alert">Email hoặc mật khẩu không đúng.</p>}
              <button className="btn-primary w-full" type="submit">Đăng nhập</button>
              <p className="text-center text-xs text-ink-400"><Link href="/quen-mat-khau" className="text-brand-600">Quên mật khẩu?</Link></p>
            </form>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">Đăng nhập bằng email / mật khẩu sẽ bật khi cấu hình Supabase Auth (<code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code>).</p>
          )}

          {DEV && (
            <form action={devLogin} className="mt-6 space-y-3 border-t border-border pt-6">
              <input type="hidden" name="next" value={next} />
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Chế độ phát triển — vào bằng tài khoản mẫu</p>
              <select name="email" className="input" defaultValue="superadmin@example.test" aria-label="Tài khoản mẫu">
                {DEV_ACCOUNTS.map((a) => <option key={a.email} value={a.email}>{a.label}</option>)}
              </select>
              <button className="btn-primary w-full" type="submit">Vào khu quản trị</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

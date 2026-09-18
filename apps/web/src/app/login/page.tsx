import { cookies, headers } from "next/headers";
import { getDb } from "@satarobo/db";
import { loginPrecheck, recordLogin, staffBlocked, staffIdleMinutes } from "@satarobo/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@supabase/ssr";
import { devActorAllowed, DEV_ACTOR_HEADER } from "@satarobo/core";
import { ACCESS_COOKIE, REFRESH_COOKIE, IDLE_COOKIE, SEEN_COOKIE, clientMeta, cookieOptions, seenCookieOptions } from "@/lib/auth-session";

export const metadata = { title: "Đăng nhập quản trị" };

const DEV = devActorAllowed(process.env);
const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Chỉ cho quay về đường dẫn nội bộ (chống open redirect) */
function safeNext(v: FormDataEntryValue | string | null | undefined) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
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
  { email: "manager.cs1@example.test", label: "Quản lý cơ sở CS1" },
  { email: "sale1.cs1@example.test", label: "Tư vấn / CSKH CS1" },
  { email: "ketoan.cs1@example.test", label: "Kế toán cơ sở CS1" },
  { email: "hr.cs1@example.test", label: "Nhân sự cơ sở CS1" },
  { email: "daotao@example.test", label: "Đào tạo (hội sở)" },
  { email: "marketing@example.test", label: "Marketing (hội sở)" },
  { email: "teacher1@satarobo.vn", label: "Giáo viên CS1" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; wait?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="grid min-h-dvh bg-surface lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="text-2xl font-extrabold tracking-tight">SataRobo <span className="text-sm font-medium text-white/70">Admin</span></div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-bold leading-tight">Hệ thống quản trị trung tâm Sata Robo</h2>
          <p className="text-white/80">Tuyển sinh, lớp học, học viên, tài chính và nhân sự trong một nơi — dữ liệu giới hạn theo cơ sở và vai trò của bạn.</p>
        </div>
        <div className="text-xs text-white/60">© 2026 Sata Robo · Dữ liệu cá nhân được bảo vệ theo Luật Bảo vệ dữ liệu cá nhân 2025</div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 right-24 h-72 w-72 rounded-full bg-white/5" aria-hidden />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden text-center text-2xl font-extrabold tracking-tight"><span className="text-brand-600">Sata</span>Robo <span className="text-sm font-medium text-ink-400">Admin</span></div>
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
                <input id="email" name="email" type="email" required className="input" autoComplete="username" placeholder="ten@satarobo.vn" />
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
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Đăng nhập bằng email/mật khẩu sẽ bật khi cấu hình Supabase Auth (NEXT_PUBLIC_SUPABASE_URL).</p>
          )}

          {DEV && (
            <form action={devLogin} className="mt-6 space-y-2 border-t border-black/5 pt-5">
              <input type="hidden" name="next" value={next} />
              <p className="text-xs font-semibold uppercase text-ink-400">Chế độ phát triển — vào bằng tài khoản mẫu</p>
              <select name="email" className="input" defaultValue="superadmin@example.test" aria-label="Tài khoản mẫu">
                {DEV_ACCOUNTS.map((a) => <option key={a.email} value={a.email}>{a.label}</option>)}
              </select>
              <button className="btn-ghost w-full" type="submit">Vào khu quản trị</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

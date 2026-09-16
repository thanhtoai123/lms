import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

const DEV = process.env.NODE_ENV !== "production";
const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function devLogin(formData: FormData) {
  "use server";
  if (!DEV) return;
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  const c = await cookies();
  c.set("x-dev-actor", email, { httpOnly: false, sameSite: "lax", path: "/" });
  redirect("/");
}

async function supabaseLogin(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const c = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => c.getAll(), setAll: (all) => all.forEach(({ name, value, options }) => c.set(name, value, options)) },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) redirect("/login?error=1");
  c.set("sb-access-token", data.session.access_token, { httpOnly: true, sameSite: "lax", path: "/", secure: !DEV });
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-b from-brand-50 to-surface">
      <div className="card w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-brand-500 grid place-items-center text-white text-2xl font-black">S</div>
          <h1 className="text-xl font-bold">Sata Robo Platform</h1>
          <p className="text-sm text-ink-600">Đăng nhập hệ thống vận hành</p>
        </div>

        {hasSupabase ? (
          <form action={supabaseLogin} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" required className="input" autoComplete="username" />
            </div>
            <div>
              <label className="label">Mật khẩu</label>
              <input name="password" type="password" required className="input" autoComplete="current-password" />
            </div>
            {sp.error && <p className="text-sm text-danger">Email hoặc mật khẩu không đúng.</p>}
            <button className="btn-primary w-full" type="submit">Đăng nhập</button>
          </form>
        ) : (
          <p className="text-sm text-ink-600">Supabase Auth chưa cấu hình (NEXT_PUBLIC_SUPABASE_URL).</p>
        )}

        {DEV && (
          <form action={devLogin} className="mt-6 border-t border-black/5 pt-4 space-y-2">
            <p className="text-xs font-semibold text-ink-400 uppercase">Dev mode — chọn tài khoản mẫu</p>
            <select name="email" className="input" defaultValue="teacher1@satarobo.vn">
              <option value="teacher1@satarobo.vn">GV Minh — Giáo viên CS1</option>
              <option value="manager.cs1@example.test">Quản lý CS1</option>
              <option value="superadmin@example.test">Super admin</option>
            </select>
            <button className="btn-ghost w-full" type="submit">Vào với tài khoản mẫu</button>
          </form>
        )}
      </div>
    </main>
  );
}

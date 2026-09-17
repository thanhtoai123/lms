import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { passwordProblems, validTokenHash } from "@satarobo/core";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, setPassword, supabaseOn, verifyTokenHash } from "@/lib/auth-session";

export const metadata = { title: "Đặt mật khẩu", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Liên kết trong email chỉ mở form (không dùng token khi GET — trình quét email có thể mở trước).
 * Token được dùng một lần khi người dùng bấm lưu.
 */
async function save(formData: FormData) {
  "use server";
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = formData.get("type") === "invite" ? "invite" : "recovery";
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");
  const back = (e: string) => redirect(`/dat-mat-khau?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&e=${encodeURIComponent(e)}`);
  if (!validTokenHash(tokenHash)) redirect("/dat-mat-khau?e=link");
  if (pw !== pw2) back("Hai mật khẩu không khớp");
  const pre = passwordProblems(pw, null);
  if (pre.length) back(pre.join("; "));
  const s = await verifyTokenHash(tokenHash, type);
  if (!s) redirect("/dat-mat-khau?e=link");
  const probs = passwordProblems(pw, s.user?.email ?? null);
  if (probs.length) redirect(`/dat-mat-khau?e=${encodeURIComponent(`${probs.join("; ")} — liên kết đã dùng, yêu cầu liên kết mới`)}&expired=1`);
  const err = await setPassword(s.access_token, pw);
  if (err) redirect(`/dat-mat-khau?e=${encodeURIComponent(err)}&expired=1`);
  const c = await cookies();
  c.set(ACCESS_COOKIE, s.access_token, cookieOptions("access", s.expires_in));
  c.set(REFRESH_COOKIE, s.refresh_token, cookieOptions("refresh"));
  redirect("/dashboard");
}

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; e?: string; expired?: string }> }) {
  const sp = await searchParams;
  const ok = validTokenHash(sp.token_hash) && sp.e !== "link" && !sp.expired;
  const type = sp.type === "invite" ? "invite" : "recovery";
  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-6">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold">{type === "invite" ? "Tạo mật khẩu tài khoản" : "Đặt lại mật khẩu"}</h1>
        {!supabaseOn() && <p className="text-sm text-amber-800">Hệ thống chưa bật đăng nhập bằng mật khẩu.</p>}
        {sp.e && sp.e !== "link" && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.e}</p>}
        {ok ? (
          <form action={save} className="space-y-3">
            <input type="hidden" name="token_hash" value={sp.token_hash} />
            <input type="hidden" name="type" value={type} />
            <div><label className="label" htmlFor="pw">Mật khẩu mới</label><input id="pw" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
            <div><label className="label" htmlFor="pw2">Nhập lại</label><input id="pw2" name="password2" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
            <p className="text-xs text-ink-600">Tối thiểu 10 ký tự, có cả chữ và số, không chứa tên email.</p>
            <button className="btn-primary w-full">Lưu mật khẩu và đăng nhập</button>
          </form>
        ) : (
          <p className="text-sm text-ink-600">Liên kết không hợp lệ hoặc đã hết hạn / đã dùng. <Link href="/quen-mat-khau" className="text-brand-600">Yêu cầu liên kết mới</Link> hoặc nhờ quản trị gửi lại lời mời.</p>
        )}
      </div>
    </main>
  );
}

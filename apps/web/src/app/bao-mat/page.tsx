import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";
import { supabaseOn } from "@/lib/auth-session";
import { MfaPanel } from "./panel";
import { LoginHistory } from "@/components/login-history";

export const metadata = { title: "Bảo mật tài khoản", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login?next=/bao-mat");
  const auth = me.auth;
  const pending = !!auth?.mfa.required && !auth.mfa.satisfied;
  const logins = await caller.auth.myLogins().catch(() => ({ items: [], lockedNow: false }));
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Bảo mật tài khoản</h1>
        {!pending && <Link href="/viec-hom-nay" className="text-sm text-brand-600">← Quản trị</Link>}
      </div>
      <p className="text-sm text-ink-600">{me.user.fullName} · {me.user.email}</p>
      {pending && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Vai trò của bạn bắt buộc xác thực 2 lớp. Nhập mã từ ứng dụng xác thực (Google Authenticator, Microsoft Authenticator…) để tiếp tục.</div>}
      {auth?.via !== "supabase" || !supabaseOn() ? (
        <p className="card p-4 text-sm text-ink-600">Xác thực 2 lớp chỉ áp dụng cho đăng nhập bằng email / mật khẩu.</p>
      ) : (
        <MfaPanel pending={pending} />
      )}
      <div className="card space-y-1 p-4 text-sm">
        <div className="font-semibold">Mật khẩu</div>
        <p className="text-ink-600">Đổi mật khẩu: <Link href="/quen-mat-khau" className="text-brand-600">gửi liên kết đặt lại</Link> tới email của bạn.</p>
        <p><Link href="/logout" className="text-red-700 underline">Đăng xuất</Link></p>
      </div>
      <section className="card overflow-hidden">
        <div className="border-b border-black/5 px-4 py-3">
          <h2 className="font-semibold">Hoạt động đăng nhập gần đây</h2>
          <p className="text-xs text-ink-600">Thấy lần đăng nhập lạ? Đổi mật khẩu ngay và báo quản trị.</p>
        </div>
        {logins.lockedNow && <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Tài khoản đang tạm khoá đăng nhập do nhập sai mật khẩu nhiều lần.</div>}
        <LoginHistory rows={logins.items} />
      </section>
    </main>
  );
}

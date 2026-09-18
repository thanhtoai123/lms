import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@satarobo/db";
import { requestPasswordReset } from "@satarobo/api";
import { sharedRateLimited } from "@/lib/route-ctx";

export const metadata = { title: "Quên mật khẩu", robots: { index: false } };
export const dynamic = "force-dynamic";

async function send(formData: FormData) {
  "use server";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const email = String(formData.get("email") ?? "").slice(0, 200);
  // Trần dùng chung giữa các bản sao. Đụng trần vẫn trả về MÀN HÌNH GIỐNG HỆT lúc gửi thành công —
  // không được để kẻ dò phân biệt "email này có tài khoản" qua thông báo lỗi.
  const blocked = (await sharedRateLimited("passwordResetIp", "ip", ip, "pwreset")) ||
    (await sharedRateLimited("passwordResetEmail", "email", email, "pwreset"));
  if (blocked) redirect("/quen-mat-khau?sent=1");
  await requestPasswordReset(getDb(), { email });
  redirect("/quen-mat-khau?sent=1");
}

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-6">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold">Quên mật khẩu</h1>
        {sp.sent ? (
          <p className="text-sm text-ink-600">Nếu email thuộc tài khoản nhân sự đang hoạt động, liên kết đặt lại mật khẩu đã được gửi (hiệu lực 1 giờ). Kiểm tra cả hộp thư rác.</p>
        ) : (
          <form action={send} className="space-y-3">
            <div><label className="label" htmlFor="email">Email công việc</label><input id="email" name="email" type="email" required autoComplete="username" className="input" /></div>
            <button className="btn-primary w-full">Gửi liên kết đặt lại</button>
          </form>
        )}
        <p className="text-center text-xs"><Link href="/login" className="text-brand-600">← Đăng nhập</Link></p>
      </div>
    </main>
  );
}

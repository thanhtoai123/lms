import { redirect } from "next/navigation";
import { currentParent } from "@/lib/parent-session";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ParentLoginPage() {
  if (await currentParent()) redirect("/ph");
  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500 text-2xl font-bold text-white">S</div>
        <h1 className="mt-3 text-xl font-bold">Sata Robo — Phụ huynh</h1>
        <p className="text-sm text-ink-600">Lịch học, điểm danh, bài tập, học bạ, học phí và nhắn tin với trung tâm.</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-[11px] text-ink-400">Dùng số điện thoại đã đăng ký với trung tâm. Trung tâm không bao giờ hỏi mã đăng nhập của anh/chị.</p>
    </main>
  );
}

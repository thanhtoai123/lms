import { redirect } from "next/navigation";
import { currentParent } from "@/lib/parent-session";
import { LoginForm } from "./form";
import { BrandLockup } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function ParentLoginPage() {
  if (await currentParent()) redirect("/ph");
  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <BrandLockup vertical height={112} className="mx-auto" />
        <h1 className="mt-4 text-xl font-bold">Cổng phụ huynh</h1>
        <p className="text-[15px] text-ink-600">Lịch học, điểm danh, bài tập, học bạ, học phí và nhắn tin với trung tâm.</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-[13px] text-ink-600">Dùng số điện thoại đã đăng ký với trung tâm. Trung tâm không bao giờ hỏi mã đăng nhập của anh/chị.</p>
    </main>
  );
}

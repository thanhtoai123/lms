import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { Quiz } from "./quiz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hướng dẫn & đào tạo" };

type Mod = { key: string; title: string; minutes: number; steps: { text: string; href?: string }[]; quiz: { q: string; options: string[] }[]; required: boolean; completedAt: Date | null };

function ModuleCard({ m }: { m: Mod }) {
  return (
    <details className="card p-4" open={m.required && !m.completedAt}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{m.title}</span>
        <span className="flex items-center gap-2 text-xs">
          <span className="text-ink-400">{m.minutes} phút</span>
          {m.completedAt ? <span className="chip bg-green-100 text-green-800">Đã xong {new Date(m.completedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span> : m.required ? <span className="chip bg-amber-100 text-amber-800">Cần học</span> : <span className="chip bg-slate-100">Tham khảo</span>}
        </span>
      </summary>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        {m.steps.map((s, i) => <li key={i}>{s.text} {s.href && <Link href={s.href} className="text-brand-600">Mở trang</Link>}</li>)}
      </ol>
      <Quiz moduleKey={m.key} questions={m.quiz} done={!!m.completedAt} />
    </details>
  );
}

export default async function TrainingPage() {
  const { caller } = await getServerCaller();
  const d = await caller.readiness.myTraining();
  return (
    <div className="space-y-4">
      <PageHeader title="Hướng dẫn & đào tạo" desc="Bài hướng dẫn ngắn theo vai trò của bạn. Đọc các bước, làm thử trên hệ thống rồi trả lời câu hỏi kiểm tra — đúng hết mới tính hoàn thành. Cơ sở chỉ chuyển chính thức khi toàn bộ nhân sự học xong." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Bài cần học" value={d.required.length} />
        <Kpi label="Đã xong" value={d.doneCount} tone={d.required.length && d.doneCount === d.required.length ? "good" : "default"} />
      </div>
      {d.required.length === 0 && <p className="text-sm text-ink-600">Vai trò của bạn không có bài bắt buộc — xem các bài tham khảo bên dưới.</p>}
      {d.required.map((m) => <ModuleCard key={m.key} m={m} />)}
      {d.others.length > 0 && <h2 className="pt-2 font-semibold">Bài của vai trò khác</h2>}
      {d.others.map((m) => <ModuleCard key={m.key} m={m} />)}
    </div>
  );
}

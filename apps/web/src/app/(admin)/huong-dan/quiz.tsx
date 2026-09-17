"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function Quiz({ moduleKey, questions, done }: { moduleKey: string; questions: { q: string; options: string[] }[]; done: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [ans, setAns] = useState<(number | null)[]>(questions.map(() => null));
  const m = useMutation(trpc.readiness.complete.mutationOptions({ onSuccess: (r) => { if (r.passed) router.refresh(); } }));
  const wrong = new Set(m.data && !m.data.passed ? m.data.wrong : []);
  return (
    <form className="mt-4 space-y-3 border-t border-black/5 pt-3 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ key: moduleKey, answers: ans.map((a) => a ?? -1).map((a) => Math.max(a, 0)) }); }}>
      <div className="font-semibold">Câu hỏi kiểm tra{done ? " (làm lại để ôn)" : ""}</div>
      {questions.map((q, i) => (
        <fieldset key={i} className={`rounded-xl border p-3 ${wrong.has(i) ? "border-red-300 bg-red-50/50" : "border-black/10"}`}>
          <legend className="px-1 font-medium">{i + 1}. {q.q}</legend>
          {q.options.map((o, j) => (
            <label key={j} className="flex items-center gap-2 py-0.5">
              <input type="radio" name={`${moduleKey}-${i}`} checked={ans[i] === j} onChange={() => setAns(ans.map((x, k) => (k === i ? j : x)))} /> {o}
            </label>
          ))}
          {wrong.has(i) && <div className="text-xs text-red-700">Chưa đúng — đọc lại các bước ở trên.</div>}
        </fieldset>
      ))}
      <button className="btn-primary" disabled={ans.some((a) => a === null) || m.isPending}>Nộp bài</button>
      {m.data?.passed && <span className="ml-2 text-green-700">Đạt — đã ghi nhận hoàn thành.</span>}
      {m.error && <span className="ml-2 text-red-700">{m.error.message}</span>}
    </form>
  );
}

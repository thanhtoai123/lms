"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function Greet({ studentId, template }: { studentId: string; template: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(template);
  const m = useMutation(trpc.care.greetBirthday.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="min-w-[16rem] space-y-1">
      {edit && <textarea className="input h-20 text-xs" value={text} onChange={(e) => setText(e.target.value)} />}
      <div className="flex gap-1">
        <button className="btn-primary !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ studentId, message: text === template ? null : text })}>Gửi lời chúc</button>
        {!edit && <button className="text-xs text-brand-600" onClick={() => setEdit(true)}>Sửa lời chúc</button>}
      </div>
      {m.error && <div className="text-xs text-red-700">{m.error.message}</div>}
    </div>
  );
}

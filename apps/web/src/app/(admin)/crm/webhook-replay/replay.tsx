"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function ReplayButton({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.replayWebhook.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex flex-col items-end gap-1">
      <button className="btn-ghost !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ id })}>{m.isPending ? "Đang chạy…" : "Chạy lại"}</button>
      {m.error && <span className="max-w-[200px] text-right text-xs text-red-700">{m.error.message}</span>}
      {m.data && <span className="text-xs text-ink-600">→ {m.data.status}</span>}
    </span>
  );
}

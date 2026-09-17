"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function RetryEmail({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.retryEmail.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="block">
      <button className="text-xs text-brand-600" disabled={m.isPending} onClick={() => m.mutate({ id })}>Gửi lại</button>
      {m.error && <span className="block text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

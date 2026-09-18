"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox } from "@/components/admin-ui";

/**
 * "Buổi này không có ảnh" — ghi nhận buổi đã xử lý ảnh để hết cảnh báo quá hạn.
 * Bấm lại để bỏ ghi nhận (buổi quay lại hàng đợi).
 */
export function NoMediaButton({ sessionId, marked, label }: { sessionId: string; marked: boolean; label: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.learning.markSessionNoMedia.mutationOptions({
    onSuccess: () => { setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  return (
    <div className="space-y-2">
      <button
        className={marked ? "btn-ghost text-xs" : "btn-primary text-sm"}
        disabled={m.isPending}
        onClick={() => m.mutate({ sessionId, value: !marked })}
      >
        {m.isPending ? "Đang lưu…" : marked ? "Bỏ ghi nhận “không có ảnh”" : `Buổi này không có ảnh (${label})`}
      </button>
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

/** Bật / tắt "Hiển thị public" ngay trên danh sách nhân sự (như bản gốc) */
export function PublicToggle({ id, isPublic, canUpdate }: { id: string; isPublic: boolean; canUpdate: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [on, setOn] = useState(isPublic);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation(trpc.hr.setStaffPublic.mutationOptions({
    onSuccess: (r) => { setOn(r.isPublic); setErr(null); router.refresh(); },
    onError: (e) => { setOn(isPublic); setErr(e.message); },
  }));
  if (!canUpdate) return <span className="chip bg-black/5 text-ink-600">{on ? "Có" : "Không"}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <label className="flex cursor-pointer items-center gap-1 text-xs">
        <input type="checkbox" checked={on} disabled={m.isPending} onChange={(e) => { setOn(e.target.checked); m.mutate({ id, isPublic: e.target.checked }); }} />
        {on ? "Có" : "Không"}
      </label>
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </span>
  );
}

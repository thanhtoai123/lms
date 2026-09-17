"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ITEM_TYPES, ITEM_TYPE_VI, type ItemType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export function NewAudit({ centers }: { centers: { id: string; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [centerId, setCenter] = useState(centers[0]?.id ?? "");
  const [type, setType] = useState("");
  const m = useMutation(trpc.inventory.createAudit.mutationOptions({ onSuccess: (r) => router.push(`/inventory/audit/${r.id}`) }));
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ centerId, type: (type || null) as ItemType | null }); }}>
      {centers.length > 1 && <select className="input" value={centerId} onChange={(e) => setCenter(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
      <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">Toàn bộ hàng</option>{ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_VI[t]}</option>)}</select>
      <button className="btn-primary" disabled={m.isPending}>+ Lập phiếu kiểm kê</button>
      {m.error && <span className="w-full text-sm text-red-700">{m.error.message}</span>}
    </form>
  );
}

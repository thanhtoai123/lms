"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function MessagingSettingsForm({ initial, centers }: { initial: { defaultCenterId: string | null; autoReply: string }; centers: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const m = useMutation(trpc.messaging.saveSettings.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate(v); }}>
      <label className="block">Cơ sở nhận tin Messenger / Zalo mới<select className="input mt-1" value={v.defaultCenterId ?? ""} onChange={(e) => setV({ ...v, defaultCenterId: e.target.value || null })}><option value="">Hội sở (chưa phân cơ sở)</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
      <label className="block">Ghi chú trả lời mẫu (hiển thị cho nhân viên)<textarea className="input mt-1" rows={2} maxLength={500} value={v.autoReply} onChange={(e) => setV({ ...v, autoReply: e.target.value })} /></label>
      <button className="btn-primary" disabled={m.isPending}>Lưu</button>
      {m.isSuccess && <span className="ml-2 text-green-700">Đã lưu</span>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </form>
  );
}

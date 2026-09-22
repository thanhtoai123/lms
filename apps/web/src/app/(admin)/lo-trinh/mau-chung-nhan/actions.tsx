"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox } from "@/components/admin-ui";

export function CreateTemplate({ templates }: { templates: { id: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(trpc.certificates.templates.create.mutationOptions({
    onSuccess: (t) => router.push(`/lo-trinh/mau-chung-nhan/${t.id}`),
    onError: (e) => setError(e.message),
  }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Tạo mẫu mới</button>;
  return (
    <div className="card max-w-xl space-y-3 p-4">
      <h2 className="font-bold">Tạo mẫu giấy chứng nhận</h2>
      <label className="block">
        <span className="label">Tên mẫu *</span>
        <input className="input" value={name} maxLength={120} placeholder="Ví dụ: Chứng nhận lộ trình — Canva 2026" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Hướng giấy</span>
          <select className="input" value={orientation} disabled={!!copyFrom} onChange={(e) => setOrientation(e.target.value === "portrait" ? "portrait" : "landscape")}>
            <option value="landscape">A4 ngang (khuyến nghị)</option>
            <option value="portrait">A4 dọc</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Sao chép bố cục từ</span>
          <select className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">— Bố cục mặc định —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={name.trim().length < 2 || create.isPending} onClick={() => { setError(null); create.mutate({ name, orientation, copyFromId: copyFrom || null }); }}>
          {create.isPending ? "Đang tạo…" : "Tạo và mở trình dựng"}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
      </div>
    </div>
  );
}

export function SetDefaultButton({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.certificates.templates.setDefault.mutationOptions({ onSuccess: () => router.refresh(), onError: (e) => window.alert(e.message) }));
  return <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={m.isPending} onClick={() => m.mutate({ id })}>Đặt làm mặc định</button>;
}

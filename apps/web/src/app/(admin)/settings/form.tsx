"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { AppSettings } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const FIELDS: { key: keyof AppSettings; label: string; hint?: string; wide?: boolean; area?: boolean; readOnly?: boolean }[] = [
  { key: "brandName", label: "Tên thương hiệu" },
  { key: "legalName", label: "Tên pháp nhân", hint: "In trên phiếu thu" },
  { key: "taxCode", label: "Mã số thuế" },
  { key: "hotline", label: "Hotline" },
  { key: "supportEmail", label: "Email hỗ trợ" },
  { key: "website", label: "Website" },
  { key: "zaloOaId", label: "Zalo OA ID" },
  { key: "parentAppUrl", label: "Địa chỉ app phụ huynh", hint: "Dùng trong email / tin nhắn" },
  { key: "timezone", label: "Múi giờ", readOnly: true },
  { key: "headOfficeAddress", label: "Địa chỉ hội sở", wide: true },
  { key: "receiptFooter", label: "Chân phiếu thu", wide: true, area: true, hint: "Tối đa 300 ký tự" },
];

export function SettingsForm({ initial, canEdit }: { initial: AppSettings; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState<AppSettings>(initial);
  const m = useMutation(trpc.admin.saveSettings.mutationOptions({ onSuccess: () => router.refresh() }));
  const set = (k: keyof AppSettings, x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <form className="card grid gap-3 p-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); m.mutate(v); }}>
      {FIELDS.map((f) => (
        <label key={f.key} className={`text-sm ${f.wide ? "md:col-span-3" : ""}`}>
          {f.label}{f.hint && <span className="ml-1 text-xs text-ink-400">({f.hint})</span>}
          {f.area
            ? <textarea className="input mt-1 w-full" rows={2} value={v[f.key]} maxLength={300} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} />
            : <input className="input mt-1 w-full" value={v[f.key]} disabled={!canEdit || f.readOnly} onChange={(e) => set(f.key, e.target.value)} />}
        </label>
      ))}
      {canEdit && (
        <div className="flex items-center gap-3 md:col-span-3">
          <button className="btn-primary" disabled={m.isPending}>Lưu cài đặt</button>
          {m.error && <span className="text-sm text-red-700">{m.error.message}</span>}
          {m.data && !m.isPending && <span className="text-sm text-green-700">Đã lưu{m.data.changed?.length ? ` (${m.data.changed.length} mục thay đổi)` : " — không có thay đổi"}.</span>}
        </div>
      )}
    </form>
  );
}

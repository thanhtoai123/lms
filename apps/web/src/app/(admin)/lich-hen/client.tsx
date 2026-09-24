"use client";

/**
 * Đặt hẹn và chốt hẹn.
 *
 * Ô thời điểm dùng `datetime-local` (giờ máy của người dùng, tức giờ Việt Nam ở trung tâm) rồi gửi
 * lên dạng ISO — không tự ý cộng trừ múi giờ ở client, để giờ hiện lại đúng cái người ta gõ.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { APPOINTMENT_KINDS, APPOINTMENT_KIND_VI, type AppointmentKind } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

function mocMacDinh() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function LichHenForm({ conversationId, leadId, goiY }: { conversationId?: string; leadId?: string | null; goiY?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [v, setV] = useState({ title: goiY ?? "", kind: "goi_lai" as AppointmentKind, at: mocMacDinh(), durationMin: 30, note: "" });
  const m = useMutation(trpc.admissions.appointments.save.mutationOptions({
    onSuccess: () => { setMo(false); setV({ ...v, title: "", note: "" }); router.refresh(); },
  }));
  return (
    <>
      <button type="button" className="btn-primary !py-1 text-xs" onClick={() => setMo((x) => !x)}>{mo ? "Đóng" : "Đặt lịch hẹn"}</button>
      {mo && (
        <div className="mt-2 w-full space-y-2 rounded-lg border border-black/10 bg-white p-3 text-xs shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="sm:col-span-2">Nội dung hẹn
              <input className="input mt-0.5 !py-1" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Gọi lại chốt lớp cho bé Minh" />
            </label>
            <label>Loại
              <select className="input mt-0.5 !py-1" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as AppointmentKind })}>
                {APPOINTMENT_KINDS.map((k) => <option key={k} value={k}>{APPOINTMENT_KIND_VI[k]}</option>)}
              </select>
            </label>
            <label>Thời điểm
              <input type="datetime-local" className="input mt-0.5 !py-1" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} />
            </label>
            <label>Thời lượng (phút)
              <input type="number" min={5} max={480} className="input mt-0.5 !py-1" value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) || 30 })} />
            </label>
            <label>Ghi chú
              <input className="input mt-0.5 !py-1" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Khách bận sáng, gọi sau 19h" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button" className="btn-primary !py-1 text-xs" disabled={m.isPending || v.title.trim().length < 3}
              onClick={() => m.mutate({
                title: v.title.trim(), kind: v.kind, at: new Date(v.at).toISOString(), durationMin: v.durationMin,
                note: v.note.trim() || null, conversationId: conversationId ?? null, leadId: leadId ?? null,
              })}
            >
              {m.isPending ? "Đang lưu…" : "Lưu lịch hẹn"}
            </button>
            {m.error && <span className="text-red-700">{m.error.message}</span>}
          </div>
        </div>
      )}
    </>
  );
}

export function DoiTrangThai({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admissions.appointments.setStatus.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex justify-end gap-1">
      <button type="button" className="btn-ghost !px-2 !py-0.5 !text-[11px]" disabled={m.isPending} onClick={() => m.mutate({ id, status: "xong" })}>Xong</button>
      <button type="button" className="btn-ghost !px-2 !py-0.5 !text-[11px]" disabled={m.isPending} onClick={() => m.mutate({ id, status: "vang" })}>Khách không đến</button>
      <button type="button" className="btn-ghost !px-2 !py-0.5 !text-[11px] text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id, status: "huy" })}>Huỷ</button>
    </span>
  );
}

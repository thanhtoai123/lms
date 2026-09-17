"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Data = RouterOutputs["hr"]["checkinPoints"];

const empty = { id: undefined as string | undefined, name: "", lat: "", lng: "", radiusM: 100, geofenceEnabled: true, isActive: true, note: "" };

export function PointsAdmin({ centerId, data }: { centerId: string; data: Data }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [rotateFor, setRotateFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation(trpc.hr.upsertCheckinPoint.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã lưu điểm chấm công" }); setOpen(false); setForm(empty); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const rotate = useMutation(trpc.hr.rotateCheckinKey.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã đổi sang đời khoá ${r.keyVersion} — in lại mã mới, mã cũ hết hiệu lực` }); setRotateFor(null); setReason(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const submit = () => save.mutate({
    id: form.id, centerId, name: form.name,
    lat: form.lat.trim() === "" ? null : Number(form.lat), lng: form.lng.trim() === "" ? null : Number(form.lng),
    radiusM: Number(form.radiusM), geofenceEnabled: form.geofenceEnabled, isActive: form.isActive, note: form.note || null,
  });
  return (
    <div className="space-y-3">
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      {data.canEdit && !open && <button className="btn-primary" onClick={() => { setForm(empty); setOpen(true); }}>Thêm điểm chấm công</button>}
      {open && (
        <div className="card space-y-3 p-4 text-sm">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs text-ink-600 md:col-span-3">Tên điểm *<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Quầy lễ tân tầng 1" /></label>
            <label className="text-xs text-ink-600">Vĩ độ<input className="input mt-1" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="16.0336" /></label>
            <label className="text-xs text-ink-600">Kinh độ<input className="input mt-1" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="108.2212" /></label>
            <label className="text-xs text-ink-600">Bán kính (m)<input type="number" className="input mt-1" value={form.radiusM} onChange={(e) => setForm({ ...form, radiusM: Number(e.target.value) })} /></label>
            <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={form.geofenceEnabled} onChange={(e) => setForm({ ...form, geofenceEnabled: e.target.checked })} /> Bật kiểm định vị</label>
            <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Đang dùng</label>
            <label className="text-xs text-ink-600 md:col-span-3">Ghi chú<input className="input mt-1" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending} onClick={submit}>{form.id ? "Lưu" : "Tạo điểm"}</button>
            <button className="btn-ghost" onClick={() => { setOpen(false); setForm(empty); }}>Huỷ</button>
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.items.map((p) => (
          <div key={p.id} className={`card space-y-2 p-4 ${p.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-ink-500">{p.centerCode} · {p.geofenceEnabled ? `Kiểm định vị: bật · bán kính ${p.radiusM}m` : "Không kiểm định vị"} · Mã QR cố định · đời khoá {p.keyVersion}</div>
                <div className="text-xs text-ink-400">{p.lat != null ? `${p.lat}, ${p.lng}` : "Chưa khai toạ độ"} · {p.punchesToday} lượt hôm nay</div>
              </div>
              <div className="w-28 shrink-0" dangerouslySetInnerHTML={{ __html: p.qrSvg }} />
            </div>
            {p.canEdit && (
              <div className="flex flex-wrap gap-1 text-xs">
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setForm({ id: p.id, name: p.name, lat: p.lat?.toString() ?? "", lng: p.lng?.toString() ?? "", radiusM: p.radiusM, geofenceEnabled: p.geofenceEnabled, isActive: p.isActive, note: p.note ?? "" }); setOpen(true); }}>Sửa</button>
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setRotateFor(rotateFor === p.id ? null : p.id)}>Đổi đời khoá</button>
                <a className="btn-ghost !px-2 !py-1 text-xs" href={`/cham-cong/man-hinh?center=${centerId}&point=${p.id}`}>Trình chiếu</a>
              </div>
            )}
            {rotateFor === p.id && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input className="input !py-1 text-xs" placeholder="Lý do đổi đời khoá (mã bị chụp lộ…)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn-primary !px-2 !py-1 text-xs" disabled={reason.trim().length < 5 || rotate.isPending} onClick={() => rotate.mutate({ id: p.id, reason: reason.trim() })}>Xác nhận</button>
              </div>
            )}
          </div>
        ))}
        {data.items.length === 0 && <div className="card p-6 text-center text-sm text-ink-500">Chưa có điểm chấm công — nhân sự chưa quét được mã.</div>}
      </div>
    </div>
  );
}

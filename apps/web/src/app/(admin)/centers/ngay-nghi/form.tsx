"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function HolidayForm({ centers, canGlobal, today }: { centers: { id: string; code: string; name: string }[]; canGlobal: boolean; today: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const tomorrow = new Date(new Date(today + "T00:00:00Z").getTime() + 86400e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ from: tomorrow, to: "", centerId: canGlobal ? "" : centers[0]?.id ?? "", name: "", reschedule: true });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = { from: f.from, to: f.to || null, centerId: f.centerId || null };
  const preview = useQuery({ ...trpc.catalog.previewHoliday.queryOptions(input), enabled: !!f.from, retry: false });
  const add = useMutation(trpc.catalog.addHoliday.mutationOptions({
    onSuccess: (r) => {
      setMsg({ ok: true, text: `Đã thêm ${r.added} ngày nghỉ${r.skipped ? ` (bỏ qua ${r.skipped} ngày đã có)` : ""}. ${r.affected} buổi bị ảnh hưởng${f.reschedule ? `: dời ${r.moved} buổi chính thức, huỷ ${r.cancelled} buổi ngoài lộ trình` : " — chưa dời"}.` });
      setF({ ...f, name: "" });
      router.refresh();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const p = preview.data;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Thêm ngày nghỉ</h2>
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-ink-600">Từ ngày<input type="date" min={tomorrow} className="input mt-1" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Đến ngày (tuỳ chọn)<input type="date" min={f.from} className="input mt-1" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Phạm vi
          <select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}>
            {canGlobal && <option value="">Toàn hệ thống</option>}
            {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Tên<input className="input mt-1" maxLength={120} placeholder="Nghỉ lễ Quốc khánh…" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      </div>
      {preview.error && <div className="text-sm text-red-700">{preview.error.message}</div>}
      {p && (
        <div className="rounded-xl bg-black/[0.03] p-3 text-sm">
          {p.dates.length} ngày · <b>{p.affected}</b> buổi đang xếp lịch rơi vào khoảng này
          {p.pastDates.length > 0 && <span className="text-red-700"> · có ngày đã qua (không thêm được)</span>}
          {p.classes.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.classes.map((c) => <span key={c.classId} className="chip bg-white">{c.classCode}: {c.sessions} buổi{c.sessions !== c.regular ? ` (${c.sessions - c.regular} ngoài lộ trình)` : ""}</span>)}</div>}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.reschedule} onChange={(e) => setF({ ...f, reschedule: e.target.checked })} /> Dời buổi bị ảnh hưởng theo lịch hiện hành của lớp (giữ đủ số buổi, lùi bế giảng); buổi ngoài lộ trình sẽ bị huỷ</label>
      <button className="btn-primary" disabled={add.isPending || f.name.trim().length < 3 || !!p?.pastDates.length} onClick={() => { setMsg(null); add.mutate({ ...input, name: f.name.trim(), reschedule: f.reschedule }); }}>
        {add.isPending ? "Đang lưu…" : "Thêm ngày nghỉ"}
      </button>
    </section>
  );
}

export function DeleteHoliday({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const del = useMutation(trpc.catalog.deleteHoliday.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!open) return <button className="text-xs text-red-700 hover:underline" onClick={() => setOpen(true)}>Xoá</button>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <input className="input !py-1 text-xs" placeholder="Lý do xoá" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={del.isPending || reason.trim().length < 5} onClick={() => del.mutate({ id, reason: reason.trim() })}>Xoá</button>
      <button className="text-xs" onClick={() => setOpen(false)}>Thôi</button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { flagLabel } from "@/components/hr-ui";

/** Lấy toạ độ; trình duyệt chặn / tắt định vị thì báo rõ để người dùng bật lại */
function getPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  });
}

export function CheckinPanel({ token }: { token: string }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.hr.checkinInfo.queryOptions({ token }));
  const [msg, setMsg] = useState<{ ok: boolean; text: string; sub?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const m = useMutation(trpc.hr.punch.mutationOptions({
    onSuccess: (r) => {
      setMsg({ ok: true, text: `Đã chấm ${r.flags.includes("off_schedule") ? "" : ""}${r.time} tại ${r.point}`, sub: [r.warning, r.flags.length ? `Cờ: ${r.flags.map(flagLabel).join(", ")}` : null].filter(Boolean).join(" · ") });
      q.refetch();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const d = q.data;
  const punch = async (kind: "in" | "out") => {
    setBusy(true);
    setMsg(null);
    const pos = await getPosition();
    setBusy(false);
    if (!pos && d?.point?.geofenceEnabled) {
      setMsg({ ok: false, text: "Cần bật định vị để chấm công — bật Vị trí cho trình duyệt rồi thử lại" });
      return;
    }
    m.mutate({ token, kind, lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.accuracy ?? null });
  };
  if (q.isLoading) return <div className="card p-6 text-sm">Đang kiểm tra mã…</div>;
  if (q.error) return <div className="card p-6 text-sm text-red-700">{q.error.message}</div>;
  if (!d?.ok) return <div className="card p-6 text-sm text-red-700">{d?.reason ?? "Mã không hợp lệ"}</div>;
  return (
    <div className="space-y-3">
      <div className="card space-y-1 p-4 text-sm">
        <div className="font-semibold">{d.point?.center?.name} · {d.point?.name}</div>
        <div className="text-xs text-ink-500">{d.point?.geofenceEnabled ? `Kiểm định vị: trong bán kính ${d.point?.radiusM}m` : "Điểm này không kiểm định vị"}</div>
        {d.staff ? (
          <>
            <div className="pt-1">{d.staff.fullName} · {d.staff.code}</div>
            <div className="text-xs text-ink-500">Ca hôm nay: {d.shift ? `${d.shift.code} · ${d.shift.name}${d.shift.clock ? ` (${d.shift.clock})` : ""}` : "không có ca — lượt chấm vẫn được ghi nhận"}</div>
            {d.punches.length > 0 && <div className="text-xs">Đã chấm: {d.punches.map((p) => `${p.kind === "in" ? "vào" : "ra"} ${p.time}`).join(" · ")}</div>}
          </>
        ) : (
          <div className="pt-1 text-amber-700">Tài khoản của bạn chưa gắn hồ sơ nhân sự — liên hệ nhân sự để được cấp.</div>
        )}
      </div>
      {d.staff && (
        <div className="flex gap-2">
          <button className="btn-primary flex-1 py-3" disabled={busy || m.isPending} onClick={() => punch("in")}>Chấm vào</button>
          <button className="btn-ghost flex-1 py-3" disabled={busy || m.isPending} onClick={() => punch("out")}>Chấm ra</button>
        </div>
      )}
      {busy && <div className="text-sm text-ink-500">Đang lấy vị trí…</div>}
      {msg && (
        <div className={`card p-4 text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>
          <div className="font-semibold">{msg.text}</div>
          {msg.sub && <div className="text-xs text-amber-700">{msg.sub}</div>}
        </div>
      )}
      <p className="text-xs text-ink-400">Lượt chấm chỉ ghi nhận và sinh cờ để quản lý rà — công của ngày tính theo ca đã xếp trên lưới phân ca.</p>
    </div>
  );
}

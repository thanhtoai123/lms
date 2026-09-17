"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { DayStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { DayChip, FlagChip, hm } from "@/components/hr-ui";

type Cell = { status: DayStatus; shift: { code: string; name: string; clock: string } | null; inMin: number | null; outMin: number | null; lateMin: number; openFlags: string[] } | null;

/** Chấm công chỉ qua mã QR tại quầy — trang này chỉ hiển thị trạng thái hôm nay */
export function PunchCard({ today, cell, punches }: { today: string; cell: Cell; punches: { kind: string; at: string; distanceM: number | null; source: string }[] }) {
  const hasIn = punches.some((p) => p.kind === "in");
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Hôm nay {today.split("-").reverse().join("/")}</h2>
          <div className="text-sm text-ink-600">
            {cell?.shift ? `${cell.shift.code} · ${cell.shift.name}${cell.shift.clock ? ` ${cell.shift.clock}` : ""}` : "Không có ca"}
            {cell && cell.status !== "off" && <span className="ml-2"><DayChip status={cell.status} /></span>}
            {cell && cell.lateMin > 0 && <span className="ml-2 text-amber-700">muộn {cell.lateMin}′</span>}
          </div>
          <div className="text-xs text-ink-400">Chấm công bằng cách quét mã QR dán tại quầy — mở từ menu thì không chấm được.</div>
        </div>
        <a className="btn-primary !px-6 !py-3 text-base" href="/cham-cong/checkin">{hasIn ? "Quét mã để chấm ra" : "Quét mã để chấm vào"}</a>
      </div>
      {punches.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {punches.map((p, i) => (
            <span key={i} className="chip bg-black/5">
              {p.kind === "in" ? "Vào" : "Ra"} {new Date(p.at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}
              {p.source === "qr" ? (p.distanceM != null ? ` · ${p.distanceM}m` : "") : p.source === "request" ? " · qua đơn" : " · sửa tay"}
            </span>
          ))}
          <span className="text-ink-400">Tính công: vào {hm(cell?.inMin ?? null)} · ra {hm(cell?.outMin ?? null)}</span>
        </div>
      )}
      {cell && cell.openFlags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-ink-600">Cờ cần xử lý:</span>
          {cell.openFlags.map((f) => <FlagChip key={f} flag={f} open />)}
          <span className="text-ink-400">— nộp đơn chỉnh công nếu quên quét.</span>
        </div>
      )}
    </section>
  );
}

export function CancelMine({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.hr.decideRequest.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span>
      <button className="text-xs text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id, action: "cancel" })}>Huỷ đơn</button>
      {m.error && <span className="block text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

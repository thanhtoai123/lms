"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { PERIOD_STATUS_VI, PERIOD_STATUS_CHIP, type PeriodStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { units } from "@/components/hr-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Board = RouterOutputs["hr"]["periodBoard"];

const CLOSE_NOTE = "Chốt xong, số công của kỳ này không đổi được từ màn nào nữa";
const REOPEN_NOTE = "Số đã chốt vẫn nằm trong nhật ký; chốt lại sau đó sẽ ghi một bản mới";

/** Trạng thái kỳ + công chuẩn + các nút Chốt kỳ / Mở lại kỳ / Tính lại */
export function PeriodBoard({ centerId, period, data }: { centerId: string; period: string; data: Board }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [std, setStd] = useState(String(data.standardUnits));
  const [note, setNote] = useState(data.standardNote ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const fail = (e: { message: string }) => setMsg({ ok: false, text: e.message });

  const close = useMutation(trpc.hr.lockPeriod.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: [`Đã chốt kỳ (bản chốt lần ${r.closeCount}). ${CLOSE_NOTE}.`, ...r.warnings].join(" · ") }); setConfirmClose(false); router.refresh(); },
    onError: fail,
  }));
  const reopen = useMutation(trpc.hr.unlockPeriod.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: `Đã mở lại kỳ. ${REOPEN_NOTE}.` }); setReason(""); router.refresh(); },
    onError: fail,
  }));
  const setStatus = useMutation(trpc.hr.setPeriodStatus.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: r.note ?? "Đã đổi trạng thái kỳ" }); router.refresh(); },
    onError: fail,
  }));
  const recalc = useMutation(trpc.hr.recalcPeriod.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã tính lại: ${r.people} người · ${units(r.totalUnits)} công · ${r.openFlags} cờ chưa rà` }); router.refresh(); },
    onError: fail,
  }));
  const saveStd = useMutation(trpc.hr.setPeriodStandard.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã lưu công chuẩn" }); router.refresh(); },
    onError: fail,
  }));

  const st = data.status as PeriodStatus;
  const canClose = data.perms.lock && (st === "open" || st === "reopened" || st === "closing");
  const canReopen = data.perms.unlock && st === "closed";
  const blocked = data.whyNotClosable.length > 0;

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`chip ${PERIOD_STATUS_CHIP[st]}`}>{PERIOD_STATUS_VI[st]}</span>
          <span>Công chuẩn <b>{units(data.standardUnits)}</b> <span className="text-xs text-ink-400">(gợi ý theo lịch: {units(data.standardSuggested)})</span></span>
          {data.closeCount > 0 && <span className="text-xs text-ink-500">Đã chốt {data.closeCount} lần{data.lockedAt ? ` · lần gần nhất ${new Date(data.lockedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}</span>}
          {data.unlockReason && st === "reopened" && <span className="text-xs text-sky-700">Lý do mở lại: {data.unlockReason}</span>}
          {data.pendingRequests > 0 && <span className="chip bg-amber-100 text-amber-800">{data.pendingRequests} đơn chờ duyệt</span>}
        </div>

        {/* Vì sao chưa chốt được */}
        {blocked && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm">
            <div className="font-semibold text-amber-800">Vì sao chưa chốt được</div>
            <ul className="mt-1 list-inside list-disc text-amber-800">{data.whyNotClosable.map((b) => <li key={b}>{b}</li>)}</ul>
            {!data.periodEnded && <p className="mt-1 text-xs text-amber-700">Kỳ chưa kết thúc — chờ hết tháng rồi rà lại cờ và đơn trước khi chốt.</p>}
          </div>
        )}
        {!blocked && data.lockCheck.warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Việc còn dang dở (vẫn chốt được): {data.lockCheck.warnings.join(" · ")}</div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-3">
          <label className="text-xs text-ink-600">Số công chuẩn
            <input className="input mt-1 !w-20" value={std} onChange={(e) => setStd(e.target.value)} placeholder={String(data.standardDefault)} />
          </label>
          <label className="flex-1 text-xs text-ink-600">Ghi chú công chuẩn
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: 30 ngày − 6 ngày nghỉ tuần/lễ" maxLength={200} />
          </label>
          <button className="btn-ghost" disabled={!data.perms.lock || saveStd.isPending}
            onClick={() => saveStd.mutate({ centerId, period, standardUnits: std.trim() === "" ? null : Number(std.replace(",", ".")), note: note.trim() || null })}>
            Lưu công chuẩn
          </button>
          <button className="btn-ghost" disabled={recalc.isPending} onClick={() => recalc.mutate({ centerId, period })}>Tính lại</button>
        </div>
        <p className="text-xs text-ink-400">Để trống số công chuẩn là quay về mặc định {data.standardDefault}.</p>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
          {st === "not_open" && data.perms.lock && (
            <button className="btn-primary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ centerId, period, status: "open", reason: null })}>Mở kỳ</button>
          )}
          {canClose && st !== "closing" && data.perms.lock && (
            <button className="btn-ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ centerId, period, status: "closing", reason: null })}>Chuyển sang Đang chốt</button>
          )}
          {st === "closing" && data.perms.lock && (
            <button className="btn-ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ centerId, period, status: "open", reason: null })}>Quay lại Đang mở</button>
          )}
          {canClose && !confirmClose && (
            <button className="btn-primary" disabled={blocked || close.isPending} onClick={() => setConfirmClose(true)}>Chốt kỳ</button>
          )}
          {canClose && confirmClose && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-amber-800">{CLOSE_NOTE}. Chốt kỳ {period}?</span>
              <button className="btn-primary" disabled={close.isPending} onClick={() => close.mutate({ centerId, period })}>Xác nhận chốt</button>
              <button className="btn-ghost" onClick={() => setConfirmClose(false)}>Huỷ</button>
            </span>
          )}
          {canReopen && (
            <span className="flex flex-wrap items-center gap-2">
              <input className="input !w-64" placeholder="Lý do mở lại (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-ghost" disabled={reason.trim().length < 5 || reopen.isPending} onClick={() => reopen.mutate({ centerId, period, reason: reason.trim() })}>Mở lại kỳ</button>
            </span>
          )}
          {st === "closed" && !data.perms.unlock && <span className="text-xs text-ink-500">Kỳ đã chốt — chỉ nhân sự Hội sở mở lại được.</span>}
        </div>
        {canReopen && <p className="text-xs text-ink-500">Mở lại kỳ có ghi nhật ký. {REOPEN_NOTE}.</p>}
        {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

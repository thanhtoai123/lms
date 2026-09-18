"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { TRIAL_CLASS_STATUS_VI, type TrialClassStatus } from "@satarobo/core";
import { Empty } from "@/components/ui";
import { ErrorBox, OkBox, fmtDate } from "@/components/admin-ui";

export type TrialClassRow = {
  id: string;
  code: string;
  name: string;
  status: TrialClassStatus;
  capacity: number;
  centerId: string;
  centerCode: string;
  courseCode: string | null;
  note: string | null;
  createdAt: Date | string;
  enrolled: number;
  sessionCount: number;
  nextSessionDate: string | null;
  seatsLeft: number;
};
type Option = { id: string; code: string; name: string };

export const TRIAL_CLASS_CHIP: Record<TrialClassStatus, string> = {
  open: "bg-green-100 text-green-800",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
};

export function TrialClassChip({ status }: { status: TrialClassStatus }) {
  return <span className={`chip ${TRIAL_CLASS_CHIP[status]}`}>{TRIAL_CLASS_STATUS_VI[status]}</span>;
}

export function TrialClassList({ items, canManage, centers, courses }: { items: TrialClassRow[]; canManage: boolean; centers: Option[]; courses: Option[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ centerId: "", courseId: "", capacity: "12", note: "" });
  /** Huỷ lớp: bấm lần 1 mở ô lý do, bấm lần 2 mới thực sự huỷ */
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onError = (e: { message: string }) => { setNotice(null); setError(e.message); };
  const create = useMutation(trpc.admissions.trials.createClass.mutationOptions({
    onSuccess: (r) => {
      setError(null);
      setOpen(false);
      setDraft({ centerId: "", courseId: "", capacity: "12", note: "" });
      setNotice(`Đã tạo lớp ${r.name} (${r.code}). Nhớ thêm buổi — lớp chưa có buổi thì chưa xếp được học viên.`);
      router.push(`/lop-trial/${r.id}`);
    },
    onError,
  }));
  const cancel = useMutation(trpc.admissions.trials.cancelClass.mutationOptions({
    onSuccess: () => { setError(null); setCancelling(null); setConfirm(false); setReason(""); setNotice("Đã huỷ lớp trải nghiệm — các buổi chưa dạy được huỷ và giáo viên đã được báo."); router.refresh(); },
    onError,
  }));
  const busy = create.isPending || cancel.isPending;

  const startCancel = (id: string) => { setCancelling(id); setConfirm(false); setReason(""); setError(null); setNotice(null); };

  return (
    <div className="space-y-3">
      {canManage && (
        open ? (
          <form
            className="card grid gap-2 p-4 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.centerId) return setError("Chọn cơ sở trước");
              create.mutate({ centerId: draft.centerId, courseId: draft.courseId || null, capacity: draft.capacity ? Number(draft.capacity) : null, note: draft.note.trim() || null });
            }}
          >
            <h2 className="font-bold sm:col-span-4">Tạo lớp trải nghiệm</h2>
            <p className="text-xs text-ink-600 sm:col-span-4">
              Tên lớp và mã lớp hệ thống tự đặt theo cơ sở + khoá trải nghiệm. Ngày / giờ / phòng / giáo viên chọn khi thêm buổi ở trang chi tiết.
            </p>
            <label className="text-xs text-ink-600">Cơ sở *
              <select className="input mt-1" value={draft.centerId} onChange={(e) => setDraft({ ...draft, centerId: e.target.value })} required>
                <option value="">— Chọn cơ sở —</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Khoá trải nghiệm
              <select className="input mt-1" value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}>
                <option value="">— Chưa rõ —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-ink-400">Chính là &quot;khoá quan tâm&quot; của khách.</span>
            </label>
            <label className="text-xs text-ink-600">Sĩ số tối đa
              <input className="input mt-1" type="number" min={1} max={60} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
            </label>
            <label className="text-xs text-ink-600">Ghi chú
              <input className="input mt-1" maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="VD: lớp trải nghiệm hè" />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-4">
              <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setError(null); }}>Huỷ</button>
              <button className="btn-primary" disabled={busy}>{create.isPending ? "Đang tạo…" : "Tạo lớp"}</button>
            </div>
          </form>
        ) : (
          <button className="btn-primary" onClick={() => { setOpen(true); setNotice(null); setError(null); }}>+ Tạo lớp trải nghiệm</button>
        )
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && !error && <OkBox>{notice}</OkBox>}

      {items.length === 0 ? (
        <Empty>Chưa có lớp trải nghiệm nào. {canManage ? "Bấm “Tạo lớp trải nghiệm” để bắt đầu." : ""}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="p-3">Lớp</th>
                <th className="p-3">Buổi kế tiếp</th>
                <th className="p-3">Sĩ số</th>
                <th className="p-3">Số buổi</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {items.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="p-3">
                    <Link href={`/lop-trial/${c.id}`} className="font-semibold text-brand-600 hover:underline">{c.name}</Link>
                    <div className="font-mono text-[11px] text-ink-400">{c.code} · {c.centerCode}{c.courseCode ? ` · ${c.courseCode}` : ""}</div>
                    {c.note && <div className="text-[11px] text-ink-600">{c.note}</div>}
                  </td>
                  <td className="p-3">{c.nextSessionDate ? fmtDate(c.nextSessionDate) : <span className="text-ink-400">Chưa xếp buổi</span>}</td>
                  <td className="p-3">
                    <span className={`chip ${c.seatsLeft === 0 ? "bg-red-100 text-red-700" : c.seatsLeft <= 2 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                      {c.enrolled}/{c.capacity}
                    </span>
                    <div className="text-[11px] text-ink-400">{c.seatsLeft === 0 ? "Đã đủ sĩ số" : `còn ${c.seatsLeft} chỗ`}</div>
                  </td>
                  <td className="p-3 tabular-nums">{c.sessionCount}</td>
                  <td className="p-3"><TrialClassChip status={c.status} /></td>
                  <td className="p-3 text-right">
                    {canManage && c.status !== "cancelled" ? (
                      cancelling === c.id ? (
                        <div className="flex flex-col items-end gap-1">
                          <input
                            className="input !py-1 text-xs"
                            autoFocus
                            maxLength={300}
                            placeholder="Lý do huỷ lớp (bắt buộc)…"
                            value={reason}
                            onChange={(e) => { setReason(e.target.value); setConfirm(false); }}
                          />
                          <div className="flex gap-2">
                            {confirm ? (
                              <button className="btn-primary !bg-red-600 !px-2 !py-1 text-xs" disabled={busy} onClick={() => cancel.mutate({ id: c.id, reason: reason.trim() })}>Bấm lại để xác nhận</button>
                            ) : (
                              <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={busy || reason.trim().length < 5} onClick={() => setConfirm(true)}>Huỷ lớp</button>
                            )}
                            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setCancelling(null); setConfirm(false); }}>Thôi</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={busy} onClick={() => startCancel(c.id)}>Huỷ lớp</button>
                      )
                    ) : (
                      <Link href={`/lop-trial/${c.id}`} className="text-xs text-brand-600 hover:underline">Xem</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

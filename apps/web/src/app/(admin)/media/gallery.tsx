"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MEDIA_STATUS_VI, MEDIA_RESTORE_DAYS, type MediaStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { Empty } from "@/components/ui";

export type GalleryItem = {
  id: string; url: string; caption: string | null; status: MediaStatus; classCode: string; sequenceNo: number; sessionDate: string;
  takenAt: string | null; isClassWide: boolean; uploaderName: string | null;
  tagged: { id: string; name: string; consent: boolean }[]; noConsentNames: string[]; consentOk: boolean; overdue: boolean;
  rejectReason: string | null; canRestore: boolean; restoreUntil: Date | string | null;
};
type Roster = { id: string; fullName: string; consent: boolean };

const ST_CHIP: Record<MediaStatus, string> = {
  library: "bg-slate-200 text-ink-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};
const vnDate = (d: string) => d.split("-").reverse().join("/");

/**
 * Thư viện ảnh lớp hai tầng.
 * - Ảnh **Trong kho**: giáo viên gắn thẻ học viên / đánh dấu ảnh chung rồi **Gửi duyệt** (PH chưa thấy).
 * - Ảnh **Chờ duyệt**: giáo vụ Duyệt / Loại.
 * - Ảnh **Từ chối**: còn **Khôi phục** trong 7 ngày.
 */
export function MediaGallery({ items, reviewMode = false, roster = [] }: { items: GalleryItem[]; reviewMode?: boolean; roster?: Roster[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const done = (label: string) => (r: { ok: number; failed: number; results: { ok: boolean; message: string }[] }) => {
    setMsg(`${label}: ${r.ok} ảnh${r.failed ? `, ${r.failed} không xử lý được: ${r.results.filter((x) => !x.ok).map((x) => x.message).join("; ")}` : ""}.`);
    setSelected([]);
    router.refresh();
  };
  const fail = (e: { message: string }) => setMsg(e.message);
  const review = useMutation(trpc.learning.reviewMedia.mutationOptions({ onSuccess: done("Đã xử lý"), onError: fail }));
  const submit = useMutation(trpc.learning.submitMedia.mutationOptions({ onSuccess: done("Đã gửi duyệt"), onError: fail }));
  const restore = useMutation(trpc.learning.restoreMedia.mutationOptions({ onSuccess: done("Đã khôi phục"), onError: fail }));
  const tags = useMutation(trpc.learning.updateMediaTags.mutationOptions({ onSuccess: () => { setMsg(null); router.refresh(); }, onError: fail }));
  const busy = review.isPending || submit.isPending || restore.isPending || tags.isPending;

  const editable = items.filter((i) => i.status === "library" || i.status === "pending");
  const selectable = items.filter((i) => i.status !== "rejected" || i.canRestore);
  const chosen = items.filter((i) => selected.includes(i.id));
  const nLibrary = chosen.filter((i) => i.status === "library").length;
  const nPending = chosen.filter((i) => i.status === "pending").length;
  // Loại được cả ảnh đã duyệt (gỡ khỏi phụ huynh)
  const rejectable = chosen.filter((i) => i.status === "pending" || i.status === "approved");
  const nRestorable = chosen.filter((i) => i.canRestore).length;
  if (items.length === 0) return <Empty>Chưa có ảnh nào.</Empty>;

  return (
    <div className="space-y-3">
      {selectable.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(selected.length === selectable.length ? [] : selectable.map((p) => p.id))}>
            {selected.length === selectable.length ? "Bỏ chọn" : `Chọn tất cả ${selectable.length} ảnh`}
          </button>
          <span className="text-ink-600">Đã chọn {selected.length}</span>
          {nLibrary > 0 && <button className="btn-primary !py-1 text-xs" disabled={busy} onClick={() => submit.mutate({ ids: chosen.filter((i) => i.status === "library").map((i) => i.id) })}>Gửi duyệt {nLibrary} ảnh</button>}
          {nPending > 0 && <button className="btn-primary !py-1 text-xs" disabled={busy} onClick={() => review.mutate({ ids: chosen.filter((i) => i.status === "pending").map((i) => i.id), action: "approve" })}>Duyệt {nPending} ảnh</button>}
          {nRestorable > 0 && <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => restore.mutate({ ids: chosen.filter((i) => i.canRestore).map((i) => i.id) })}>Khôi phục {nRestorable} ảnh</button>}
          {rejectable.length > 0 && (
            <>
              <input className="input !w-56 !py-1 text-xs" placeholder="Lý do loại ảnh" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-ghost !py-1 text-xs text-red-700" disabled={busy} onClick={() => review.mutate({ ids: rejectable.map((i) => i.id), action: "reject", reason })}>Loại {rejectable.length} ảnh</button>
            </>
          )}
        </div>
      )}
      {msg && <div className="rounded-xl border border-black/10 bg-white p-2 text-sm">{msg}</div>}
      <div className={`grid gap-3 ${reviewMode ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
        {items.map((m) => {
          const sel = selected.includes(m.id);
          const canSelect = m.status !== "rejected" || m.canRestore;
          const canEdit = editable.some((x) => x.id === m.id);
          return (
            <figure key={m.id} className={`card overflow-hidden ${sel ? "ring-2 ring-brand-600" : ""} ${m.overdue ? "border-red-300" : ""}`}>
              <button type="button" className="block w-full" disabled={!canSelect} onClick={() => setSelected((s) => (sel ? s.filter((x) => x !== m.id) : [...s, m.id]))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.caption ?? `Ảnh buổi ${m.sequenceNo}`} className="aspect-[4/3] w-full bg-black/5 object-cover" loading="lazy" />
              </button>
              <figcaption className="space-y-1 p-2 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium">{m.classCode} · B{m.sequenceNo}</span>
                  <span className={`chip ${ST_CHIP[m.status]}`}>{MEDIA_STATUS_VI[m.status]}</span>
                </div>
                <div className="text-ink-400">
                  Chụp {vnDate(m.takenAt ?? m.sessionDate)} · {m.uploaderName ?? "?"}{m.overdue ? " · quá hạn duyệt" : ""}
                </div>
                {m.isClassWide && <div className="chip bg-brand-50 text-brand-700">Ảnh chung cả lớp</div>}
                {m.caption && <div className="line-clamp-2">{m.caption}</div>}
                {m.tagged.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.tagged.map((t) => (
                      <span key={t.id} className={`chip ${t.consent ? "bg-black/5" : "bg-red-100 text-red-700"}`}>
                        {t.name}
                        {canEdit && <button className="ml-1" title="Bỏ gắn" disabled={busy} onClick={() => tags.mutate({ id: m.id, taggedStudentIds: m.tagged.filter((x) => x.id !== t.id).map((x) => x.id) })}>✕</button>}
                      </span>
                    ))}
                  </div>
                )}
                {m.status === "library" && !m.isClassWide && m.tagged.length === 0 && <div className="text-amber-700">Chưa gắn học viên — gắn thẻ hoặc đánh dấu ảnh chung trước khi gửi duyệt</div>}
                {!m.consentOk && m.status !== "rejected" && <div className="text-red-700">Chưa có đồng ý đăng ảnh: {m.noConsentNames.join(", ")}</div>}
                {m.rejectReason && <div className="text-red-700">Lý do loại: {m.rejectReason}</div>}
                {m.status === "rejected" && (
                  m.canRestore
                    ? <button className="text-brand-600 underline" disabled={busy} onClick={() => restore.mutate({ ids: [m.id] })}>Khôi phục (còn hạn đến {new Date(m.restoreUntil!).toLocaleDateString("vi-VN")})</button>
                    : <span className="text-ink-400">Quá {MEDIA_RESTORE_DAYS} ngày — không khôi phục được</span>
                )}
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label className="flex items-center gap-1 text-ink-600">
                      <input type="checkbox" checked={m.isClassWide} disabled={busy} onChange={(e) => tags.mutate({ id: m.id, isClassWide: e.target.checked })} /> Ảnh chung cả lớp
                    </label>
                    {roster.length > 0 && <button className="text-brand-600 underline" onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? "Đóng" : "Gắn học viên"}</button>}
                    {m.status === "library" && <button className="btn-primary !px-2 !py-0.5 text-[11px]" disabled={busy} onClick={() => submit.mutate({ ids: [m.id] })}>Gửi duyệt</button>}
                  </div>
                )}
                {canEdit && editing === m.id && roster.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {roster.map((r) => {
                      const on = m.tagged.some((t) => t.id === r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          disabled={busy}
                          title={r.consent ? "PH đã đồng ý đăng ảnh" : "PH CHƯA đồng ý đăng ảnh"}
                          className={`chip cursor-pointer px-2 py-0.5 ${on ? "bg-brand-600 text-white" : "bg-black/5"}`}
                          onClick={() => tags.mutate({ id: m.id, taggedStudentIds: on ? m.tagged.filter((t) => t.id !== r.id).map((t) => t.id) : [...m.tagged.map((t) => t.id), r.id] })}
                        >
                          {r.fullName}{!r.consent && " ⚠"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

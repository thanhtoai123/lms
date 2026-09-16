"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Empty } from "@/components/ui";

export type GalleryItem = {
  id: string; url: string; caption: string | null; status: "pending" | "approved" | "rejected"; classCode: string; sequenceNo: number; sessionDate: string;
  uploaderName: string | null; tagged: { id: string; name: string; consent: boolean }[]; consentOk: boolean; overdue: boolean; rejectReason: string | null;
};
const ST_VI = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" } as const;
const ST_CHIP = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-700" } as const;

export function MediaGallery({ items, reviewMode = false }: { items: GalleryItem[]; reviewMode?: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const review = useMutation(trpc.learning.reviewMedia.mutationOptions({
    onSuccess: (r) => { setMsg(`${r.ok} ảnh xử lý xong${r.failed ? `, ${r.failed} không xử lý được: ${r.results.filter((x) => !x.ok).map((x) => x.message).join("; ")}` : ""}.`); setSelected([]); router.refresh(); },
    onError: (e) => setMsg(e.message),
  }));
  const untag = useMutation(trpc.learning.updateMediaTags.mutationOptions({ onSuccess: () => router.refresh(), onError: (e) => setMsg(e.message) }));
  const pending = items.filter((i) => i.status === "pending");
  if (items.length === 0) return <Empty>Chưa có ảnh nào.</Empty>;

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(selected.length === pending.length ? [] : pending.map((p) => p.id))}>{selected.length === pending.length ? "Bỏ chọn" : `Chọn tất cả ${pending.length} ảnh chờ`}</button>
          <span className="text-ink-600">Đã chọn {selected.length}</span>
          <button className="btn-primary !py-1 text-xs" disabled={!selected.length || review.isPending} onClick={() => review.mutate({ ids: selected, action: "approve" })}>Duyệt</button>
          <input className="input !w-56 !py-1 text-xs" placeholder="Lý do từ chối" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-ghost !py-1 text-xs text-red-700" disabled={!selected.length || review.isPending} onClick={() => review.mutate({ ids: selected, action: "reject", reason })}>Từ chối</button>
        </div>
      )}
      {msg && <div className="rounded-xl border border-black/10 bg-white p-2 text-sm">{msg}</div>}
      <div className={`grid gap-3 ${reviewMode ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
        {items.map((m) => {
          const sel = selected.includes(m.id);
          return (
            <figure key={m.id} className={`card overflow-hidden ${sel ? "ring-2 ring-brand-600" : ""} ${m.overdue ? "border-red-300" : ""}`}>
              <button type="button" className="block w-full" disabled={m.status !== "pending"} onClick={() => setSelected((s) => (sel ? s.filter((x) => x !== m.id) : [...s, m.id]))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.caption ?? `Ảnh buổi ${m.sequenceNo}`} className="aspect-[4/3] w-full bg-black/5 object-cover" loading="lazy" />
              </button>
              <figcaption className="space-y-1 p-2 text-xs">
                <div className="flex items-center justify-between gap-1"><span className="font-medium">{m.classCode} · B{m.sequenceNo}</span><span className={`chip ${ST_CHIP[m.status]}`}>{ST_VI[m.status]}</span></div>
                <div className="text-ink-400">{m.sessionDate.split("-").reverse().join("/")} · {m.uploaderName ?? "?"}{m.overdue ? " · quá hạn duyệt" : ""}</div>
                {m.caption && <div className="line-clamp-2">{m.caption}</div>}
                {m.tagged.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.tagged.map((t) => (
                      <span key={t.id} className={`chip ${t.consent ? "bg-black/5" : "bg-red-100 text-red-700"}`}>
                        {t.name}{!t.consent && m.status === "pending" && <button className="ml-1" title="Bỏ gắn" onClick={() => untag.mutate({ id: m.id, taggedStudentIds: m.tagged.filter((x) => x.id !== t.id).map((x) => x.id) })}>✕</button>}
                      </span>
                    ))}
                  </div>
                )}
                {!m.consentOk && m.status === "pending" && <div className="text-red-700">Có HV chưa đồng ý đăng ảnh</div>}
                {m.rejectReason && <div className="text-red-700">Lý do: {m.rejectReason}</div>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

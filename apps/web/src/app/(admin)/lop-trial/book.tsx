"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { LEAD_STATUS_VI } from "@satarobo/core";
import { WEEKDAY_VI } from "@/components/ui";

type Center = { id: string; code: string; name: string };
type Course = { id: string; code: string; name: string };

export function fmtDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const wd = d.getDay() === 0 ? 7 : d.getDay();
  return `${WEEKDAY_VI[wd]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Bảng chọn buổi còn chỗ — dùng cho cả xếp mới và đổi lịch */
export function SlotPicker({ centerId, courseId, leadId, excludeSessionId, selected, onSelect }: { centerId?: string; courseId?: string; leadId?: string; excludeSessionId?: string; selected: string | null; onSelect: (id: string) => void }) {
  const trpc = useTRPC();
  const slots = useQuery(trpc.admissions.trials.slots.queryOptions({ centerId: centerId || undefined, courseId: courseId || undefined, leadId, days: 30 }));
  if (slots.isLoading) return <div className="text-sm text-ink-400">Đang tìm buổi còn chỗ…</div>;
  if (slots.error) return <div className="text-sm text-red-700">{slots.error.message}</div>;
  const list = (slots.data ?? []).filter((s) => s.sessionId !== excludeSessionId);
  if (!list.length) return <div className="rounded-xl bg-black/[0.03] p-3 text-sm text-ink-600">Không có buổi nào trong 30 ngày tới phù hợp bộ lọc.</div>;
  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-black/10">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Buổi</th><th className="p-2">Lớp</th><th className="p-2">GV / phòng</th><th className="p-2">Chỗ trống</th><th className="p-2"></th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {list.map((s) => {
            const full = s.seatsLeft <= 0;
            const disabled = full || s.alreadyBooked;
            return (
              <tr key={s.sessionId} className={`${selected === s.sessionId ? "bg-brand-50" : ""} ${disabled ? "opacity-50" : "cursor-pointer hover:bg-black/[0.02]"}`} onClick={() => !disabled && onSelect(s.sessionId)}>
                <td className="p-2"><div className="font-medium">{fmtDay(s.date)}</div><div className="text-xs text-ink-400">{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)} · buổi {s.sequenceNo}</div></td>
                <td className="p-2"><div className="font-mono text-xs">{s.classCode}</div><div className="text-xs text-ink-400">{s.centerCode} · {s.courseCode}</div></td>
                <td className="p-2 text-xs">{s.teacherName ?? "—"}<div className="text-ink-400">{s.roomCode ?? ""}</div></td>
                <td className="p-2"><span className={`chip ${full ? "bg-red-100 text-red-700" : s.seatsLeft <= 2 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{full ? "Đủ chỗ" : `${s.seatsLeft} chỗ`}</span><div className="text-[11px] text-ink-400">{s.enrolled} HV · {s.trials} thử</div></td>
                <td className="p-2 text-right">{s.alreadyBooked ? <span className="text-xs text-ink-400">đã xếp</span> : <input type="radio" readOnly checked={selected === s.sessionId} disabled={disabled} aria-label="Chọn buổi" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BookTrial({ centers, courses, initialLeadId }: { centers: Center[]; courses: Course[]; initialLeadId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(!!initialLeadId);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [leadId, setLeadId] = useState<string | null>(initialLeadId ?? null);
  const [childId, setChildId] = useState<string>("");
  const [centerId, setCenterId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const options = useQuery({ ...trpc.admissions.trials.leadOptions.queryOptions({ q: debounced || undefined }), enabled: open && !leadId });
  const picked = useQuery({ ...trpc.admissions.trials.leadOptions.queryOptions({ id: leadId ?? undefined }), enabled: open && !!leadId });
  const lead = useMemo(() => (leadId ? picked.data?.[0] ?? null : null), [leadId, picked.data]);

  useEffect(() => {
    if (!lead) return;
    setCenterId((c) => c || lead.centerId || "");
    const child = lead.children.find((k) => k.id === childId) ?? lead.children[0];
    if (child && !childId) setChildId(child.id);
    setCourseId((c) => c || child?.interestedCourseId || lead.interestedCourseId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);

  const book = useMutation(trpc.admissions.trials.book.mutationOptions({
    onSuccess: () => {
      setMsg({ ok: true, text: "Đã xếp học thử, giáo viên đứng buổi đã được báo." });
      setSessionId(null);
      setNote("");
      router.refresh();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  const reset = () => { setLeadId(null); setChildId(""); setCenterId(""); setCourseId(""); setSessionId(null); setMsg(null); };

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>+ Xếp học thử</button>;
  }
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Xếp học thử</h2>
        <button className="text-sm text-ink-600" onClick={() => { setOpen(false); reset(); }}>Đóng</button>
      </div>
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}

      {!leadId ? (
        <div className="space-y-2">
          <label className="label">1. Chọn khách (lead đang mở)</label>
          <input className="input max-w-md" placeholder="Tên PH / tên bé / SĐT…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-60 overflow-y-auto rounded-xl border border-black/10">
            {options.isLoading ? <div className="p-3 text-sm text-ink-400">Đang tìm…</div> : (options.data ?? []).length === 0 ? <div className="p-3 text-sm text-ink-400">Không có lead phù hợp (chỉ hiện lead bạn được sửa).</div> : (
              <ul className="divide-y divide-black/5">
                {options.data!.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-black/[0.03]" onClick={() => { setLeadId(l.id); setMsg(null); }}>
                      <span><b>{l.parentName}</b> <span className="text-ink-600">· {l.children.map((c) => c.fullName).join(", ") || l.childName || "chưa có tên bé"}</span></span>
                      <span className="text-xs text-ink-400">{LEAD_STATUS_VI[l.status]} · đã thử {l.trialsUsed}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : !lead ? (
        <div className="text-sm text-ink-400">{picked.isLoading ? "Đang tải lead…" : "Không tìm thấy lead hoặc bạn không có quyền xếp lịch cho lead này."} <button className="underline" onClick={reset}>Chọn lại</button></div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] p-3 text-sm">
            <span>Khách: <Link href={`/leads/${lead.id}`} className="font-semibold text-brand-600">{lead.parentName}</Link></span>
            <span className="chip bg-black/5">{LEAD_STATUS_VI[lead.status]}</span>
            <span className="text-xs text-ink-600">đã dùng {lead.trialsUsed} lượt thử</span>
            <button className="ml-auto text-xs underline" onClick={reset}>Đổi khách</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-ink-600">Bé học thử
              <select className="input mt-1" value={childId} onChange={(e) => setChildId(e.target.value)}>
                {lead.children.length === 0 && <option value="">{lead.childName ?? "(chưa có tên bé)"}</option>}
                {lead.children.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Cơ sở
              <select className="input mt-1" value={centerId} onChange={(e) => { setCenterId(e.target.value); setSessionId(null); }}>
                <option value="">Mọi cơ sở</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Khoá
              <select className="input mt-1" value={courseId} onChange={(e) => { setCourseId(e.target.value); setSessionId(null); }}>
                <option value="">Mọi khoá</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <div className="label">2. Chọn buổi còn chỗ (30 ngày tới)</div>
            <SlotPicker centerId={centerId} courseId={courseId} leadId={lead.id} selected={sessionId} onSelect={setSessionId} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-xs text-ink-600">Ghi chú cho GV (tuỳ chọn)
              <input className="input mt-1" maxLength={300} placeholder="Bé hơi nhút nhát, PH đưa đón…" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn-primary" disabled={!sessionId || book.isPending} onClick={() => sessionId && book.mutate({ leadId: lead.id, childId: childId || null, sessionId, note: note.trim() || null })}>
              {book.isPending ? "Đang xếp…" : "3. Xếp học thử"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

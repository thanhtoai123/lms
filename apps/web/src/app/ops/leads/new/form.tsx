"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Kid = { fullName: string; grade: string; school: string; interestedCourseId: string };

export function NewLeadForm({ centers, courses, assignees }: { centers: { id: string; code: string; name: string }[]; courses: { id: string; code: string; name: string }[]; assignees: { id: string; fullName: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ parentName: "", phone: "", email: "", centerId: centers[0]?.id ?? "", source: "walk-in", notes: "", assignedToId: "" });
  const [kids, setKids] = useState<Kid[]>([{ fullName: "", grade: "", school: "", interestedCourseId: "" }]);
  const setKid = (i: number, patch: Partial<Kid>) => setKids((k) => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(trpc.admissions.leads.create.mutationOptions({ onSuccess: (r) => router.push(`/ops/leads/${r.lead.id}${r.duplicated ? "?dup=1" : ""}`), onError: (e) => setError(e.message) }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="card p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const children = kids.filter((k) => k.fullName.trim()).map((k) => ({ fullName: k.fullName.trim(), grade: k.grade ? Number(k.grade) : null, school: k.school || null, interestedCourseId: k.interestedCourseId || null }));
        create.mutate({ parentName: f.parentName, phone: f.phone, email: f.email || null, centerId: f.centerId || null, interestedCourseId: children[0]?.interestedCourseId ?? null, source: f.source, notes: f.notes || null, consent: true, assignedToId: f.assignedToId || null, children });
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Tên phụ huynh *</label><input className="input" value={f.parentName} onChange={set("parentName")} required minLength={2} /></div>
        <div><label className="label">Số điện thoại *</label><input className="input" value={f.phone} onChange={set("phone")} required inputMode="tel" placeholder="09xx xxx xxx" /></div>
        <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={set("email")} /></div>
        <div><label className="label">Cơ sở</label><select className="input" value={f.centerId} onChange={set("centerId")}><option value="">—</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
        <div><label className="label">Nguồn</label><select className="input" value={f.source} onChange={set("source")}>{["walk-in", "phone", "zalo", "facebook", "referral", "event", "other"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label">Giao cho sale (bỏ trống = chia tự động theo chế độ của cơ sở)</label><select className="input" value={f.assignedToId} onChange={set("assignedToId")}><option value="">— Chia tự động —</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><div className="label">Con của phụ huynh</div><button type="button" className="text-xs text-brand-700 underline" onClick={() => setKids((k) => [...k, { fullName: "", grade: "", school: "", interestedCourseId: "" }])}>+ Thêm con</button></div>
        {kids.map((k, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_1fr_1fr_auto] gap-2 items-center">
            <input className="input" placeholder={`Tên con ${i + 1}`} value={k.fullName} onChange={(e) => setKid(i, { fullName: e.target.value })} />
            <input className="input" type="number" min={1} max={12} placeholder="Lớp" value={k.grade} onChange={(e) => setKid(i, { grade: e.target.value })} />
            <input className="input" placeholder="Trường" value={k.school} onChange={(e) => setKid(i, { school: e.target.value })} />
            <select className="input" value={k.interestedCourseId} onChange={(e) => setKid(i, { interestedCourseId: e.target.value })}><option value="">Khoá quan tâm</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
            <button type="button" className="text-xs text-ink-400 hover:text-red-700 disabled:opacity-30" disabled={kids.length === 1} onClick={() => setKids((x) => x.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div><label className="label">Ghi chú</label><textarea className="input" value={f.notes} onChange={set("notes")} /></div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <button className="btn-primary" disabled={create.isPending}>{create.isPending ? "Đang lưu…" : "Tạo lead"}</button>
    </form>
  );
}

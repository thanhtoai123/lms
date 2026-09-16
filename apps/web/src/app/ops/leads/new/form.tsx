"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function NewLeadForm({ centers, courses }: { centers: { id: string; code: string; name: string }[]; courses: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ parentName: "", phone: "", childName: "", childGrade: "", school: "", centerId: centers[0]?.id ?? "", interestedCourseId: "", source: "walk-in", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(trpc.admissions.leads.create.mutationOptions({ onSuccess: (r) => router.push(`/ops/leads/${r.lead.id}${r.duplicated ? "?dup=1" : ""}`), onError: (e) => setError(e.message) }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="card p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate({ parentName: f.parentName, phone: f.phone, childName: f.childName || null, childGrade: f.childGrade ? Number(f.childGrade) : null, school: f.school || null, centerId: f.centerId || null, interestedCourseId: f.interestedCourseId || null, source: f.source, notes: f.notes || null, consent: true });
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Tên phụ huynh *</label><input className="input" value={f.parentName} onChange={set("parentName")} required minLength={2} /></div>
        <div><label className="label">Số điện thoại *</label><input className="input" value={f.phone} onChange={set("phone")} required inputMode="tel" placeholder="09xx xxx xxx" /></div>
        <div><label className="label">Tên con</label><input className="input" value={f.childName} onChange={set("childName")} /></div>
        <div><label className="label">Lớp</label><input className="input" type="number" min={1} max={12} value={f.childGrade} onChange={set("childGrade")} /></div>
        <div><label className="label">Trường</label><input className="input" value={f.school} onChange={set("school")} /></div>
        <div><label className="label">Cơ sở</label><select className="input" value={f.centerId} onChange={set("centerId")}><option value="">—</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
        <div><label className="label">Khoá quan tâm</label><select className="input" value={f.interestedCourseId} onChange={set("interestedCourseId")}><option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
        <div><label className="label">Nguồn</label><select className="input" value={f.source} onChange={set("source")}>{["walk-in", "phone", "zalo", "facebook", "referral", "event", "other"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Ghi chú</label><textarea className="input" value={f.notes} onChange={set("notes")} /></div>
      </div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <button className="btn-primary" disabled={create.isPending}>{create.isPending ? "Đang lưu…" : "Tạo lead & tự phân bổ"}</button>
    </form>
  );
}

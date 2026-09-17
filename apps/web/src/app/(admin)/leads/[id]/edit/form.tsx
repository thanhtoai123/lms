"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { LeadChildrenBlock, type LeadChildRow } from "../children";

type LeadForEdit = {
  id: string;
  parentName: string;
  phone: string;
  email: string | null;
  centerId: string | null;
  source: string | null;
  notes: string | null;
  facebookUrl: string | null;
  childName: string | null;
  childGrade: number | null;
  courseCode: string | null;
  converted: boolean;
  legacyChildName: string | null;
  children: LeadChildRow[];
};

export function LeadEditForm({ lead, centers, courses }: { lead: LeadForEdit; centers: { id: string; code: string; name: string }[]; courses: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({
    parentName: lead.parentName, phone: lead.phone, email: lead.email ?? "", centerId: lead.centerId ?? "", source: lead.source ?? "", notes: lead.notes ?? "",
    facebookUrl: lead.facebookUrl ?? "", childName: lead.childName ?? "", childGrade: lead.childGrade ? String(lead.childGrade) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(trpc.admissions.leads.update.mutationOptions({ onSuccess: () => router.push(`/leads/${lead.id}`), onError: (e) => setError(e.message) }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const phoneMasked = /x/i.test(lead.phone);
  const dupLink = error?.match(/\/leads\/[0-9a-f-]{36}/)?.[0] ?? null;

  return (
    <div className="space-y-4">
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate({
            leadId: lead.id, parentName: f.parentName, phone: f.phone, email: f.email || null, centerId: f.centerId || null, source: f.source || null, notes: f.notes || null,
            facebookUrl: f.facebookUrl || null, childName: f.childName || null, childGrade: f.childGrade ? Number(f.childGrade) : null,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Tên phụ huynh *</label><input className="input" required minLength={2} maxLength={120} value={f.parentName} onChange={set("parentName")} /></div>
          <div>
            <label className="label">SĐT *</label>
            <input className="input" required inputMode="tel" placeholder="09xxxxxxxx" value={f.phone} onChange={set("phone")} disabled={phoneMasked} />
            {phoneMasked && <p className="mt-1 text-[11px] text-ink-400">Số đang được che theo quyền của bạn — không đổi được.</p>}
          </div>
          <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={set("email")} /></div>
          <div><label className="label">Link Facebook</label><input className="input" placeholder="facebook.com/… hoặc m.me/…" value={f.facebookUrl} onChange={set("facebookUrl")} /></div>
          <div><label className="label">Tên con (cũ)</label><input className="input" value={f.childName} onChange={set("childName")} maxLength={120} /></div>
          <div><label className="label">Lớp của con</label><input className="input" type="number" min={1} max={12} value={f.childGrade} onChange={set("childGrade")} /></div>
          <div>
            <label className="label">Đơn vị</label>
            <select className="input" value={f.centerId} onChange={set("centerId")} disabled={lead.converted}>
              <option value="">Chưa xác định (tự chia đều theo cơ sở)</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-ink-400">Đổi cơ sở kèm bàn giao sale thì dùng &quot;Chuyển lead&quot; ở trang chi tiết.</p>
          </div>
          <div>
            <label className="label">Khoá quan tâm</label>
            <input className="input" disabled value={lead.courseCode ?? "—"} />
            <p className="mt-1 text-[11px] text-ink-400">Lấy theo khoá quan tâm của con — sửa ở khối &quot;Con của phụ huynh&quot; bên dưới.</p>
          </div>
          <div><label className="label">Nguồn</label><input className="input" placeholder="Sự kiện, walk-in…" maxLength={60} value={f.source} onChange={set("source")} /></div>
        </div>
        <div><label className="label">Ghi chú</label><textarea className="input min-h-24" maxLength={4000} value={f.notes} onChange={set("notes")} /></div>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
            {dupLink && <> · <Link href={dupLink} className="font-semibold underline">Mở lead trùng</Link></>}
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu thay đổi"}</button>
          <Link href={`/leads/${lead.id}`} className="btn-ghost">Huỷ</Link>
        </div>
      </form>
      <LeadChildrenBlock leadId={lead.id} legacyChildName={lead.legacyChildName} legacyGrade={lead.childGrade} items={lead.children} courses={courses} canEdit onChanged={() => router.refresh()} />
    </div>
  );
}

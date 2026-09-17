"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Kid = { fullName: string; interestedCourseId: string };
type Result = { key: number; at: string; leadId: string; name: string; phone: string; kind: "created" | "merged" | "same"; detail: string };

const SOURCES = ["walk-in", "phone", "zalo", "facebook", "tiktok", "referral", "event", "quatang", "sale-form", "other"];
const EMPTY_FORM = { parentName: "", phone: "", facebookUrl: "", source: "", centerId: "", notes: "", assignedToId: "" };

/**
 * Phiếu nhập nhanh cho sale: không ô nào bắt buộc ngoài SĐT (căn cứ duy nhất để kiểm tra trùng),
 * lưu xong ở lại trang để nhập phiếu tiếp; kết quả từng phiếu hiện ở "Đã nhập trong phiên này".
 */
export function NewLeadForm({ centers, courses, assignees }: { centers: { id: string; code: string; name: string }[]; courses: { id: string; code: string; name: string }[]; assignees: { id: string; fullName: string }[] }) {
  const trpc = useTRPC();
  const [f, setF] = useState(EMPTY_FORM);
  const [kids, setKids] = useState<Kid[]>([{ fullName: "", interestedCourseId: "" }]);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const setKid = (i: number, patch: Partial<Kid>) => setKids((k) => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const assigneeName = (id: string | null) => (id ? assignees.find((a) => a.id === id)?.fullName ?? null : null);

  const create = useMutation(trpc.admissions.leads.create.mutationOptions({
    onSuccess: (r, vars) => {
      const who = assigneeName(r.lead.assignedToId);
      const kind: Result["kind"] = !r.duplicated ? "created" : r.childrenAdded > 0 ? "merged" : "same";
      const detail = kind === "created"
        ? `đã tạo${who ? ` · giao cho ${who}` : " · chưa có sale nhận (vào pool)"}`
        : kind === "merged"
          ? `trùng số — đã thêm ${r.childrenAdded} bé vào khách cũ${who ? ` (sale ${who})` : ""}`
          : `trùng số — không tạo mới${r.merged.length || r.hasConflicts ? " (đã bổ sung / ghi chú thông tin khác)" : ""}${who ? ` · sale ${who}` : ""}`;
      setResults((list) => [{ key: Date.now(), at: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), leadId: r.lead.id, name: r.lead.parentName, phone: vars.phone, kind, detail }, ...list]);
      setF({ ...EMPTY_FORM, source: f.source, centerId: f.centerId, assignedToId: f.assignedToId });
      setKids([{ fullName: "", interestedCourseId: "" }]);
      setError(null);
    },
    onError: (e) => setError(e.message),
  }));

  return (
    <div className="space-y-4">
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const children = kids.filter((k) => k.fullName.trim()).map((k) => ({ fullName: k.fullName.trim(), interestedCourseId: k.interestedCourseId || null }));
          create.mutate({
            parentName: f.parentName.trim() || undefined, phone: f.phone, centerId: f.centerId || null, interestedCourseId: children[0]?.interestedCourseId || kids[0]?.interestedCourseId || null,
            source: f.source.trim() || null, facebookUrl: f.facebookUrl.trim() || null, notes: f.notes.trim() || null, consent: true, assignedToId: f.assignedToId || null, children,
          });
        }}
      >
        <p className="text-sm text-ink-600">Nhập nhanh khách thu được từ quảng cáo, sự kiện, hoặc tư vấn trực tiếp. Hệ thống tự kiểm tra trùng số điện thoại và tự giao cho tư vấn viên theo cơ sở. Điền được tới đâu lưu tới đó — nhân viên nhập lấy theo tài khoản đang đăng nhập.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Tên phụ huynh</label><input className="input" value={f.parentName} onChange={set("parentName")} maxLength={120} /></div>
          <div><label className="label">SĐT phụ huynh *</label><input className="input" value={f.phone} onChange={set("phone")} required inputMode="tel" placeholder="09xx xxx xxx" /></div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><div className="label">Con của phụ huynh</div><button type="button" className="text-xs text-brand-700 underline" onClick={() => setKids((k) => [...k, { fullName: "", interestedCourseId: "" }])}>+ Thêm con</button></div>
          {kids.map((k, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <input className="input" placeholder={`Tên bé thứ ${i + 1}`} value={k.fullName} onChange={(e) => setKid(i, { fullName: e.target.value })} maxLength={120} />
              <select className="input" value={k.interestedCourseId} onChange={(e) => setKid(i, { interestedCourseId: e.target.value })}>
                <option value="">Khoá quan tâm của bé thứ {i + 1}</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
              <button type="button" className="text-xs text-ink-400 hover:text-red-700 disabled:opacity-30" disabled={kids.length === 1} title={`Bỏ bé thứ ${i + 1}`} onClick={() => setKids((x) => x.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Nguồn</label>
            <input className="input" list="lead-sources" value={f.source} onChange={set("source")} maxLength={60} placeholder="Chọn gợi ý hoặc tự gõ" />
            <datalist id="lead-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div><label className="label">Link Facebook</label><input className="input" value={f.facebookUrl} onChange={set("facebookUrl")} placeholder="facebook.com/… hoặc m.me/…" maxLength={300} /></div>
          <div>
            <label className="label">Cơ sở phụ huynh chọn</label>
            <select className="input" value={f.centerId} onChange={set("centerId")}>
              <option value="">— Để hệ thống tự chia —</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Giao cho sale</label>
            <select className="input" value={f.assignedToId} onChange={set("assignedToId")}>
              <option value="">— Chia tự động theo chế độ của cơ sở —</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Ghi chú</label><textarea className="input" value={f.notes} onChange={set("notes")} maxLength={2000} /></div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button className="btn-primary" disabled={create.isPending || f.phone.trim().length < 9}>{create.isPending ? "Đang lưu…" : "Lưu và nhập phiếu tiếp"}</button>
      </form>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Đã nhập trong phiên này <span className="text-xs font-normal text-ink-400">({results.length})</span></h2>
        {results.length === 0 ? <p className="text-sm text-ink-400">Chưa có phiếu nào.</p> : (
          <ul className="divide-y divide-black/5 text-sm">
            {results.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="text-xs text-ink-400">{r.at}</span> · <Link href={`/leads/${r.leadId}`} className="font-medium text-brand-700">{r.name}</Link> · <span className="font-mono text-xs">{r.phone}</span></span>
                <span className={`chip ${r.kind === "created" ? "bg-green-100 text-green-800" : r.kind === "merged" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`} title={r.kind === "same" ? "Số này đã có trong hệ thống — không tạo khách mới." : undefined}>{r.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

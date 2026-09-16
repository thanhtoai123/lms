"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, STUDENT_STATUS_VI } from "@/components/admin-ui";

type Center = { id: string; code: string; name: string };
type Guardian = { fullName: string; phone: string; email: string; relation: "mother" | "father" | "guardian" | "parent"; mediaConsent: boolean };
export type StudentFormValues = {
  fullName: string; nickname: string; dateOfBirth: string; gender: "" | "male" | "female" | "other"; grade: string; school: string;
  homeCenterId: string; status: string; healthNotes: string; interests: string; notes: string;
};

const EMPTY_G: Guardian = { fullName: "", phone: "", email: "", relation: "mother", mediaConsent: false };
const nn = (v: string) => (v.trim() ? v.trim() : null);

export function StudentForm({ centers, initial, studentId }: { centers: Center[]; initial?: StudentFormValues; studentId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const editing = !!studentId;
  const [f, setF] = useState<StudentFormValues>(
    initial ?? { fullName: "", nickname: "", dateOfBirth: "", gender: "", grade: "", school: "", homeCenterId: centers[0]?.id ?? "", status: "prospect", healthNotes: "", interests: "", notes: "" },
  );
  const [guardians, setGuardians] = useState<Guardian[]>([{ ...EMPTY_G }]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onError = (e: { message: string }) => setError(e.message);
  const create = useMutation(trpc.students.create.mutationOptions({ onSuccess: (s) => router.push(`/students/${s.id}`), onError }));
  const update = useMutation(trpc.students.update.mutationOptions({ onSuccess: () => { router.push(`/students/${studentId}`); router.refresh(); }, onError }));
  const set = (k: keyof StudentFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setG = (i: number, patch: Partial<Guardian>) => setGuardians((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const busy = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const base = {
      fullName: f.fullName.trim(), nickname: nn(f.nickname), dateOfBirth: nn(f.dateOfBirth), gender: (f.gender || null) as "male" | "female" | "other" | null,
      grade: f.grade ? Number(f.grade) : null, school: nn(f.school), homeCenterId: f.homeCenterId,
      status: f.status as "prospect" | "trial" | "active" | "paused" | "alumni" | "withdrawn",
      healthNotes: nn(f.healthNotes), interests: nn(f.interests), notes: nn(f.notes),
    };
    if (editing) update.mutate({ id: studentId!, ...base, reason: nn(reason) ?? undefined });
    else create.mutate({ ...base, guardians: guardians.filter((g) => g.fullName.trim() || g.phone.trim()).map((g) => ({ fullName: g.fullName.trim(), phone: g.phone.trim(), email: nn(g.email), relation: g.relation, mediaConsent: g.mediaConsent })) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Thông tin học viên</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2"><label className="label">Họ và tên *</label><input className="input" required minLength={2} value={f.fullName} onChange={set("fullName")} /></div>
          <div><label className="label">Tên gọi ở nhà</label><input className="input" value={f.nickname} onChange={set("nickname")} /></div>
          <div><label className="label">Ngày sinh</label><input type="date" className="input" value={f.dateOfBirth} onChange={set("dateOfBirth")} /></div>
          <div><label className="label">Giới tính</label><select className="input" value={f.gender} onChange={set("gender")}><option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></div>
          <div><label className="label">Cơ sở *</label><select className="input" required value={f.homeCenterId} onChange={set("homeCenterId")}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
          {editing && <div><label className="label">Trạng thái</label><select className="input" value={f.status} onChange={set("status")}>{Object.entries(STUDENT_STATUS_VI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Học tập</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Lớp (1–12)</label><input type="number" min={1} max={12} className="input" value={f.grade} onChange={set("grade")} /></div>
          <div className="sm:col-span-2"><label className="label">Trường</label><input className="input" value={f.school} onChange={set("school")} /></div>
          <div className="sm:col-span-3"><label className="label">Sở thích / điểm mạnh</label><input className="input" value={f.interests} onChange={set("interests")} placeholder="Lắp ráp, lập trình Scratch, vẽ…" /></div>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Sức khoẻ & lưu ý</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Sức khoẻ, dị ứng</label><textarea className="input min-h-20" value={f.healthNotes} onChange={set("healthNotes")} placeholder="Dị ứng, thuốc cần dùng, lưu ý khi học…" /></div>
          <div><label className="label">Ghi chú nội bộ</label><textarea className="input min-h-20" value={f.notes} onChange={set("notes")} /></div>
        </div>
      </section>

      {!editing && (
        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Phụ huynh</h2>
            {guardians.length < 2 && <button type="button" className="btn-ghost text-xs" onClick={() => setGuardians((g) => [...g, { ...EMPTY_G, relation: "father" }])}>+ Thêm phụ huynh 2</button>}
          </div>
          <p className="text-xs text-ink-400">SĐT trùng với phụ huynh đã có sẽ được ghép vào hồ sơ cũ (không tạo trùng).</p>
          {guardians.map((g, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-black/5 p-3 sm:grid-cols-[1fr_1fr_1fr_140px]">
              <input className="input" placeholder={`Họ tên PH ${i + 1}${i === 0 ? " *" : ""}`} required={i === 0} value={g.fullName} onChange={(e) => setG(i, { fullName: e.target.value })} />
              <input className="input" placeholder="SĐT *" required={i === 0} inputMode="tel" value={g.phone} onChange={(e) => setG(i, { phone: e.target.value })} />
              <input className="input" placeholder="Email" type="email" value={g.email} onChange={(e) => setG(i, { email: e.target.value })} />
              <select className="input" value={g.relation} onChange={(e) => setG(i, { relation: e.target.value as Guardian["relation"] })}><option value="mother">Mẹ</option><option value="father">Bố</option><option value="guardian">Người giám hộ</option><option value="parent">Phụ huynh</option></select>
              <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" checked={g.mediaConsent} onChange={(e) => setG(i, { mediaConsent: e.target.checked })} /> Đồng ý cho trung tâm đăng ảnh của con</label>
            </div>
          ))}
        </section>
      )}

      {editing && (
        <section className="card p-5"><label className="label">Lý do sửa (ghi nhật ký)</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cập nhật theo yêu cầu phụ huynh…" /></section>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo học viên"}</button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Huỷ</button>
      </div>
    </form>
  );
}

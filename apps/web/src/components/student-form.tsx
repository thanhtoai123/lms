"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox } from "@/components/admin-ui";
import { BLOOD_TYPES, BLOOD_TYPE_VI, GUARDIAN_RELATIONS, GUARDIAN_RELATION_VI, type BloodType, type GuardianRelation } from "@satarobo/core";

type Center = { id: string; code: string; name: string };
export type GuardianFormValues = {
  parentId?: string;
  fullName: string;
  phone: string;
  email: string;
  relation: GuardianRelation;
  mediaConsent: boolean;
  /** Nhập mới (để trống = giữ nguyên CCCD đã lưu) */
  nationalId: string;
  nationalIdMasked?: string | null;
};
export type StudentFormValues = {
  fullName: string; nickname: string; code: string; dateOfBirth: string; gender: "" | "male" | "female" | "other"; phone: string; email: string;
  grade: string; school: string; interests: string;
  homeCenterId: string; preferredCenterId: string; firstEnrolledOn: string; notes: string;
  bloodType: "" | BloodType; allergies: string[]; healthNotes: string;
  address: { address: string; ward: string; district: string; city: string };
};

type TextKey = Exclude<keyof StudentFormValues, "address" | "allergies" | "bloodType" | "gender">;

const EMPTY_G: GuardianFormValues = { fullName: "", phone: "", email: "", relation: "mother", mediaConsent: false, nationalId: "" };
const nn = (v: string) => (v.trim() ? v.trim() : null);
const RELATIONS = GUARDIAN_RELATIONS.filter((r) => r !== "parent");

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-bold">{title}</h2>
        {hint && <p className="text-xs text-ink-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function GuardianFields({ g, onChange, index, required, editing }: { g: GuardianFormValues; onChange: (p: Partial<GuardianFormValues>) => void; index: number; required: boolean; editing: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div><label className="label">Họ tên phụ huynh {index === 0 ? "chính" : "thứ hai"}{required ? " *" : ""}</label><input className="input" required={required} minLength={2} value={g.fullName} onChange={(e) => onChange({ fullName: e.target.value })} /></div>
      <div><label className="label">SĐT{required ? " *" : ""}</label><input className="input" required={required} inputMode="tel" value={g.phone} onChange={(e) => onChange({ phone: e.target.value })} /></div>
      <div>
        <label className="label">Quan hệ</label>
        <select className="input" value={g.relation} onChange={(e) => onChange({ relation: e.target.value as GuardianRelation })}>
          {RELATIONS.map((r) => <option key={r} value={r}>{GUARDIAN_RELATION_VI[r]}</option>)}
          {g.relation === "parent" && <option value="parent">{GUARDIAN_RELATION_VI.parent}</option>}
        </select>
      </div>
      <div><label className="label">Email</label><input className="input" type="email" value={g.email} onChange={(e) => onChange({ email: e.target.value })} /></div>
      <div>
        <label className="label">CCCD phụ huynh</label>
        <input className="input" inputMode="numeric" maxLength={15} value={g.nationalId} onChange={(e) => onChange({ nationalId: e.target.value })} placeholder={g.nationalIdMasked ? `Đã lưu ${g.nationalIdMasked} — để trống nếu giữ nguyên` : "9 hoặc 12 số"} />
        <p className="mt-0.5 text-[11px] text-ink-400">Lưu mã hoá; chỉ xem đầy đủ khi ghi lý do.</p>
      </div>
      {!editing && (
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={g.mediaConsent} onChange={(e) => onChange({ mediaConsent: e.target.checked })} /> Đồng ý cho trung tâm đăng ảnh của con</label>
      )}
    </div>
  );
}

export function StudentForm({ centers, initial, studentId, guardiansInitial }: { centers: Center[]; initial?: StudentFormValues; studentId?: string; guardiansInitial?: GuardianFormValues[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const editing = !!studentId;
  const [f, setF] = useState<StudentFormValues>(
    initial ?? {
      fullName: "", nickname: "", code: "", dateOfBirth: "", gender: "", phone: "", email: "", grade: "", school: "", interests: "",
      homeCenterId: centers[0]?.id ?? "", preferredCenterId: "", firstEnrolledOn: "", notes: "",
      bloodType: "", allergies: [], healthNotes: "", address: { address: "", ward: "", district: "", city: "" },
    },
  );
  const existing = guardiansInitial ?? [];
  const [g1, setG1] = useState<GuardianFormValues>(existing[0] ?? { ...EMPTY_G });
  const [g2, setG2] = useState<GuardianFormValues>(existing[1] ?? { ...EMPTY_G, relation: "father" });
  const [others] = useState<GuardianFormValues[]>(existing.slice(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onError = (e: { message: string }) => setError(e.message);
  const create = useMutation(trpc.students.create.mutationOptions({ onSuccess: (s) => router.push(`/students/${s!.id}`), onError }));
  const update = useMutation(trpc.students.update.mutationOptions({ onSuccess: () => { router.push(`/students/${studentId}`); router.refresh(); }, onError }));
  const set = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setF((p) => {
      const n = { ...p };
      n[k] = v;
      return n;
    });
  };
  const setAddr = (k: keyof StudentFormValues["address"]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((p) => {
      const a = { ...p.address };
      a[k] = v;
      return { ...p, address: a };
    });
  };
  const busy = create.isPending || update.isPending;
  const g2Filled = !!(g2.fullName.trim() || g2.phone.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const base = {
      fullName: f.fullName.trim(), nickname: nn(f.nickname), dateOfBirth: nn(f.dateOfBirth), gender: f.gender || null,
      phone: nn(f.phone), email: nn(f.email),
      grade: f.grade ? Number(f.grade) : null, school: nn(f.school), interests: nn(f.interests),
      homeCenterId: f.homeCenterId, preferredCenterId: f.preferredCenterId || null, firstEnrolledOn: nn(f.firstEnrolledOn), notes: nn(f.notes),
      bloodType: f.bloodType || null, allergies: f.allergies.map((a) => a.trim()).filter(Boolean), healthNotes: nn(f.healthNotes),
      address: { address: nn(f.address.address), ward: nn(f.address.ward), district: nn(f.address.district), city: nn(f.address.city) },
    };
    const newG = (g: GuardianFormValues) => ({ fullName: g.fullName.trim(), phone: g.phone.trim(), email: nn(g.email), relation: g.relation, mediaConsent: g.mediaConsent, nationalId: nn(g.nationalId) });
    if (!editing) {
      create.mutate({ ...base, code: nn(f.code), guardians: [g1, ...(g2Filled ? [g2] : [])].map(newG) });
      return;
    }
    const patch = (g: GuardianFormValues, orig: GuardianFormValues) => ({
      parentId: g.parentId!,
      ...(g.fullName.trim() !== orig.fullName ? { fullName: g.fullName.trim() } : {}),
      ...(g.phone.trim() !== orig.phone ? { phone: g.phone.trim() } : {}),
      ...(g.email.trim() !== orig.email ? { email: nn(g.email) } : {}),
      ...(g.relation !== orig.relation ? { relation: g.relation } : {}),
      ...(g.nationalId.trim() ? { nationalId: g.nationalId.trim() } : {}),
    });
    const patches = [g1, g2].flatMap((g, i) => (g.parentId && existing[i] ? [patch(g, existing[i]!)] : []));
    const adds = [g1, g2].filter((g, i) => !g.parentId && (i === 0 || g2Filled) && (g.fullName.trim() || g.phone.trim())).map(newG);
    update.mutate({
      id: studentId!, ...base, code: f.code.trim() || undefined, reason: nn(reason) ?? undefined,
      guardians: patches.filter((p) => Object.keys(p).length > 1), addGuardians: adds.length ? adds : undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Thông tin học viên">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2"><label className="label">Họ và tên *</label><input className="input" required minLength={2} value={f.fullName} onChange={set("fullName")} /></div>
          <div><label className="label">Tên gọi ở nhà</label><input className="input" value={f.nickname} onChange={set("nickname")} /></div>
          <div>
            <label className="label">Mã học viên</label>
            <input className="input font-mono uppercase" maxLength={30} value={f.code} onChange={set("code")} placeholder={editing ? "" : "Để trống để tự sinh (VD SR.HV.001)"} />
            <p className="mt-0.5 text-[11px] text-ink-400">Chữ in hoa, số, dấu chấm, gạch ngang; không trùng học viên khác.</p>
          </div>
          <div><label className="label">Ngày sinh</label><input type="date" className="input" value={f.dateOfBirth} onChange={set("dateOfBirth")} /></div>
          <div><label className="label">Giới tính</label><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as StudentFormValues["gender"] })}><option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></div>
          <div><label className="label">SĐT học viên (nếu có)</label><input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} /></div>
          <div><label className="label">Email học viên</label><input className="input" type="email" value={f.email} onChange={set("email")} /></div>
        </div>
        {editing && <p className="text-xs text-ink-400">Trạng thái học viên tự cập nhật theo ghi danh; bảo lưu / nghỉ học hẳn / kích hoạt lại dùng khối “Vòng đời học viên” ở hồ sơ.</p>}
      </Section>

      <Section title="Học vấn">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Lớp hiện tại</label>
            <select className="input" value={f.grade} onChange={set("grade")}>
              <option value="">—</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Lớp {n}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Trường đang học</label><input className="input" value={f.school} onChange={set("school")} /></div>
          <div className="sm:col-span-3"><label className="label">Sở thích / điểm mạnh</label><input className="input" value={f.interests} onChange={set("interests")} placeholder="Lắp ráp, lập trình Scratch, vẽ…" /></div>
        </div>
      </Section>

      <Section title="Phụ huynh" hint={editing ? "Sửa tên / SĐT / quan hệ / CCCD của phụ huynh đã gắn. SĐT trùng phụ huynh khác sẽ bị chặn — dùng “Thêm phụ huynh” ở hồ sơ để gắn." : "SĐT trùng với phụ huynh đã có sẽ được ghép vào hồ sơ cũ (không tạo trùng)."}>
        <GuardianFields g={g1} index={0} required={!editing} editing={editing && !!g1.parentId} onChange={(p) => setG1({ ...g1, ...p })} />
        <details className="rounded-xl border border-black/5 p-3" open={!!g2.parentId || g2Filled}>
          <summary className="cursor-pointer text-sm font-semibold text-brand-600">{g2.parentId ? "Phụ huynh thứ hai" : "Thêm phụ huynh thứ hai"}</summary>
          <div className="mt-3"><GuardianFields g={g2} index={1} required={false} editing={editing && !!g2.parentId} onChange={(p) => setG2({ ...g2, ...p })} /></div>
        </details>
        {others.length > 0 && <p className="text-xs text-ink-400">Còn {others.length} người giám hộ khác — xem ở hồ sơ học viên.</p>}
      </Section>

      <Section title="Địa chỉ">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4"><label className="label">Số nhà, đường</label><input className="input" maxLength={200} value={f.address.address} onChange={setAddr("address")} /></div>
          <div><label className="label">Phường / Xã</label><input className="input" maxLength={100} value={f.address.ward} onChange={setAddr("ward")} /></div>
          <div><label className="label">Quận / Huyện</label><input className="input" maxLength={100} value={f.address.district} onChange={setAddr("district")} /></div>
          <div className="lg:col-span-2"><label className="label">Tỉnh / Thành phố</label><input className="input" maxLength={100} value={f.address.city} onChange={setAddr("city")} /></div>
        </div>
      </Section>

      <Section title="Thông tin Sata Robo">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Cơ sở *</label><select className="input" required value={f.homeCenterId} onChange={set("homeCenterId")}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
          <div>
            <label className="label">Đơn vị mong muốn</label>
            <select className="input" value={f.preferredCenterId} onChange={set("preferredCenterId")}>
              <option value="">— Chưa chọn —</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ngày đăng ký lần đầu</label>
            <input type="date" className="input" value={f.firstEnrolledOn} onChange={set("firstEnrolledOn")} />
            <p className="mt-0.5 text-[11px] text-ink-400">Để trống: tự điền khi ghi danh lớp đầu tiên.</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3"><label className="label">Ghi chú nội bộ (không public)</label><textarea className="input min-h-16" value={f.notes} onChange={set("notes")} /></div>
        </div>
      </Section>

      <Section title="Sức khoẻ (tuỳ chọn)">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Nhóm máu</label>
            <select className="input" value={f.bloodType} onChange={(e) => setF({ ...f, bloodType: e.target.value as StudentFormValues["bloodType"] })}>
              <option value="">—</option>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{BLOOD_TYPE_VI[b]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dị ứng</label>
            <div className="space-y-1">
              {f.allergies.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" maxLength={100} value={a} onChange={(e) => setF({ ...f, allergies: f.allergies.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="VD: Tôm, đậu phộng, phấn hoa…" />
                  <button type="button" className="btn-ghost !px-2 text-xs" onClick={() => setF({ ...f, allergies: f.allergies.filter((_, j) => j !== i) })}>Xoá mục</button>
                </div>
              ))}
              {f.allergies.length < 20 && <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setF({ ...f, allergies: [...f.allergies, ""] })}>+ Thêm mục</button>}
            </div>
          </div>
          <div className="sm:col-span-3"><label className="label">Bệnh nền, lưu ý cho giáo viên</label><textarea className="input min-h-20" value={f.healthNotes} onChange={set("healthNotes")} placeholder="Thuốc cần dùng, lưu ý khi học…" /></div>
        </div>
      </Section>

      {editing && (
        <section className="card p-5"><label className="label">Lý do sửa (ghi nhật ký)</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cập nhật theo yêu cầu phụ huynh…" /></section>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Đang lưu…" : editing ? "Cập nhật" : "Tạo học viên"}</button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Huỷ</button>
      </div>
    </form>
  );
}

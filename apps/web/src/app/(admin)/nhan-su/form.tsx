"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEPARTMENTS, DEPARTMENT_VI, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_VI, type Department, type EmploymentType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { emptyPrivate } from "./defaults";

export type StaffFormValue = {
  id?: string;
  fullName: string; email: string; phone: string; centerId: string; department: Department; title: string;
  employmentType: EmploymentType; hiredAt: string; annualLeaveDays: number; notes: string; userId: string; teacherId: string;
  private: { idNumber: string; birthDate: string; address: string; taxCode: string; insuranceNo: string; bankName: string; bankAccount: string; baseSalary: string; allowance: string } | null;
};


export function StaffForm({ initial, centers, canSalary, current }: {
  initial: StaffFormValue;
  centers: { id: string; code: string; name: string }[];
  canSalary: boolean;
  current?: { account: { id: string; email: string } | null; teacher: { id: string; code: string | null; fullName: string } | null };
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState<StaffFormValue>(initial);
  const [editPriv, setEditPriv] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const opts = useQuery({ ...trpc.hr.linkOptions.queryOptions({ centerId: f.centerId }), enabled: !!f.centerId, retry: false });
  const save = useMutation(trpc.hr.upsertStaff.mutationOptions({
    onSuccess: (r) => { router.push(`/nhan-su/${r.id}`); router.refresh(); },
    onError: (e) => setErr(e.message),
  }));
  const set = <K extends keyof StaffFormValue>(k: K, v: StaffFormValue[K]) => setF((x) => ({ ...x, [k]: v }));
  const setP = (k: keyof typeof emptyPrivate, v: string) => setF((x) => ({ ...x, private: { ...(x.private ?? emptyPrivate), [k]: v } }));
  const accounts = [...(current?.account ? [{ id: current.account.id, email: current.account.email, fullName: "(đang gắn)" }] : []), ...(opts.data?.accounts ?? [])];
  const teachers = [...(current?.teacher ? [{ id: current.teacher.id, code: current.teacher.code, fullName: `${current.teacher.fullName} (đang gắn)`, userId: null }] : []), ...(opts.data?.teachers ?? [])];
  const submit = () => {
    setErr(null);
    const p = f.private;
    save.mutate({
      id: f.id, fullName: f.fullName, email: f.email, phone: f.phone || null, centerId: f.centerId, department: f.department, title: f.title,
      employmentType: f.employmentType, hiredAt: f.hiredAt, annualLeaveDays: Number(f.annualLeaveDays), notes: f.notes || null,
      userId: f.userId || null, teacherId: f.teacherId || null,
      private: canSalary && p && (editPriv || !f.id) ? {
        idNumber: p.idNumber.replace(/\s/g, "") || null, birthDate: p.birthDate, address: p.address || null, taxCode: p.taxCode || null, insuranceNo: p.insuranceNo || null,
        bankName: p.bankName || null, bankAccount: p.bankAccount || null, baseSalary: p.baseSalary ? Number(p.baseSalary) : null, allowance: p.allowance ? Number(p.allowance) : null,
      } : null,
    });
  };
  const L = "text-xs text-ink-600";
  return (
    <div className="space-y-4">
      <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className={L}>Họ tên *<input className="input mt-1" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></label>
        <label className={L}>Email<input className="input mt-1" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className={L}>Số điện thoại<input className="input mt-1" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className={L}>Cơ sở *<select className="input mt-1" value={f.centerId} onChange={(e) => { set("centerId", e.target.value); set("userId", initial.userId); set("teacherId", initial.teacherId); }}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
        <label className={L}>Bộ phận *<select className="input mt-1" value={f.department} onChange={(e) => set("department", e.target.value as Department)}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_VI[d]}</option>)}</select></label>
        <label className={L}>Chức danh *<input className="input mt-1" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className={L}>Loại hợp đồng<select className="input mt-1" value={f.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)}>{EMPLOYMENT_TYPES.map((d) => <option key={d} value={d}>{EMPLOYMENT_TYPE_VI[d]}</option>)}</select></label>
        <label className={L}>Ngày vào làm<input className="input mt-1" type="date" value={f.hiredAt} onChange={(e) => set("hiredAt", e.target.value)} /></label>
        <label className={L}>Phép năm (ngày/năm)<input className="input mt-1" type="number" min={0} max={30} step={0.5} value={f.annualLeaveDays} onChange={(e) => set("annualLeaveDays", Number(e.target.value))} /></label>
        <label className={L}>Tài khoản đăng nhập
          <select className="input mt-1" value={f.userId} onChange={(e) => set("userId", e.target.value)}>
            <option value="">— Chưa gắn —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.email} · {a.fullName}</option>)}
          </select>
          <span className="text-[11px] text-ink-400">Cần gắn để nhân viên tự chấm công và làm đơn.</span>
        </label>
        <label className={L}>Hồ sơ giáo viên
          <select className="input mt-1" value={f.teacherId} onChange={(e) => set("teacherId", e.target.value)}>
            <option value="">— Không —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.code ?? ""} {t.fullName}</option>)}
          </select>
        </label>
        <label className={`${L} sm:col-span-2 lg:col-span-3`}>Ghi chú<textarea className="input mt-1 h-16" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </section>

      {canSalary && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Giấy tờ, lương, ngân hàng <span className="text-xs font-normal text-ink-400">(chỉ Nhân sự / Kế toán / Quản trị; mọi thay đổi ghi nhật ký)</span></h2>
            {f.id && !editPriv && <button className="text-sm text-brand-600" onClick={() => { setEditPriv(true); setF((x) => ({ ...x, private: x.private ?? emptyPrivate })); }}>Sửa</button>}
          </div>
          {(editPriv || !f.id) ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {f.id && <p className="text-xs text-amber-700 sm:col-span-2 lg:col-span-3">Nhập lại đầy đủ — ô để trống sẽ xoá giá trị cũ (CCCD cũ đang được che).</p>}
              <label className={L}>CCCD<input className="input mt-1" inputMode="numeric" value={f.private?.idNumber ?? ""} onChange={(e) => setP("idNumber", e.target.value)} /></label>
              <label className={L}>Ngày sinh<input className="input mt-1" type="date" value={f.private?.birthDate ?? ""} onChange={(e) => setP("birthDate", e.target.value)} /></label>
              <label className={L}>Mã số thuế<input className="input mt-1" value={f.private?.taxCode ?? ""} onChange={(e) => setP("taxCode", e.target.value)} /></label>
              <label className={L}>Số sổ BHXH<input className="input mt-1" value={f.private?.insuranceNo ?? ""} onChange={(e) => setP("insuranceNo", e.target.value)} /></label>
              <label className={L}>Ngân hàng<input className="input mt-1" value={f.private?.bankName ?? ""} onChange={(e) => setP("bankName", e.target.value)} /></label>
              <label className={L}>Số tài khoản<input className="input mt-1" value={f.private?.bankAccount ?? ""} onChange={(e) => setP("bankAccount", e.target.value)} /></label>
              <label className={L}>Lương cơ bản (đ)<input className="input mt-1" type="number" min={0} step={100000} value={f.private?.baseSalary ?? ""} onChange={(e) => setP("baseSalary", e.target.value)} /></label>
              <label className={L}>Phụ cấp (đ)<input className="input mt-1" type="number" min={0} step={100000} value={f.private?.allowance ?? ""} onChange={(e) => setP("allowance", e.target.value)} /></label>
              <label className={`${L} sm:col-span-2 lg:col-span-1`}>Địa chỉ<input className="input mt-1" value={f.private?.address ?? ""} onChange={(e) => setP("address", e.target.value)} /></label>
            </div>
          ) : <p className="text-sm text-ink-600">Thông tin hiện tại hiển thị ở trang hồ sơ (CCCD được che).</p>}
        </section>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending || f.fullName.trim().length < 2 || f.title.trim().length < 2 || !f.centerId} onClick={submit}>{f.id ? "Lưu thay đổi" : "Tạo hồ sơ"}</button>
        {err && <span className="text-sm text-red-700">{err}</span>}
      </div>
    </div>
  );
}

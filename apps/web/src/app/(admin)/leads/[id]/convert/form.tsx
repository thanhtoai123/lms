"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { packagePrice, isValidIdNumber, type LeadStatus } from "@satarobo/core";
import { vnd } from "@/components/finance-ui";

type Cls = { id: string; code: string; name: string; centerId: string; centerCode: string; courseCode: string; enrolled: number; capacity: number; listPrice: number | null; totalSessions: number | null };
type LeadForConvert = {
  id: string; parentName: string; phone: string; email: string | null; status: LeadStatus; centerId: string | null; centerCode: string | null;
  childName: string | null; childGrade: number | null; courseCode: string | null;
  children: { id: string; fullName: string; grade: number | null; courseCode: string | null; converted: boolean }[];
  payment: { paid: number; total: number; outstanding: number; recorded: number; orders: number; gate: string | null };
  canCreateOrder: boolean;
};
type Item = { key: number; childId: string; studentName: string; dateOfBirth: string; grade: string; classId: string; packageSessions: string; status: "active" | "trial"; scholarship: boolean; scholarshipReason: string; showAll: boolean };

export function ConvertForm({ lead, classes, scholarshipMode }: { lead: LeadForConvert; classes: Cls[]; scholarshipMode: boolean }) {
  const trpc = useTRPC();
  const openChildren = lead.children.filter((c) => !c.converted);
  const courseOf = (childId: string) => (childId ? openChildren.find((c) => c.id === childId)?.courseCode ?? null : openChildren.length ? null : lead.courseCode);
  const matching = (courseCode: string | null) => classes.filter((c) => (!lead.centerId || c.centerId === lead.centerId) && (!courseCode || c.courseCode === courseCode));
  const newItem = (key: number, child?: (typeof openChildren)[number]): Item => {
    const cc = child ? child.courseCode : openChildren.length ? null : lead.courseCode;
    const first = matching(cc)[0];
    return {
      key, childId: child?.id ?? "", studentName: child?.fullName ?? (openChildren.length ? "" : lead.childName ?? ""), dateOfBirth: "", grade: String(child?.grade ?? (openChildren.length ? "" : lead.childGrade ?? "")),
      classId: first?.id ?? "", packageSessions: String(first?.totalSessions ?? 48), status: "active", scholarship: scholarshipMode, scholarshipReason: "", showAll: false,
    };
  };
  const [items, setItems] = useState<Item[]>(() => (openChildren.length ? openChildren.map((c, i) => newItem(i + 1, c)) : [newItem(1)]));
  const [parent, setParent] = useState({ fullName: lead.parentName, email: lead.email ?? "", idNumber: "", address: "", province: "", ward: "" });
  const [mediaConsent, setMediaConsent] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const convert = useMutation(trpc.admissions.leads.convert.mutationOptions({ onError: (e) => setError(e.message), onSuccess: () => setError(null) }));

  const setItem = (key: number, patch: Partial<Item>) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const allScholarship = items.length > 0 && items.every((i) => i.scholarship);
  const blocked = !!lead.payment.gate && !allScholarship;
  const usedChildren = new Set(items.map((i) => i.childId).filter(Boolean));
  const idOk = !parent.idNumber.trim() || isValidIdNumber(parent.idNumber);
  const itemsOk = items.every((i) => i.classId && Number(i.packageSessions) >= 1 && (i.childId || i.studentName.trim().length >= 2) && (!i.scholarship || i.scholarshipReason.trim().length >= 5));
  const priceOf = useMemo(() => (i: Item) => {
    const c = classes.find((x) => x.id === i.classId);
    if (!c || c.listPrice === null || !c.totalSessions) return null;
    return packagePrice(c.listPrice, c.totalSessions, Number(i.packageSessions) || c.totalSessions);
  }, [classes]);

  if (convert.data) {
    const r = convert.data;
    return (
      <div className="card space-y-2 border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <div className="text-base font-semibold">Đã chuyển đổi {r.studentIds.length} học viên.</div>
        {r.accountPending && <div>Tài khoản phụ huynh ở trạng thái chờ kích hoạt — PH vào /kich-hoat nhập SĐT nhận OTP Zalo để đặt mật khẩu.</div>}
        {r.orderCode && <div>Đơn học bổng {r.orderCode} (0đ) đã được tạo.</div>}
        <div>{r.leadClosed ? "Lead chuyển sang “Đã đăng ký”." : "Lead còn con chưa chốt — vẫn mở."}</div>
        <div className="flex flex-wrap gap-3 pt-1">
          {r.studentIds.map((sid, i) => <Link key={sid} href={`/students/${sid}`} className="font-semibold underline">Học viên {i + 1}</Link>)}
          <Link href={`/leads/${lead.id}`} className="underline">← Về lead</Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        convert.mutate({
          leadId: lead.id,
          parent: { fullName: parent.fullName.trim() || null, email: parent.email.trim() || null, idNumber: parent.idNumber.replace(/\s/g, "") || null, address: parent.address.trim() || null, province: parent.province.trim() || null, ward: parent.ward.trim() || null },
          items: items.map((i) => ({
            childId: i.childId || null, studentName: i.childId ? null : i.studentName.trim() || null, dateOfBirth: i.dateOfBirth || null, grade: i.grade ? Number(i.grade) : null,
            classId: i.classId, packageSessions: Number(i.packageSessions), status: i.status, scholarshipFull: i.scholarship, scholarshipReason: i.scholarship ? i.scholarshipReason.trim() : null,
          })),
          mediaConsent,
          waiverReason: waiverReason.trim() || null,
        });
      }}
    >
      <section className={`card space-y-2 p-4 ${lead.payment.gate ? "border-amber-300" : "border-green-200"}`}>
        <h2 className="font-semibold">Thanh toán</h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <span>Đã nộp <b className="tabular-nums">{vnd(lead.payment.paid)}</b>{lead.payment.recorded > 0 && <span className="text-xs text-amber-700"> ({vnd(lead.payment.recorded)} chờ kế toán)</span>}</span>
          <span>Tổng phải thu <b className="tabular-nums">{vnd(lead.payment.total)}</b></span>
          <span>Còn thiếu <b className="tabular-nums">{vnd(lead.payment.outstanding)}</b></span>
          <span className="text-ink-400">{lead.payment.orders ? `${lead.payment.orders} đơn` : "Chưa có đơn hàng"}</span>
        </div>
        {lead.payment.gate && (
          <div className="text-sm text-amber-800">
            ⚠ {lead.payment.gate}.{" "}
            {lead.canCreateOrder && <Link href={`/orders/new?leadId=${lead.id}`} className="font-semibold underline">+ Tạo đơn hàng cho lead này</Link>}
            <span className="block text-xs text-ink-600">Chỉ chốt được ngay khi mọi học viên được học bổng toàn phần (đơn 0đ, lý do bắt buộc).</span>
          </div>
        )}
      </section>

      <section className="card grid gap-2 p-4 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Phụ huynh</h2>
        <label className="text-xs text-ink-600">Họ tên *<input className="input mt-1" required minLength={2} maxLength={120} value={parent.fullName} onChange={(e) => setParent({ ...parent, fullName: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Email <span className="text-ink-400">(bỏ trống nếu PH không dùng email)</span><input className="input mt-1" type="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} /></label>
        <label className="text-xs text-ink-600">SĐT (tài khoản đăng nhập)<input className="input mt-1" disabled value={lead.phone} /></label>
        <label className="text-xs text-ink-600">CCCD / CMND (9 hoặc 12 chữ số)
          <input className={`input mt-1 ${idOk ? "" : "border-red-400"}`} inputMode="numeric" autoComplete="off" value={parent.idNumber} onChange={(e) => setParent({ ...parent, idNumber: e.target.value })} />
          <span className="text-[11px] text-ink-400">Được mã hoá khi lưu.</span>
        </label>
        <label className="text-xs text-ink-600">Tỉnh / Thành<input className="input mt-1" value={parent.province} maxLength={80} onChange={(e) => setParent({ ...parent, province: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Phường / Xã<input className="input mt-1" value={parent.ward} maxLength={80} onChange={(e) => setParent({ ...parent, ward: e.target.value })} /></label>
        <label className="text-xs text-ink-600 sm:col-span-3">Địa chỉ<input className="input mt-1" value={parent.address} maxLength={300} onChange={(e) => setParent({ ...parent, address: e.target.value })} /></label>
      </section>

      {items.map((it, idx) => {
        const cc = courseOf(it.childId);
        const options = it.showAll ? classes : matching(cc);
        const price = priceOf(it);
        const child = openChildren.find((c) => c.id === it.childId);
        return (
          <section key={it.key} className="card grid gap-2 p-4 sm:grid-cols-6">
            <div className="flex items-center justify-between sm:col-span-6">
              <h2 className="font-semibold">Học viên {idx + 1}{child ? " (từ lead)" : ""}</h2>
              {items.length > 1 && <button type="button" className="text-xs text-red-700" onClick={() => setItems(items.filter((x) => x.key !== it.key))}>Bỏ học viên {idx + 1}</button>}
            </div>
            {openChildren.length > 0 && (
              <label className="text-xs text-ink-600 sm:col-span-2">Con trong lead
                <select className="input mt-1" value={it.childId} onChange={(e) => {
                  const c = openChildren.find((x) => x.id === e.target.value);
                  const first = matching(c ? c.courseCode : null)[0];
                  setItem(it.key, { childId: e.target.value, studentName: c?.fullName ?? "", grade: c?.grade ? String(c.grade) : "", classId: first?.id ?? "", packageSessions: String(first?.totalSessions ?? it.packageSessions) });
                }}>
                  <option value="">— Học viên khác (nhập tên) —</option>
                  {openChildren.map((c) => <option key={c.id} value={c.id} disabled={usedChildren.has(c.id) && c.id !== it.childId}>{c.fullName}{c.courseCode ? ` · ${c.courseCode}` : ""}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs text-ink-600 sm:col-span-2">Tên học viên *
              <input className="input mt-1" required={!it.childId} disabled={!!it.childId} value={it.studentName} maxLength={120} onChange={(e) => setItem(it.key, { studentName: e.target.value })} />
            </label>
            <label className="text-xs text-ink-600">Ngày sinh<input className="input mt-1" type="date" value={it.dateOfBirth} onChange={(e) => setItem(it.key, { dateOfBirth: e.target.value })} /></label>
            <label className="text-xs text-ink-600">Lớp / khối<input className="input mt-1" type="number" min={1} max={12} value={it.grade} onChange={(e) => setItem(it.key, { grade: e.target.value })} /></label>
            <div className="text-xs text-ink-600 sm:col-span-4">Lớp đăng ký * <span className="text-ink-400">({it.showAll ? "mọi lớp" : `đúng ${cc ? `khoá ${cc}` : "khoá quan tâm"} & cơ sở ${lead.centerCode ?? "của khách"}`})</span>
              <select className="input mt-1" required value={it.classId} onChange={(e) => { const c = classes.find((x) => x.id === e.target.value); setItem(it.key, { classId: e.target.value, packageSessions: String(c?.totalSessions ?? it.packageSessions) }); }}>
                <option value="">— Chọn lớp —</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} · {c.courseCode}{c.listPrice !== null ? ` (${vnd(c.listPrice)})` : ""} · {c.enrolled}/{c.capacity}{it.showAll ? ` · ${c.centerCode}` : ""}</option>)}
              </select>
              {options.length === 0 && <span className="text-[11px] text-amber-700">Không có lớp đang tuyển đúng khoá & cơ sở.</span>}
              <label className="mt-1 flex items-center gap-1 text-[11px]"><input type="checkbox" checked={it.showAll} onChange={(e) => setItem(it.key, { showAll: e.target.checked })} /> Hiện mọi lớp (khác khoá / cơ sở cần quyền quản lý cơ sở)</label>
            </div>
            <label className="text-xs text-ink-600">Số buổi *<input className="input mt-1" type="number" min={1} max={500} required value={it.packageSessions} onChange={(e) => setItem(it.key, { packageSessions: e.target.value })} /></label>
            <div className="flex flex-col justify-end gap-1 text-xs">
              <label className="flex items-center gap-1"><input type="radio" checked={it.status === "active"} onChange={() => setItem(it.key, { status: "active" })} /> Chính thức</label>
              <label className="flex items-center gap-1"><input type="radio" checked={it.status === "trial"} onChange={() => setItem(it.key, { status: "trial" })} /> Học thử trong lớp</label>
            </div>
            <div className="space-y-1 sm:col-span-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={it.scholarship} onChange={(e) => setItem(it.key, { scholarship: e.target.checked })} />
                Miễn phí học bổng toàn phần — học phí của em này về 0đ.{price !== null && <span className="text-ink-400"> Giá lớp {vnd(price)}.</span>}
              </label>
              {it.scholarship && <input className="input" required minLength={5} maxLength={300} placeholder="Lý do học bổng * (VD: con cán bộ nhân viên, giải thưởng cuộc thi…)" value={it.scholarshipReason} onChange={(e) => setItem(it.key, { scholarshipReason: e.target.value })} />}
            </div>
          </section>
        );
      })}
      {items.length < 10 && <button type="button" className="text-sm font-semibold text-brand-600" onClick={() => setItems([...items, newItem(Math.max(0, ...items.map((i) => i.key)) + 1)])}>+ Thêm học viên</button>}

      <section className="card space-y-2 p-4 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={mediaConsent} onChange={(e) => setMediaConsent(e.target.checked)} />
          <span>Phụ huynh đồng ý cho trung tâm sử dụng hình ảnh/video của học viên trong lớp cho mục đích lưu trữ &amp; truyền thông (NĐ 13/2023). Người tick &amp; thời điểm sẽ được ghi nhật ký.</span>
        </label>
        {(error?.includes("tiên quyết") || waiverReason) && (
          <input className="input" maxLength={300} placeholder="Miễn điều kiện tiên quyết — lý do (quản lý cơ sở), VD: đã test đầu vào" value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} />
        )}
        <p className="text-[11px] text-ink-400">Kết quả: tạo học viên (mã tự sinh theo cơ sở) + tài khoản phụ huynh đăng nhập bằng SĐT (chờ kích hoạt) + ghi danh lớp; đơn hàng của lead được gắn học viên. Lead chuyển “Đã đăng ký” khi mọi con đã chốt.</p>
      </section>

      {!idOk && <div className="text-sm text-red-700">CCCD / CMND gồm 9 hoặc 12 chữ số</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={convert.isPending || blocked || !idOk || !itemsOk} title={blocked ? lead.payment.gate ?? "" : undefined}>{convert.isPending ? "Đang chuyển đổi…" : "Xác nhận chuyển đổi"}</button>
        <Link href={`/leads/${lead.id}`} className="btn-ghost">Hủy</Link>
        {blocked && <span className="text-sm text-amber-800">{lead.payment.gate}</span>}
      </div>
    </form>
  );
}

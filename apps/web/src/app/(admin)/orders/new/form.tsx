"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  priceLines, buildPlan, validateInstallmentPlan, formatUnitPrice, COACH_MULTIPLIER, CLASS_FORMATS, CLASS_FORMAT_VI, MAX_INSTALLMENTS,
  ORDER_TYPES, ORDER_TYPE_VI, type OrderType, type ClassFormat, type InstallmentKind,
} from "@satarobo/core";
import { vnd } from "@/components/finance-ui";

type Draft = { enrollmentId: string; centerId: string; studentId: string; studentName: string; classCode: string; courseId: string; courseCode: string; packageSessions: number; unitPrice: number; parent: { id: string; fullName: string; phone: string; email: string | null } | null };
type LeadDraft = {
  leadId: string; centerId: string | null; parentName: string; phone: string; email: string | null;
  children: { id: string; fullName: string; converted: boolean; courseId: string | null }[];
  items: { courseId: string; description: string; unitPrice: number; packageSessions: number | null; leadChildId: string | null }[];
};
type LineDisc = { kind: "amount" | "percent"; value: number; reason: string };
type Item = { courseId: string; description: string; quantity: number; unitPrice: number; packageSessions: number | ""; leadChildId: string; format: ClassFormat; basePrice: number; discounts: LineDisc[]; packageId: string };
type PlanRow = { amount: number; dueDate: string; kind: InstallmentKind };

type Pkg = { id: string; courseId: string; courseCode: string; code: string; name: string; sessions: number; price: number; savingPercent: number };

export function OrderForm({ centers, methods, courses, packages = [], today, draft, leadDraft, maxLineDiscountPercent = 50 }: {
  centers: { id: string; code: string; name: string }[];
  methods: { id: string; name: string; centerId: string | null; allowFor: string[]; kind: string }[];
  courses: { id: string; code: string; name: string; totalSessions: number; listPrice: number }[];
  /** Gói bán đang mở (/course-packages) — chọn gói là tự điền số buổi + đơn giá */
  packages?: Pkg[];
  today: string;
  draft: Draft | null;
  leadDraft?: LeadDraft | null;
  /** Trần % giảm theo dòng (cấu hình vận hành) */
  maxLineDiscountPercent?: number;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [type, setType] = useState<OrderType>("course");
  const lockedCenter = draft?.centerId ?? leadDraft?.centerId ?? null;
  const [centerId, setCenterId] = useState(lockedCenter ?? centers[0]?.id ?? "");
  const [cust, setCust] = useState(leadDraft
    ? { name: leadDraft.parentName, phone: leadDraft.phone, email: leadDraft.email ?? "", idNumber: "", address: "", province: "", ward: "" }
    : { name: draft?.parent?.fullName ?? "", phone: draft?.parent?.phone ?? "", email: draft?.parent?.email ?? "", idNumber: "", address: "", province: "", ward: "" });
  const emptyItem: Item = { courseId: "", description: "", quantity: 1, unitPrice: 0, packageSessions: "", leadChildId: "", format: "group", basePrice: 0, discounts: [], packageId: "" };
  const [items, setItems] = useState<Item[]>(draft
    ? [{ ...emptyItem, courseId: draft.courseId, description: `Học phí ${draft.courseCode} — gói ${draft.packageSessions} buổi (${draft.studentName}, lớp ${draft.classCode})`, unitPrice: draft.unitPrice, basePrice: draft.unitPrice, packageSessions: draft.packageSessions }]
    : leadDraft?.items.length
      ? leadDraft.items.map((i) => ({ ...emptyItem, courseId: i.courseId, description: i.description, unitPrice: i.unitPrice, basePrice: i.unitPrice, packageSessions: i.packageSessions ?? "", leadChildId: i.leadChildId ?? "" }))
      : [emptyItem]);
  const leadKids = (leadDraft?.children ?? []).filter((c) => !c.converted);
  const [discount, setDiscount] = useState<{ type: "amount" | "percent"; value: number }>({ type: "percent", value: 0 });
  const [methodId, setMethodId] = useState("");
  const [inst, setInst] = useState({ count: 1, firstDueDate: today, intervalDays: 30, monthly: false, deposit: 0 });
  const [custom, setCustom] = useState<PlanRow[] | null>(null);
  const [notes, setNotes] = useState({ customerNote: "", internalNote: "", remindDays: 3 });
  const [err, setErr] = useState<string | null>(null);

  const priced = useMemo(
    () => priceLines(items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, discounts: i.discounts, maxPercent: maxLineDiscountPercent, format: i.format, sessions: i.packageSessions === "" ? null : i.packageSessions }))),
    [items, maxLineDiscountPercent],
  );
  const orderDiscount = discount.value > 0 ? (discount.type === "percent" ? Math.round((priced.total * Math.min(100, discount.value)) / 100) : Math.min(Math.round(discount.value), priced.total)) : 0;
  const total = priced.total - orderDiscount;
  const autoPlan = useMemo(() => {
    try { return buildPlan(total, inst.count, inst.firstDueDate, { intervalDays: inst.intervalDays, monthly: inst.monthly, deposit: inst.deposit || null }); } catch { return []; }
  }, [total, inst]);
  const plan: PlanRow[] = custom ?? autoPlan.map((p) => ({ amount: p.amount, dueDate: p.dueDate, kind: (p.kind ?? "installment") as InstallmentKind }));
  const planErrs = total > 0 ? validateInstallmentPlan(total, plan, { maxInstallments: MAX_INSTALLMENTS }) : [];
  const availableMethods = methods.filter((m) => (!m.centerId || m.centerId === centerId) && m.allowFor.includes(type));

  const create = useMutation(trpc.finance.createOrder.mutationOptions({
    onSuccess: (r) => { if (r.planError) setErr(`Đơn đã tạo, nhưng CHƯA lưu được kế hoạch thanh toán: ${r.planError}. Đặt lại ở khối "Kế hoạch thanh toán" trong trang đơn.`); router.push(`/orders/${r.id}`); },
    onError: (e) => setErr(e.message),
  }));
  const setItem = (i: number, patch: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pickCourse = (i: number, courseId: string) => {
    const c = courses.find((x) => x.id === courseId);
    setItem(i, { courseId, packageId: "", description: c ? `Học phí ${c.code} — ${c.name}` : items[i]!.description, unitPrice: c ? c.listPrice : items[i]!.unitPrice, basePrice: c ? c.listPrice : items[i]!.basePrice, packageSessions: c ? c.totalSessions : "" });
  };
  /** Chọn gói bán → điền khoá, số buổi và đơn giá theo giá đang bán của gói */
  const pickPackage = (i: number, packageId: string) => {
    const p = packages.find((x) => x.id === packageId);
    if (!p) { setItem(i, { packageId: "" }); return; }
    setItem(i, { packageId, courseId: p.courseId, description: `Học phí ${p.courseCode} — ${p.name}`, packageSessions: p.sessions, unitPrice: p.price, basePrice: p.price, format: "group" });
  };

  const submit = () => {
    setErr(null);
    create.mutate({
      type, centerId, enrollmentId: draft?.enrollmentId ?? null, studentId: draft?.studentId ?? null, parentId: draft?.parent?.id ?? null, leadId: leadDraft?.leadId ?? null,
      customer: { name: cust.name, phone: cust.phone, email: cust.email || null, idNumber: cust.idNumber || null, address: cust.address || null, province: cust.province || null, ward: cust.ward || null },
      items: items.map((i) => ({
        courseId: i.courseId || null, description: i.description, quantity: i.quantity, unitPrice: Math.round(i.unitPrice),
        packageSessions: i.packageSessions === "" ? null : i.packageSessions, leadChildId: i.leadChildId || null,
        enrollmentId: draft && items.length === 1 ? draft.enrollmentId : null, studentId: draft && items.length === 1 ? draft.studentId : null,
        format: i.format, discounts: i.discounts.filter((d) => d.value > 0).map((d) => ({ kind: d.kind, value: Math.round(d.value), reason: d.reason.trim() })),
      })),
      discount: discount.value ? discount : null,
      paymentMethodId: methodId,
      installments: custom ? { plan: custom.map((p) => ({ amount: Math.round(p.amount), dueDate: p.dueDate, kind: p.kind })) } : { count: inst.count, firstDueDate: inst.firstDueDate, intervalDays: inst.intervalDays, monthly: inst.monthly, deposit: inst.deposit || null },
      customerNote: notes.customerNote || null, internalNote: notes.internalNote || null, remindDays: notes.remindDays,
    });
  };

  return (
    <div className="space-y-4">
      {draft && <div className="rounded-xl bg-brand-50 p-3 text-sm">Tạo đơn cho đăng ký: <b>{draft.studentName}</b> · lớp {draft.classCode} · gói {draft.packageSessions} buổi</div>}
      {leadDraft && <div className="rounded-xl bg-brand-50 p-3 text-sm">Tạo đơn cho khách tiềm năng <b>{leadDraft.parentName}</b> — đơn gắn với lead; ghi nhận thu xong mới chốt được. Một đơn nhận nhiều dòng (mỗi con một dòng).</div>}
      <section className="card grid gap-2 p-4 sm:grid-cols-3">
        <label className="text-xs text-ink-600">Loại đơn *
          <select className="input mt-1" value={type} disabled={!!draft} onChange={(e) => setType(e.target.value as OrderType)}>{ORDER_TYPES.map((t) => <option key={t} value={t}>{ORDER_TYPE_VI[t]}</option>)}</select>
        </label>
        <label className="text-xs text-ink-600">Cơ sở *
          <select className="input mt-1" value={centerId} disabled={!!lockedCenter} title={leadDraft?.centerId ? "Khoá theo cơ sở của khách" : undefined} onChange={(e) => { setCenterId(e.target.value); setMethodId(""); }}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
        </label>
        <label className="text-xs text-ink-600">Phương thức thanh toán *
          <select className="input mt-1" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            <option value="">— Chọn —</option>
            {availableMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Khách hàng</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-ink-600">Tên phụ huynh *<input className="input mt-1" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Số điện thoại *<input className="input mt-1" value={cust.phone} disabled={!!leadDraft} title={leadDraft ? "Lấy theo SĐT của lead" : undefined} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Email<input className="input mt-1" type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} /></label>
          <label className="text-xs text-ink-600">CCCD (được che, chỉ kế toán xem)<input className="input mt-1" autoComplete="off" value={cust.idNumber} onChange={(e) => setCust({ ...cust, idNumber: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Tỉnh / thành<input className="input mt-1" value={cust.province} onChange={(e) => setCust({ ...cust, province: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Phường / xã<input className="input mt-1" value={cust.ward} onChange={(e) => setCust({ ...cust, ward: e.target.value })} /></label>
          <label className="text-xs text-ink-600 sm:col-span-3">Địa chỉ<input className="input mt-1" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></label>
        </div>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Sản phẩm</h2>
        {items.map((it, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
            {type === "course" && (
              <label className="text-xs text-ink-600 sm:col-span-2">Khoá
                <select className="input mt-1" value={it.courseId} disabled={!!draft} onChange={(e) => pickCourse(i, e.target.value)}>
                  <option value="">—</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </label>
            )}
            {type === "course" && packages.length > 0 && (
              <label className="text-xs text-ink-600 sm:col-span-12">Gói bán (chọn gói → tự điền số buổi + đơn giá)
                <select className="input mt-1" value={it.packageId} onChange={(e) => pickPackage(i, e.target.value)}>
                  <option value="">— Không dùng gói, nhập tay —</option>
                  {packages.filter((p) => !it.courseId || p.courseId === it.courseId || p.id === it.packageId).map((p) => (
                    <option key={p.id} value={p.id}>{p.courseCode} · {p.name} — {p.sessions} buổi · {vnd(p.price)}{p.savingPercent > 0 ? ` (−${p.savingPercent}%)` : ""}</option>
                  ))}
                </select>
              </label>
            )}
            {leadDraft && (
              <label className="text-xs text-ink-600 sm:col-span-12">Học viên (con của lead)
                <select className="input mt-1" value={it.leadChildId} onChange={(e) => setItem(i, { leadChildId: e.target.value })}>
                  <option value="">— Không gắn con —</option>
                  {leadKids.map((c) => <option key={c.id} value={c.id}>{c.fullName} · chưa có hồ sơ học viên</option>)}
                </select>
              </label>
            )}
            <label className={`text-xs text-ink-600 ${type === "course" ? "sm:col-span-4" : "sm:col-span-6"}`}>Mô tả *<input className="input mt-1" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></label>
            {type === "course" && <label className="text-xs text-ink-600 sm:col-span-1">Buổi<input type="number" min={1} max={500} className="input mt-1" value={it.packageSessions} onChange={(e) => setItem(i, { packageSessions: e.target.value === "" ? "" : Number(e.target.value) })} /></label>}
            <label className="text-xs text-ink-600 sm:col-span-1">SL<input type="number" min={1} className="input mt-1" value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></label>
            <label className="text-xs text-ink-600 sm:col-span-2">Đơn giá (đ) *<input type="number" min={0} step={1000} className="input mt-1" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value), basePrice: it.format === "group" ? Number(e.target.value) : it.basePrice })} /></label>
            <div className="flex items-center justify-between gap-2 pb-2 text-sm tabular-nums sm:col-span-2"><b>{vnd(priced.lines[i]?.net ?? 0)}</b>{items.length > 1 && <button className="text-xs text-red-700" onClick={() => setItems(items.filter((_, j) => j !== i))}>Xoá dòng {i + 1}</button>}</div>

            {type === "course" && (
              <div className="flex flex-wrap items-end gap-2 sm:col-span-12">
                <label className="text-xs text-ink-600">Hình thức lớp
                  <select className="input mt-1" value={it.format} onChange={(e) => setItem(i, { format: e.target.value as ClassFormat })}>
                    {CLASS_FORMATS.map((f) => <option key={f} value={f}>{CLASS_FORMAT_VI[f]}{f === "group" ? "" : ` ×${COACH_MULTIPLIER[f]}`}</option>)}
                  </select>
                </label>
                {it.format !== "group" && (
                  <div className="pb-2 text-xs text-ink-600">
                    {vnd(it.basePrice || it.unitPrice)}/gói × {COACH_MULTIPLIER[it.format]} = <b>{vnd(formatUnitPrice(it.basePrice || it.unitPrice, it.format))}</b>
                    <button className="ml-2 font-semibold text-brand-600" onClick={() => setItem(i, { unitPrice: formatUnitPrice(it.basePrice || it.unitPrice, it.format) })}>Áp số này vào Đơn giá</button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1 sm:col-span-12">
              {it.discounts.length === 0 && <div className="text-[11px] text-ink-400">Chưa có khoản giảm nào — dòng này bán đúng giá.</div>}
              {it.discounts.map((d, k) => (
                <div key={k} className="flex flex-wrap items-center gap-1">
                  <input type="number" min={1} className="input !w-28 !py-1 text-xs" value={d.value} onChange={(e) => setItem(i, { discounts: it.discounts.map((x, j) => (j === k ? { ...x, value: Number(e.target.value) } : x)) })} />
                  <select className="input !w-20 !py-1 text-xs" value={d.kind} onChange={(e) => setItem(i, { discounts: it.discounts.map((x, j) => (j === k ? { ...x, kind: e.target.value as "amount" | "percent" } : x)) })}>
                    <option value="percent">%</option><option value="amount">đ</option>
                  </select>
                  <input className="input !w-56 !py-1 text-xs" placeholder="Lý do giảm (bắt buộc)" value={d.reason} onChange={(e) => setItem(i, { discounts: it.discounts.map((x, j) => (j === k ? { ...x, reason: e.target.value } : x)) })} />
                  <button className="text-xs text-red-700" onClick={() => setItem(i, { discounts: it.discounts.filter((_, j) => j !== k) })}>Bỏ</button>
                </div>
              ))}
              {it.discounts.length < 5 && <button className="text-xs font-semibold text-brand-600" onClick={() => setItem(i, { discounts: [...it.discounts, { kind: "percent", value: 5, reason: "" }] })}>+ Thêm khoản giảm</button>}
              <span className="ml-2 text-[11px] text-ink-400">Trần giảm theo dòng: {maxLineDiscountPercent}%. Nhiều khoản cộng dồn, không vượt thành tiền.</span>
            </div>
          </div>
        ))}
        {!draft && <button className="text-xs font-semibold text-brand-600" onClick={() => setItems([...items, emptyItem])}>+ Thêm dòng</button>}
        <div className="flex flex-wrap items-end justify-end gap-3 border-t border-black/5 pt-3 text-sm">
          <label className="text-xs text-ink-600">Giảm giá cả đơn
            <div className="mt-1 flex gap-1">
              <input type="number" min={0} className="input w-32" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: Number(e.target.value) })} />
              <select className="input w-24" value={discount.type} onChange={(e) => setDiscount({ ...discount, type: e.target.value as "amount" | "percent" })}><option value="percent">%</option><option value="amount">đ</option></select>
            </div>
          </label>
          <div className="text-right">
            <div className="text-xs text-ink-400">Tạm tính {vnd(priced.subtotal)} · giảm theo dòng {vnd(priced.discountAmount)}{orderDiscount > 0 ? ` · giảm cả đơn ${vnd(orderDiscount)}` : ""}</div>
            <div className="text-xl font-bold">{vnd(total)}</div>
          </div>
        </div>
        {priced.errors.length > 0 && <div className="text-sm text-red-700">{priced.errors.join("; ")}</div>}
      </section>

      <section className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Kế hoạch thanh toán</h2>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!custom} onChange={(e) => setCustom(e.target.checked ? plan.map((p) => ({ ...p })) : null)} /> Tự nhập từng đợt</label>
        </div>
        <div className="text-sm">Tổng đơn sau giảm giá: <b>{vnd(total)}</b></div>
        {!custom && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 pb-2 text-xs text-ink-600">
              <input type="checkbox" checked={inst.deposit > 0} onChange={(e) => setInst({ ...inst, deposit: e.target.checked ? Math.max(1000, Math.round(total / 10 / 1000) * 1000) : 0 })} /> Thu cọc trước
            </label>
            {inst.deposit > 0 && <label className="text-xs text-ink-600">Tiền cọc (đ)<input type="number" min={1000} step={1000} className="input mt-1 w-36" value={inst.deposit} onChange={(e) => setInst({ ...inst, deposit: Number(e.target.value) })} /></label>}
            <label className="text-xs text-ink-600">Chia thành
              <select className="input mt-1" value={inst.count} onChange={(e) => setInst({ ...inst, count: Number(e.target.value) })}>
                <option value={1}>1 lần</option>
                {[2, 3, 4].map((n) => <option key={n} value={n}>{n} học phần</option>)}
                {Array.from({ length: MAX_INSTALLMENTS - 4 }, (_, k) => k + 5).map((n) => <option key={n} value={n}>{n} đợt</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-ink-600"><input type="checkbox" checked={inst.monthly} onChange={(e) => setInst({ ...inst, monthly: e.target.checked })} /> Mốc theo tháng</label>
            <label className="text-xs text-ink-600">Hạn đợt đầu<input type="date" className="input mt-1" value={inst.firstDueDate} onChange={(e) => setInst({ ...inst, firstDueDate: e.target.value })} /></label>
            {inst.count > 1 && !inst.monthly && <label className="text-xs text-ink-600">Cách nhau (ngày)<input type="number" min={7} max={180} className="input mt-1 w-28" value={inst.intervalDays} onChange={(e) => setInst({ ...inst, intervalDays: Number(e.target.value) })} /></label>}
          </div>
        )}
        <table className="w-full max-w-lg text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-1">Phiếu</th><th className="p-1">Hẹn đóng</th><th className="p-1 text-right">Số tiền</th></tr></thead>
          <tbody>
            {plan.map((p, i) => (
              <tr key={i}>
                <td className="p-1">{p.kind === "deposit" ? "Cọc" : `Đợt ${custom ? i + 1 - plan.slice(0, i).filter((x) => x.kind === "deposit").length : i + 1 - (inst.deposit > 0 ? 1 : 0)}`}</td>
                <td className="p-1">{custom ? <input type="date" className="input !py-1" value={p.dueDate} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} /> : p.dueDate.split("-").reverse().join("/")}</td>
                <td className="p-1 text-right">{custom ? <input type="number" min={0} step={1000} className="input !py-1 text-right" value={p.amount} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} /> : <span className="tabular-nums">{vnd(p.amount)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`text-xs ${plan.reduce((s, p) => s + p.amount, 0) === total ? "text-green-700" : "text-red-700"}`}>
          Tổng {plan.length} phiếu: {vnd(plan.reduce((s, p) => s + p.amount, 0))} / {vnd(total)}
        </div>
        {custom && (
          <div className="flex gap-2 text-xs">
            {custom.length < MAX_INSTALLMENTS + 1 && <button className="font-semibold text-brand-600" onClick={() => setCustom([...custom, { amount: 0, dueDate: custom[custom.length - 1]?.dueDate ?? today, kind: "installment" }])}>+ Thêm đợt</button>}
            {custom.length > 1 && <button className="text-red-700" onClick={() => setCustom(custom.slice(0, -1))}>Bỏ đợt cuối</button>}
          </div>
        )}
        {planErrs.length > 0 && <div className="text-sm text-red-700">{planErrs.join("; ")}</div>}
        <label className="text-xs text-ink-600">Nhắc công nợ trước (ngày)<input type="number" min={0} max={30} className="input mt-1 w-24" value={notes.remindDays} onChange={(e) => setNotes({ ...notes, remindDays: Number(e.target.value) })} /></label>
      </section>

      <section className="card grid gap-2 p-4 sm:grid-cols-2">
        <label className="text-xs text-ink-600">Ghi chú cho khách<textarea className="input mt-1 min-h-16" value={notes.customerNote} onChange={(e) => setNotes({ ...notes, customerNote: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Ghi chú nội bộ {discount.value > 0 && <span className="text-red-600">* (bắt buộc khi giảm giá)</span>}<textarea className="input mt-1 min-h-16" value={notes.internalNote} onChange={(e) => setNotes({ ...notes, internalNote: e.target.value })} placeholder="Chương trình ưu đãi, người duyệt giảm giá…" /></label>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <button className="btn-primary" disabled={create.isPending || !methodId || !cust.name || !cust.phone || priced.errors.length > 0 || planErrs.length > 0} onClick={submit}>
        {create.isPending ? "Đang tạo…" : `Tạo đơn ${vnd(total)}`}
      </button>
    </div>
  );
}

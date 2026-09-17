"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

export type Opt = { id: string; label: string };
export type ItemOpt = { id: string; sku: string; name: string; unit: string; type: string; salePrice?: number | null; rentPrice?: number | null; deposit?: number | null };

const money = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("vi-VN")}đ`);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="card mt-10 w-full max-w-lg space-y-3 p-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button type="button" className="text-ink-400" onClick={onClose} aria-label="Đóng">✕</button></div>
        {children}
      </div>
    </div>
  );
}
function Err({ e }: { e: { message: string } | null }) {
  return e ? <p className="text-sm text-red-700">{e.message}</p> : null;
}
const itemLabel = (i: ItemOpt) => `${i.sku} — ${i.name}`;

const MOVE_TITLE = { receipt: "Nhập kho", issue: "Cấp phát cho học viên / lớp", return: "Nhận lại từ học viên", damage: "Báo hỏng / mất" } as const;
type ManualType = keyof typeof MOVE_TITLE;

export function MovementButton({ type, centers, items, classes, label }: { type: ManualType; centers: Opt[]; items: ItemOpt[]; classes?: (Opt & { centerId: string })[]; label?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [centerId, setCenter] = useState(centers[0]?.id ?? "");
  const [itemId, setItem] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [unitCost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [classId, setClass] = useState("");
  const m = useMutation(trpc.inventory.createMovement.mutationOptions({ onSuccess: () => { setOpen(false); setQty("1"); setNote(""); setStudent(null); router.refresh(); } }));
  const cls = (classes ?? []).filter((c) => c.centerId === centerId);
  if (!open) return <button type="button" className={type === "receipt" ? "btn-primary" : "btn-ghost"} onClick={() => setOpen(true)}>{label ?? MOVE_TITLE[type]}</button>;
  return (
    <Modal title={MOVE_TITLE[type]} onClose={() => setOpen(false)}>
      <form className="space-y-2" onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ type, centerId, itemId, qty: Number(qty), unitCost: type === "receipt" ? Number(unitCost.replace(/\D/g, "")) : null, supplier: supplier || null, note: note || null, studentId: student?.id ?? null, classId: classId || null });
      }}>
        {centers.length > 1 && <label className="block text-sm">Cơ sở<select className="input mt-1 w-full" value={centerId} onChange={(e) => setCenter(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        <label className="block text-sm">Mặt hàng<select className="input mt-1 w-full" value={itemId} onChange={(e) => setItem(e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}</select></label>
        <div className="flex gap-2">
          <label className="text-sm">Số lượng<input type="number" min={1} className="input mt-1 w-28" value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
          {type === "receipt" && <label className="flex-1 text-sm">Đơn giá nhập (đ)<input inputMode="numeric" className="input mt-1 w-full" value={unitCost} onChange={(e) => setCost(e.target.value)} required /></label>}
        </div>
        {type === "receipt" && <label className="block text-sm">Nhà cung cấp<input className="input mt-1 w-full" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={150} /></label>}
        {(type === "issue" || type === "return") && (
          <>
            <div className="text-sm">Học viên<div className="mt-1"><StudentPicker value={student} onChange={setStudent} /></div></div>
            {type === "issue" && cls.length > 0 && <label className="block text-sm">Hoặc cấp cho lớp<select className="input mt-1 w-full" value={classId} onChange={(e) => setClass(e.target.value)}><option value="">—</option>{cls.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
          </>
        )}
        <label className="block text-sm">Ghi chú{type !== "receipt" && type !== "issue" && <span className="text-xs text-red-700"> (bắt buộc)</span>}<textarea className="input mt-1 w-full" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        <Err e={m.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu phiếu</button></div>
      </form>
    </Modal>
  );
}

export function TransferButton({ centers, allCenters, items }: { centers: Opt[]; allCenters: Opt[]; items: ItemOpt[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(centers[0]?.id ?? "");
  const [to, setTo] = useState(allCenters.find((c) => c.id !== centers[0]?.id)?.id ?? "");
  const [itemId, setItem] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const m = useMutation(trpc.inventory.transfer.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (allCenters.length < 2) return null;
  if (!open) return <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>Chuyển kho</button>;
  return (
    <Modal title="Chuyển kho giữa cơ sở" onClose={() => setOpen(false)}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ fromCenterId: from, toCenterId: to, itemId, qty: Number(qty), note: note || null }); }}>
        <div className="flex gap-2">
          <label className="flex-1 text-sm">Từ<select className="input mt-1 w-full" value={from} onChange={(e) => setFrom(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="flex-1 text-sm">Đến<select className="input mt-1 w-full" value={to} onChange={(e) => setTo(e.target.value)}>{allCenters.filter((c) => c.id !== from).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        </div>
        <label className="block text-sm">Mặt hàng<select className="input mt-1 w-full" value={itemId} onChange={(e) => setItem(e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}</select></label>
        <label className="block text-sm">Số lượng<input type="number" min={1} className="input mt-1 w-28" value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
        <label className="block text-sm">Ghi chú<input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        <Err e={m.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending || !to}>Chuyển</button></div>
      </form>
    </Modal>
  );
}

export function SellButton({ centers, items, methods }: { centers: Opt[]; items: ItemOpt[]; methods: (Opt & { centerId: string | null })[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [centerId, setCenter] = useState(centers[0]?.id ?? "");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lines, setLines] = useState<{ itemId: string; qty: number }[]>([{ itemId: items[0]?.id ?? "", qty: 1 }]);
  const mOpts = methods.filter((x) => !x.centerId || x.centerId === centerId);
  const [methodId, setMethod] = useState(mOpts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const m = useMutation(trpc.inventory.sell.mutationOptions({ onSuccess: (r) => { setOpen(false); router.push(`/orders/${r.id}`); } }));
  const total = lines.reduce((a, l) => a + (items.find((i) => i.id === l.itemId)?.salePrice ?? 0) * l.qty, 0);
  const sellable = items.filter((i) => i.salePrice);
  if (!sellable.length || !methods.length) return null;
  if (!open) return <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>Bán hàng</button>;
  return (
    <Modal title="Bán sản phẩm (lập đơn + xuất kho)" onClose={() => setOpen(false)}>
      <form className="space-y-2" onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ centerId, studentId: student?.id ?? null, customer: name && phone ? { name, phone } : null, lines, paymentMethodId: methodId, note: note || null });
      }}>
        {centers.length > 1 && <label className="block text-sm">Cơ sở<select className="input mt-1 w-full" value={centerId} onChange={(e) => setCenter(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        <div className="text-sm">Học viên (lấy thông tin phụ huynh)<div className="mt-1"><StudentPicker value={student} onChange={setStudent} /></div></div>
        {!student && (
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Tên khách" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <input className="input w-36" placeholder="SĐT" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
          </div>
        )}
        {lines.map((l, idx) => (
          <div key={idx} className="flex gap-2">
            <select className="input flex-1" value={l.itemId} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, itemId: e.target.value } : x)))}>
              {sellable.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)} · {money(i.salePrice)}</option>)}
            </select>
            <input type="number" min={1} className="input w-20" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, qty: Number(e.target.value) } : x)))} />
            {lines.length > 1 && <button type="button" className="text-xs text-red-700" onClick={() => setLines(lines.filter((_, j) => j !== idx))}>Xoá</button>}
          </div>
        ))}
        <button type="button" className="text-xs text-brand-600" onClick={() => setLines([...lines, { itemId: sellable[0]!.id, qty: 1 }])}>+ Thêm dòng</button>
        <label className="block text-sm">Phương thức thanh toán<select className="input mt-1 w-full" value={methodId} onChange={(e) => setMethod(e.target.value)}>{mOpts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label className="block text-sm">Ghi chú<input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        <p className="text-sm">Tổng: <b>{money(total)}</b> — đơn hàng mới ở trạng thái chờ thanh toán; huỷ đơn sẽ tự nhập lại hàng.</p>
        <Err e={m.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending || !methodId}>Lập đơn</button></div>
      </form>
    </Modal>
  );
}

export function RentButton({ centers, items, methods }: { centers: Opt[]; items: ItemOpt[]; methods: (Opt & { centerId: string | null })[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const rentable = items.filter((i) => i.rentPrice);
  const [open, setOpen] = useState(false);
  const [centerId, setCenter] = useState(centers[0]?.id ?? "");
  const [itemId, setItem] = useState(rentable[0]?.id ?? "");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [days, setDays] = useState("30");
  const [qty, setQty] = useState("1");
  const [methodId, setMethod] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation(trpc.inventory.rentOut.mutationOptions({ onSuccess: () => { setOpen(false); setStudent(null); router.refresh(); } }));
  if (!rentable.length) return null;
  const it = rentable.find((i) => i.id === itemId);
  const fee = (it?.rentPrice ?? 0) * Math.max(1, Math.ceil(Number(days || 0) / 30)) * Number(qty || 0);
  if (!open) return <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>Cho thuê</button>;
  return (
    <Modal title="Cho thuê học cụ / sản phẩm" onClose={() => setOpen(false)}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (student) m.mutate({ centerId, itemId, studentId: student.id, qty: Number(qty), days: Number(days), paymentMethodId: methodId || null, note: note || null }); }}>
        {centers.length > 1 && <label className="block text-sm">Cơ sở<select className="input mt-1 w-full" value={centerId} onChange={(e) => setCenter(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        <label className="block text-sm">Mặt hàng<select className="input mt-1 w-full" value={itemId} onChange={(e) => setItem(e.target.value)}>{rentable.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)} · {money(i.rentPrice)}/tháng</option>)}</select></label>
        <div className="text-sm">Học viên<div className="mt-1"><StudentPicker value={student} onChange={setStudent} /></div></div>
        <div className="flex gap-2">
          <label className="text-sm">Số ngày<input type="number" min={1} max={365} className="input mt-1 w-24" value={days} onChange={(e) => setDays(e.target.value)} /></label>
          <label className="text-sm">Số lượng<input type="number" min={1} max={10} className="input mt-1 w-20" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        </div>
        <label className="block text-sm">Lập đơn thu tiền thuê + cọc<select className="input mt-1 w-full" value={methodId} onChange={(e) => setMethod(e.target.value)}><option value="">Không lập đơn (thu sau)</option>{methods.filter((x) => !x.centerId || x.centerId === centerId).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label className="block text-sm">Ghi chú<input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        <p className="text-sm">Tiền thuê: <b>{money(fee)}</b> · cọc {money((it?.deposit ?? 0) * Number(qty || 0))}</p>
        <Err e={m.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending || !student}>Cho thuê</button></div>
      </form>
    </Modal>
  );
}

export function CloseRentalButton({ id, deposit }: { id: string; deposit: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"ok" | "damaged" | "lost">("ok");
  const [charge, setCharge] = useState("0");
  const [note, setNote] = useState("");
  const m = useMutation(trpc.inventory.closeRental.mutationOptions({ onSuccess: () => router.refresh() }));
  if (m.data) return <span className="text-xs text-green-700">Đã đóng · hoàn cọc {money(m.data.refund)}{m.data.charged ? ` (trừ ${money(m.data.charged)})` : ""}</span>;
  if (!open) return <button type="button" className="text-xs text-brand-600" onClick={() => setOpen(true)}>Nhận lại</button>;
  return (
    <form className="space-y-1 text-xs" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, outcome, damageCharge: Number(charge) || 0, note: note || null }); }}>
      <select className="input !py-1 text-xs" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}><option value="ok">Trả nguyên vẹn</option><option value="damaged">Trả nhưng hỏng</option><option value="lost">Mất / không trả</option></select>
      {outcome === "damaged" && <input inputMode="numeric" className="input !py-1 text-xs" placeholder="Trừ cọc (đ)" value={charge} onChange={(e) => setCharge(e.target.value)} />}
      {outcome !== "ok" && <input className="input !py-1 text-xs" placeholder="Tình trạng" value={note} onChange={(e) => setNote(e.target.value)} />}
      <div className="flex gap-1"><button className="btn-primary !py-1 text-xs" disabled={m.isPending}>Xác nhận</button><button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setOpen(false)}>Huỷ</button></div>
      <p className="text-ink-400">Cọc {money(deposit)}; trả trễ trừ theo ngày.</p>
      <Err e={m.error} />
    </form>
  );
}

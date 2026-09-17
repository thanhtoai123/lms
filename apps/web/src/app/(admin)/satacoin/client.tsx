"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AWARD_REASONS, COIN_REASON_VI, type CoinReason } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Row = { id: string; rank: number; fullName: string; code: string | null; centerCode: string | null; balance: number; available: number; held: number; earned: number; tier: string; tierClass: string; href: string };

export function LeaderTable({ rows, classId, needClass }: { rows: Row[]; classId: string | null; needClass: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState<CoinReason>("homework");
  const [note, setNote] = useState("");
  const m = useMutation(trpc.coin.award.mutationOptions({ onSuccess: () => { setSel([]); setNote(""); router.refresh(); } }));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3 text-sm">
        {needClass ? <span className="text-amber-700">Chọn lớp ở bộ lọc để thưởng xu.</span> : (
          <>
            <span>Thưởng cho <b>{sel.length}</b> HV:</span>
            <input type="number" min={1} className="input w-20 !py-1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Số xu" />
            <select className="input !py-1" value={reason} onChange={(e) => setReason(e.target.value as CoinReason)}>{AWARD_REASONS.map((r) => <option key={r} value={r}>{COIN_REASON_VI[r]}</option>)}</select>
            <input className="input flex-1 !py-1" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            <button type="button" className="btn-primary !py-1" disabled={!sel.length || m.isPending} onClick={() => m.mutate({ studentIds: sel, amount: Number(amount), reason, note: note || null, classId })}>Thưởng</button>
          </>
        )}
        {m.error && <span className="w-full text-red-700">{m.error.message}</span>}
        {m.data && <span className="w-full text-green-700">Đã thưởng {m.data.total} xu cho {m.data.awarded} học viên.</span>}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-ink-400">
          <tr>
            <th className="p-3">{!needClass && <input type="checkbox" aria-label="Chọn tất cả" checked={sel.length === rows.length && rows.length > 0} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} />}</th>
            <th className="p-3">#</th><th className="p-3">Học viên</th><th className="p-3">Hạng</th><th className="p-3 text-right">Số dư</th><th className="p-3 text-right">Khả dụng</th><th className="p-3 text-right">Tích luỹ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((r) => (
            <tr key={r.id} className={sel.includes(r.id) ? "bg-brand-50" : ""}>
              <td className="p-3">{!needClass && <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Chọn ${r.fullName}`} />}</td>
              <td className="p-3 tabular-nums text-ink-400">{r.rank}</td>
              <td className="p-3"><Link href={r.href} className="font-medium hover:underline">{r.fullName}</Link><div className="font-mono text-xs text-ink-400">{r.code} · {r.centerCode}</div></td>
              <td className="p-3"><span className={`chip ${r.tierClass}`}>{r.tier}</span></td>
              <td className="p-3 text-right font-semibold tabular-nums text-amber-700">{r.balance}</td>
              <td className="p-3 text-right tabular-nums">{r.available}{r.held > 0 && <div className="text-[11px] text-ink-400">giữ {r.held}</div>}</td>
              <td className="p-3 text-right tabular-nums text-ink-600">{r.earned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SessionAward({ sessions }: { sessions: { id: string; label: string; awarded: number }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [sessionId, setSession] = useState(sessions.find((s) => !s.awarded)?.id ?? sessions[0]!.id);
  const [amount, setAmount] = useState("5");
  const m = useMutation(trpc.coin.awardSession.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
      <span className="font-medium">Thưởng chuyên cần cả buổi:</span>
      <select className="input !py-1" value={sessionId} onChange={(e) => setSession(e.target.value)}>{sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.awarded ? ` (đã thưởng ${s.awarded})` : ""}</option>)}</select>
      <input type="number" min={1} className="input w-20 !py-1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Xu mỗi học viên" />
      <button type="button" className="btn-primary !py-1" disabled={m.isPending} onClick={() => m.mutate({ sessionId, amount: Number(amount) })}>Thưởng HV có mặt</button>
      {m.error && <span className="text-red-700">{m.error.message}</span>}
      {m.data && <span className="text-green-700">Đã thưởng {m.data.awarded} HV.</span>}
    </div>
  );
}

type Panel = {
  student: { id: string; code: string | null; fullName: string };
  balance: number; earned: number; held: number; available: number;
  tier: { label: string; next: { label: string; need: number } | null };
  canAdjust: boolean; canRedeem: boolean;
  history: { id: string; createdAt: string; amount: number; balanceAfter: number; reasonLabel: string; note: string | null; byName: string | null; classCode: string | null; revoked: boolean; revokeBlock: string | null }[];
  redemptions: { id: string; code: string; rewardName: string; cost: number; statusLabel: string; createdAt: string }[];
};

export function StudentPanel({ data, rewards, closeHref, tierClass }: { data: Panel; rewards: { id: string; name: string; cost: number; stock: number | null }[]; closeHref: string; tierClass: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [adj, setAdj] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [rewardId, setReward] = useState(rewards[0]?.id ?? "");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revNote, setRevNote] = useState("");
  const adjust = useMutation(trpc.coin.adjust.mutationOptions({ onSuccess: () => { setAdj(""); setAdjNote(""); router.refresh(); } }));
  const redeem = useMutation(trpc.coin.redeem.mutationOptions({ onSuccess: () => router.refresh() }));
  const revoke = useMutation(trpc.coin.revoke.mutationOptions({ onSuccess: () => { setRevoking(null); setRevNote(""); router.refresh(); } }));
  const fmt = (d: string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <section className="card space-y-3 border-amber-300 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{data.student.fullName} <span className="font-mono text-xs text-ink-400">{data.student.code}</span></h2>
          <p className="text-sm">
            <span className="text-2xl font-bold text-amber-600">{data.balance}</span> xu · khả dụng {data.available}{data.held ? ` (giữ ${data.held})` : ""} · tích luỹ {data.earned}{" "}
            <span className={`chip ${tierClass}`}>{data.tier.label}</span>{data.tier.next && <span className="text-xs text-ink-400"> — còn {data.tier.next.need} xu lên {data.tier.next.label}</span>}
          </p>
        </div>
        <div className="flex gap-2"><Link href={`/students/${data.student.id}`} className="btn-ghost">Hồ sơ</Link><Link href={closeHref} className="btn-ghost">Đóng</Link></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.canRedeem && rewards.length > 0 && (
          <form className="space-y-1 rounded-lg bg-black/5 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); redeem.mutate({ studentId: data.student.id, rewardId }); }}>
            <div className="font-medium">Đổi quà</div>
            <div className="flex gap-2">
              <select className="input flex-1 !py-1" value={rewardId} onChange={(e) => setReward(e.target.value)}>{rewards.map((r) => <option key={r.id} value={r.id} disabled={r.stock === 0}>{r.name} — {r.cost} xu{r.stock === 0 ? " (hết)" : ""}</option>)}</select>
              <button className="btn-primary !py-1" disabled={redeem.isPending}>Gửi yêu cầu</button>
            </div>
            {redeem.error && <p className="text-red-700">{redeem.error.message}</p>}
            {redeem.data && <p className="text-green-700">Đã tạo {redeem.data.code} — chờ quản lý duyệt.</p>}
          </form>
        )}
        {data.canAdjust && (
          <form className="space-y-1 rounded-lg bg-black/5 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); adjust.mutate({ studentId: data.student.id, amount: Number(adj), note: adjNote }); }}>
            <div className="font-medium">Điều chỉnh (+/−)</div>
            <div className="flex gap-2">
              <input type="number" className="input w-24 !py-1" placeholder="±xu" value={adj} onChange={(e) => setAdj(e.target.value)} required />
              <input className="input flex-1 !py-1" placeholder="Lý do (≥ 10 ký tự)" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} maxLength={300} required />
              <button className="btn-ghost !py-1" disabled={adjust.isPending}>Lưu</button>
            </div>
            {adjust.error && <p className="text-red-700">{adjust.error.message}</p>}
          </form>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Thời gian</th><th className="p-2">Lý do</th><th className="p-2 text-right">Xu</th><th className="p-2 text-right">Số dư</th><th className="p-2">Bởi</th><th /></tr></thead>
          <tbody className="divide-y divide-black/5">
            {data.history.map((h) => (
              <tr key={h.id} className={h.revoked ? "text-ink-400 line-through" : ""}>
                <td className="p-2 text-xs">{fmt(h.createdAt)}</td>
                <td className="p-2 text-xs">{h.reasonLabel}{h.classCode && ` · ${h.classCode}`}{h.note && <div className="text-ink-400">{h.note}</div>}</td>
                <td className={`p-2 text-right font-semibold tabular-nums ${h.amount < 0 ? "text-red-700" : "text-green-700"}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</td>
                <td className="p-2 text-right tabular-nums">{h.balanceAfter}</td>
                <td className="p-2 text-xs">{h.byName ?? "—"}</td>
                <td className="p-2 text-right text-xs">
                  {data.canAdjust && !h.revokeBlock && (revoking === h.id ? (
                    <span className="inline-flex gap-1">
                      <input className="input !py-0.5 text-xs" placeholder="Lý do thu hồi" value={revNote} onChange={(e) => setRevNote(e.target.value)} />
                      <button type="button" className="text-red-700" disabled={revoke.isPending} onClick={() => revoke.mutate({ txId: h.id, note: revNote })}>OK</button>
                      <button type="button" onClick={() => setRevoking(null)}>✕</button>
                    </span>
                  ) : <button type="button" className="text-red-700" onClick={() => setRevoking(h.id)}>Thu hồi</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {revoke.error && <p className="text-sm text-red-700">{revoke.error.message}</p>}
      </div>
      {data.redemptions.length > 0 && (
        <p className="text-xs text-ink-600">Đổi quà: {data.redemptions.map((r) => `${r.code} ${r.rewardName} (${r.cost} xu) — ${r.statusLabel}`).join(" · ")}</p>
      )}
    </section>
  );
}

export function RedemptionActions({ id, canDecide, canDeliver, canCancel }: { id: string; canDecide: boolean; canDeliver: boolean; canCancel: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const m = useMutation(trpc.coin.decideRedemption.mutationOptions({ onSuccess: () => router.refresh() }));
  if (!canDecide && !canDeliver && !canCancel) return <span className="text-xs text-ink-400">—</span>;
  const go = (action: "approve" | "reject" | "deliver" | "cancel") => m.mutate({ id, action, note: note || null });
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap gap-1">
        {canDecide && <button type="button" className="btn-primary !py-1 text-xs" disabled={m.isPending} onClick={() => go("approve")}>Duyệt (trừ xu)</button>}
        {canDeliver && <button type="button" className="btn-primary !py-1 text-xs" disabled={m.isPending} onClick={() => go("deliver")}>Đã trao quà</button>}
        {canDecide && <button type="button" className="btn-ghost !py-1 text-xs" disabled={m.isPending} onClick={() => go("reject")}>Từ chối</button>}
        {canCancel && <button type="button" className="btn-ghost !py-1 text-xs text-red-700" disabled={m.isPending} onClick={() => go("cancel")}>Huỷ</button>}
      </div>
      {(canDecide || canCancel) && <input className="input w-full !py-0.5 text-xs" placeholder="Lý do (bắt buộc khi từ chối / huỷ)" value={note} onChange={(e) => setNote(e.target.value)} />}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function RewardForm({ reward, inventoryOptions }: { reward?: { id: string; name: string; description: string | null; cost: number; inventoryItemId: string | null; isActive: boolean; sortOrder: number }; inventoryOptions: { id: string; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(reward?.name ?? "");
  const [description, setDesc] = useState(reward?.description ?? "");
  const [cost, setCost] = useState(String(reward?.cost ?? 50));
  const [inv, setInv] = useState(reward?.inventoryItemId ?? "");
  const [isActive, setActive] = useState(reward?.isActive ?? true);
  const m = useMutation(trpc.coin.upsertReward.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className={reward ? "mt-2 text-xs text-brand-600" : "btn-primary"} onClick={() => setOpen(true)}>{reward ? "Sửa" : "+ Thêm quà"}</button>;
  return (
    <form className="mt-2 space-y-2 rounded-lg border border-black/10 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: reward?.id, name, description: description || null, cost: Number(cost), inventoryItemId: inv || null, isActive, sortOrder: reward?.sortOrder }); }}>
      <input className="input w-full" placeholder="Tên quà" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      <input className="input w-full" placeholder="Mô tả" value={description} onChange={(e) => setDesc(e.target.value)} maxLength={300} />
      <div className="flex gap-2">
        <input type="number" min={1} className="input w-24" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Giá xu" />
        <select className="input flex-1" value={inv} onChange={(e) => setInv(e.target.value)}><option value="">Không trừ kho</option>{inventoryOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      </div>
      {reward && <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} /> Đang áp dụng</label>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
      <div className="flex gap-2"><button className="btn-primary !py-1" disabled={m.isPending}>Lưu</button><button type="button" className="btn-ghost !py-1" onClick={() => setOpen(false)}>Huỷ</button></div>
    </form>
  );
}

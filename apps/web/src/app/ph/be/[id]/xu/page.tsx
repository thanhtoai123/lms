import { notFound } from "next/navigation";
import { Award, Coins } from "lucide-react";
import { getDb } from "@satarobo/db";
import { hubCoins } from "@satarobo/api";
import { childShortName } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhPageHead, PhSection, dtPh } from "@/components/ph-ui";
import { Progress } from "@/components/ph/bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "SataCoin của con — Sata Robo", robots: { index: false } };

/**
 * SATACOIN CỦA CON (chỉ đọc): số xu, hạng, lịch sử, quà đổi được, yêu cầu đổi quà.
 * Đổi quà do thầy cô / trung tâm làm tại lớp — phụ huynh xem để động viên con.
 */
export default async function CoinsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireParent();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await hubCoins(getDb(), p.id, id);
  if (!c) notFound();
  const name = childShortName(c.child);
  const nextNeed = c.tier.next?.need ?? 0;
  const pct = c.tier.next ? Math.round((c.earned / (c.earned + nextNeed)) * 100) : 100;

  return (
    <>
      <PhMain className="space-y-5">
        <PhPageHead title={`SataCoin của ${name}`} back={{ href: `/ph/be/${c.child.id}`, label: name }} />
        <section aria-label="Số xu" className="rounded-3xl bg-gradient-to-br from-accent-500 to-accent-600 p-5 text-accent-foreground shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold">Xu của {name}</div>
              <div className="flex items-baseline gap-2"><span className="text-[40px] font-extrabold leading-none">{c.balance}</span><span className="text-[16px] font-bold">xu</span></div>
              {c.held > 0 && <div className="text-[13px]">{c.held} xu đang giữ cho quà chờ duyệt · còn dùng được {c.available}</div>}
            </div>
            <Coins className="h-14 w-14 opacity-80" aria-hidden />
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-[14px] font-semibold"><span>Hạng {c.tier.label}</span><span>{c.tier.next ? `Còn ${nextNeed} xu lên ${c.tier.next.label}` : "Hạng cao nhất"}</span></div>
            <div className="rounded-full bg-white/40"><Progress percent={pct} label={`Tiến độ lên hạng: ${pct}%`} tone="primary" /></div>
          </div>
        </section>

        <PhSection title="Quà đổi được">
          {c.rewards.length === 0 ? <div className="card p-4 text-ink-600">Trung tâm chưa mở quà đổi xu.</div> : (
            <ul className="grid grid-cols-2 gap-3">
              {c.rewards.map((r) => (
                <li key={r.id} className={`card flex flex-col gap-1 p-4 ${r.affordable ? "border-primary/40" : ""}`}>
                  <Award className={`h-6 w-6 ${r.affordable ? "text-primary" : "text-ink-600"}`} aria-hidden />
                  <div className="font-bold leading-snug">{r.name}</div>
                  <div className="text-[14px] font-semibold text-accent-700">{r.cost} xu</div>
                  <div className={`text-[13px] ${r.affordable ? "font-semibold text-green-700" : "text-ink-600"}`}>{r.affordable ? "Đủ xu để đổi" : `Còn thiếu ${r.need} xu`}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="px-1 text-[13px] text-ink-600">Con nhờ thầy cô đổi quà tại lớp; quà được trao sau khi trung tâm duyệt.</p>
        </PhSection>

        {c.redemptions.length > 0 && (
          <PhSection title="Quà đã đổi">
            <ul className="card divide-y divide-black/5">
              {c.redemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0"><span className="block font-semibold">{r.rewardName}</span><span className="block text-[13px] text-ink-600">{r.cost} xu · {dtPh(r.createdAt)}</span></span>
                  <span className="shrink-0 rounded-full bg-black/5 px-2.5 py-0.5 text-[13px] font-semibold">{r.statusLabel}</span>
                </li>
              ))}
            </ul>
          </PhSection>
        )}

        <PhSection title="Lịch sử xu">
          {c.history.length === 0 ? <div className="card p-4 text-ink-600">Chưa có giao dịch xu.</div> : (
            <ul className="card divide-y divide-black/5">
              {c.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{h.reasonLabel}{h.classCode ? <span className="font-normal text-ink-600"> · {h.classCode}</span> : null}</span>
                    {h.note && <span className="block text-[13px] text-ink-600">{h.note}</span>}
                    <span className="block text-[12px] text-ink-600">{dtPh(h.createdAt)}</span>
                  </span>
                  <span className={`shrink-0 text-[17px] font-extrabold ${h.amount >= 0 ? "text-green-700" : "text-red-700"}`}>{h.amount >= 0 ? `+${h.amount}` : h.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </PhSection>
      </PhMain>
    </>
  );
}

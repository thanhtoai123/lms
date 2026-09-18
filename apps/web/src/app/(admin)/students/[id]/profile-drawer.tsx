"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Drawer } from "@/components/drawer";

export interface ProfileExtras {
  health: { label: string; value: string }[];
  pauses: { id: string; line: string; sub: string; meta: string; open: boolean }[];
  coin: { balance: number; tierLabel: string; note: string; href: string } | null;
  homework: { summary: string; items: { id: string; title: string; right: string; href: string }[] } | null;
  kits: { overdue: boolean; text: string }[] | null;
  care: { id: string; title: string; status: string }[];
  events: { id: string; when: string; title: string; reason: string | null }[];
}

/**
 * Hồ sơ đầy đủ của học viên nằm trong panel trượt phải.
 *
 * Trước đây trang hồ sơ có 11 khối cùng lúc (sức khoẻ, bảo lưu, xu, bài tập,
 * học cụ, chăm sóc, lịch sử…) nên phải cuộn rất lâu mới thấy việc chính.
 * Nay màn hình chính giữ 3 khối việc (vòng đời · đăng ký học · điểm danh) và
 * một khối liên hệ phụ huynh; phần tra cứu mở khi cần.
 */
export function ProfileDrawer({ name, extras }: { name: string; extras: ProfileExtras }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost min-h-10 !py-1.5 text-xs" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" aria-hidden />
        Hồ sơ đầy đủ
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Hồ sơ đầy đủ · ${name}`} desc="Sức khoẻ, bảo lưu, xu thưởng, bài tập, học cụ, chăm sóc và lịch sử ghi danh" width="md">
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="mb-2 font-bold text-foreground">Sức khoẻ &amp; ghi chú</h3>
            <dl className="space-y-2">
              {extras.health.map((h) => (
                <div key={h.label}>
                  <dt className="label">{h.label}</dt>
                  <dd className="whitespace-pre-line">{h.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 font-bold text-foreground">Lịch sử bảo lưu</h3>
            {extras.pauses.length === 0 ? <p className="text-muted-foreground">Chưa có lần bảo lưu nào.</p> : (
              <ol className="space-y-2">
                {extras.pauses.map((p) => (
                  <li key={p.id} className={`border-l-2 pl-3 ${p.open ? "border-amber-400" : "border-border"}`}>
                    <div>{p.line}{p.open && <span className="chip ml-1 bg-amber-100 text-amber-800">đang bảo lưu</span>}</div>
                    <div className="text-xs text-muted-foreground">{p.sub}</div>
                    <div className="text-[11px] text-muted-foreground">{p.meta}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {extras.coin && (
            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-bold text-foreground">SataCoin</h3>
                <Link href={extras.coin.href} className="text-xs font-semibold text-primary">Chi tiết →</Link>
              </div>
              <p><span className="text-2xl font-bold text-accent-ink">{extras.coin.balance}</span> xu · hạng {extras.coin.tierLabel}</p>
              <p className="text-xs text-muted-foreground">{extras.coin.note}</p>
            </section>
          )}

          {extras.homework && (
            <section>
              <h3 className="mb-1 font-bold text-foreground">Bài tập về nhà</h3>
              <p className="mb-1 text-xs text-muted-foreground">{extras.homework.summary}</p>
              {extras.homework.items.map((h) => (
                <div key={h.id} className="flex justify-between gap-2">
                  <Link href={h.href} className="truncate hover:underline">{h.title}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{h.right}</span>
                </div>
              ))}
            </section>
          )}

          {extras.kits && extras.kits.length > 0 && (
            <section>
              <h3 className="mb-1 font-bold text-foreground">Học cụ &amp; đồ thuê</h3>
              {extras.kits.map((k, i) => <div key={i} className={k.overdue ? "text-red-700" : ""}>{k.text}</div>)}
            </section>
          )}

          {extras.care.length > 0 && (
            <section>
              <h3 className="mb-1 font-bold text-foreground">Chăm sóc</h3>
              {extras.care.map((c) => (
                <div key={c.id} className="flex justify-between gap-2"><span>{c.title}</span><span className="text-xs text-muted-foreground">{c.status}</span></div>
              ))}
            </section>
          )}

          <section>
            <h3 className="mb-2 font-bold text-foreground">Lịch sử ghi danh</h3>
            <ol className="space-y-2">
              {extras.events.map((ev) => (
                <li key={ev.id} className="border-l-2 border-border pl-3">
                  <div className="text-[11px] text-muted-foreground">{ev.when}</div>
                  <div><span className="font-medium">{ev.title}</span>{ev.reason ? <span className="text-muted-foreground"> — {ev.reason}</span> : null}</div>
                </li>
              ))}
              {extras.events.length === 0 && <li className="text-muted-foreground">—</li>}
            </ol>
          </section>
        </div>
      </Drawer>
    </>
  );
}

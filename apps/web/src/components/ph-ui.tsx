import Link from "next/link";

export function PhNav({ unread = 0 }: { unread?: number }) {
  const items = [["/ph", "Trang chủ"], ["/ph/hoc-phi", "Học phí"], ["/ph/tin-nhan", "Tin nhắn"], ["/ph/thong-bao", `Thông báo${unread ? ` (${unread})` : ""}`], ["/ph/tai-khoan", "Tài khoản"]] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-black/5 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid max-w-md grid-cols-5 text-center text-[11px] font-medium">{items.map(([h, l]) => <Link key={h} href={h} className="py-3 hover:text-brand-600">{l}</Link>)}</div>
    </nav>
  );
}

export function PhHeader({ title, name }: { title: string; name?: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur">
      <Link href="/ph" className="font-bold text-brand-600">Sata Robo</Link>
      <div className="truncate text-sm font-semibold">{title}</div>
      <div className="max-w-[110px] truncate text-xs text-ink-600">{name ?? ""}</div>
    </header>
  );
}

export const vndPh = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
export const datePh = (d: string | Date | null | undefined) => (d ? new Date(typeof d === "string" && d.length === 10 ? `${d}T00:00:00+07:00` : d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit" }) : "—");
export const dtPh = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

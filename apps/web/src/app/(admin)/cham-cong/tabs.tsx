import Link from "next/link";

/**
 * Điều hướng chung của module Chấm công.
 *
 * Trước đây là 7 chip ngang hàng — nhìn vào không biết đâu là việc hằng ngày,
 * đâu là thiết lập. Nay tách làm hai: 3 việc hằng ngày đứng trước (bảng công,
 * phân ca, kỳ công) rồi tới "Của tôi"; ba mục thiết lập ít dùng gom sau vạch
 * ngăn, chữ nhạt hơn để không tranh chỗ với việc chính.
 */
const MAIN = [
  { key: "bang-cong", label: "Bảng công ngày", href: "/cham-cong" },
  { key: "phan-ca", label: "Lưới phân ca", href: "/cham-cong/phan-ca" },
  { key: "ky-cong", label: "Kỳ công & chốt", href: "/cham-cong/ky-cong" },
] as const;

const SETUP = [
  { key: "danh-muc-ca", label: "Mã ca", href: "/cham-cong/danh-muc-ca" },
  { key: "diem-cham", label: "Điểm chấm công", href: "/cham-cong/diem-cham" },
  { key: "man-hinh", label: "Màn hình QR", href: "/cham-cong/man-hinh" },
] as const;

export function TimesheetTabs({ centerId, period, active }: { centerId?: string; period?: string; active: string }) {
  const qs = (href: string) => {
    if (href === "/cham-cong/lich-ca" || href === "/cham-cong/man-hinh") return href;
    const p = new URLSearchParams();
    if (centerId) p.set("center", centerId);
    if (period && href !== "/don-tu") p.set("period", period);
    const s = p.toString();
    return s ? `${href}?${s}` : href;
  };
  const cls = (on: boolean, quiet = false) =>
    `chip min-h-10 px-3 ${on ? "bg-primary-soft text-primary" : quiet ? "bg-transparent text-muted-foreground hover:bg-muted" : "bg-muted text-muted-foreground hover:text-foreground"}`;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Điều hướng chấm công">
      {MAIN.map((t) => <Link key={t.key} href={qs(t.href)} className={cls(active === t.key)}>{t.label}</Link>)}
      <Link href="/don-tu" className={cls(active === "don-tu")}>Đơn từ</Link>
      <Link href="/cham-cong/lich-ca" className={cls(active === "cua-toi")}>Của tôi</Link>
      <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
      <span className="hidden text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">Thiết lập</span>
      {SETUP.map((t) => <Link key={t.key} href={qs(t.href)} className={cls(active === t.key, true)}>{t.label}</Link>)}
    </nav>
  );
}

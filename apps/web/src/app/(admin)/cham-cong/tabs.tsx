import Link from "next/link";

const TABS = [
  { key: "bang-cong", label: "Bảng công ngày", href: "/cham-cong" },
  { key: "phan-ca", label: "Lưới phân ca", href: "/cham-cong/phan-ca" },
  { key: "ky-cong", label: "Kỳ công & chốt", href: "/cham-cong/ky-cong" },
  { key: "don-tu", label: "Đơn từ", href: "/don-tu" },
  { key: "danh-muc-ca", label: "Mã ca", href: "/cham-cong/danh-muc-ca" },
  { key: "diem-cham", label: "Điểm chấm công", href: "/cham-cong/diem-cham" },
  { key: "cua-toi", label: "Của tôi", href: "/cham-cong/lich-ca" },
] as const;

/** Điều hướng chung của module Chấm công (giữ cơ sở + kỳ công đang xem) */
export function TimesheetTabs({ centerId, period, active }: { centerId?: string; period?: string; active: string }) {
  const qs = (href: string) => {
    if (href === "/cham-cong/lich-ca") return href;
    const p = new URLSearchParams();
    if (centerId) p.set("center", centerId);
    if (period && href !== "/don-tu") p.set("period", period);
    const s = p.toString();
    return s ? `${href}?${s}` : href;
  };
  return (
    <nav className="flex flex-wrap gap-1 text-xs">
      {TABS.map((t) => (
        <Link key={t.key} href={qs(t.href)} className={`chip ${active === t.key ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{t.label}</Link>
      ))}
    </nav>
  );
}

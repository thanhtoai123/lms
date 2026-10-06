import Link from "next/link";

const TABS = [
  { key: "lop", label: "Lớp của tôi", href: "/teacher/classes" },
  { key: "hoc-vien", label: "Học viên", href: "/teacher/hoc-vien" },
  { key: "giao-an", label: "Giáo án của tôi", href: "/teacher/giao-an" },
] as const;

/** Chip đầu trang của mục "Lớp của tôi": Lớp · Học viên · Giáo án (cùng kiểu dải chip của khu quản trị) */
export function ClassTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Lớp của tôi" className="flex gap-1.5 overflow-x-auto pb-1">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
            className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-[14px] transition-colors ${on ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

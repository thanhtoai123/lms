import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { childShortName } from "@satarobo/core";

/**
 * Mảnh dùng chung của cổng phụ huynh. Khung (thanh bên, thanh trên, ngăn kéo) nằm ở
 * `app/ph/layout.tsx` + `components/ph/nav.tsx`; ở đây chỉ còn phần bên trong trang.
 */

/** Tiêu đề phụ trong trang: dùng khi trang cần nút quay lại hoặc một câu dẫn */
export function PhPageHead({ title, desc, back, action }: {
  title: string;
  desc?: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {back && (
        <Link href={back.href} aria-label={`Quay lại: ${back.label}`} className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 hover:bg-muted">
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-[20px] font-extrabold leading-tight md:text-[24px]">{title}</h2>
        {desc && <p className="mt-0.5 text-[14px] text-ink-600">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/** Tiêu đề khối kiểu hệ cũ: chữ hoa nhỏ, giãn chữ, liên kết "Xem tất cả" bên phải */
export function PhBlock({ title, action, children, id, className = "" }: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 space-y-2 ${className}`} aria-label={title}>
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-600">{title}</h2>
        {action && <Link href={action.href} className="inline-flex min-h-9 items-center text-[13px] font-bold text-primary">{action.label} →</Link>}
      </div>
      {children}
    </section>
  );
}

/** Vùng nội dung của một trang cổng phụ huynh (lề chung cho cả ba khổ màn hình) */
export function PhMain({ children, className = "", label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <main aria-label={label} className={`flex-1 px-4 pb-12 pt-4 md:px-6 md:pt-6 ${className}`}>
      {children}
    </main>
  );
}

/**
 * Bố cục hai cột từ 1024px: cột chính (buổi học, nhận xét…) và cột phụ dính mép trên
 * (học phí, thông báo, lối tắt). Dưới 1024px thì xếp chồng đúng thứ tự đọc của điện thoại.
 */
export function PhTwoCol({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 space-y-5">{main}</div>
      <div className="min-w-0 space-y-5 lg:sticky lg:top-24">{side}</div>
    </div>
  );
}

/** Chip chuyển nhanh giữa các con (ẩn khi chỉ có một con) */
export function ChildChips({ kids, activeId, hrefFor }: { kids: { id: string; fullName: string; nickname?: string | null }[]; activeId: string | null; hrefFor: (id: string) => string }) {
  if (kids.length < 2) return null;
  return (
    // Điện thoại: cuộn ngang. Máy tính: xuống dòng, không cần cuộn (thanh cuộn ngang trên máy tính khó thấy)
    <nav aria-label="Chọn con" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
        {kids.map((k) => {
          const on = k.id === activeId;
          return (
            <li key={k.id}>
              <Link
                href={hrefFor(k.id)}
                aria-current={on ? "true" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold transition ${on ? "border-primary bg-primary text-white shadow-md" : "border-border bg-white text-foreground hover:border-primary/40"}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${on ? "bg-white/20" : "bg-primary-soft text-primary"}`} aria-hidden>
                  {childShortName(k).slice(0, 1).toUpperCase()}
                </span>
                {childShortName(k)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Khối có tiêu đề + liên kết "Xem tất cả" tuỳ chọn */
export function PhSection({ title, action, children, id, className = "" }: { title: string; action?: { href: string; label: string }; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 space-y-2 ${className}`} aria-label={title}>
      <div className="flex items-end justify-between gap-2 px-1">
        <h2 className="text-[16px] font-bold">{title}</h2>
        {action && <Link href={action.href} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-primary">{action.label}</Link>}
      </div>
      {children}
    </section>
  );
}

export const vndPh = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
export const datePh = (d: string | Date | null | undefined) => (d ? new Date(typeof d === "string" && d.length === 10 ? `${d}T00:00:00+07:00` : d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit" }) : "—");
export const dtPh = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

const WD = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
/** "Hôm nay" / "Ngày mai" / "Thứ Bảy 26/09" cho ngày ISO */
export function dayPh(date: string, today: string): string {
  if (date === today) return "Hôm nay";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (date === t.toISOString().slice(0, 10)) return "Ngày mai";
  const js = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${WD[js === 0 ? 7 : js]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
export const todayPh = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

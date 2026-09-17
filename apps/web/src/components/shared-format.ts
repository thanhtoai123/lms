/** Hằng số / hàm định dạng dùng được ở cả server và client (không đặt trong file "use client") */
export const TONE_CHIP: Record<string, string> = { out: "bg-red-100 text-red-700", low: "bg-amber-100 text-amber-800", ok: "bg-green-100 text-green-800" };
export const TONE_VI: Record<string, string> = { out: "Hết hàng", low: "Sắp hết", ok: "Đủ" };
export const DOC_STATUS_CHIP: Record<string, string> = { draft: "bg-slate-100 text-slate-600", published: "bg-green-100 text-green-800", archived: "bg-amber-100 text-amber-800" };
export const fmtSize = (n: number | null | undefined) => (n == null ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

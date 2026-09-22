"use client";

import { Printer } from "lucide-react";

/** "In / Lưu PDF" — mở hộp thoại in của trình duyệt (chọn máy in "Lưu dưới dạng PDF") */
export function PrintButton({ label = "In / Lưu PDF", className = "btn-primary min-h-10" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}

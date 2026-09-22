"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" className="btn-primary min-h-10" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden /> In / Lưu PDF
    </button>
  );
}

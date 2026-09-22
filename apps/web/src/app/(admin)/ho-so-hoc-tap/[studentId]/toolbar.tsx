"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { PrintButton } from "@/components/portfolio/print-button";
import { ShareDrawer } from "@/components/portfolio/portfolio-block";

/** Thanh công cụ trang hồ sơ: In / Lưu PDF, Chia sẻ (drawer). `autoPrint` mở hộp thoại in ngay khi trang tải xong */
export function PortfolioToolbar({
  studentId, studentName, enrollments, canShare, canExport, autoPrint,
}: {
  studentId: string;
  studentName: string;
  enrollments: { id: string; label: string }[];
  canShare: boolean;
  canExport: boolean;
  autoPrint: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoPrint) return;
    // Chờ ảnh và phông tải xong rồi mới in
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, [autoPrint]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrintButton />
      {canShare && (
        <button type="button" className="btn-ghost min-h-10" onClick={() => setOpen(true)}><Share2 className="h-4 w-4" aria-hidden /> Chia sẻ</button>
      )}
      {canShare && <ShareDrawer open={open} onClose={() => setOpen(false)} studentId={studentId} studentName={studentName} enrollments={enrollments} canExport={canExport} />}
    </div>
  );
}

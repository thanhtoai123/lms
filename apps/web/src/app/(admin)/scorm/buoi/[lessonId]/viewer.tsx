"use client";

/**
 * Khung xem giáo án — DÙNG CHUNG cho slide PDF và gói SCORM, để người dạy chỉ phải quen một màn hình.
 *
 * Lớp chữ mờ (tên người xem + giờ) nằm đè lên khung: giáo án là tài sản của trung tâm, ảnh chụp màn
 * hình lọt ra ngoài vẫn truy được ai chụp. Lớp này không nhận chuột nên không cản thao tác.
 */
import { useEffect, useRef, useState } from "react";
import { ScormPlayer } from "../../[id]/player";

export function PlanViewer({ kind, documentId, fileUrl, watermark }: {
  kind: "pdf" | "scorm";
  documentId: string;
  fileUrl: string | null;
  watermark: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("vi-VN"));

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("vi-VN")), 30_000);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { clearInterval(t); document.removeEventListener("fullscreenchange", onFs); };
  }, []);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await box.current?.requestFullscreen();
    } catch { /* trình duyệt từ chối — vẫn xem được ở khung thường */ }
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost !py-1" onClick={toggle}>{full ? "Thoát toàn màn hình" : "Toàn màn hình"}</button>
      <div ref={box} className="relative overflow-hidden rounded-lg border border-black/10 bg-black/5">
        {kind === "scorm" ? (
          <ScormPlayer id={documentId} />
        ) : (
          <iframe
            src={fileUrl ?? ""}
            title="Giáo án slide"
            className="h-[70vh] w-full bg-white"
            // PDF là tệp của chính hệ thống, phát qua URL có chữ ký hết hạn
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-wrap content-center justify-center gap-16 opacity-[0.10]">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="-rotate-12 select-none whitespace-nowrap text-lg font-bold tracking-wide">{watermark} · {clock}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

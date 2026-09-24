"use client";

/**
 * KHUNG CHIẾU GIÁO ÁN — dùng chung cho slide PDF và gói SCORM.
 *
 * NGUYÊN TẮC SỐ MỘT: DẠY ĐƯỢC ĐÃ. Màn hình phải luôn rõ và không có gì che chắn khi giáo viên
 * đang chiếu bài: không thanh công cụ, không dòng cảnh báo, không lớp mờ thường trực.
 * Nút trình chiếu nổi trong góc và chỉ hiện khi rê chuột.
 *
 * Slide PDF vẽ ra <canvas> (xem pdf-canvas.tsx) chứ KHÔNG dùng trình xem PDF của trình duyệt:
 * bỏ được thanh công cụ đen kèm nút tải/in, và chữ mờ được vẽ THẲNG VÀO ảnh trang nên không
 * bóc ra được bằng cách xoá phần tử.
 *
 * Chỉ CHE TRONG KHOẢNH KHẮC có dấu hiệu chụp (PrintScreen, Win+Shift+S, Ctrl+P/S, DevTools,
 * hoặc trang bị đẩy xuống nền ngay sau một phím chụp) rồi trả lại màn hình ngay.
 *
 * NÓI THẲNG GIỚI HẠN: trình duyệt KHÔNG chặn được phần mềm quay màn hình. Lớp chặn thật là
 * ứng dụng máy tính ở tools/trinh-chieu (Windows: WDA_EXCLUDEFROMCAPTURE) — xem
 * docs/CHONG-CHUP-MAN-HINH.md. Chấm tròn nhỏ góc dưới phải cho biết đang ở chế độ nào.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { type CaptureKind } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ScormPlayer } from "../../[id]/player";
import { PdfCanvas } from "./pdf-canvas";

/**
 * Chữ mờ: chỉ BA dòng (trên – giữa – dưới), đủ để một ảnh chụp bất kỳ dính ít nhất một dòng
 * mà không làm rối slide đang chiếu. Trước đây rải 8 dòng, nhìn rất nhiễu khi dạy.
 */
const MARKS = [
  { top: "8%", left: "6%" },
  { top: "48%", left: "52%" },
  { top: "88%", left: "26%" },
];

/** Thời gian che màn khi phát hiện thao tác chụp (ms) */
const CHE_MS = 1500;
/** Sau một phím chụp, nếu trang bị ẩn trong khoảng này thì coi là "chụp rồi chuyển cửa sổ" */
const SAU_PHIM_CHUP_MS = 4000;

export function PlanViewer({ kind, documentId, lessonId, streamPath, watermark, canReport }: {
  kind: "pdf" | "scorm";
  documentId: string;
  lessonId: string;
  streamPath: string | null;
  watermark: string;
  /** Có ghi nhật ký thao tác nghi vấn không */
  canReport: boolean;
}) {
  const trpc = useTRPC();
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [clock, setClock] = useState("");
  /** Đang chạy trong "Ứng dụng trình chiếu an toàn" (Electron) hay trình duyệt thường */
  const [trongUngDung, setTrongUngDung] = useState(false);
  /** pdf.js không mở được (máy cũ, tệp lạ) → quay về trình xem PDF của trình duyệt */
  const [duPhongPdf, setDuPhongPdf] = useState(false);
  /** Lớp che tạm thời khi có dấu hiệu chụp — KHÔNG phải trạng thái "mất tiêu điểm" */
  const [shield, setShield] = useState<string | null>(null);
  const report = useMutation(trpc.content.planCaptureAttempt.mutationOptions({}));
  const sent = useRef<Record<string, number>>({});
  const lastKeyAt = useRef(0);
  const hideTimer = useRef<number | null>(null);

  /** Che màn 1,5 giây + ghi nhật ký (mỗi loại tối đa 1 lần / 20 giây để không dội nhật ký) */
  const flag = useCallback((k: CaptureKind, message: string) => {
    setShield(message);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShield(null), CHE_MS);
    if (!canReport) return;
    const now = Date.now();
    if (now - (sent.current[k] ?? 0) < 20_000) return;
    sent.current[k] = now;
    report.mutate({ lessonId, kind: k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReport, lessonId]);

  useEffect(() => {
    setTrongUngDung(/SataRoboTrinhChieu|Electron/i.test(navigator.userAgent));
    const tick = () => setClock(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = window.setInterval(tick, 1000);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { window.clearInterval(t); document.removeEventListener("fullscreenchange", onFs); };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onContext = (e: MouseEvent) => { e.preventDefault(); flag("context_menu", "Menu chuột phải đã tắt trên khung học liệu."); };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); flag("copy", "Không chép được nội dung học liệu."); };
    const onDrag = (e: DragEvent) => e.preventDefault();

    const onKey = (e: KeyboardEvent) => {
      const k = (e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (k === "p" || k === "s")) {
        e.preventDefault();
        flag(k === "p" ? "print" : "download",
          k === "p" ? "Không in được học liệu — thao tác đã được ghi lại." : "Không tải được học liệu — thao tác đã được ghi lại.");
        return;
      }
      // PrintScreen / Win+Shift+S (Snipping Tool): không chặn được ở trình duyệt, nhưng che màn ngay,
      // xoá clipboard nếu trình duyệt cho, và ghi nhật ký kèm tên người đang xem.
      if (k === "printscreen" || (e.shiftKey && (mod || e.getModifierState?.("Meta")) && k === "s")) {
        lastKeyAt.current = Date.now();
        flag("screenshot_key", "Ảnh chụp mang chữ mờ tên bạn và thao tác này đã được ghi lại.");
        void navigator.clipboard?.writeText("").catch(() => {});
        return;
      }
      if (k === "f12" || (mod && e.shiftKey && (k === "i" || k === "j" || k === "c"))) {
        flag("devtools", "Thao tác mở công cụ nhà phát triển đã được ghi lại.");
      }
    };
    const onPrint = () => flag("print", "Học liệu không in ra giấy được.");

    // Chỉ che khi trang bị ẩn NGAY SAU một phím chụp (chụp xong chuyển cửa sổ).
    // Bình thường đổi cửa sổ / bật máy chiếu KHÔNG che, để buổi dạy không bị gián đoạn.
    const onVis = () => {
      if (document.visibilityState === "hidden" && Date.now() - lastKeyAt.current < SAU_PHIM_CHUP_MS) {
        flag("screenshot_key", "Thao tác chụp màn hình đã được ghi lại.");
      }
    };

    el.addEventListener("contextmenu", onContext);
    el.addEventListener("copy", onCopy);
    el.addEventListener("dragstart", onDrag);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);
    window.addEventListener("beforeprint", onPrint);
    document.addEventListener("visibilitychange", onVis);
    document.body.classList.add("dang-xem-hoc-lieu");
    return () => {
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("copy", onCopy);
      el.removeEventListener("dragstart", onDrag);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKey);
      window.removeEventListener("beforeprint", onPrint);
      document.removeEventListener("visibilitychange", onVis);
      document.body.classList.remove("dang-xem-hoc-lieu");
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [flag]);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await box.current?.requestFullscreen({ navigationUI: "hide" });
    } catch { /* trình duyệt từ chối — vẫn xem được ở khung lớn */ }
  };

  return (
    <div
      ref={box}
      onKeyDown={(e) => { if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) void toggle(); }}
      tabIndex={-1}
      className={`bao-ve-hoc-lieu group relative select-none overflow-hidden rounded-xl border border-black/10 bg-neutral-100 ${full ? "h-screen w-screen rounded-none" : "h-[calc(100vh-11rem)] min-h-[440px] w-full"}`}
    >
      <div className="h-full w-full">
        {kind === "scorm" ? (
          <ScormPlayer id={documentId} fill />
        ) : duPhongPdf || !streamPath ? (
          <object data={`${streamPath ?? ""}#toolbar=0&navpanes=0&statusbar=0&view=FitH`} type="application/pdf" className="h-full w-full bg-white" aria-label="Slide giáo án">
            <p className="p-4 text-sm text-white">Trình duyệt không mở được slide trong khung. Hãy dùng Chrome / Edge bản mới.</p>
          </object>
        ) : (
          <PdfCanvas src={streamPath} watermark={watermark} onFail={() => setDuPhongPdf(true)} />
        )}
      </div>

      {/* Chữ mờ phủ ngoài — CHỈ cần cho gói SCORM và bản dự phòng (nội dung nằm trong tài liệu con,
          không vẽ chữ vào được). Slide PDF đã có chữ mờ vẽ thẳng vào ảnh trang. */}
      {(kind === "scorm" || duPhongPdf) && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {MARKS.map((m, i) => (
            <span
              key={i}
              className="absolute -rotate-[16deg] whitespace-nowrap text-[13px] font-semibold tracking-wide text-white/25 mix-blend-difference sm:text-sm"
              style={{ top: m.top, left: m.left }}
            >
              {watermark} · {clock}
            </span>
          ))}
        </div>
      )}

      {/* Nút trình chiếu: nổi trong góc, mờ đi khi không rê chuột — không chiếm một thanh ngang */}
      <button
        type="button"
        onClick={toggle}
        className="absolute right-3 top-3 rounded-lg bg-black/55 px-3 py-1.5 text-xs font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100"
        title="Phím tắt: F"
      >
        {full ? "Thoát trình chiếu (Esc)" : "Trình chiếu toàn màn hình (F)"}
      </button>

      {/* Lớp che TẠM THỜI khi có dấu hiệu chụp — tự tắt sau ~1,5 giây */}
      {shield && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/95 p-6 text-center">
          <p className="text-lg font-bold text-white">{shield}</p>
          <p className="text-sm text-white/70">Người xem: {watermark}</p>
        </div>
      )}

      {/* Dấu hiệu nhỏ: đang được ứng dụng bảo vệ hay chỉ là trình duyệt (không chiếm chỗ, không ồn) */}
      <span
        aria-hidden
        title={trongUngDung ? "Ứng dụng trình chiếu an toàn: phần mềm quay/chụp chỉ thu được màn đen" : "Trình duyệt: không chặn được phần mềm quay/chụp màn hình"}
        className={`absolute bottom-2 right-3 h-2 w-2 rounded-full ${trongUngDung ? "bg-green-400" : "bg-amber-400"} opacity-60`}
      />
    </div>
  );
}

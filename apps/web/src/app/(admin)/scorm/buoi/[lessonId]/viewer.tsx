"use client";

/**
 * KHUNG CHIẾU GIÁO ÁN — dùng chung cho slide PDF và gói SCORM.
 *
 * Hai việc trang này phải làm cho ra hồn:
 *  1) CHIẾU HẾT MÀN HÌNH: giáo viên bật máy chiếu là thấy bài, không phải kéo thanh cuộn.
 *     Nút "Trình chiếu" đưa khung vào fullscreen thật (API của trình duyệt); ở chế độ thường
 *     khung vẫn cao gần hết cửa sổ (không phải một ô nhỏ giữa trang như trước).
 *  2) HẠN CHẾ SAO CHÉP — và nói thật về giới hạn: KHÔNG trình duyệt nào chặn được quay màn hình
 *     hay chụp bằng điện thoại. Ở đây chặn các đường dễ (chuột phải, kéo–thả, chép, Ctrl+P/S, in giấy),
 *     dán chữ mờ mang tên người xem lên mọi khung hình, làm mờ nội dung khi cửa sổ mất tiêu điểm,
 *     và GHI NHẬT KÝ mọi thao tác nghi vấn để quản trị nhìn thấy ai đang cố sao chép.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PROTECT_NOTICE, type CaptureKind } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ScormPlayer } from "../../[id]/player";

/** Vị trí các dòng chữ mờ — rải đều, lệch nhau để không bị cắt gọn bằng một lần crop */
const MARKS = [
  { top: "6%", left: "4%" }, { top: "18%", left: "58%" }, { top: "34%", left: "22%" },
  { top: "50%", left: "70%" }, { top: "63%", left: "8%" }, { top: "78%", left: "44%" },
  { top: "90%", left: "66%" }, { top: "26%", left: "86%" },
];

export function PlanViewer({ kind, documentId, lessonId, streamPath, watermark, canReport }: {
  kind: "pdf" | "scorm";
  documentId: string;
  lessonId: string;
  streamPath: string | null;
  watermark: string;
  /** Có ghi nhật ký thao tác nghi vấn không (tắt khi người dùng không có quyền gọi) */
  canReport: boolean;
}) {
  const trpc = useTRPC();
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [clock, setClock] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const report = useMutation(trpc.content.planCaptureAttempt.mutationOptions({}));
  const sent = useRef<Record<string, number>>({});

  /** Ghi nhận thao tác nghi vấn, mỗi loại tối đa 1 lần / 20 giây để không spam nhật ký */
  const flag = useCallback((k: CaptureKind, message: string) => {
    setWarn(message);
    window.setTimeout(() => setWarn(null), 6000);
    if (!canReport) return;
    const now = Date.now();
    if (now - (sent.current[k] ?? 0) < 20_000) return;
    sent.current[k] = now;
    report.mutate({ lessonId, kind: k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReport, lessonId]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = window.setInterval(tick, 1000);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { window.clearInterval(t); document.removeEventListener("fullscreenchange", onFs); };
  }, []);

  // Rào các thao tác sao chép dễ + ghi nhật ký
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onContext = (e: MouseEvent) => { e.preventDefault(); flag("context_menu", "Menu chuột phải đã tắt trên khung học liệu."); };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); flag("copy", "Không chép được nội dung học liệu."); };
    const onDrag = (e: DragEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (k === "p" || k === "s")) {
        e.preventDefault();
        flag(k === "p" ? "print" : "download", k === "p" ? "Không in được học liệu — thao tác đã được ghi lại." : "Không tải được học liệu — thao tác đã được ghi lại.");
      }
      // PrintScreen: không chặn được, nhưng xoá clipboard (nếu trình duyệt cho) và ghi nhật ký
      if (k === "printscreen" || (e.shiftKey && mod && k === "s")) {
        flag("screenshot_key", "Ảnh chụp màn hình mang chữ mờ tên bạn và thao tác này đã được ghi lại.");
        void navigator.clipboard?.writeText("").catch(() => {});
      }
      if (k === "f12" || (mod && e.shiftKey && (k === "i" || k === "j" || k === "c"))) flag("devtools", "Thao tác mở công cụ nhà phát triển đã được ghi lại.");
    };
    const onPrint = () => flag("print", "Học liệu không in ra giấy được.");
    const onBlur = () => setBlurred(true);
    const onFocus = () => setBlurred(false);
    const onVis = () => setBlurred(document.visibilityState === "hidden");

    el.addEventListener("contextmenu", onContext);
    el.addEventListener("copy", onCopy);
    el.addEventListener("dragstart", onDrag);
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeprint", onPrint);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    document.body.classList.add("dang-xem-hoc-lieu");
    return () => {
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("copy", onCopy);
      el.removeEventListener("dragstart", onDrag);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeprint", onPrint);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      document.body.classList.remove("dang-xem-hoc-lieu");
    };
  }, [flag]);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await box.current?.requestFullscreen({ navigationUI: "hide" });
    } catch { /* trình duyệt từ chối — vẫn xem được ở khung lớn */ }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !py-1" onClick={toggle}>{full ? "Thoát trình chiếu" : "Trình chiếu toàn màn hình"}</button>
        <span className="text-xs text-ink-600">Phím tắt: F (trình chiếu) · Esc (thoát)</span>
      </div>

      <div
        ref={box}
        onKeyDown={(e) => { if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) void toggle(); }}
        tabIndex={-1}
        className={`bao-ve-hoc-lieu relative select-none overflow-hidden rounded-xl border border-black/10 bg-black ${full ? "h-screen w-screen rounded-none" : "h-[calc(100vh-13rem)] min-h-[420px] w-full"}`}
      >
        <div className={`h-full w-full transition duration-150 ${blurred ? "blur-lg" : ""}`}>
          {kind === "scorm" ? (
            <ScormPlayer id={documentId} fill />
          ) : (
            <object data={`${streamPath ?? ""}#toolbar=0&navpanes=0&statusbar=0&view=FitH`} type="application/pdf" className="h-full w-full bg-white" aria-label="Slide giáo án">
              <p className="p-4 text-sm text-white">Trình duyệt không mở được slide trong khung. Hãy dùng Chrome / Edge bản mới.</p>
            </object>
          )}
        </div>

        {/* Chữ mờ: tên người xem + giờ chạy theo giây — ảnh chụp lọt ra ngoài là truy được ngay */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {MARKS.map((m, i) => (
            <span
              key={i}
              className="absolute -rotate-[18deg] whitespace-nowrap text-[13px] font-semibold tracking-wide text-black/20 mix-blend-difference sm:text-sm"
              style={{ top: m.top, left: m.left }}
            >
              {watermark} · {clock}
            </span>
          ))}
        </div>

        {blurred && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 text-center text-sm font-semibold text-white">
            Cửa sổ đang không được chọn — nội dung tạm ẩn.<br />Bấm vào khung để xem tiếp.
          </div>
        )}

        {warn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-red-700/90 px-4 py-2 text-center text-sm font-semibold text-white">{warn}</div>
        )}
      </div>

      <p className="text-xs text-ink-600">{PROTECT_NOTICE}</p>
    </div>
  );
}

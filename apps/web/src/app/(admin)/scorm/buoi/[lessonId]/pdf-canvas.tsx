"use client";

/**
 * KHUNG CHIẾU SLIDE PDF — vẽ từng trang ra <canvas> bằng pdf.js, KHÔNG dùng trình xem PDF của trình duyệt.
 *
 * Vì sao không dùng <object>/<iframe>:
 *  1. Trình xem PDF của Chrome tự đắp một THANH CÔNG CỤ ĐEN ở trên (có nút tải về, in, mở tab mới)
 *     mà trang không tắt được — vừa xấu khi trình chiếu, vừa mở sẵn đường tải tệp gốc.
 *  2. Nội dung nằm trong một tài liệu con: chữ mờ của ta chỉ có thể phủ BÊN NGOÀI, nên ai mở
 *     "Công cụ nhà phát triển" là xoá được lớp phủ đó.
 *
 * Vẽ ra canvas giải quyết cả hai: không còn thanh công cụ, và CHỮ MỜ ĐƯỢC VẼ THẲNG VÀO ẢNH TRANG —
 * xoá phần tử nào cũng không bóc được chữ ra, mọi ảnh chụp đều dính tên người xem.
 * Chữ trong slide cũng không bôi-chép được vì trang là ảnh, không có lớp text.
 *
 * Bộ nhớ: chỉ vẽ những trang đang ở gần khung nhìn và xoá canvas của trang đã trôi xa —
 * một giáo án 80 trang không làm treo máy chiếu.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Số trang giữ ảnh hai bên trang đang xem (xa hơn thì xoá để nhẹ bộ nhớ) */
const GIU_QUANH = 2;
/** Tỷ lệ điểm ảnh tối đa — màn 4K không cần vẽ gấp 3 lần */
const DPR_TOI_DA = 2;

type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
  cleanup(): void;
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };

/** Vẽ chữ mờ THẲNG VÀO ảnh trang: ba dòng chéo, đủ đọc khi phóng to nhưng không che bài */
function veChuMo(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const co = Math.max(13, Math.round(w / 48));
  ctx.save();
  ctx.font = `600 ${co}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.lineWidth = Math.max(1, co / 10);
  ctx.textBaseline = "middle";
  // Viền sáng + ruột tối: đọc được cả trên nền trắng lẫn nền ảnh tối
  for (const [fx, fy] of [[0.07, 0.11], [0.34, 0.5], [0.2, 0.89]] as const) {
    ctx.save();
    ctx.translate(w * fx, h * fy);
    ctx.rotate((-16 * Math.PI) / 180);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(text, 0, 0);
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#101010";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function PdfCanvas({ src, watermark, onFail }: {
  src: string;
  /** Chuỗi chữ mờ (tên + liên hệ đã che + giờ) */
  watermark: string;
  /** Gọi khi không mở được bằng pdf.js — khung ngoài sẽ quay về cách xem dự phòng */
  onFail?: (ly_do: string) => void;
}) {
  const boc = useRef<HTMLDivElement>(null);
  const doc = useRef<PdfDoc | null>(null);
  const daVe = useRef<Set<number>>(new Set());
  const dangVe = useRef<Set<number>>(new Set());
  const [soTrang, setSoTrang] = useState(0);
  const [tyLe, setTyLe] = useState<{ w: number; h: number } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(true);

  /** Vẽ một trang vào canvas tương ứng (không vẽ lại nếu đã có) */
  const veTrang = useCallback(async (n: number) => {
    const d = doc.current;
    const khung = boc.current?.querySelector<HTMLCanvasElement>(`canvas[data-trang="${n}"]`);
    if (!d || !khung || daVe.current.has(n) || dangVe.current.has(n)) return;
    dangVe.current.add(n);
    try {
      const page = await d.getPage(n);
      const rong = khung.parentElement?.clientWidth ?? 900;
      const v1 = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_TOI_DA);
      const scale = (rong / v1.width) * dpr;
      const vp = page.getViewport({ scale });
      khung.width = Math.floor(vp.width);
      khung.height = Math.floor(vp.height);
      const ctx = khung.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, khung.width, khung.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      veChuMo(ctx, khung.width, khung.height, watermark);
      daVe.current.add(n);
      page.cleanup();
    } catch {
      /* trang hỏng: để trắng, các trang khác vẫn chiếu được */
    } finally {
      dangVe.current.delete(n);
    }
  }, [watermark]);

  /** Xoá ảnh của trang đã trôi xa để không ăn hết bộ nhớ */
  const xoaTrang = useCallback((n: number) => {
    const khung = boc.current?.querySelector<HTMLCanvasElement>(`canvas[data-trang="${n}"]`);
    if (!khung || !daVe.current.has(n)) return;
    khung.width = 1;
    khung.height = 1;
    daVe.current.delete(n);
  }, []);

  // Nạp tài liệu
  useEffect(() => {
    let huy = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Bộ xử lý nền: tệp được chép sang public/ khi cài gói (apps/web/scripts/copy-pdf-worker.mjs)
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: src, withCredentials: true, isEvalSupported: false });
        const d = (await task.promise) as unknown as PdfDoc;
        if (huy) { void d.destroy(); return; }
        doc.current = d;
        const p1 = await d.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        setTyLe({ w: v.width, h: v.height });
        p1.cleanup();
        setSoTrang(d.numPages);
        setDangTai(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Không mở được tệp";
        setLoi(msg);
        setDangTai(false);
        onFail?.(msg);
      }
    })();
    return () => {
      huy = true;
      const d = doc.current;
      doc.current = null;
      daVe.current.clear();
      if (d) void d.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Vẽ theo khung nhìn
  useEffect(() => {
    if (!soTrang || !boc.current) return;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const n = Number((en.target as HTMLElement).dataset.o ?? 0);
        if (!n) continue;
        if (en.isIntersecting) {
          for (let k = Math.max(1, n - 1); k <= Math.min(soTrang, n + 1); k++) void veTrang(k);
          for (const da of [...daVe.current]) if (Math.abs(da - n) > GIU_QUANH) xoaTrang(da);
        }
      }
    }, { root: boc.current, rootMargin: "300px 0px" });
    boc.current.querySelectorAll<HTMLElement>("[data-o]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [soTrang, veTrang, xoaTrang]);

  // Đổi kích thước (vào/ra toàn màn hình): vẽ lại cho nét
  useEffect(() => {
    const el = boc.current;
    if (!el || !soTrang) return;
    let t: number | null = null;
    const ro = new ResizeObserver(() => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const cu = [...daVe.current];
        daVe.current.clear();
        for (const n of cu) void veTrang(n);
      }, 250);
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (t) window.clearTimeout(t); };
  }, [soTrang, veTrang]);

  if (loi) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-6 text-center text-sm text-white/80">
        Không mở được slide trong khung ({loi}).
      </div>
    );
  }

  return (
    <div ref={boc} className="h-full w-full overflow-y-auto overflow-x-hidden bg-neutral-100">
      {dangTai && <div className="flex h-full items-center justify-center text-sm text-ink-600">Đang mở slide…</div>}
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
        {Array.from({ length: soTrang }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            data-o={n}
            className="relative w-full bg-white shadow-md ring-1 ring-black/5"
            style={tyLe ? { aspectRatio: `${tyLe.w} / ${tyLe.h}` } : undefined}
          >
            <canvas data-trang={n} className="block h-full w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

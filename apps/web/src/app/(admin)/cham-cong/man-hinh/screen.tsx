"use client";

import { useEffect, useState } from "react";

/** Trình chiếu toàn màn hình: không menu, không hiện tên nhân sự; Esc để thoát */
export function FullScreenQr({ svg, centerName, pointName }: { svg: string; centerName: string; pointName: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOn(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [on]);
  return (
    <>
      <button className="btn-primary w-full" onClick={() => setOn(true)}>Trình chiếu</button>
      {on && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-6">
          <div className="text-center">
            <div className="text-2xl font-semibold">{centerName}</div>
            <div className="text-ink-500">{pointName} — quét mã để chấm công</div>
          </div>
          <div className="w-[min(70vh,70vw)]" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="max-w-lg text-center text-sm text-ink-500">Mở camera điện thoại, quét mã và bấm Chấm vào / Chấm ra. Phải đứng trong khuôn viên cơ sở thì mới chấm được.</p>
          <button className="btn-ghost" onClick={() => setOn(false)}>Thoát (Esc)</button>
        </div>
      )}
    </>
  );
}

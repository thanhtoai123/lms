"use client";

/**
 * HỎI ĐỒNG Ý ĐO LƯỜNG QUẢNG CÁO (chỉ hiện khi trang có thẻ Meta / Google — xem ad-tags.tsx).
 * Đồng ý → chạy `window.__thAdsBoot()` và ghi nhớ; Từ chối → ghi nhớ, không nạp thẻ. Không chặn nội dung, không tick sẵn.
 * Mở liên kết /#do-luong (mục 7 Chính sách bảo mật: "đổi lựa chọn đo lường") để hỏi lại.
 */
import { useEffect, useState } from "react";

const KEY = "th-ads-consent";
type W = Window & { __thAdsBoot?: () => void };

function read(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function save(v: "yes" | "no") {
  try { localStorage.setItem(KEY, v); } catch { /* chế độ riêng tư: chỉ áp dụng cho lượt xem này */ }
}

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!read()) setOpen(true);
    const onHash = () => { if (location.hash === "#do-luong") setOpen(true); };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (!open) return null;
  const choose = (v: "yes" | "no") => {
    save(v);
    if (v === "yes") (window as W).__thAdsBoot?.();
    setOpen(false);
  };
  return (
    <div className="lp-consent-bar" role="dialog" aria-live="polite" aria-label="Đồng ý đo lường quảng cáo">
      <p>
        TH STEAM Academy muốn dùng cookie của Meta và Google để đo hiệu quả quảng cáo. Bố mẹ có đồng ý không?{" "}
        <a href="/chinh-sach/bao-mat" target="_blank" rel="noopener">Chính sách bảo mật</a>
      </p>
      <div>
        <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => choose("no")}>Không đồng ý</button>
        <button type="button" className="lp-btn lp-btn-primary lp-btn-sm" onClick={() => choose("yes")}>Đồng ý</button>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PREFIX = "sr-filter:";

function read(key: string) {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(PREFIX + key, value); } catch { /* chế độ riêng tư / chặn lưu trữ */ }
}

/**
 * Nhớ bộ lọc gần nhất của người dùng cho một trang danh sách.
 *
 * Cách hoạt động (hợp với các trang lọc bằng form GET đang có):
 *  - Vào trang mà URL chưa có tham số nào → khôi phục chuỗi lọc đã lưu (router.replace).
 *  - Mỗi lần URL có tham số → lưu lại.
 *  - Người dùng bấm "Bỏ lọc" (URL sạch) ngay sau khi vừa khôi phục thì không khôi phục lại
 *    trong cùng phiên — cờ `restored` trong sessionStorage giữ đúng ý định đó.
 *
 * Mọi truy cập localStorage đều bọc try/catch: trình duyệt chặn lưu trữ vẫn dùng trang bình thường.
 */
export function RememberFilters({ storageKey, ignore = [] }: { storageKey: string; ignore?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const current = new URLSearchParams(params.toString());
    for (const k of ignore) current.delete(k);
    const qs = current.toString();
    const flag = `${PREFIX}${storageKey}:restored`;

    if (qs) {
      write(storageKey, qs);
      try { sessionStorage.removeItem(flag); } catch {}
      return;
    }
    // URL sạch: khôi phục một lần cho mỗi phiên
    let already = false;
    try { already = sessionStorage.getItem(flag) === "1"; } catch {}
    if (already) return;
    const saved = read(storageKey);
    try { sessionStorage.setItem(flag, "1"); } catch {}
    if (saved) router.replace(`${pathname}?${saved}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pathname, storageKey]);

  return null;
}

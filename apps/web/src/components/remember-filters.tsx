"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PREFIX = "sr-filter:";

function read(key: string) {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(PREFIX + key, value); } catch { /* chế độ riêng tư / trình duyệt chặn lưu trữ */ }
}

/**
 * Nhớ bộ lọc gần nhất của người dùng cho một trang danh sách.
 *
 * Hợp với các trang đang lọc bằng form GET:
 *  - **Lần đầu mở trang** mà URL chưa có tham số nào → khôi phục chuỗi lọc đã lưu.
 *  - Sau đó, mỗi lần URL đổi thì lưu lại chuỗi lọc mới.
 *  - Bấm "Xoá lọc" (URL sạch, vẫn đang ở trang đó) → xoá luôn chuỗi đã lưu,
 *    không khôi phục đè lên ý định của người dùng.
 *
 * Mọi truy cập localStorage đều bọc try/catch: trình duyệt chặn lưu trữ thì trang
 * vẫn chạy bình thường, chỉ là không nhớ bộ lọc.
 */
export function RememberFilters({ storageKey, ignore = [] }: { storageKey: string; ignore?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const firstRun = useRef(true);

  useEffect(() => {
    const current = new URLSearchParams(params.toString());
    for (const k of ignore) current.delete(k);
    const qs = current.toString();

    if (!firstRun.current) {
      // Đang ở trong trang: URL có lọc thì lưu, người dùng xoá lọc thì quên luôn
      write(storageKey, qs);
      return;
    }
    firstRun.current = false;
    if (qs) { write(storageKey, qs); return; }
    const saved = read(storageKey);
    if (saved) router.replace(`${pathname}?${saved}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pathname, storageKey]);

  return null;
}

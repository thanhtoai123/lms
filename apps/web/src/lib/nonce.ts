import { headers } from "next/headers";
import { NONCE_REQUEST_HEADER } from "@satarobo/core";

/**
 * Nonce CSP của yêu cầu hiện tại (do `proxy.ts` sinh và gắn vào header yêu cầu).
 *
 * KIỂM KÊ SCRIPT NỘI TUYẾN CỦA ỨNG DỤNG (rà 18/09/2026):
 *  - Mã của chúng ta KHÔNG tự viết thẻ `<script>` nội tuyến nào: không dùng `next/script`,
 *    không có `dangerouslySetInnerHTML` nào chứa `<script>`. Các `dangerouslySetInnerHTML`
 *    còn lại là `<style>` (`components/column-chooser.tsx`), HTML bài viết đã escape
 *    (`renderMarkdown`) và SVG mã QR / thẻ học viên do máy chủ tự sinh.
 *  - Script nội tuyến duy nhất trên trang là do **Next.js sinh** (bootstrap, dữ liệu RSC
 *    `self.__next_f.push(...)`, các mảnh JS). Next tự gắn `nonce=` cho chúng khi đọc được
 *    nonce từ header `Content-Security-Policy` TRÊN YÊU CẦU — đó là lý do `proxy.ts`
 *    đặt header đó lên request chứ không chỉ lên response.
 *  - Mảnh JS nạp động lúc chạy (webpack chunk) không phải lúc nào cũng nhận nonce, nên CSP
 *    có thêm `'strict-dynamic'`: script đã được tin được phép nạp tiếp script con.
 *
 * Dùng hàm này khi PHẢI thêm một `<script>` nội tuyến mới:
 *   `<script nonce={await cspNonce()} …>`
 */
export async function cspNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_REQUEST_HEADER) ?? undefined;
}

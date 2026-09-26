/**
 * KHO TỆP TRÊN ĐĨA CỤC BỘ — dùng cho máy phát triển và cho máy chủ tự dựng có ổ đĩa bền.
 *
 * KHÔNG dùng trên nền tảng triển khai có đĩa tạm thời (Vercel và tương tự): mỗi lần triển
 * khai là mất toàn bộ tệp đã tải lên. Trang Vận hành có một mục cảnh báo đúng điều này.
 */
import { mkdir, readFile, writeFile, unlink, rm, access } from "node:fs/promises";
import path from "node:path";
import { isSafeObjectKey } from "@satarobo/core";
import type { KhoTep } from "./loai";

export function thuMucGoc(env: Record<string, string | undefined> = process.env): string {
  return env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "uploads");
}

function duongDanAnToan(key: string): string {
  // isSafeObjectKey chặn cả "..", "//", đường dẫn tuyệt đối và ký tự lạ
  if (!isSafeObjectKey(key)) throw new Error("Khoá lưu trữ không hợp lệ");
  const goc = path.resolve(thuMucGoc());
  const p = path.join(goc, key);
  // Lớp chặn cuối: đường dẫn phải nằm trong thư mục gốc sau khi chuẩn hoá
  if (!path.resolve(p).startsWith(goc + path.sep)) throw new Error("Khoá lưu trữ không hợp lệ");
  return p;
}

export const khoDia: KhoTep = {
  ten: "dia",
  async dat(key, data) {
    const p = duongDanAnToan(key);
    await mkdir(/* turbopackIgnore: true */ path.dirname(p), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ p, data);
  },
  async lay(key) {
    try {
      return await readFile(/* turbopackIgnore: true */ duongDanAnToan(key));
    } catch {
      return null;
    }
  },
  async xoa(key) {
    try { await unlink(/* turbopackIgnore: true */ duongDanAnToan(key)); } catch { /* đã xoá */ }
  },
  async xoaTheoTienTo(prefix) {
    try { await rm(/* turbopackIgnore: true */ duongDanAnToan(prefix), { recursive: true, force: true }); } catch { /* đã xoá */ }
  },
  async kiemTra() {
    const goc = thuMucGoc();
    await mkdir(/* turbopackIgnore: true */ goc, { recursive: true });
    await access(/* turbopackIgnore: true */ goc);
  },
};

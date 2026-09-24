/**
 * Chép bộ xử lý nền của pdf.js vào `public/` sau mỗi lần cài gói.
 *
 * pdf.js cần một tệp worker chạy riêng luồng. Gói `pdfjs-dist` để tệp đó trong node_modules,
 * mà trình đóng gói của Next KHÔNG tự phát tệp ấy ra web, nên cách chắc chắn nhất là chép sang
 * `public/` rồi trỏ `workerSrc = "/pdf.worker.min.mjs"`. Chép lúc cài gói (postinstall) để
 * máy nào cài xong cũng có, không cần nhớ thao tác tay.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const require = createRequire(import.meta.url);

let nguon;
try {
  // Lấy đúng vị trí gói dù pnpm để trong kho .pnpm
  nguon = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
} catch {
  console.warn("[pdf-worker] chưa cài pdfjs-dist — bỏ qua (khung xem slide sẽ dùng bản dự phòng)");
  process.exit(0);
}
if (!existsSync(nguon)) {
  console.warn(`[pdf-worker] không thấy ${nguon} — bỏ qua`);
  process.exit(0);
}
const dich = join(web, "public", "pdf.worker.min.mjs");
mkdirSync(dirname(dich), { recursive: true });
copyFileSync(nguon, dich);
console.log("[pdf-worker] đã chép", dich);

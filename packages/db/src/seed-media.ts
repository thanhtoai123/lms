/**
 * BỔ SUNG ẢNH MINH CHỨNG MẪU — thêm gallery ảnh từng buổi (ảnh của bé + ảnh cả lớp)
 * cho gia đình mẫu, KHÔNG xoá dữ liệu khác. An toàn chạy lại nhiều lần (idempotent).
 *
 *   pnpm db:seed-media
 *
 * Dùng khi hồ sơ năng lực ở cổng phụ huynh chưa hiện ảnh mà không muốn reset toàn bộ CSDL.
 */
import "./env";
import { createDb } from "./index";
import { seedDemoPortfolioMedia } from "./seed-portfolio";

const db = createDb();
const r = await seedDemoPortfolioMedia(db);
console.log(`✓ Đã thêm ảnh minh chứng mẫu: ${r.photos} ảnh cho ${r.students} học viên (đã bật đồng ý đăng ảnh cho phụ huynh mẫu).`);
process.exit(0);

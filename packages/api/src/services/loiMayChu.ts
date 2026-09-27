/**
 * Ghi lỗi máy chủ gom theo vân tay — KHÔNG BAO GIỜ được làm hỏng yêu cầu đang lỗi thêm lần nữa:
 * mọi thất bại khi ghi đều bị nuốt (chỉ in cảnh báo).
 */
import { sql, desc, gte } from "drizzle-orm";
import { getDb, serverErrors, type Database } from "@satarobo/db";
import { laLoiCanGhi, redactErrorForLog, taoLoiMayChu } from "@satarobo/core";

export async function ghiLoiMayChu(err: unknown, path: string, db?: Database) {
  // Phản hồi bình thường (403/404/412, người xem đóng trang, redirect) không phải lỗi máy chủ
  if (!laLoiCanGhi(err)) return;
  try {
    const r = redactErrorForLog(err);
    const l = taoLoiMayChu({ name: r.name, code: r.code ?? null, msg: r.msg, path });
    await (db ?? getDb()).insert(serverErrors).values({ fingerprint: l.vanTay, name: l.ten, code: l.ma, message: l.thongDiep, path: l.duongDan })
      .onConflictDoUpdate({ target: serverErrors.fingerprint, set: { count: sql`${serverErrors.count} + 1`, lastAt: new Date() } });
  } catch (e) {
    console.warn("[loi-may-chu] không ghi được:", (e as Error)?.name ?? "Error");
  }
}

/** Lỗi gần đây cho trang Vận hành: lặp lại trong 7 ngày, chưa xử lý hoặc tái phát sau khi xử lý */
export async function loiGanDay(db: Database, gioiHan = 15) {
  const tu = new Date(Date.now() - 7 * 86_400_000);
  const rows = await db.select().from(serverErrors).where(gte(serverErrors.lastAt, tu)).orderBy(desc(serverErrors.lastAt)).limit(100);
  return rows.filter((r) => !r.resolvedAt || r.lastAt > r.resolvedAt).slice(0, gioiHan);
}

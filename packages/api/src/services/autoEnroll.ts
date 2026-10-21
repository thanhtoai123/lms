/**
 * TỰ XẾP LỚP KHI TIỀN VỀ (outbox `order.first_payment`, xử lý ở worker).
 *
 * Đơn tạo từ lead, dòng đơn có "Lớp sẽ xếp khi tiền về" (order_items.target_class_id): khi đơn nhận khoản tiền
 * đầu tiên (chuyển khoản tự khớp hoặc kế toán xác nhận) hệ thống tự CHỐT học viên — tạo phụ huynh, học viên,
 * ghi danh vào lớp — bằng đúng hàm chốt tay `convertLead`, chạy với quyền của NGƯỜI TẠO ĐƠN (mọi kiểm tra
 * quyền, khoá tiên quyết, cổng thanh toán giữ nguyên).
 *
 * Không tự xếp được (chưa chọn lớp, lớp đã đầy / kết thúc, người tạo đơn không có quyền, khoá tiên quyết…)
 * → báo người tạo đơn "Tiền đã về — cần chốt xếp lớp" kèm lý do và đường dẫn trang chốt. Không bao giờ ném lỗi
 * làm kẹt hàng đợi vì lý do nghiệp vụ.
 */
import { eq, sql } from "drizzle-orm";
import { orders, orderItems, orderEvents, leads, leadChildren, classes, type Database } from "@satarobo/db";
import { contextForUserId } from "../context";
import type { ProtectedContext } from "../trpc";
import { convertLead, type ConvertItemInput } from "./leads";
import { notify, type Db } from "./finance";
import { writeAudit } from "./audit";

export type AutoEnrollResult =
  | { status: "skipped"; note: string }
  | { status: "enrolled"; note: string; enrollmentIds: string[] }
  | { status: "needs_action"; note: string };

export async function autoEnrollOrder(db: Database, orderId: string): Promise<AutoEnrollResult> {
  const d = db as unknown as Db;
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o || !o.leadId) return { status: "skipped", note: "Đơn không tạo từ lead" };
  if (o.status !== "partially_paid" && o.status !== "paid") return { status: "skipped", note: "Đơn chưa có khoản tiền xác nhận" };
  const [lead] = await db.select().from(leads).where(eq(leads.id, o.leadId)).limit(1);
  if (!lead || lead.deletedAt) return { status: "skipped", note: "Lead không còn" };

  const kids = await db.select().from(leadChildren).where(eq(leadChildren.leadId, lead.id));
  const openKids = kids.filter((k) => !k.convertedStudentId);
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));

  // Đã chốt hết (chốt tay trước đó) → không làm gì
  if (lead.status === "enrolled" && openKids.length === 0) return { status: "skipped", note: "Lead đã chốt học viên" };

  // Mỗi con (hoặc lead một con không tách con) lấy dòng có lớp chọn sẵn đầu tiên — combo 2 năm chỉ xếp Năm 1
  const picked: { line: typeof lines[number]; childId: string | null }[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.targetClassId) continue;
    const childId = l.leadChildId ?? null;
    if (childId) {
      const k = kids.find((x) => x.id === childId);
      if (!k || k.convertedStudentId || seen.has(childId)) continue;
      seen.add(childId);
    } else {
      if (openKids.length > 0 || seen.has("_lead")) continue;
      seen.add("_lead");
    }
    picked.push({ line: l, childId });
  }

  const link = `/leads/${lead.id}/convert`;
  const askSale = async (reason: string): Promise<AutoEnrollResult> => {
    await notify(d, [o.createdBy, lead.assignedToId], "Tiền đã về — cần chốt xếp lớp", `${o.code} · ${lead.parentName}: ${reason}`, link, 3, "order.auto_enroll");
    await db.insert(orderEvents).values({ orderId: o.id, event: "auto_enroll", note: `Chưa tự xếp lớp: ${reason}`, actorId: null });
    return { status: "needs_action", note: reason };
  };

  if (!picked.length) return askSale("đơn chưa chọn lớp sẽ xếp — vào trang chốt để chọn lớp");
  if (!o.createdBy) return askSale("đơn không có người tạo để chạy chốt tự động");
  const ctx = await contextForUserId(db, o.createdBy);
  if (!ctx?.actor || !ctx.user) return askSale("tài khoản người tạo đơn không còn hoạt động");

  // Lớp còn nhận học viên không (đầy / kết thúc thì để người chốt tay chọn lớp khác)
  for (const p of picked) {
    const [c] = await db.select({ code: classes.code, status: classes.status, capacity: classes.capacity, enrolled: sql<number>`(select count(*)::int from enrollments e where e.class_id = ${classes.id} and e.status in ('active','trial'))` })
      .from(classes).where(eq(classes.id, p.line.targetClassId!)).limit(1);
    if (!c || (c.status !== "recruiting" && c.status !== "running")) return askSale(`lớp ${c?.code ?? "đã chọn"} không còn mở`);
    if (c.capacity > 0 && Number(c.enrolled) >= c.capacity) return askSale(`lớp ${c.code} đã đủ ${c.capacity} học viên`);
  }

  const items: ConvertItemInput[] = picked.map((p) => ({
    childId: p.childId, classId: p.line.targetClassId!, packageSessions: p.line.packageSessions ?? 45, status: "active",
  }));
  try {
    const r = await convertLead(ctx as ProtectedContext, { leadId: lead.id, items });
    const note = `Đã tự xếp ${r.enrollmentIds.length} học viên vào lớp khi tiền về`;
    await db.insert(orderEvents).values({ orderId: o.id, event: "auto_enroll", note, actorId: null });
    await notify(d, [o.createdBy, lead.assignedToId], "Đã tự xếp lớp", `${o.code} · ${lead.parentName}: ${note}${r.accountPending ? " · tài khoản phụ huynh chờ kích hoạt" : ""}`, `/orders/${o.id}`, 2, "order.auto_enroll");
    await writeAudit(d, { actorId: null, action: "CREATE", module: "enrollments", entity: "enrollments", entityId: r.enrollmentId, after: { mode: "auto_enroll", orderId: o.id, orderCode: o.code, enrollmentIds: r.enrollmentIds, runAs: o.createdBy } });
    return { status: "enrolled", note, enrollmentIds: r.enrollmentIds };
  } catch (e) {
    return askSale((e as Error).message.slice(0, 300));
  }
}

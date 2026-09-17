import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { orders, orderItems, orderEvents, payments, refunds, enrollments, classes, students, userRoles, users, userNotifications } from "@satarobo/db";
import { refundProposal, formatVnd, remainingSessions } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { consumedSql } from "./students";

type Db = ProtectedContext["db"];

export type RefundTrigger = "withdraw" | "transfer" | "class_cancel";
const TRIGGER_VI: Record<RefundTrigger, string> = { withdraw: "Nghỉ học", transfer: "Chuyển lớp", class_cancel: "Huỷ lớp" };

/**
 * Hook vòng đời học vụ (Đợt 3): khi học viên nghỉ hẳn / lớp bị huỷ, nếu ghi danh còn tiền đã thu (đã xác nhận)
 * chưa dùng hết và đơn chưa có đề xuất hoàn đang mở → tạo đề xuất hoàn tiền "Chờ duyệt"
 * (số tiền = đề xuất theo buổi chưa học) và báo quản lý cơ sở. Không kiểm quyền tài chính:
 * chỉ gọi bên trong transaction của thao tác học vụ đã được phân quyền; duyệt / chi vẫn đi luồng /hoan-tien.
 *
 * Ghi chú: Đợt 2 (mục 19) dự kiến chuyển hàm này vào finance.ts (thêm refunds.trigger / auto) — giữ nguyên chữ ký.
 */
export async function proposeRefundIfPaid(tx: Db, input: { enrollmentId: string; reason: string; trigger: RefundTrigger; actorId: string }): Promise<{ refundId: string | null; amount: number }> {
  const none = { refundId: null, amount: 0 };
  const [e] = await tx
    .select({ id: enrollments.id, packageSessions: enrollments.packageSessions, consumed: consumedSql, transferredFromId: enrollments.transferredFromId, centerId: classes.centerId, classCode: classes.code, studentName: students.fullName })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(students, eq(students.id, enrollments.studentId))
    .where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!e) return none;

  // Đơn có thể gắn với ghi danh gốc trước khi chuyển lớp → lần theo chuỗi transferred_from
  const chain = [e.id];
  let prev = e.transferredFromId;
  while (prev && chain.length < 6 && !chain.includes(prev)) {
    chain.push(prev);
    const p = await tx.query.enrollments.findFirst({ where: eq(enrollments.id, prev), columns: { transferredFromId: true } });
    prev = p?.transferredFromId ?? null;
  }
  const [o] = await tx.select({ id: orders.id, code: orders.code, total: orders.total })
    .from(orders).where(and(inArray(orders.enrollmentId, chain), inArray(orders.status, ["partially_paid", "paid"]))).orderBy(desc(orders.createdAt)).limit(1);
  if (!o) return none;

  const [paid] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "confirmed")));
  const rs = await tx.select({ amount: refunds.amount, status: refunds.status }).from(refunds).where(eq(refunds.orderId, o.id));
  if (rs.some((r) => r.status === "pending" || r.status === "approved")) return none;
  const already = rs.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0);

  const items = await tx.select({ amount: orderItems.amount, packageSessions: orderItems.packageSessions }).from(orderItems).where(eq(orderItems.orderId, o.id));
  const courseItem = items.find((i) => i.packageSessions);
  const gross = items.reduce((s, i) => s + i.amount, 0);
  const ratio = gross > 0 ? o.total / gross : 1;
  const packageValue = Math.round((courseItem?.amount ?? o.total) * (Number.isFinite(ratio) ? ratio : 1));
  const pkg = courseItem?.packageSessions ?? e.packageSessions;
  // buổi đã dùng của cả gói = gói gốc − số buổi còn lại hiện tại (đã mang sang khi chuyển lớp)
  const used = Math.max(0, pkg - remainingSessions(e.packageSessions, e.consumed));
  const proposal = refundProposal({ paid: Number(paid?.n ?? 0), packageValue, packageSessions: pkg, consumedSessions: used, alreadyRefunded: already });
  if (proposal.refundable <= 0) return none;

  const reason = `[${TRIGGER_VI[input.trigger]} — tự đề xuất] ${input.reason}`.slice(0, 500);
  const [row] = await tx.insert(refunds).values({
    orderId: o.id, enrollmentId: e.id, centerId: e.centerId, status: "pending", amount: proposal.refundable, proposedAmount: proposal.refundable,
    sessionsUsed: proposal.usedSessions, sessionsTotal: pkg, reason, requestedBy: input.actorId,
  }).returning({ id: refunds.id });
  await tx.insert(orderEvents).values({ orderId: o.id, event: "refund_requested", note: `${formatVnd(proposal.refundable)} (tự đề xuất khi ${TRIGGER_VI[input.trigger].toLowerCase()}): ${input.reason}`.slice(0, 500), actorId: input.actorId });
  const managers = (await tx.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, e.centerId), eq(users.isActive, true)))).map((r) => r.u);
  const ids = [...new Set(managers)];
  if (ids.length) {
    await tx.insert(userNotifications).values(ids.map((userId) => ({ userId, title: "Đề xuất hoàn tiền chờ duyệt", body: `${e.studentName} · ${e.classCode} · ${formatVnd(proposal.refundable)} (${TRIGGER_VI[input.trigger]})`, link: "/hoan-tien?status=pending", priority: 2 })));
  }
  return { refundId: row!.id, amount: proposal.refundable };
}

/** Tổng tiền đã thu (đã xác nhận) của các ghi danh — dùng cho xem trước huỷ lớp */
export async function collectedForEnrollments(db: Db, enrollmentIds: string[]): Promise<number> {
  if (!enrollmentIds.length) return 0;
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(inArray(orders.enrollmentId, enrollmentIds), eq(payments.status, "confirmed")));
  return Number(r?.n ?? 0);
}

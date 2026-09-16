/**
 * Domain events — hợp đồng giữa các bounded context.
 * Producer ghi vào bảng outbox trong cùng transaction; worker tiêu thụ và chạy automation.
 */
export type DomainEvent =
  | { type: "session.completed"; sessionId: string; classId: string; date: string; teacherId: string | null }
  | { type: "attendance.recorded"; sessionId: string; enrollmentId: string; studentId: string; status: string; sequenceNo: number }
  | { type: "lead.created"; leadId: string; centerId: string | null; source: string | null }
  | { type: "lead.status_changed"; leadId: string; from: string; to: string; actorId: string | null }
  | { type: "lead.sla_breached"; leadId: string; status: string; overdueMinutes: number }
  | { type: "enrollment.created"; enrollmentId: string; studentId: string; classId: string }
  | { type: "risk.detected"; studentId: string; enrollmentId: string; code: string; severity: number; detail: string }
  | { type: "report_card.due"; enrollmentId: string; sessionId: string; sequenceNo: number };

export type DomainEventType = DomainEvent["type"];

export const NOTIFICATION_CHANNELS = ["in_app", "push", "zns", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Hành động mà automation có thể tạo ra */
export type Action =
  | { kind: "notify_parent"; studentId: string; template: string; params: Record<string, string>; channels: NotificationChannel[] }
  | { kind: "notify_user"; userId: string | null; role?: string; centerId?: string | null; title: string; body: string; link?: string; priority: 1 | 2 | 3 }
  | { kind: "create_care_task"; studentId: string; enrollmentId: string; code: string; title: string; dueInHours: number; severity: number }
  | { kind: "create_lead_task"; leadId: string; title: string; dueInMinutes: number };

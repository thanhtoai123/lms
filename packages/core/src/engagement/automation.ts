import type { Action, DomainEvent } from "./events.js";

/**
 * Rule engine tối giản: rule = (điều kiện trên event) → danh sách action.
 * Rule là DỮ LIỆU (có thể lưu DB, bật/tắt theo cơ sở); ở đây kèm bộ rule mặc định
 * tái hiện các automation của hệ cũ (chăm sóc HV khi nghỉ liên tiếp, nhắc lead, học bạ mốc 5/12…).
 */
export interface AutomationRule {
  code: string;
  name: string;
  enabled: boolean;
  on: DomainEvent["type"];
  when?: (e: DomainEvent) => boolean;
  actions: (e: DomainEvent) => Action[];
}

export const DEFAULT_RULES: AutomationRule[] = [
  {
    code: "SESSION_COMPLETED_NOTIFY_PARENTS",
    name: "Buổi học hoàn tất → gửi điểm danh + nhận xét cho phụ huynh",
    enabled: true,
    on: "session.completed",
    actions: (e) => (e.type === "session.completed" ? [{ kind: "notify_parent", studentId: "*", template: "SESSION_SUMMARY", params: { sessionId: e.sessionId, date: e.date }, channels: ["in_app", "zns"] }] : []),
  },
  {
    code: "RISK_TO_CARE_TASK",
    name: "Cảnh báo rủi ro → tạo việc chăm sóc cho CSKH cơ sở",
    enabled: true,
    on: "risk.detected",
    actions: (e) =>
      e.type === "risk.detected"
        ? [
            { kind: "create_care_task", studentId: e.studentId, enrollmentId: e.enrollmentId, code: e.code, title: `Chăm sóc: ${e.detail}`, dueInHours: e.severity === 1 ? 24 : 72, severity: e.severity },
            { kind: "notify_user", userId: null, role: "CENTER_SALES_CSM", title: "Học viên cần chăm sóc", body: e.detail, link: `/cham-soc-hv`, priority: e.severity as 1 | 2 | 3 },
          ]
        : [],
  },
  {
    code: "LEAD_ASSIGNED_NOTIFY",
    name: "Lead mới vừa chia cho tôi → báo tư vấn viên được chia",
    enabled: true,
    on: "lead.assigned",
    actions: (e) => (e.type === "lead.assigned" ? [{ kind: "notify_user", userId: e.assigneeId, title: "Bạn vừa nhận lead mới", body: `Chế độ chia: ${e.mode}. Gọi trong 15 phút.`, link: `/leads/${e.leadId}`, priority: 1 }] : []),
  },
  {
    code: "LEAD_TRANSFERRED_NOTIFY",
    name: "Lead được bàn giao/chuyển → báo người nhận",
    enabled: true,
    on: "lead.transferred",
    when: (e) => e.type === "lead.transferred" && !!e.toUserId,
    actions: (e) => (e.type === "lead.transferred" ? [{ kind: "notify_user", userId: e.toUserId, title: "Bạn được bàn giao lead", body: e.reason ?? "Không có lý do", link: `/leads/${e.leadId}`, priority: 2 }] : []),
  },
  {
    code: "ATTENDANCE_CORRECTED_NOTIFY_TEACHER",
    name: "Điểm danh bị sửa hồi tố → báo GV phụ trách buổi",
    enabled: true,
    on: "attendance.corrected",
    actions: (e) => (e.type === "attendance.corrected" ? [{ kind: "notify_user", userId: null, role: "TEACHER", title: "Điểm danh buổi học đã được sửa", body: `${e.from ?? "chưa có"} → ${e.to}. Lý do: ${e.reason}`, link: `/teacher/sessions/${e.sessionId}`, priority: 2 }] : []),
  },
  {
    code: "NEW_LEAD_FIRST_CALL",
    name: "Lead mới → việc gọi trong 15 phút",
    enabled: true,
    on: "lead.created",
    actions: (e) => (e.type === "lead.created" ? [{ kind: "create_lead_task", leadId: e.leadId, title: "Gọi tư vấn lần đầu", dueInMinutes: 15 }] : []),
  },
  {
    code: "LEAD_SLA_BREACH_ESCALATE",
    name: "Lead quá SLA → báo quản lý cơ sở",
    enabled: true,
    on: "lead.sla_breached",
    when: (e) => e.type === "lead.sla_breached" && e.overdueMinutes >= 60,
    actions: (e) => (e.type === "lead.sla_breached" ? [{ kind: "notify_user", userId: null, role: "CENTER_MANAGER", title: "Lead quá SLA", body: `Lead ${e.leadId} quá hạn ${e.overdueMinutes} phút ở trạng thái ${e.status}`, link: `/leads/${e.leadId}`, priority: 2 }] : []),
  },
  {
    code: "REPORT_CARD_MILESTONE",
    name: "Đến mốc buổi 5/12 → nhắc GV viết học bạ",
    enabled: true,
    on: "report_card.due",
    actions: (e) => (e.type === "report_card.due" ? [{ kind: "notify_user", userId: null, role: "TEACHER", title: "Đến hạn viết học bạ", body: `Buổi ${e.sequenceNo} — viết học bạ năng lực cho học viên`, link: `/teacher/sessions/${e.sessionId}`, priority: 2 }] : []),
  },
  {
    code: "COURSE_COMPLETED_RENEWAL",
    name: "Hoàn thành khoá → việc tư vấn tái tục khoá tiếp theo",
    enabled: true,
    on: "course.completed",
    actions: (e) =>
      e.type === "course.completed"
        ? [
            { kind: "create_care_task", studentId: e.studentId, enrollmentId: e.enrollmentId, code: "RENEWAL", title: e.nextCourseId ? "Tư vấn tái tục: gợi ý khoá tiếp theo" : "Tư vấn tái tục sau hoàn thành khoá", dueInHours: 72, severity: 2 },
            { kind: "notify_user", userId: null, role: "CENTER_SALES_CSM", title: "Học viên hoàn thành khoá", body: "Gọi chúc mừng và tư vấn khoá tiếp theo", link: `/students/${e.studentId}`, priority: 2 },
          ]
        : [],
  },
  {
    code: "TRIAL_DONE_FOLLOWUP",
    name: "Học thử xong → việc gọi chốt trong 24h",
    enabled: true,
    on: "lead.status_changed",
    when: (e) => e.type === "lead.status_changed" && e.to === "trial_done",
    actions: (e) => (e.type === "lead.status_changed" ? [{ kind: "create_lead_task", leadId: e.leadId, title: "Gọi chốt sau học thử", dueInMinutes: 24 * 60 }] : []),
  },
];

export function runRules(event: DomainEvent, rules: AutomationRule[] = DEFAULT_RULES): { rule: string; actions: Action[] }[] {
  const out: { rule: string; actions: Action[] }[] = [];
  for (const r of rules) {
    if (!r.enabled || r.on !== event.type) continue;
    if (r.when && !r.when(event)) continue;
    const actions = r.actions(event);
    if (actions.length) out.push({ rule: r.code, actions });
  }
  return out;
}

/**
 * BẢNG ÁNH XẠ legacy → new.
 *
 * Tên bảng/cột legacy ở đây là GIẢ ĐỊNH suy ra từ giao diện admin.satarobo.vn
 * (bộ lọc, cột bảng, tham số URL). Trước khi chạy thật, mở Supabase Studio của hệ cũ,
 * đối chiếu và sửa `legacyTable` / `columns` cho đúng. Script sẽ báo lỗi rõ ràng nếu
 * bảng/cột không tồn tại thay vì migrate sai.
 */

export interface TableMap {
  legacyTable: string;
  /** Câu SELECT lấy dữ liệu legacy — chỉnh sửa tự do */
  select: string;
  note: string;
}

export const MAPPING = {
  centers: {
    legacyTable: "centers",
    select: `select id, code, name, address, phone from centers`,
    note: "2 cơ sở: CS1 (211 Nguyễn Hữu Thọ), CS2 (114 Hoàng Diệu)",
  },
  rooms: {
    legacyTable: "rooms",
    select: `select id, center_id, code, name, coalesce(capacity,12) as capacity from rooms`,
    note: "Mã phòng như 101, P302 xuất hiện trong mã lịch lớp",
  },
  courses: {
    legacyTable: "courses",
    select: `select id, code, name, slug, grade_from, grade_to, coalesce(total_sessions,48) as total_sessions, coalesce(price,0) as price from courses`,
    note: "11 khoá dạy (Sata1..Sata8, combo…)",
  },
  teachers: {
    legacyTable: "teachers",
    select: `select id, user_id, center_id, code, full_name, phone, email, grade, contract_type, status from teachers`,
    note: "Cột NGẠCH/LOẠI HĐ trên màn Giáo viên",
  },
  parents: {
    legacyTable: "parents",
    select: `select id, user_id, full_name, phone, email, zalo_id, national_id, address from parents`,
    note: "national_id/address chuyển sang parent_private (mã hoá). KHÔNG copy sang bảng parents mới.",
  },
  students: {
    legacyTable: "students",
    select: `select id, code, full_name, nickname, dob, grade, school, center_id, status, parent_id from students`,
    note: "parent_id → student_guardians (isPrimary=true)",
  },
  classes: {
    legacyTable: "classes",
    select: `select id, code, name, course_id, center_id, room_id, teacher_id, capacity, start_date, status, schedule_text from classes`,
    note: "schedule_text dạng 'sata6.15h45-T7.CS2-P302' → parse thành class_schedules (xem parseLegacySchedule)",
  },
  sessions: {
    legacyTable: "sessions",
    select: `select id, class_id, seq, date, start_time, end_time, room_id, teacher_id, status, topic, note from sessions`,
    note: "status legacy (vd 'DONE','PENDING') → map sang state machine mới",
  },
  enrollments: {
    legacyTable: "enrollments",
    select: `select id, student_id, class_id, status, package_sessions, created_at from enrollments`,
    note: "Đăng ký học",
  },
  attendance: {
    legacyTable: "attendance",
    select: `select id, session_id, enrollment_id, status, note from attendance`,
    note: "status legacy → present|late|absent_excused|absent_unexcused|makeup",
  },
} satisfies Record<string, TableMap>;

export const SESSION_STATUS_MAP: Record<string, "scheduled" | "completed" | "cancelled"> = {
  DONE: "completed", COMPLETED: "completed", FINISHED: "completed",
  PENDING: "scheduled", SCHEDULED: "scheduled", OPEN: "scheduled",
  CANCELLED: "cancelled", CANCELED: "cancelled",
};

export const ATTENDANCE_STATUS_MAP: Record<string, "present" | "late" | "absent_excused" | "absent_unexcused" | "makeup"> = {
  PRESENT: "present", CO_MAT: "present", P: "present",
  LATE: "late", MUON: "late",
  ABSENT_EXCUSED: "absent_excused", VANG_CO_PHEP: "absent_excused", EXCUSED: "absent_excused",
  ABSENT: "absent_unexcused", ABSENT_UNEXCUSED: "absent_unexcused", VANG: "absent_unexcused",
  MAKEUP: "makeup", HOC_BU: "makeup",
};

/**
 * Parse chuỗi lịch legacy "sata6.15h45-T7.CS2-P302" → { weekday: 6, startTime: "15:45", roomCode: "P302" }
 * Thứ trong chuỗi: T2..T7, CN.
 */
export function parseLegacySchedule(text: string, sessionMinutes = 90): { weekday: number; startTime: string; endTime: string; roomCode: string | null } | null {
  const m = /(\d{1,2})h(\d{2})-(T[2-7]|CN)(?:\.[A-Z0-9]+-([A-Z0-9]+))?/i.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const wd = m[3]!.toUpperCase() === "CN" ? 7 : Number(m[3]!.slice(1)) - 1; // T2 → 1 (Thứ Hai)
  const start = h * 60 + mm;
  const end = start + sessionMinutes;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { weekday: wd, startTime: `${pad(h)}:${pad(mm)}`, endTime: `${pad(Math.floor(end / 60))}:${pad(end % 60)}`, roomCode: m[4] ?? null };
}

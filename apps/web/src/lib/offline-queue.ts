/**
 * Hàng đợi điểm danh ngoại tuyến cho app giáo viên (localStorage theo thiết bị).
 * Điểm danh ghi đè theo (buổi, học viên) nên gửi lại nhiều lần vẫn an toàn.
 */
export interface QueuedAttendance {
  id: string;
  sessionId: string;
  records: { enrollmentId: string; status: string; studentRemark: string | null; rating: number | null }[];
  submit: boolean;
  queuedAt: string;
  lastError?: string;
  tries?: number;
}

const KEY = "sr:offline-attendance";
export const QUEUE_EVENT = "sr-offline-queue";

function read(): QueuedAttendance[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as QueuedAttendance[]) : [];
  } catch {
    return [];
  }
}
function write(list: QueuedAttendance[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* hết dung lượng / chế độ riêng tư */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function queued(): QueuedAttendance[] {
  return typeof window === "undefined" ? [] : read();
}

/** Mỗi buổi chỉ giữ bản mới nhất */
export function enqueueAttendance(item: Omit<QueuedAttendance, "id" | "queuedAt">) {
  const list = read().filter((x) => x.sessionId !== item.sessionId);
  list.push({ ...item, id: `${item.sessionId}:${Date.now()}`, queuedAt: new Date().toISOString() });
  write(list);
}

export function removeQueued(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function markFailed(id: string, error: string) {
  write(read().map((x) => (x.id === id ? { ...x, lastError: error.slice(0, 200), tries: (x.tries ?? 0) + 1 } : x)));
}

/** Lỗi mạng (không tới được máy chủ) — khác lỗi nghiệp vụ do máy chủ trả về */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const err = e as { data?: unknown; message?: string; cause?: unknown } | null;
  if (!err) return false;
  if (err.data) return false;
  return /fetch|network|load failed|NetworkError/i.test(err.message ?? "") || err.cause instanceof TypeError;
}

/* Nháp điểm danh + dữ liệu buổi đã tải (để xem lại khi mất mạng) */
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(`sr:${key}`, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* bỏ qua */
  }
}
export function loadLocal<T>(key: string, maxAgeMs = 3 * 86_400_000): T | null {
  try {
    const v = JSON.parse(localStorage.getItem(`sr:${key}`) ?? "null") as { at: number; value: T } | null;
    return v && Date.now() - v.at <= maxAgeMs ? v.value : null;
  } catch {
    return null;
  }
}
export function dropLocal(key: string) {
  try {
    localStorage.removeItem(`sr:${key}`);
  } catch {
    /* bỏ qua */
  }
}

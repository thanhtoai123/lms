import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRIAL_CLASS_STATUSES, TRIAL_CLASS_STATUS_VI, TRIAL_SESSION_STATUSES, TRIAL_ENROLLMENT_STATUSES, TRIAL_ATTENDANCE_STATUSES,
  TRIAL_CLASS_MAX_SESSIONS, trialClassCode, nextTrialClassSeq, trialClassName,
  canAddTrialSession, trialSeatsLeft, canEnrollTrial, validateTrialSessionChange,
} from "./classRules.js";
import { requireReason } from "./rules.js";

test("hằng số và nhãn tiếng Việt của lớp trải nghiệm", () => {
  assert.deepEqual([...TRIAL_CLASS_STATUSES], ["open", "closed", "cancelled"]);
  assert.deepEqual([...TRIAL_SESSION_STATUSES], ["scheduled", "done", "cancelled"]);
  assert.deepEqual([...TRIAL_ENROLLMENT_STATUSES], ["enrolled", "withdrawn"]);
  assert.deepEqual([...TRIAL_ATTENDANCE_STATUSES], ["present", "absent", "late"]);
  assert.equal(TRIAL_CLASS_STATUS_VI.open, "Đang mở");
  for (const s of TRIAL_CLASS_STATUSES) assert.ok(TRIAL_CLASS_STATUS_VI[s].length > 0);
});

test("bỏ dấu, mã lớp và tên lớp tự đặt", () => {
  // bỏ dấu kiểm gián tiếp qua tên lớp tự đặt
  assert.equal(trialClassName({ centerCode: "CS1", courseCode: "Lớp trải nghiệm", seq: 3 }), "CS1-LOP TRAI NGHIEM-Lop trial 3");
  assert.equal(trialClassCode("cs2", 2026, 8), "TRIAL-CS2-26-008");
  assert.equal(trialClassCode("CS1", 2026, 123), "TRIAL-CS1-26-123");
  assert.equal(trialClassName({ centerCode: "CS2", courseCode: "SATA6", seq: 8 }), "CS2-SATA6-Lop trial 8");
  // Chưa chọn khoá trải nghiệm → bỏ phần khoá
  assert.equal(trialClassName({ centerCode: "CS1", courseCode: null, seq: 1 }), "CS1-Lop trial 1");
  assert.equal(trialClassName({ centerCode: "CS1", courseCode: "Cơ bản", seq: 2 }), "CS1-CO BAN-Lop trial 2");
});

test("số thứ tự mã lớp lấy theo max, bỏ qua mã khác cơ sở / khác năm", () => {
  const codes = ["TRIAL-CS2-26-001", "TRIAL-CS2-26-007", "TRIAL-CS1-26-020", "TRIAL-CS2-25-099", "CS2.SATA6.26.003", null];
  assert.equal(nextTrialClassSeq(codes, "CS2", 2026), 8);
  assert.equal(nextTrialClassSeq(codes, "CS1", 2026), 21);
  assert.equal(nextTrialClassSeq([], "CS3", 2026), 1);
});

test("thêm buổi: chỉ lớp đang mở, có trần số buổi", () => {
  assert.deepEqual(canAddTrialSession({ status: "open", sessionCount: 0 }), { ok: true, reason: "" });
  assert.equal(canAddTrialSession({ status: "open", sessionCount: TRIAL_CLASS_MAX_SESSIONS }).ok, false);
  assert.match(canAddTrialSession({ status: "open", sessionCount: 3, maxSessions: 3 }).reason, /tối đa 3 buổi/);
  assert.match(canAddTrialSession({ status: "cancelled", sessionCount: 0 }).reason, /đã huỷ/);
  assert.match(canAddTrialSession({ status: "closed", sessionCount: 0 }).reason, /đã đóng/);
});

test("xếp học viên: hết chỗ thì chặn, có quyền vượt sĩ số thì cho qua", () => {
  assert.equal(trialSeatsLeft({ capacity: 12, enrolled: 5 }), 7);
  assert.equal(trialSeatsLeft({ capacity: 12, enrolled: 15 }), 0);
  const okRes = canEnrollTrial({ capacity: 12, enrolled: 5, status: "open", sessionCount: 2 });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.overridden, false);
  const full = canEnrollTrial({ capacity: 12, enrolled: 12, status: "open", sessionCount: 2 });
  assert.equal(full.ok, false);
  assert.match(full.reason, /vượt sĩ số/);
  const forced = canEnrollTrial({ capacity: 12, enrolled: 12, override: true, status: "open", sessionCount: 2 });
  assert.equal(forced.ok, true);
  assert.equal(forced.overridden, true);
  assert.match(canEnrollTrial({ capacity: 12, enrolled: 0, status: "cancelled" }).reason, /Đã huỷ/);
  assert.match(canEnrollTrial({ capacity: 12, enrolled: 0, status: "closed" }).reason, /Đã đóng/);
  assert.match(canEnrollTrial({ capacity: 12, enrolled: 0, status: "open", sessionCount: 0 }).reason, /chưa có buổi/);
  // Không truyền status/sessionCount thì chỉ xét sĩ số
  assert.equal(canEnrollTrial({ capacity: 1, enrolled: 0 }).ok, true);
});

test("đổi lịch / huỷ buổi: chặn buổi đã qua, đã huỷ, đã dạy", () => {
  const now = "2026-09-18T10:00";
  assert.deepEqual(validateTrialSessionChange({ date: "2026-09-20", now, status: "scheduled" }), []);
  // Buổi hôm nay vẫn sửa được
  assert.deepEqual(validateTrialSessionChange({ date: "2026-09-18", now, status: "scheduled" }), []);
  assert.match(validateTrialSessionChange({ date: "2026-09-17", now, status: "scheduled" }).join(), /đã qua/);
  assert.match(validateTrialSessionChange({ date: "2026-09-20", now, status: "cancelled" }).join(), /đã huỷ/);
  assert.match(validateTrialSessionChange({ date: "2026-09-20", now, status: "done" }).join(), /đã dạy/);
  assert.match(validateTrialSessionChange({ date: "2026-09-20", now, status: "scheduled", newDate: "2026-09-01" }).join(), /lùi về quá khứ/);
  assert.equal(validateTrialSessionChange({ date: "2026-09-17", now, status: "cancelled" }).length, 2);
});

test("lý do đổi lịch / huỷ dùng lại requireReason", () => {
  assert.throws(() => requireReason("ok"), /lý do/);
  assert.equal(requireReason(" GV bận đột xuất "), "GV bận đột xuất");
});

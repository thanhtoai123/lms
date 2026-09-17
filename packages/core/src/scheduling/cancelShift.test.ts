import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planCancelShift, planReanchor, validatePhases, phasesToRules, checkScheduleDrift, scanSlots, orderInversions, planReflow,
  type ExistingSession,
} from "./replan.js";
import { generateSessions } from "./generateSessions.js";

// Lớp học Thứ 7 15:45 từ 05/09/2026, 6 buổi: 05/09, 12/09, 19/09, 26/09, 03/10, 10/10
const rules = [{ weekday: 6 as const, startTime: "15:45", endTime: "17:15", roomId: "r1", teacherId: "t1", effectiveFrom: "2026-08-01", effectiveTo: null }];
const TODAY = "2026-09-16";
const make = (): ExistingSession[] =>
  generateSessions({ classId: "c", startDate: "2026-09-05", totalSessions: 6, rules }).map((p) => ({
    id: `s${p.sequenceNo}`, sequenceNo: p.sequenceNo, date: p.date, startTime: `${p.startTime}:00`, endTime: `${p.endTime}:00`,
    status: p.date < TODAY ? "completed" : "scheduled", kind: "regular", roomId: p.roomId, teacherId: p.teacherId,
    hasAttendance: p.date < TODAY, hasContent: p.date < TODAY,
  }));

test("huỷ buổi có dời bù: buổi thay thế nhận ca kế tiếp, các buổi sau dời một nhịp, sinh ca cuối", () => {
  const r = planCancelShift({ sessions: make(), cancelledId: "s3", rules, today: TODAY });
  assert.deepEqual(r.errors, []);
  assert.equal(r.archiveSeq, 5001);
  assert.equal(r.replacement?.date, "2026-09-26");
  assert.deepEqual(r.moves.map((m) => [m.sequenceNo, m.from.date, m.to.date]), [
    [4, "2026-09-26", "2026-10-03"],
    [5, "2026-10-03", "2026-10-10"],
    [6, "2026-10-10", "2026-10-17"],
  ]);
  assert.ok(r.moves.every((m) => m.changed && m.to.startTime === "15:45" && m.to.roomId === "r1"));
  assert.equal(r.newEndDate, "2026-10-17");
  // ngày nghỉ: ca cuối bỏ qua 17/10
  assert.equal(planCancelShift({ sessions: make(), cancelledId: "s3", rules, today: TODAY, holidays: ["2026-10-17"] }).newEndDate, "2026-10-24");
});

test("huỷ buổi cuối / đã có số lưu trữ / buổi có dữ liệu không bị dời", () => {
  const last = planCancelShift({ sessions: make(), cancelledId: "s6", rules, today: TODAY });
  assert.equal(last.moves.length, 0);
  assert.equal(last.replacement?.date, "2026-10-17");
  const withArchive = [...make(), { ...make()[0]!, id: "old", sequenceNo: 5001, status: "cancelled" }];
  assert.equal(planCancelShift({ sessions: withArchive, cancelledId: "s4", rules, today: TODAY }).archiveSeq, 5002);
  const ss = make();
  ss[4] = { ...ss[4]!, hasContent: true }; // buổi 5 đã giao bài tập
  const r = planCancelShift({ sessions: ss, cancelledId: "s3", rules, today: TODAY });
  assert.equal(r.replacement?.date, "2026-09-26");
  assert.deepEqual(r.moves.map((m) => [m.sequenceNo, m.to.date]), [[4, "2026-10-10"], [6, "2026-10-17"]]);
  assert.ok(r.warnings.some((w) => w.includes("giữ nguyên")));
  assert.ok(r.warnings.some((w) => w.includes("không đúng thứ tự")));
});

test("huỷ buổi: chặn buổi đã điểm danh, buổi ngoài lộ trình, lớp chưa có lịch", () => {
  assert.match(planCancelShift({ sessions: make(), cancelledId: "s1", rules, today: TODAY }).errors.join(), /điểm danh|hoàn tất/);
  const extra = [...make(), { ...make()[5]!, id: "x", sequenceNo: 1001, kind: "coach_1_1" }];
  assert.match(planCancelShift({ sessions: extra, cancelledId: "x", rules, today: TODAY }).errors.join(), /ngoài lộ trình/);
  assert.match(planCancelShift({ sessions: make(), cancelledId: "s4", rules: [], today: TODAY }).errors.join(), /chưa có lịch/);
  assert.match(planCancelShift({ sessions: make(), cancelledId: "nope", rules, today: TODAY }).errors.join(), /Không tìm thấy/);
});

test("kiểm tra lịch sau khi huỷ: dời bù vẫn khớp, huỷ không bù chỉ cảnh báo", () => {
  const ss = make();
  const r = planCancelShift({ sessions: ss, cancelledId: "s3", rules, today: TODAY });
  const after: ExistingSession[] = [
    ...ss.map((s) => {
      if (s.id === "s3") return { ...s, sequenceNo: r.archiveSeq, status: "cancelled" };
      const m = r.moves.find((x) => x.sessionId === s.id);
      return m ? { ...s, date: m.to.date } : s;
    }),
    { ...ss[2]!, id: "s3b", date: r.replacement!.date },
  ];
  const ok = checkScheduleDrift({ startDate: "2026-09-05", totalSessions: 6, rules, sessions: after });
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  assert.equal(ok.anchor.mismatched, 0);
  const none = ss.map((s) => (s.id === "s3" ? { ...s, status: "cancelled" } : s));
  const w = checkScheduleDrift({ startDate: "2026-09-05", totalSessions: 6, rules, sessions: none });
  assert.ok(w.issues.every((i) => i.severity !== "error"), JSON.stringify(w.issues));
  assert.ok(w.issues.some((i) => i.code === "COUNT" && i.severity === "warning"));
  assert.ok(!w.issues.some((i) => i.code === "SEQ_GAP"));
});

test("neo sai ngày khai giảng được phát hiện và xếp lại cả dãy (giữ buổi có dữ liệu)", () => {
  // cả dãy lùi 1 tuần so với khai giảng 29/08
  const drift = checkScheduleDrift({ startDate: "2026-08-29", totalSessions: 6, rules, sessions: make() });
  const a = drift.issues.find((i) => i.code === "ANCHOR");
  assert.ok(a);
  assert.match(a.message, /Neo sai ngày khai giảng/);
  assert.equal(drift.anchor.expectedFirstDate, "2026-08-29");
  assert.equal(drift.anchor.mismatched, 6);

  const ss = make().map((s) => ({ ...s, status: "scheduled", hasAttendance: false, hasContent: false }));
  const r = planReanchor({ sessions: ss, rules, startDate: "2026-08-29", today: "2026-08-20" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.kept, 0);
  assert.deepEqual(r.changes.map((c) => c.to.date), ["2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03"]);
  assert.equal(r.newEndDate, "2026-10-03");

  // buổi 1–2 đã học (giữ nguyên) → buổi 3 không thể chen trước buổi 2
  const kept = planReanchor({ sessions: make(), rules, startDate: "2026-08-29", today: TODAY });
  assert.equal(kept.kept, 2);
  assert.deepEqual(kept.changes.map((c) => [c.sequenceNo, c.to.date]), [[3, "2026-09-19"], [4, "2026-09-26"], [5, "2026-10-03"], [6, "2026-10-10"]]);
  assert.ok(kept.changes.every((c) => !c.changed));
  assert.ok(kept.warnings.some((w) => w.includes("giữ nguyên")));
  assert.match(planReanchor({ sessions: make(), rules, startDate: null, today: TODAY }).errors.join(), /khai giảng/);
});

test("xếp lại theo lịch không lấy ca của buổi đã huỷ", () => {
  const ss = make().map((s) => ({ ...s, status: "scheduled", hasAttendance: false, hasContent: false }));
  ss[1] = { ...ss[1]!, status: "cancelled" }; // 12/09 huỷ không bù
  const r = planReanchor({ sessions: ss, rules, startDate: "2026-09-05", today: "2026-09-01" });
  assert.deepEqual(r.changes.map((c) => c.to.date), ["2026-09-05", "2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10"]);
  assert.ok(r.changes.every((c) => !c.changed));
});

test("áp lịch mới không dời buổi đã có nhận xét / bài tập / ảnh", () => {
  const ss = make();
  ss[3] = { ...ss[3]!, hasContent: true };
  const r = planReflow({ sessions: ss, rules: [{ ...rules[0]!, weekday: 7, effectiveFrom: "2026-09-17" }], fromDate: "2026-09-17", today: TODAY });
  assert.deepEqual(r.changes.map((c) => c.sequenceNo), [3, 5, 6]);
  assert.match(r.warnings.join(), /nhận xét, bài tập, ảnh/);
});

test("quét ca trống, thứ tự bài", () => {
  const s = scanSlots({ rules, from: "2026-09-19", afterTime: "15:45", count: 2, blocked: [{ date: "2026-09-26", startTime: "15:45:00" }] });
  assert.deepEqual(s.map((x) => x.date), ["2026-10-03", "2026-10-10"]);
  assert.equal(orderInversions([{ seq: 1, date: "2026-09-05", startTime: "15:45" }, { seq: 2, date: "2026-09-19", startTime: "15:45" }, { seq: 3, date: "2026-09-12", startTime: "15:45" }]), 1);
});

test("kế hoạch lịch nhiều giai đoạn", () => {
  const slot = { weekday: 2 as const, startTime: "18:00", endTime: "19:30", roomId: null, teacherId: null };
  const ok = [
    { from: "2026-07-01", to: "2026-07-31", slots: [slot, { ...slot, weekday: 5 as const }], note: "Hè 2 buổi/tuần" },
    { from: "2026-08-01", to: null, slots: [slot] },
  ];
  assert.deepEqual(validatePhases(ok, "2026-07-01"), []);
  assert.equal(phasesToRules(ok).length, 3);
  assert.equal(phasesToRules(ok)[2]!.effectiveTo, null);
  assert.match(validatePhases(ok, "2026-07-02").join(), /đúng ngày khai giảng/);
  assert.match(validatePhases([{ ...ok[0]!, to: null }, ok[1]!], "2026-07-01").join(), /chỉ giai đoạn cuối/);
  assert.match(validatePhases([ok[0]!, { ...ok[1]!, from: "2026-07-20" }], "2026-07-01").join(), /chồng/);
  assert.match(validatePhases([ok[0]!, { ...ok[1]!, from: "2026-08-05" }], "2026-07-01").join(), /ngay sau/);
  assert.match(validatePhases([ok[0]!, { ...ok[1]!, to: "2026-09-30" }], "2026-07-01").join(), /cuối phải để trống/);
  assert.match(validatePhases([{ ...ok[1]!, from: "2026-07-01", slots: [] }], "2026-07-01").join(), /Giai đoạn 1: Cần ít nhất một ca/);
  assert.match(validatePhases([], "2026-07-01").join(), /ít nhất một giai đoạn/);
  // sinh buổi theo 2 giai đoạn
  const g = generateSessions({ classId: "c", startDate: "2026-07-01", totalSessions: 12, rules: phasesToRules(ok) });
  assert.ok(g.filter((x) => x.date >= "2026-08-01").every((x) => x.startTime === "18:00"));
  assert.equal(g.filter((x) => x.date < "2026-08-01").length, 9);
});

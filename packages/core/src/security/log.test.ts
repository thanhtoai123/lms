import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_ERROR_MESSAGE,
  buildLogRecord,
  clientSafeMessage,
  createLogger,
  formatLogRecord,
  normalizeLogData,
  redactErrorForLog,
  scrubSql,
  type LogRecord,
} from "./log.js";

/** Lỗi giống hệt cái `postgres-js` ném ra: mang theo câu SQL và GIÁ TRỊ THAM SỐ */
function pgError() {
  const e = new Error('duplicate key value violates unique constraint "parents_phone_uq"') as Error & Record<string, unknown>;
  e.name = "PostgresError";
  e.code = "23505";
  e.constraint_name = "parents_phone_uq";
  e.detail = "Key (phone)=(0912345678) already exists.";
  e.query = 'insert into "parents" ("full_name","phone","email") values ($1,$2,$3) returning "id"';
  e.parameters = ["Nguyễn Văn An", "0912345678", "an.nguyen@example.com"];
  return e;
}

/* --------------------------- scrubSql --------------------------- */

test("câu truy vấn nguyên văn bị lược sạch", () => {
  const out = scrubSql('select "students"."full_name" from "students" where "students"."phone" = $1');
  assert.equal(out, "«câu truy vấn đã lược bỏ»");
  assert.ok(!out.includes("students"));
});

test("tên bảng / cột trong nháy kép bị thay bằng nhãn trung tính", () => {
  const out = scrubSql('cột "parents"."citizen_id" không tồn tại');
  assert.ok(!out.includes("citizen_id"), "vẫn lộ tên cột");
  assert.ok(out.includes("«cột»"));
});

test("mẫu Key (cột)=(giá trị) của Postgres bị xoá — nó lộ cả tên cột lẫn SĐT thật", () => {
  const out = scrubSql("Key (phone)=(0912345678) already exists.");
  assert.ok(!out.includes("0912345678"), "vẫn lộ số điện thoại");
  assert.ok(!out.includes("phone"));
});

test("câu tiếng Việt bình thường không bị cắt xén", () => {
  const msg = "Không thể xoá lớp đang có học viên đăng ký";
  assert.equal(scrubSql(msg), msg);
});

/* ----------------------- redactErrorForLog ---------------------- */

test("lỗi CSDL rút về phần an toàn: không còn câu SQL, không còn tham số", () => {
  const r = redactErrorForLog(pgError());
  const s = JSON.stringify(r);
  assert.ok(!s.includes("insert into"), "còn câu SQL");
  assert.ok(!s.includes("0912345678"), "còn số điện thoại");
  assert.ok(!s.includes("an.nguyen@example.com"), "còn email");
  assert.ok(!s.includes("Nguyễn Văn An"), "còn họ tên");
  // Giữ phần hữu ích cho vận hành
  assert.equal(r.code, "23505");
  assert.equal(r.constraint, "parents_phone_uq");
  assert.equal(r.name, "PostgresError");
});

test("chuỗi và giá trị lạ cũng xử lý được, không ném lỗi", () => {
  assert.equal(redactErrorForLog("Gọi 0912345678 để xác nhận").msg, "Gọi 09***78 để xác nhận");
  assert.equal(redactErrorForLog(null).name, "Unknown");
  assert.equal(redactErrorForLog(undefined).name, "Unknown");
});

/* ------------------------ buildLogRecord ------------------------ */

test("bản ghi log che SĐT / email lẫn trong câu chữ", () => {
  const r = buildLogRecord("error", "trpc", "gửi OTP tới 0912345678 (an.nguyen@example.com) thất bại", undefined, 0);
  assert.ok(!r.msg.includes("0912345678"));
  assert.ok(!r.msg.includes("an.nguyen@example.com"));
  assert.equal(r.msg, "gửi OTP tới 09***78 (a***@e.com) thất bại");
  assert.equal(r.time, "1970-01-01T00:00:00.000Z");
});

test("dữ liệu kèm theo cũng bị che theo tên trường", () => {
  const r = buildLogRecord("warn", "otp", "chặn", { phone: "0912345678", email: "an@example.com", cccd: "049301001234", rows: 12 }, 0);
  const d = r.data as Record<string, unknown>;
  assert.equal(d.phone, "09***78");
  assert.equal(d.email, "a***@e.com");
  assert.ok(!String(d.cccd).includes("049301001234"), "CCCD phải bị che");
  assert.equal(d.rows, 12, "số liệu không phải PII thì giữ nguyên");
});

test("lỗi đặt trong data cũng đi qua bộ lược, không in query/parameters", () => {
  const r = buildLogRecord("error", "trpc", "students.create", { err: pgError() }, 0);
  const s = formatLogRecord(r);
  assert.ok(!s.includes("insert into"));
  assert.ok(!s.includes("0912345678"));
  assert.ok(s.includes("23505"), "vẫn phải giữ mã lỗi để điều tra");
});

test("data rỗng thì không thêm khoá thừa; dữ liệu vòng lặp không làm vỡ ghi log", () => {
  assert.equal(buildLogRecord("info", "x", "y", {}, 0).data, undefined);
  const loop: Record<string, unknown> = { a: 1 };
  loop.self = loop;
  const line = formatLogRecord(buildLogRecord("info", "x", "y", loop, 0));
  assert.ok(line.includes("không tuần tự hoá được") || line.includes('"a"'));
});

test("normalizeLogData giữ nguyên hình dạng, chỉ đổi giá trị chuỗi", () => {
  const out = normalizeLogData({ list: [{ phone: "0912345678" }], n: 3 })!;
  assert.deepEqual(out, { list: [{ phone: "09***78" }], n: 3 });
});

/* --------------------------- logger ---------------------------- */

test("logger đẩy bản ghi đã che PII vào sink được tiêm", () => {
  const seen: LogRecord[] = [];
  const log = createLogger("api", (r) => seen.push(r));
  log.error("thất bại", { phone: "0912345678" });
  log.child("outbox").info("xong", { sent: 2 });
  assert.equal(seen.length, 2);
  assert.equal(seen[0]!.level, "error");
  assert.equal(seen[0]!.scope, "api");
  assert.equal((seen[0]!.data as Record<string, unknown>).phone, "09***78");
  assert.equal(seen[1]!.scope, "api:outbox");
  assert.equal(seen[1]!.level, "info");
});

/* --------------------- thông báo cho máy khách ------------------- */

test("lỗi CSDL không bao giờ chuyển nguyên văn ra máy khách", () => {
  assert.equal(clientSafeMessage(pgError()), GENERIC_ERROR_MESSAGE);
  assert.equal(clientSafeMessage(new Error('relation "students" does not exist')), GENERIC_ERROR_MESSAGE);
  assert.equal(clientSafeMessage(new Error('column "parents"."citizen_id" does not exist')), GENERIC_ERROR_MESSAGE);
  assert.equal(clientSafeMessage(new Error('select * from "orders" where "id" = $1')), GENERIC_ERROR_MESSAGE);
});

test("lỗi nghiệp vụ tiếng Việt giữ nguyên để người dùng còn biết đường sửa", () => {
  const msg = "Buổi học đã điểm danh, không thể đổi giáo viên";
  assert.equal(clientSafeMessage(new Error(msg)), msg);
  assert.equal(clientSafeMessage(new Error("Không kết nối được cơ sở dữ liệu. Hãy bật Docker Desktop rồi tải lại trang.")), "Không kết nối được cơ sở dữ liệu. Hãy bật Docker Desktop rồi tải lại trang.");
});

test("thông báo quá dài hoặc lỗi không rõ đều về câu chung", () => {
  assert.equal(clientSafeMessage(new Error("x".repeat(400))), GENERIC_ERROR_MESSAGE);
  assert.equal(clientSafeMessage(null), GENERIC_ERROR_MESSAGE);
  assert.equal(clientSafeMessage(new Error("")), GENERIC_ERROR_MESSAGE);
});

test("kiểm tra lặp lại cho cùng một lỗi luôn ra cùng kết quả (regex không giữ trạng thái)", () => {
  const e = new Error('column "x" does not exist');
  for (let i = 0; i < 5; i++) assert.equal(clientSafeMessage(e), GENERIC_ERROR_MESSAGE, `lần ${i + 1}`);
});

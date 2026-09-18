/**
 * Cấu hình dùng chung chọn theo trung tâm (mẫu email, danh mục loại thông báo)
 * và luật RLS ở tầng CSDL — kiểm thử thuần, không chạm Postgres.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickForTenant, catalogForTenant, hasPerTenantConfig,
  tenantSessionValue, parseTenantSession, rlsSessionFrom, rlsAllowsRow,
} from "./tenant.js";

const SATA = "t-sata";
const FR = "t-fr1";

/* ------------------------------------------------------------------ */
/* Chọn cấu hình theo trung tâm                                        */
/* ------------------------------------------------------------------ */

type Row = { tenantId: string | null; eventKey: string; subject: string };
const rows: Row[] = [
  { tenantId: SATA, eventKey: "ORDER_CREATED", subject: "Chuỗi: đơn hàng mới" },
  { tenantId: FR, eventKey: "ORDER_CREATED", subject: "Huế: đơn hàng mới" },
  { tenantId: null, eventKey: "ORDER_CREATED", subject: "Dùng chung" },
];

test("mỗi trung tâm lấy đúng mẫu của mình", () => {
  assert.equal(pickForTenant(rows, SATA, SATA)?.subject, "Chuỗi: đơn hàng mới");
  assert.equal(pickForTenant(rows, FR, SATA)?.subject, "Huế: đơn hàng mới");
});

test("trung tâm chưa khai mẫu thì rơi về mẫu của trung tâm mặc định", () => {
  assert.equal(pickForTenant(rows, "t-moi", SATA)?.subject, "Chuỗi: đơn hàng mới");
  assert.equal(pickForTenant(rows, null, SATA)?.subject, "Chuỗi: đơn hàng mới");
});

test("không biết trung tâm mặc định thì lấy dòng dùng chung (dữ liệu di sản)", () => {
  assert.equal(pickForTenant(rows, null, null)?.subject, "Dùng chung");
  assert.equal(pickForTenant(rows, "t-moi")?.subject, "Dùng chung");
});

test("chỉ có một dòng của chuỗi: hệ thống một-tenant chạy y như trước", () => {
  const only: Row[] = [{ tenantId: SATA, eventKey: "ORDER_CREATED", subject: "Chuỗi" }];
  assert.equal(pickForTenant(only, SATA, SATA)?.subject, "Chuỗi");
  assert.equal(pickForTenant(only, null, null)?.subject, "Chuỗi", "không có dòng dùng chung thì lấy dòng còn lại");
  assert.equal(pickForTenant([], SATA, SATA), null);
});

test("bên nhượng quyền KHÔNG đè được mẫu của chuỗi", () => {
  const sata = pickForTenant(rows, SATA, SATA);
  const fr = pickForTenant(rows, FR, SATA);
  assert.notEqual(sata?.subject, fr?.subject);
  assert.equal(sata?.tenantId, SATA);
});

/* ------------------------------------------------------------------ */
/* Danh mục loại thông báo: khoá theo (tenantId, mã)                   */
/* ------------------------------------------------------------------ */

type Catalog = { tenantId: string | null; prefix: string; pushEnabled: boolean };
const catalog: Catalog[] = [
  { tenantId: SATA, prefix: "lead.moi", pushEnabled: true },
  { tenantId: FR, prefix: "lead.moi", pushEnabled: false },
  { tenantId: SATA, prefix: "payment.decided", pushEnabled: true },
];

test("danh mục của mỗi trung tâm độc lập — công tắc đẩy của bên nhượng quyền có hiệu lực", () => {
  const ofSata = catalogForTenant(catalog, (r) => r.prefix, SATA, SATA);
  const ofFr = catalogForTenant(catalog, (r) => r.prefix, FR, SATA);
  assert.equal(ofSata.get("lead.moi")?.pushEnabled, true);
  assert.equal(ofFr.get("lead.moi")?.pushEnabled, false, "trung tâm nhượng quyền tắt đẩy thì phải tắt thật");
  // Mã trung tâm nhượng quyền chưa khai → dự phòng về cấu hình của chuỗi
  assert.equal(ofFr.get("payment.decided")?.pushEnabled, true);
});

test("không truyền tenant thì dùng cấu hình của trung tâm mặc định", () => {
  const m = catalogForTenant(catalog, (r) => r.prefix, null, SATA);
  assert.equal(m.get("lead.moi")?.tenantId, SATA);
  assert.equal(m.size, 2);
});

test("hasPerTenantConfig: chỉ tra tenant người nhận khi thật sự cần", () => {
  assert.equal(hasPerTenantConfig(catalog, SATA), true);
  assert.equal(hasPerTenantConfig(catalog.filter((r) => r.tenantId === SATA), SATA), false, "một-tenant thì không cần tra");
  assert.equal(hasPerTenantConfig([{ tenantId: null, prefix: "x", pushEnabled: true }], SATA), false);
  assert.equal(hasPerTenantConfig([], SATA), false);
});

/* ------------------------------------------------------------------ */
/* RLS: biến phiên app.tenant_ids / app.bypass_rls                     */
/* ------------------------------------------------------------------ */

test("ghép và đọc ngược biến phiên", () => {
  assert.equal(tenantSessionValue([SATA, FR]), `${SATA},${FR}`);
  assert.equal(tenantSessionValue([SATA, SATA, null, undefined, " "]), SATA, "bỏ trùng và phần tử rỗng");
  assert.equal(tenantSessionValue([]), "");
  assert.deepEqual(parseTenantSession(`${SATA}, ${FR}`), [SATA, FR]);
  assert.deepEqual(parseTenantSession(""), []);
  assert.deepEqual(parseTenantSession(null), []);
});

test("cờ bỏ qua RLS nhận đúng các cách viết", () => {
  for (const v of ["on", "ON", "true", "1", "yes"]) assert.equal(rlsSessionFrom("", v).bypass, true, v);
  for (const v of ["off", "false", "0", "", null, undefined]) assert.equal(rlsSessionFrom("", v).bypass, false, String(v));
});

test("luật RLS: đúng phạm vi thì cho, khác trung tâm thì chặn", () => {
  const s = rlsSessionFrom(`${SATA},${FR}`);
  assert.equal(rlsAllowsRow(SATA, s), true);
  assert.equal(rlsAllowsRow(FR, s), true);
  assert.equal(rlsAllowsRow("t-khac", s), false);
});

test("luật RLS: dòng chưa gắn tenant (dữ liệu di sản) vẫn đọc được", () => {
  const s = rlsSessionFrom(SATA);
  assert.equal(rlsAllowsRow(null, s), true);
  assert.equal(rlsAllowsRow(undefined, s), true);
  assert.equal(rlsAllowsRow("", s), true);
});

test("luật RLS: chưa đặt biến phiên thì CHẶN — mặc định an toàn", () => {
  const s = rlsSessionFrom(null);
  assert.equal(rlsAllowsRow(SATA, s), false);
  assert.equal(rlsAllowsRow(FR, s), false);
  assert.equal(rlsAllowsRow(null, s), true, "dòng di sản không bị chặn");
});

test("luật RLS: lệnh quản trị (migrate, seed, nhân bản, worker) đi qua được", () => {
  const s = rlsSessionFrom("", "on");
  assert.equal(rlsAllowsRow(SATA, s), true);
  assert.equal(rlsAllowsRow("t-khac", s), true);
});

test("một tenant SATA: mọi dòng đều qua được, hành vi không đổi", () => {
  const s = rlsSessionFrom(tenantSessionValue([SATA]));
  for (const row of [SATA, null, undefined]) assert.equal(rlsAllowsRow(row, s), true);
});

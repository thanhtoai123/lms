import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TENANT_TYPES, TENANT_TYPE_VI, TENANT_STATUSES, TENANT_STATUS_VI, TENANT_SETTING_VI,
  tenantOf, sameTenant, tenantScope, canAccessTenant, assertSameTenant, assertTenantScope,
  isHeadOfficeActor, isSuperAdminActor, defaultTenantSettings, withSettingsDefaults, validateTenantSettings,
  canSeePii, canSeeFinanceDetail, redactForActor, assertFinanceDetail,
  canTransferAcrossTenant, assertTransferAllowed, validateTenantCode, TenantIsolationError,
  DEFAULT_TENANT_CODE, type TenantActor, type TenantRef,
} from "./tenant.js";
import type { Role } from "../policy/policy.js";

/* Dàn cảnh: chuỗi có 2 tenant OWNED (SATA, SATA2) và 2 tenant nhượng quyền (FR1, FR2) */
const T = {
  sata: { id: "t-sata", code: "SATA", name: "Sata Robo", type: "OWNED", status: "active" } as TenantRef,
  sata2: { id: "t-sata2", code: "SATA2", name: "Sata Robo Hà Nội", type: "OWNED", status: "active" } as TenantRef,
  fr1: { id: "t-fr1", code: "FR1", name: "Sata Robo Huế (NQ)", type: "FRANCHISE", status: "active" } as TenantRef,
  fr2: { id: "t-fr2", code: "FR2", name: "Sata Robo Vinh (NQ)", type: "FRANCHISE", status: "closed" } as TenantRef,
};
const ALL: TenantRef[] = [T.sata, T.sata2, T.fr1, T.fr2];

const actor = (tenantId: string | null, roles: [Role, string | null][]): TenantActor => ({
  userId: "u1",
  tenantId,
  assignments: roles.map(([role, centerId]) => ({ role, centerId })),
});

const superAdmin = actor(T.sata.id, [["SUPER_ADMIN", null]]);
const hoAccountant = actor(T.sata.id, [["HO_ACCOUNTANT", null]]);
const centerManager = actor(T.sata.id, [["CENTER_MANAGER", "cs1"]]);
const frAdmin = actor(T.fr1.id, [["SUPER_ADMIN", null]]);
const frManager = actor(T.fr1.id, [["CENTER_MANAGER", "cs-fr1"]]);

test("danh mục loại / trạng thái tenant có nhãn tiếng Việt", () => {
  assert.deepEqual([...TENANT_TYPES], ["OWNED", "FRANCHISE"]);
  for (const t of TENANT_TYPES) assert.ok(TENANT_TYPE_VI[t].length > 3);
  for (const s of TENANT_STATUSES) assert.ok(TENANT_STATUS_VI[s].length > 3);
  assert.equal(TENANT_TYPE_VI.FRANCHISE, "Nhượng quyền");
  assert.equal(DEFAULT_TENANT_CODE, "SATA");
});

test("tenantOf đọc được từ chuỗi, bản ghi và actor", () => {
  assert.equal(tenantOf("t-sata"), "t-sata");
  assert.equal(tenantOf({ tenantId: "t-fr1" }), "t-fr1");
  assert.equal(tenantOf(superAdmin), T.sata.id);
  assert.equal(tenantOf(null), null);
  assert.equal(tenantOf(undefined), null);
  assert.equal(tenantOf({ tenantId: null }), null);
  assert.equal(tenantOf("  "), null);
});

test("sameTenant: null không cùng tenant với bất kỳ ai", () => {
  assert.ok(sameTenant(superAdmin, { tenantId: T.sata.id }));
  assert.ok(!sameTenant(superAdmin, { tenantId: T.fr1.id }));
  assert.ok(!sameTenant({ tenantId: null }, { tenantId: null }));
  assert.ok(sameTenant("t-fr1", "t-fr1"));
});

test("Hội sở của tenant OWNED thấy mọi tenant OWNED, không thấy tenant nhượng quyền", () => {
  const scope = tenantScope(hoAccountant, ALL);
  assert.deepEqual(scope.sort(), [T.sata.id, T.sata2.id].sort());
  assert.ok(!scope.includes(T.fr1.id));
});

test("SUPER_ADMIN của chuỗi thấy cả tenant nhượng quyền (trừ tenant đã đóng)", () => {
  const scope = tenantScope(superAdmin, ALL);
  assert.deepEqual(scope.sort(), [T.sata.id, T.sata2.id, T.fr1.id].sort());
  assert.ok(!scope.includes(T.fr2.id), "tenant đã đóng không nằm trong phạm vi đọc dữ liệu");
});

test("actor thuộc tenant nhượng quyền CHỈ thấy tenant của mình, kể cả khi là SUPER_ADMIN", () => {
  assert.deepEqual(tenantScope(frAdmin, ALL), [T.fr1.id]);
  assert.deepEqual(tenantScope(frManager, ALL), [T.fr1.id]);
});

test("actor gắn cơ sở của chuỗi chỉ thấy tenant của mình", () => {
  assert.deepEqual(tenantScope(centerManager, ALL), [T.sata.id]);
});

test("tenantScope: actor chưa gắn tenant thì không thấy gì; tenant lạ thì khoá về chính nó", () => {
  assert.deepEqual(tenantScope(actor(null, [["SUPER_ADMIN", null]]), ALL), []);
  assert.deepEqual(tenantScope(actor("t-la", [["SUPER_ADMIN", null]]), ALL), ["t-la"]);
  // không truyền danh sách tenant → vẫn chỉ thấy chính mình
  assert.deepEqual(tenantScope(superAdmin), [T.sata.id]);
});

test("isHeadOfficeActor / isSuperAdminActor", () => {
  assert.ok(isHeadOfficeActor(hoAccountant));
  assert.ok(!isHeadOfficeActor(centerManager));
  assert.ok(isSuperAdminActor(frAdmin));
  assert.ok(!isSuperAdminActor(hoAccountant));
});

test("canAccessTenant theo phạm vi; dữ liệu chưa gắn tenant không bị chặn", () => {
  assert.ok(canAccessTenant(hoAccountant, T.sata2.id, ALL));
  assert.ok(!canAccessTenant(hoAccountant, T.fr1.id, ALL));
  assert.ok(canAccessTenant(frAdmin, T.fr1.id, ALL));
  assert.ok(!canAccessTenant(frAdmin, T.sata.id, ALL));
  assert.ok(canAccessTenant(frAdmin, null, ALL));
});

test("assertSameTenant ném lỗi tiếng Việt khi truy cập chéo", () => {
  assert.doesNotThrow(() => assertSameTenant(superAdmin, { tenantId: T.sata.id }));
  assert.throws(() => assertSameTenant(superAdmin, { tenantId: T.fr1.id }, "Học viên"), (e: Error) => {
    assert.ok(e instanceof TenantIsolationError);
    assert.match(e.message, /Học viên thuộc một trung tâm khác/);
    assert.match(e.message, /cách ly/);
    return true;
  });
  // bản ghi di sản chưa gắn tenant → không chặn (tenant mặc định chạy y như cũ)
  assert.doesNotThrow(() => assertSameTenant(superAdmin, { tenantId: null }));
  assert.doesNotThrow(() => assertSameTenant({ tenantId: null }, { tenantId: T.fr1.id }));
});

test("assertTenantScope dùng phạm vi đã tính sẵn", () => {
  const scope = tenantScope(superAdmin, ALL);
  assert.doesNotThrow(() => assertTenantScope(scope, { tenantId: T.fr1.id }));
  assert.throws(() => assertTenantScope(scope, { tenantId: T.fr2.id }, "Phiếu thu"), /Phiếu thu thuộc một trung tâm khác/);
  assert.doesNotThrow(() => assertTenantScope(scope, null));
});

test("cấu hình mặc định: OWNED mở, FRANCHISE đóng", () => {
  const owned = defaultTenantSettings("OWNED");
  assert.deepEqual(owned, { hoSeesPii: true, hoSeesFinanceDetail: true, dataRetentionYears: 10, allowCrossCenterTransfer: true });
  const fr = defaultTenantSettings("FRANCHISE");
  assert.equal(fr.hoSeesPii, false);
  assert.equal(fr.hoSeesFinanceDetail, false);
  assert.equal(fr.allowCrossCenterTransfer, false);
  assert.equal(fr.dataRetentionYears, 5);
});

test("withSettingsDefaults điền khuyết; validateTenantSettings canh số năm", () => {
  assert.deepEqual(withSettingsDefaults("FRANCHISE", { hoSeesPii: true }), {
    hoSeesPii: true, hoSeesFinanceDetail: false, dataRetentionYears: 5, allowCrossCenterTransfer: false,
  });
  assert.deepEqual(withSettingsDefaults("OWNED", null), defaultTenantSettings("OWNED"));
  assert.equal(validateTenantSettings({ dataRetentionYears: 5 }), null);
  assert.ok(validateTenantSettings({ dataRetentionYears: 0 }));
  assert.ok(validateTenantSettings({ dataRetentionYears: 21 }));
  assert.ok(validateTenantSettings({ dataRetentionYears: 2.5 }));
  for (const k of Object.keys(TENANT_SETTING_VI) as (keyof typeof TENANT_SETTING_VI)[]) {
    assert.ok(TENANT_SETTING_VI[k].label.length > 5 && TENANT_SETTING_VI[k].desc.length > 20);
  }
});

test("hoSeesPii=false: người ngoài tenant không được xem PII, người trong tenant thì được", () => {
  const s = defaultTenantSettings("FRANCHISE");
  assert.ok(!canSeePii(superAdmin, T.fr1, s));
  assert.ok(canSeePii(frAdmin, T.fr1, s));
  assert.ok(canSeePii(superAdmin, T.fr1, { ...s, hoSeesPii: true }));
  // tenant OWNED khác vẫn mở vì mặc định hoSeesPii = true
  assert.ok(canSeePii(hoAccountant, T.sata2, defaultTenantSettings("OWNED")));
});

test("redactForActor che họ tên / SĐT / email / địa chỉ khi hoSeesPii=false", () => {
  const s = defaultTenantSettings("FRANCHISE");
  const row = {
    studentName: "Nguyễn Văn An",
    phone: "0912345678",
    email: "an.nguyen@gmail.com",
    address: "211 Nguyễn Hữu Thọ, Hải Châu, Đà Nẵng",
    revenue: 48000000,
    note: "Gọi lại số 0987654321",
  };
  const masked = redactForActor(row, superAdmin, T.fr1, s);
  assert.equal(masked.studentName, "Nguyễn V. A.");
  assert.equal(masked.phone, "0912****78");
  assert.equal(masked.email, "a***@gmail.com");
  assert.equal(masked.address, "Hải Châu, Đà Nẵng");
  assert.equal(masked.revenue, 48000000, "số liệu tổng hợp vẫn giữ nguyên");
  assert.equal(masked.note, "Gọi lại số 0987****21");
  // trong tenant thì nguyên vẹn, và không sửa đối tượng gốc
  assert.deepEqual(redactForActor(row, frAdmin, T.fr1, s), row);
  assert.equal(row.phone, "0912345678");
});

test("hoSeesFinanceDetail=false: chặn xem chi tiết, chỉ còn tổng hợp", () => {
  const s = defaultTenantSettings("FRANCHISE");
  assert.ok(!canSeeFinanceDetail(superAdmin, T.fr1, s));
  assert.ok(canSeeFinanceDetail(frManager, T.fr1, s));
  assert.throws(() => assertFinanceDetail(superAdmin, T.fr1, s), (e: Error) => {
    assert.ok(e instanceof TenantIsolationError);
    assert.match(e.message, /tổng hợp/);
    return true;
  });
  assert.doesNotThrow(() => assertFinanceDetail(superAdmin, T.fr1, { ...s, hoSeesFinanceDetail: true }));
});

test("allowCrossCenterTransfer=false chặn chuyển học viên sang tenant khác", () => {
  const fr = defaultTenantSettings("FRANCHISE");
  const owned = defaultTenantSettings("OWNED");
  // cùng tenant: luôn được, kể cả khi công tắc tắt
  assert.equal(canTransferAcrossTenant({ from: T.fr1.id, to: T.fr1.id, fromSettings: fr }), null);
  // khác tenant, nguồn chặn
  assert.match(canTransferAcrossTenant({ from: T.fr1.id, to: T.sata.id, fromSettings: fr }) ?? "", /Trung tâm nguồn không cho phép chuyển học viên/);
  // khác tenant, nguồn mở nhưng đích chặn
  assert.match(
    canTransferAcrossTenant({ from: T.sata.id, to: T.fr1.id, fromSettings: owned, toSettings: fr, what: "lead" }) ?? "",
    /Trung tâm nhận không cho phép nhận lead/,
  );
  // hai bên cùng mở
  assert.equal(canTransferAcrossTenant({ from: T.sata.id, to: T.sata2.id, fromSettings: owned, toSettings: owned }), null);
  // dữ liệu chưa gắn tenant thì không chặn
  assert.equal(canTransferAcrossTenant({ from: null, to: T.fr1.id, fromSettings: fr }), null);
  assert.throws(() => assertTransferAllowed({ from: T.fr1.id, to: T.sata.id, fromSettings: fr }), TenantIsolationError);
});

test("validateTenantCode", () => {
  assert.equal(validateTenantCode("SATA"), null);
  assert.equal(validateTenantCode("FR_HUE1"), null);
  assert.ok(validateTenantCode("a"));
  assert.ok(validateTenantCode("fr1"));
  assert.ok(validateTenantCode("1FR"));
  assert.ok(validateTenantCode("QUA_DAI_QUA_DAI"));
});

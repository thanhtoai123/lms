import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPath, pathSegment, isUnderPath, validateUnitCode, recomputeSubtreePaths, canDeleteUnit, visibleUnitIds,
  assertImmutable, flattenTree, OrgTreeError, ORG_UNIT_TYPES, ORG_UNIT_TYPE_VI, ORG_RELATIONSHIPS, ORG_RELATIONSHIP_VI,
  type OrgUnitNode,
} from "./tree.js";

const u = (id: string, code: string, type: OrgUnitNode["type"], parentId: string | null, path: string, status: "active" | "inactive" = "active"): OrgUnitNode =>
  ({ id, code, type, parentId, path, status });

/** Cây mẫu: root → ho → khoi-dn → cs1 → diem-a */
function sample(): OrgUnitNode[] {
  return [
    u("r", "ROOT", "root", null, "/root"),
    u("h", "HO", "ho", "r", "/root/ho"),
    u("k", "KHOI-DN", "region", "h", "/root/ho/khoi-dn"),
    u("c1", "CS1", "center", "k", "/root/ho/khoi-dn/cs1"),
    u("c2", "CS2", "center", "k", "/root/ho/khoi-dn/cs2"),
    u("s1", "DIEM-A", "site", "c1", "/root/ho/khoi-dn/cs1/diem-a"),
    u("k2", "KHOI-HN", "region", "h", "/root/ho/khoi-hn"),
  ];
}

test("danh mục loại đơn vị & quan hệ có đủ nhãn tiếng Việt", () => {
  assert.equal(ORG_UNIT_TYPES.length, 8);
  for (const t of ORG_UNIT_TYPES) assert.ok(ORG_UNIT_TYPE_VI[t].length > 2);
  assert.deepEqual([...ORG_RELATIONSHIPS], ["owned", "franchise", "affiliate"]);
  assert.equal(ORG_RELATIONSHIP_VI.franchise, "Nhượng quyền");
});

test("pathSegment bỏ dấu và ký tự lạ", () => {
  assert.equal(pathSegment("CS1"), "cs1");
  assert.equal(pathSegment("Khối Đà Nẵng"), "khoi-da-nang");
  assert.throws(() => pathSegment("---"), OrgTreeError);
});

test("buildPath nối theo cha", () => {
  assert.equal(buildPath(null, "ROOT"), "/root");
  assert.equal(buildPath("/root", "HO"), "/root/ho");
  assert.equal(buildPath("/root/ho/", "KHOI-DN"), "/root/ho/khoi-dn");
  assert.equal(buildPath("/root/ho/khoi-dn", "CS1"), "/root/ho/khoi-dn/cs1");
});

test("isUnderPath không nhầm tiền tố", () => {
  assert.ok(isUnderPath("/root/ho/cs1", "/root/ho"));
  assert.ok(isUnderPath("/root/ho", "/root/ho"));
  assert.ok(!isUnderPath("/root/hoa", "/root/ho"));
  assert.ok(!isUnderPath("/root", "/root/ho"));
});

test("validateUnitCode", () => {
  assert.equal(validateUnitCode("CS1"), null);
  assert.equal(validateUnitCode("KHOI_DN-2"), null);
  assert.ok(validateUnitCode("A"));
  assert.ok(validateUnitCode("Khối DN"));
});

test("đổi cha tính lại path CẢ NHÁNH CON", () => {
  const changes = recomputeSubtreePaths(sample(), "c1", "k2");
  assert.deepEqual(changes.map((c) => [c.id, c.to]), [
    ["c1", "/root/ho/khoi-hn/cs1"],
    ["s1", "/root/ho/khoi-hn/cs1/diem-a"],
  ]);
  assert.equal(changes[0]!.parentId, "k2");
  assert.equal(changes[0]!.from, "/root/ho/khoi-dn/cs1");
  // nút con giữ nguyên parentId của nó
  assert.equal(changes[1]!.parentId, "c1");
});

test("đổi cha: chặn vòng lặp và cha không hợp lệ", () => {
  assert.throws(() => recomputeSubtreePaths(sample(), "k", "c1"), /nhánh con của chính nó/);
  assert.throws(() => recomputeSubtreePaths(sample(), "k", "k"), /chính nó/);
  assert.throws(() => recomputeSubtreePaths(sample(), "c1", "s1"), OrgTreeError);
  assert.throws(() => recomputeSubtreePaths(sample(), "c1", null), /gốc cây/);
  assert.throws(() => recomputeSubtreePaths(sample(), "zzz", "k"), /Không tìm thấy đơn vị/);
});

test("đổi cha: chặn trùng mã trong cùng đơn vị cha", () => {
  const nodes = [...sample(), u("c3", "CS1", "center", "k2", "/root/ho/khoi-hn/cs1")];
  assert.throws(() => recomputeSubtreePaths(nodes, "c1", "k2"), /đã có đơn vị mã CS1/);
});

test("đổi cha về đúng chỗ cũ thì không có thay đổi nào", () => {
  assert.deepEqual(recomputeSubtreePaths(sample(), "c1", "k"), []);
});

test("canDeleteUnit: còn đơn vị con đang hoạt động thì không xoá", () => {
  assert.match(canDeleteUnit({ type: "region", code: "KHOI-DN" }, [{ status: "active", code: "CS1" }]) ?? "", /đang hoạt động/);
  assert.equal(canDeleteUnit({ type: "region", code: "KHOI-DN" }, [{ status: "inactive", code: "CS1" }]), null);
  assert.equal(canDeleteUnit({ type: "center", code: "CS9" }, []), null);
  assert.match(canDeleteUnit({ type: "root", code: "ROOT" }, []) ?? "", /gốc hệ thống/);
});

test("visibleUnitIds: thấy chính mình và nhánh dưới, bỏ đơn vị ngừng hoạt động", () => {
  const nodes = sample().map((n) => (n.id === "s1" ? { ...n, status: "inactive" as const } : n));
  assert.deepEqual(visibleUnitIds("/root/ho/khoi-dn", nodes).sort(), ["c1", "c2", "k"].sort());
  assert.deepEqual(visibleUnitIds("/root/ho/khoi-dn/cs1", nodes), ["c1"]);
  assert.deepEqual(visibleUnitIds(null, nodes), []);
  assert.equal(visibleUnitIds("/root", sample()).length, 7);
});

test("assertImmutable: mã và loại không đổi được", () => {
  const before = { code: "CS1", type: "center" as const };
  assert.throws(() => assertImmutable(before, { code: "CS2" }), /Mã đơn vị không đổi được/);
  assert.throws(() => assertImmutable(before, { type: "site" }), /Loại đơn vị không đổi được/);
  assert.doesNotThrow(() => assertImmutable(before, { code: "CS1", type: "center" }));
  assert.doesNotThrow(() => assertImmutable(before, {}));
});

test("flattenTree cho độ sâu để thụt đầu dòng", () => {
  const items = flattenTree(sample());
  assert.equal(items[0]!.node.id, "r");
  assert.equal(items[0]!.depth, 0);
  assert.equal(items.find((i) => i.node.id === "s1")!.depth, 4);
});

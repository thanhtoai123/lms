/**
 * Cây tổ chức động (bản gốc /to-chuc): gốc hệ thống → hội sở / khối vùng → phòng ban → cơ sở → điểm dạy.
 *
 * Quy tắc bất biến của bản gốc:
 *  - `code` và `type` KHÔNG đổi được sau khi tạo;
 *  - đổi đơn vị cha thì `path` của CẢ NHÁNH CON phải tính lại (path quyết định ai thấy dữ liệu nào);
 *  - đơn vị còn đơn vị con **đang hoạt động** thì không xoá;
 *  - chỉ đơn vị **Đang hoạt động** được tính khi xét quyền.
 *
 * Toàn bộ file này là hàm thuần — không chạm CSDL.
 */

export class OrgTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgTreeError";
  }
}

export const ORG_UNIT_TYPES = ["root", "ho", "region", "department", "center", "site", "partner", "franchise_legacy"] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const ORG_UNIT_TYPE_VI: Record<OrgUnitType, string> = {
  root: "Gốc hệ thống",
  ho: "Hội sở",
  region: "Khối vùng",
  department: "Phòng ban",
  center: "Cơ sở",
  site: "Điểm dạy",
  partner: "Đối tác",
  franchise_legacy: "Nhượng quyền (loại cũ)",
};

export const ORG_RELATIONSHIPS = ["owned", "franchise", "affiliate"] as const;
export type OrgRelationship = (typeof ORG_RELATIONSHIPS)[number];

export const ORG_RELATIONSHIP_VI: Record<OrgRelationship, string> = {
  owned: "Sở hữu",
  franchise: "Nhượng quyền",
  affiliate: "Liên kết",
};

export const ORG_UNIT_STATUSES = ["active", "inactive"] as const;
export type OrgUnitStatus = (typeof ORG_UNIT_STATUSES)[number];
export const ORG_UNIT_STATUS_VI: Record<OrgUnitStatus, string> = { active: "Đang hoạt động", inactive: "Ngừng hoạt động" };

/** Loại nào được làm cha của loại nào (null = không có cha, tức là gốc) */
export const ORG_PARENT_TYPES: Record<OrgUnitType, readonly (OrgUnitType | null)[]> = {
  root: [null],
  ho: ["root"],
  region: ["root", "ho"],
  department: ["root", "ho", "region", "center"],
  center: ["root", "ho", "region"],
  site: ["center"],
  partner: ["root", "ho", "region"],
  franchise_legacy: ["root", "ho", "region"],
};

export interface OrgUnitNode {
  id: string;
  code: string;
  name?: string;
  type: OrgUnitType;
  parentId: string | null;
  path: string;
  status?: OrgUnitStatus;
}

/* ------------------------------------------------------------------ */
/* Đường dẫn                                                           */
/* ------------------------------------------------------------------ */

/** Một đoạn path: mã đơn vị viết thường, ký tự lạ thành "-" */
export function pathSegment(code: string): string {
  const s = code
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new OrgTreeError("Mã đơn vị phải có ít nhất một chữ hoặc số");
  return s;
}

/** `buildPath(null, "ROOT") = "/root"` · `buildPath("/root/ho", "CS1") = "/root/ho/cs1"` */
export function buildPath(parentPath: string | null, code: string): string {
  const seg = pathSegment(code);
  if (!parentPath) return `/${seg}`;
  const base = parentPath.endsWith("/") ? parentPath.slice(0, -1) : parentPath;
  if (!base.startsWith("/")) throw new OrgTreeError(`Đường dẫn cha không hợp lệ: ${parentPath}`);
  return `${base}/${seg}`;
}

/** "/root/ho" là tổ tiên (hoặc chính nó) của "/root/ho/cs1"; "/root/h" thì không */
export function isUnderPath(path: string, ancestorPath: string): boolean {
  if (!ancestorPath) return false;
  const a = ancestorPath.endsWith("/") ? ancestorPath.slice(0, -1) : ancestorPath;
  return path === a || path.startsWith(`${a}/`);
}

/** Mã đơn vị hợp lệ: 2–20 ký tự, chữ / số / gạch, không dấu */
export function validateUnitCode(code: string): string | null {
  const c = code.trim();
  if (c.length < 2 || c.length > 20) return "Mã đơn vị dài 2–20 ký tự";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(c)) return "Mã đơn vị chỉ gồm chữ không dấu, số, gạch ngang hoặc gạch dưới";
  return null;
}

/* ------------------------------------------------------------------ */
/* Đổi cha → tính lại path cả nhánh con                                */
/* ------------------------------------------------------------------ */

export interface PathChange {
  id: string;
  parentId: string | null;
  from: string;
  to: string;
}

/**
 * Đổi cha của `movedId` sang `newParentId` và tính lại path của chính nó + toàn bộ nhánh con.
 * Trả về danh sách thay đổi (chỉ những nút thật sự đổi path), thứ tự cha trước con.
 * Ném lỗi khi: không tìm thấy nút, đưa vào chính nó / nhánh con của nó, trùng mã trong cùng cha.
 */
export function recomputeSubtreePaths(nodes: readonly OrgUnitNode[], movedId: string, newParentId: string | null): PathChange[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const moved = byId.get(movedId);
  if (!moved) throw new OrgTreeError("Không tìm thấy đơn vị cần chuyển");
  const parent = newParentId ? byId.get(newParentId) : null;
  if (newParentId && !parent) throw new OrgTreeError("Không tìm thấy đơn vị cha mới");
  if (newParentId === movedId) throw new OrgTreeError("Không thể đặt đơn vị làm cha của chính nó");
  if (parent && isUnderPath(parent.path, moved.path)) throw new OrgTreeError("Không thể chuyển đơn vị vào nhánh con của chính nó");
  if (!newParentId && moved.type !== "root") throw new OrgTreeError(`Chỉ đơn vị loại "${ORG_UNIT_TYPE_VI.root}" mới được đứng ở gốc cây`);

  const allowed = ORG_PARENT_TYPES[moved.type];
  if (!allowed.includes(parent ? parent.type : null)) {
    throw new OrgTreeError(`${ORG_UNIT_TYPE_VI[moved.type]} không thể trực thuộc ${parent ? ORG_UNIT_TYPE_VI[parent.type] : "gốc cây"}`);
  }
  const dup = nodes.find((n) => n.id !== movedId && n.parentId === (newParentId ?? null) && pathSegment(n.code) === pathSegment(moved.code));
  if (dup) throw new OrgTreeError(`Đơn vị cha đã có đơn vị mã ${moved.code}`);

  const childrenOf = new Map<string, OrgUnitNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }

  const out: PathChange[] = [];
  const walk = (node: OrgUnitNode, parentPath: string | null, parentIdOf: string | null) => {
    const to = buildPath(parentPath, node.code);
    if (to !== node.path || parentIdOf !== node.parentId) out.push({ id: node.id, parentId: parentIdOf, from: node.path, to });
    for (const c of childrenOf.get(node.id) ?? []) walk(c, to, node.id);
  };
  walk(moved, parent ? parent.path : null, newParentId ?? null);
  return out;
}

/* ------------------------------------------------------------------ */
/* Xoá mềm                                                             */
/* ------------------------------------------------------------------ */

/** null = xoá được; chuỗi = lý do không xoá được */
export function canDeleteUnit(node: Pick<OrgUnitNode, "type" | "code">, children: readonly Pick<OrgUnitNode, "status" | "code">[]): string | null {
  if (node.type === "root") return "Không xoá được đơn vị gốc hệ thống";
  const alive = children.filter((c) => (c.status ?? "active") === "active");
  if (alive.length) return `Đơn vị còn ${alive.length} đơn vị con đang hoạt động (${alive.slice(0, 3).map((c) => c.code).join(", ")}${alive.length > 3 ? "…" : ""}) — chuyển hoặc ngừng hoạt động các đơn vị con trước`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Phạm vi nhìn thấy                                                   */
/* ------------------------------------------------------------------ */

/**
 * Người ở đơn vị có path `actorPath` thấy chính mình và toàn bộ nhánh dưới.
 * Chỉ tính đơn vị đang hoạt động (bản gốc: "Chỉ đơn vị Đang hoạt động được tính khi xét quyền").
 * `actorPath` rỗng / null = không giới hạn theo cây (dùng quyền vai trò như cũ) → trả về rỗng.
 */
export function visibleUnitIds(actorPath: string | null | undefined, nodes: readonly OrgUnitNode[]): string[] {
  if (!actorPath) return [];
  return nodes.filter((n) => (n.status ?? "active") === "active" && isUnderPath(n.path, actorPath)).map((n) => n.id);
}

/* ------------------------------------------------------------------ */
/* Bất biến sau khi tạo                                                */
/* ------------------------------------------------------------------ */

export interface OrgUnitImmutable {
  code: string;
  type: OrgUnitType;
}

/** Mã và loại đơn vị không đổi được sau khi tạo — ném OrgTreeError nếu cố đổi */
export function assertImmutable(before: OrgUnitImmutable, after: Partial<OrgUnitImmutable>): void {
  if (after.code !== undefined && after.code.trim() !== before.code) {
    throw new OrgTreeError(`Mã đơn vị không đổi được sau khi tạo (${before.code})`);
  }
  if (after.type !== undefined && after.type !== before.type) {
    throw new OrgTreeError(`Loại đơn vị không đổi được sau khi tạo (${ORG_UNIT_TYPE_VI[before.type]})`);
  }
}

/* ------------------------------------------------------------------ */
/* Tiện ích dựng cây để hiển thị                                       */
/* ------------------------------------------------------------------ */

export interface OrgTreeItem<T extends OrgUnitNode> {
  node: T;
  depth: number;
}

/** Duyệt cây theo thứ tự cha → con, sắp xếp theo path (đủ để vẽ cây phẳng có thụt đầu dòng) */
export function flattenTree<T extends OrgUnitNode>(nodes: readonly T[]): OrgTreeItem<T>[] {
  return [...nodes]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((node) => ({ node, depth: Math.max(0, node.path.split("/").filter(Boolean).length - 1) }));
}

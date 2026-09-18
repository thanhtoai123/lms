"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ORG_UNIT_TYPES, ORG_UNIT_TYPE_VI, ORG_RELATIONSHIPS, ORG_RELATIONSHIP_VI, ORG_UNIT_STATUSES, ORG_UNIT_STATUS_VI, type OrgUnitType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export type Unit = {
  id: string; code: string; name: string; type: OrgUnitType; typeLabel: string; parentId: string | null; path: string; depth: number;
  address: string | null; relationshipType: string; relationshipLabel: string; status: string; statusLabel: string;
  legalEntityId: string | null; legalEntityName: string | null; centerId: string | null; regionId: string | null;
  note: string | null; children: number; students: number; classes: number; staff: number;
};
export type LegalEntity = { id: string; legalName: string; taxCode: string; isActive: boolean };
type Center = { id: string; code: string; name: string };

const REASON_HINT = "Lý do thay đổi (bắt buộc, ≥ 5 ký tự — ghi vào nhật ký)";

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-lg space-y-3 p-4">
        <h3 className="font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Danh sách cha hợp lệ cho một loại đơn vị */
function parentOptions(units: Unit[], type: OrgUnitType, excludeId?: string) {
  const excluded = excludeId ? units.find((u) => u.id === excludeId) : null;
  return units.filter((u) => {
    if (u.id === excludeId) return false;
    // không cho chọn cha nằm trong nhánh con của chính nó
    if (excluded && (u.path === excluded.path || u.path.startsWith(`${excluded.path}/`))) return false;
    return ALLOWED[type].includes(u.type);
  });
}

const ALLOWED: Record<OrgUnitType, OrgUnitType[]> = {
  root: [],
  ho: ["root"],
  region: ["root", "ho"],
  department: ["root", "ho", "region", "center"],
  center: ["root", "ho", "region"],
  site: ["center"],
  partner: ["root", "ho", "region"],
  franchise_legacy: ["root", "ho", "region"],
};

export function SeedTree() {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("Dựng cây tổ chức lần đầu từ khu vực và cơ sở đang dùng");
  const m = useMutation(trpc.org.seedUnits.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="card space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ reason }); }}>
      <h3 className="font-semibold">Dựng cây từ dữ liệu đang có</h3>
      <p className="text-sm text-ink-600">Tạo <b>Gốc hệ thống → Hội sở → Khối vùng (từ khu vực) → Cơ sở (từ bảng cơ sở)</b>. Chạy lại được — chỉ thêm đơn vị còn thiếu, không đụng phân quyền theo cơ sở đang chạy.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_HINT} maxLength={300} required />
        <button className="btn-primary" disabled={m.isPending}>{m.isPending ? "Đang dựng…" : "Dựng cây"}</button>
      </div>
      {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
      {m.data && <p className="text-sm text-green-700">Đã tạo {m.data.created} đơn vị.</p>}
    </form>
  );
}

export function NewUnit({ units, entities, centers }: { units: Unit[]; entities: LegalEntity[]; centers: Center[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<OrgUnitType>("center");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [address, setAddress] = useState("");
  const [relationshipType, setRel] = useState<string>("owned");
  const [legalEntityId, setLegal] = useState("");
  const [centerId, setCenter] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.org.createUnit.mutationOptions({ onSuccess: () => { setOpen(false); setCode(""); setName(""); setReason(""); router.refresh(); } }));
  const parents = parentOptions(units, type);

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Thêm đơn vị</button>;
  return (
    <Modal title="Thêm đơn vị" onClose={() => setOpen(false)}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({
            code, name, type, parentId: parentId || null, address: address || null,
            relationshipType: relationshipType as "owned", legalEntityId: legalEntityId || null,
            centerId: type === "center" && centerId ? centerId : null, note: null, reason,
          });
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Loại đơn vị
            <select className="input mt-1 w-full" value={type} onChange={(e) => { setType(e.target.value as OrgUnitType); setParentId(""); }}>
              {ORG_UNIT_TYPES.filter((t) => t !== "root" || units.length === 0).map((t) => <option key={t} value={t}>{ORG_UNIT_TYPE_VI[t]}</option>)}
            </select>
          </label>
          <label className="text-sm">Đơn vị cha
            <select className="input mt-1 w-full" value={parentId} onChange={(e) => setParentId(e.target.value)} required={type !== "root"} disabled={type === "root"}>
              <option value="">{type === "root" ? "— Gốc cây —" : "— Chọn đơn vị cha —"}</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{"— ".repeat(p.depth)}{p.code} · {p.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Mã đơn vị <span className="text-ink-400">(không đổi được sau khi tạo)</span>
            <input className="input mt-1 w-full uppercase" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} required />
          </label>
          <label className="text-sm">Tên đơn vị<input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label>
          <label className="text-sm">Quan hệ
            <select className="input mt-1 w-full" value={relationshipType} onChange={(e) => setRel(e.target.value)}>
              {ORG_RELATIONSHIPS.map((r) => <option key={r} value={r}>{ORG_RELATIONSHIP_VI[r]}</option>)}
            </select>
          </label>
          <label className="text-sm">Pháp nhân
            <select className="input mt-1 w-full" value={legalEntityId} onChange={(e) => setLegal(e.target.value)}>
              <option value="">— Chưa gán —</option>
              {entities.map((x) => <option key={x.id} value={x.id}>{x.legalName} ({x.taxCode})</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">Địa chỉ<input className="input mt-1 w-full" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} /></label>
        {type === "center" && (
          <label className="block text-sm">Gắn vào cơ sở sẵn có
            <select className="input mt-1 w-full" value={centerId} onChange={(e) => setCenter(e.target.value)}>
              <option value="">Tạo cơ sở mới theo mã ở trên</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-ink-400">Đơn vị loại &quot;Cơ sở&quot; luôn có một dòng trong bảng cơ sở — phân quyền theo cơ sở vẫn chạy như cũ.</span>
          </label>
        )}
        <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_HINT} maxLength={300} required />
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
          <button className="btn-primary" disabled={m.isPending}>Tạo đơn vị</button>
        </div>
      </form>
    </Modal>
  );
}

export function UnitActions({ unit, units, entities }: { unit: Unit; units: Unit[]; entities: LegalEntity[] }) {
  const [mode, setMode] = useState<"" | "edit" | "move" | "delete">("");
  return (
    <>
      <span className="flex flex-wrap gap-1">
        <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setMode("edit")}>Sửa</button>
        {unit.type !== "root" && <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setMode("move")}>Đổi cha</button>}
        {unit.type !== "root" && <button className="btn-ghost !px-2 !py-0.5 text-xs text-red-700" onClick={() => setMode("delete")}>Xoá</button>}
      </span>
      {mode === "edit" && <EditUnit unit={unit} entities={entities} onClose={() => setMode("")} />}
      {mode === "move" && <MoveUnit unit={unit} units={units} onClose={() => setMode("")} />}
      {mode === "delete" && <DeleteUnit unit={unit} onClose={() => setMode("")} />}
    </>
  );
}

function EditUnit({ unit, entities, onClose }: { unit: Unit; entities: LegalEntity[]; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState(unit.name);
  const [address, setAddress] = useState(unit.address ?? "");
  const [relationshipType, setRel] = useState(unit.relationshipType);
  const [status, setStatus] = useState(unit.status);
  const [legalEntityId, setLegal] = useState(unit.legalEntityId ?? "");
  const [note, setNote] = useState(unit.note ?? "");
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.org.updateUnit.mutationOptions({ onSuccess: () => { onClose(); router.refresh(); } }));
  return (
    <Modal title={`Sửa đơn vị ${unit.code}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ id: unit.id, name, address: address || null, relationshipType: relationshipType as "owned", status: status as "active", legalEntityId: legalEntityId || null, note: note || null, reason });
        }}
      >
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          Mã <b>{unit.code}</b> và loại <b>{ORG_UNIT_TYPE_VI[unit.type]}</b> không đổi được sau khi tạo.
        </p>
        <label className="block text-sm">Tên đơn vị<input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label>
        <label className="block text-sm">Địa chỉ<input className="input mt-1 w-full" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} /></label>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-sm">Quan hệ
            <select className="input mt-1 w-full" value={relationshipType} onChange={(e) => setRel(e.target.value)}>
              {ORG_RELATIONSHIPS.map((r) => <option key={r} value={r}>{ORG_RELATIONSHIP_VI[r]}</option>)}
            </select>
          </label>
          <label className="text-sm">Trạng thái
            <select className="input mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              {ORG_UNIT_STATUSES.map((s) => <option key={s} value={s}>{ORG_UNIT_STATUS_VI[s]}</option>)}
            </select>
          </label>
          <label className="text-sm">Pháp nhân
            <select className="input mt-1 w-full" value={legalEntityId} onChange={(e) => setLegal(e.target.value)}>
              <option value="">— Chưa gán —</option>
              {entities.map((x) => <option key={x.id} value={x.id}>{x.legalName}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">Ghi chú<input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
        <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_HINT} maxLength={300} required />
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={m.isPending}>Lưu</button>
        </div>
      </form>
    </Modal>
  );
}

function MoveUnit({ unit, units, onClose }: { unit: Unit; units: Unit[]; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [parentId, setParentId] = useState(unit.parentId ?? "");
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.org.moveUnit.mutationOptions({ onSuccess: () => { onClose(); router.refresh(); } }));
  const parents = parentOptions(units, unit.type, unit.id);
  const subtree = units.filter((u) => u.path.startsWith(`${unit.path}/`));
  return (
    <Modal title={`Đổi đơn vị cha của ${unit.code}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: unit.id, parentId: parentId || null, reason }); }}>
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          ⚠️ <b>Đổi đơn vị cha sẽ tính lại đường dẫn của cả nhánh con.</b>
          {subtree.length > 0 && <> Nhánh này còn <b>{subtree.length}</b> đơn vị con sẽ đổi đường dẫn theo ({subtree.slice(0, 4).map((s) => s.code).join(", ")}{subtree.length > 4 ? "…" : ""}).</>}
          {" "}Đường dẫn quyết định ai thấy dữ liệu của nhánh nào.
        </p>
        <div className="text-xs text-ink-600">Đường dẫn hiện tại: <code className="font-mono">{unit.path}</code></div>
        <label className="block text-sm">Đơn vị cha mới
          <select className="input mt-1 w-full" value={parentId} onChange={(e) => setParentId(e.target.value)} required>
            <option value="">— Chọn đơn vị cha —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{"— ".repeat(p.depth)}{p.code} · {p.name}</option>)}
          </select>
        </label>
        <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_HINT} maxLength={300} required />
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        {m.data && <p className="text-sm text-green-700">Đã tính lại đường dẫn cho {m.data.changed} đơn vị.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={m.isPending}>Đổi cha &amp; tính lại đường dẫn</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteUnit({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.org.deleteUnit.mutationOptions({ onSuccess: () => { onClose(); router.refresh(); } }));
  return (
    <Modal title={`Xoá đơn vị ${unit.code}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: unit.id, reason }); }}>
        <p className="text-sm text-ink-600">
          Xoá mềm — dữ liệu nghiệp vụ đã gắn vẫn giữ nguyên. Đơn vị còn <b>đơn vị con đang hoạt động</b> thì không xoá được.
          {unit.centerId && " Cơ sở tương ứng sẽ chuyển sang Ngừng hoạt động (không xoá khỏi bảng cơ sở)."}
        </p>
        <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_HINT} maxLength={300} required />
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Không xoá</button>
          <button className="btn-primary !bg-red-600" disabled={m.isPending}>Xoá đơn vị</button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Khu vực cũ (regions) — giữ nguyên vì phân quyền và báo cáo đang dùng */
/* ------------------------------------------------------------------ */

export function RegionForm({ managers, region }: { managers: { id: string; fullName: string }[]; region?: { id: string; code: string; name: string; managerUserId: string | null; sortOrder: number } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(region?.code ?? "");
  const [name, setName] = useState(region?.name ?? "");
  const [managerUserId, setManager] = useState(region?.managerUserId ?? "");
  const [sortOrder, setSort] = useState(region?.sortOrder ?? 0);
  const m = useMutation(trpc.admin.upsertRegion.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button className={region ? "btn-ghost !px-2 !py-0.5 text-xs" : "btn-ghost"} onClick={() => setOpen(true)}>{region ? "Sửa" : "+ Khu vực"}</button>;
  return (
    <Modal title={region ? "Sửa khu vực" : "Tạo khu vực"} onClose={() => setOpen(false)}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: region?.id, code, name, managerUserId: managerUserId || null, sortOrder }); }}>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">Mã<input className="input mt-1 w-full uppercase" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} required /></label>
          <label className="col-span-2 text-sm">Tên<input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
        </div>
        <label className="block text-sm">Người phụ trách
          <select className="input mt-1 w-full" value={managerUserId} onChange={(e) => setManager(e.target.value)}>
            <option value="">— Chưa gán —</option>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </label>
        <label className="block text-sm">Thứ tự<input type="number" min={0} max={999} className="input mt-1 w-24" value={sortOrder} onChange={(e) => setSort(Number(e.target.value))} /></label>
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </Modal>
  );
}

export function DeleteRegion({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.deleteRegion.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex flex-col items-end">
      <button className="btn-ghost !px-2 !py-0.5 text-xs text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id })}>Xoá</button>
      {m.error && <span className="max-w-[220px] text-right text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

export function AssignRegion({ centerId, regionId, regions }: { centerId: string; regionId: string | null; regions: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.assignCenterRegion.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex flex-col items-end">
      <select className="input !py-1 text-xs" value={regionId ?? ""} disabled={m.isPending} onChange={(e) => m.mutate({ centerId, regionId: e.target.value || null })} aria-label="Khu vực">
        <option value="">Chưa thuộc khu vực</option>
        {regions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
      </select>
      {m.error && <span className="text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

export function LegalEntityForm({ entity }: { entity?: LegalEntity & { address?: string | null; representative?: string | null } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [legalName, setLegalName] = useState(entity?.legalName ?? "");
  const [taxCode, setTaxCode] = useState(entity?.taxCode ?? "");
  const [address, setAddress] = useState(entity?.address ?? "");
  const [representative, setRep] = useState(entity?.representative ?? "");
  const [isActive, setActive] = useState(entity?.isActive ?? true);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.org.upsertLegalEntity.mutationOptions({ onSuccess: () => { setOpen(false); setReason(""); router.refresh(); } }));
  if (!open) return <button className={entity ? "btn-ghost !px-2 !py-0.5 text-xs" : "btn-ghost"} onClick={() => setOpen(true)}>{entity ? "Sửa" : "+ Pháp nhân"}</button>;
  return (
    <Modal title={entity ? "Sửa pháp nhân" : "Thêm pháp nhân"} onClose={() => setOpen(false)}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: entity?.id, legalName, taxCode, address: address || null, representative: representative || null, isActive, reason }); }}>
        <label className="block text-sm">Tên pháp nhân<input className="input mt-1 w-full" value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={200} required /></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Mã số thuế<input className="input mt-1 w-full" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} maxLength={14} placeholder="0401234567" required /></label>
          <label className="text-sm">Người đại diện<input className="input mt-1 w-full" value={representative} onChange={(e) => setRep(e.target.value)} maxLength={120} /></label>
        </div>
        <label className="block text-sm">Địa chỉ<input className="input mt-1 w-full" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} /> Đang hoạt động</label>
        <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_HINT} maxLength={300} required />
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
          <button className="btn-primary" disabled={m.isPending}>Lưu</button>
        </div>
      </form>
    </Modal>
  );
}

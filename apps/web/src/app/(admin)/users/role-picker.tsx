"use client";

export type RoleOpt = { role: string; label: string; global: boolean };
export type CenterOpt = { id: string; code: string; name: string };

/** Chọn vai trò + cơ sở (vai trò Hội sở tự khoá cơ sở = toàn hệ thống) */
export function RolePicker({ roles, centers, role, centerId, onChange }: { roles: RoleOpt[]; centers: CenterOpt[]; role: string; centerId: string; onChange: (role: string, centerId: string) => void }) {
  const isGlobal = roles.find((r) => r.role === role)?.global ?? false;
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input max-w-[240px]" value={role} onChange={(e) => { const g = roles.find((r) => r.role === e.target.value)?.global; onChange(e.target.value, g ? "" : centerId); }}>
        <option value="">— Chọn vai trò —</option>
        <optgroup label="Hội sở (toàn hệ thống)">{roles.filter((r) => r.global).map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}</optgroup>
        <optgroup label="Cơ sở">{roles.filter((r) => !r.global).map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}</optgroup>
      </select>
      <select className="input max-w-[220px]" value={isGlobal ? "" : centerId} disabled={isGlobal || !role} onChange={(e) => onChange(role, e.target.value)}>
        <option value="">{isGlobal ? "Toàn hệ thống" : "— Chọn cơ sở —"}</option>
        {!isGlobal && centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
      </select>
    </div>
  );
}

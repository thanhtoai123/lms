"use client";

import { WEEKDAY_VI } from "@/components/ui";

export type SlotRow = { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; startTime: string; endTime: string; roomId: string; teacherId: string };
export type Opt = { id: string; label: string };

export function toSlotInput(rows: SlotRow[]) {
  return rows.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, roomId: s.roomId || null, teacherId: s.teacherId || null }));
}

/** Bảng nhập ca học trong tuần (thứ, giờ, phòng, GV) */
export function SlotEditor({ rows, onChange, rooms, teachers, disabled }: { rows: SlotRow[]; onChange: (rows: SlotRow[]) => void; rooms: Opt[]; teachers: Opt[]; disabled?: boolean }) {
  const upd = (i: number, patch: Partial<SlotRow>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      {rows.map((s, i) => (
        <div key={i} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-6">
          <select className="input" value={s.weekday} disabled={disabled} onChange={(e) => upd(i, { weekday: Number(e.target.value) as SlotRow["weekday"] })}>
            {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => <option key={d} value={d}>{WEEKDAY_VI[d]}</option>)}
          </select>
          <input type="time" className="input" value={s.startTime} disabled={disabled} onChange={(e) => upd(i, { startTime: e.target.value })} />
          <input type="time" className="input" value={s.endTime} disabled={disabled} onChange={(e) => upd(i, { endTime: e.target.value })} />
          <select className="input" value={s.roomId} disabled={disabled} onChange={(e) => upd(i, { roomId: e.target.value })}>
            <option value="">Phòng mặc định</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <select className="input" value={s.teacherId} disabled={disabled} onChange={(e) => upd(i, { teacherId: e.target.value })}>
            <option value="">GV chính</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button type="button" className="btn-ghost" disabled={disabled || rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Xoá</button>
        </div>
      ))}
      {!disabled && (
        <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => onChange([...rows, { weekday: 3, startTime: "18:00", endTime: "19:30", roomId: "", teacherId: "" }])}>
          + Thêm ca
        </button>
      )}
    </div>
  );
}

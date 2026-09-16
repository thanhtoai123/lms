"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export type PickedStudent = { id: string; fullName: string; code: string | null; grade: number | null };

/** Ô tìm học viên (tên / mã), debounce 300ms */
export function StudentPicker({ value, onChange }: { value: PickedStudent | null; onChange: (s: PickedStudent | null) => void }) {
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const res = useQuery({ ...trpc.students.pick.queryOptions({ q: debounced }), enabled: debounced.length >= 2 && !value });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand-600/30 bg-brand-50 p-3 text-sm">
        <span><span className="font-medium">{value.fullName}</span> <span className="font-mono text-xs text-ink-400">{value.code}</span>{value.grade ? <span className="text-xs text-ink-400"> · lớp {value.grade}</span> : null}</span>
        <button type="button" className="text-xs underline" onClick={() => onChange(null)}>Đổi</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <input className="input" placeholder="Gõ tên hoặc mã học viên (≥ 2 ký tự)…" value={q} onChange={(e) => setQ(e.target.value)} />
      {debounced.length >= 2 && (
        <div className="max-h-56 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/5">
          {res.isLoading && <div className="p-2 text-xs text-ink-400">Đang tìm…</div>}
          {res.data?.map((s) => (
            <button type="button" key={s.id} className="block w-full p-2 text-left text-sm hover:bg-brand-50" onClick={() => onChange({ id: s.id, fullName: s.fullName, code: s.code, grade: s.grade })}>
              {s.fullName} <span className="font-mono text-xs text-ink-400">{s.code}</span> <span className="text-xs text-ink-400">{s.centerCode ?? ""}{s.grade ? ` · lớp ${s.grade}` : ""}</span>
            </button>
          ))}
          {res.data?.length === 0 && <div className="p-2 text-xs text-ink-400">Không thấy — <a href="/students/new" className="underline">thêm học viên mới</a></div>}
        </div>
      )}
    </div>
  );
}

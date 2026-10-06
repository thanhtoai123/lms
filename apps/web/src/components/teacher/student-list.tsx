"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface StudentRow {
  enrollmentId: string; studentId: string; code: string | null; fullName: string; nickname: string | null; grade: number | null; trial: boolean;
  classId: string; classCode: string; className: string; attendancePct: number | null; sessionsMarked: number; avg: number | null;
  riskLevel: "high" | "watch" | null; riskReasons: string[];
}

/** bỏ dấu tiếng Việt để tìm "nguyen" ra "Nguyễn" */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

const selectCls = "min-h-11 rounded-xl border border-border bg-card px-3 text-[14px]";

/** Danh sách học viên của giáo viên: tìm theo tên / mã, lọc lớp · trạng thái · cần quan tâm, nhóm theo lớp */
export function StudentList({ classes, rows }: { classes: { id: string; code: string; name: string }[]; rows: StudentRow[] }) {
  const [q, setQ] = useState("");
  const [lop, setLop] = useState("");
  const [tt, setTt] = useState<"" | "active" | "trial" | "risk">("");
  const [group, setGroup] = useState(true);

  const list = useMemo(() => {
    const k = fold(q.trim());
    return rows.filter((r) =>
      (!lop || r.classId === lop)
      && (tt === "" || (tt === "trial" ? r.trial : tt === "active" ? !r.trial : r.riskLevel !== null))
      && (!k || fold(`${r.fullName} ${r.nickname ?? ""} ${r.code ?? ""}`).includes(k)));
  }, [rows, q, lop, tt]);

  const byClass = useMemo(() => {
    const m = new Map<string, StudentRow[]>();
    for (const r of list) { const a = m.get(r.classId) ?? []; a.push(r); m.set(r.classId, a); }
    return [...m.entries()];
  }, [list]);

  const row = (r: StudentRow) => (
    <li key={r.enrollmentId}>
      <Link href={`/students/${r.studentId}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{r.fullName}{r.nickname ? <span className="font-normal text-ink-600"> · {r.nickname}</span> : null}</span>
          <span className="block truncate text-[13px] text-ink-600">{[r.code, !group || lop ? null : r.classCode, r.grade ? `Lớp ${r.grade}` : null].filter(Boolean).join(" · ")}</span>
          {r.riskLevel && <span className="block truncate text-[13px] text-amber-800">{r.riskReasons.join(" · ")}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-[13px]">
          <span className="flex gap-1">
            {r.trial && <span className="chip bg-blue-100 text-blue-700">Học thử</span>}
            {r.riskLevel && <span className={`chip ${r.riskLevel === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{r.riskLevel === "high" ? "Cần quan tâm" : "Theo dõi"}</span>}
          </span>
          <span className="text-ink-600">{r.attendancePct !== null ? `CC ${r.attendancePct}%` : "Chưa có điểm danh"}{r.avg !== null ? ` · TB ${r.avg}` : ""}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc mã học viên…" aria-label="Tìm học viên"
          className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[15px]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Lọc theo lớp" value={lop} onChange={(e) => setLop(e.target.value)} className={selectCls}>
          <option value="">Tất cả lớp</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        <select aria-label="Lọc theo trạng thái" value={tt} onChange={(e) => setTt(e.target.value as typeof tt)} className={selectCls}>
          <option value="">Mọi trạng thái</option>
          <option value="active">Đang học</option>
          <option value="trial">Học thử</option>
          <option value="risk">Cần quan tâm</option>
        </select>
        <label className="inline-flex min-h-11 items-center gap-2 px-1 text-[14px]"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />Nhóm theo lớp</label>
      </div>
      <p className="text-[13px] text-ink-600" aria-live="polite">{list.length}/{rows.length} học viên</p>
      {list.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink-400">Không tìm thấy học viên. Thử đổi từ khoá hoặc bộ lọc.</div>
      ) : group && !lop ? (
        byClass.map(([id, items]) => (
          <section key={id} className="card px-4 py-2" aria-label={items[0]!.className}>
            <h2 className="pt-1 text-[14px] font-semibold text-ink-600">{items[0]!.className} <span className="font-normal">· {items.length} HV</span></h2>
            <ul className="divide-y divide-black/5">{items.map(row)}</ul>
          </section>
        ))
      ) : (
        <div className="card px-4 py-1"><ul className="divide-y divide-black/5">{list.map(row)}</ul></div>
      )}
    </div>
  );
}

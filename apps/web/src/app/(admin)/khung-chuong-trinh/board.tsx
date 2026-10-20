"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  TH_TRACKS, TH_LEVEL_VI, TH_LEVEL_COLOR, TH_DIFFICULTY_VI, TH_PRICING, TH_DELIVERY, TH_SESSIONS_PER_YEAR, TH_CRITERIA_ORDER,
  ageRange, examCourseCode, examCourseName, thProgramsOfTrack, thCourseSpecs, yearCourseCode, yearCourseName, moduleTitle, sessionTitle, type ThTrackCode,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type State = Record<string, { id: string; isActive: boolean; totalSessions: number; lessons: number; criteria: number }>;
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Trạng thái một khoá chuẩn trong CSDL */
function CourseState({ code, sessions, state }: { code: string; sessions: number; state: State }) {
  const s = state[code];
  if (!s) return <span className="chip bg-amber-50 text-amber-800">Chưa nạp</span>;
  const full = s.lessons >= sessions && s.criteria >= TH_CRITERIA_ORDER.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className={`chip ${!s.isActive ? "bg-slate-100 text-slate-600" : full ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{!s.isActive ? "Ngừng bán" : full ? "Đã nạp đủ" : "Thiếu buổi / tiêu chí"}</span>
      <span className="text-xs tabular-nums text-ink-400">{s.lessons}/{sessions} buổi · {s.criteria} tiêu chí</span>
      <Link href={`/curriculums?course=${s.id}`} className="text-xs text-brand-600 hover:underline">Giáo trình</Link>
    </span>
  );
}

export function CatalogBoard({ state, otherActiveCourses, canSync }: { state: State; otherActiveCourses: number; canSync: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [track, setTrack] = useState<ThTrackCode>("ROBO");
  const [retire, setRetire] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const specs = useMemo(() => thCourseSpecs(), []);
  const loaded = specs.filter((s) => state[s.code]).length;
  const full = specs.filter((s) => { const x = state[s.code]; return x && x.isActive && x.lessons >= s.totalSessions && x.criteria >= TH_CRITERIA_ORDER.length; }).length;

  const sync = useMutation(trpc.thsteam.sync.mutationOptions({
    onSuccess: (r) => {
      setMsg(`Đã đồng bộ: khoá tạo ${r.courses.created} / cập nhật ${r.courses.updated} · buổi tạo ${r.lessons.created} / cập nhật ${r.lessons.updated}${r.renamed.sessions + r.renamed.plans ? ` (đổi tên ${r.renamed.sessions} buổi dạy, ${r.renamed.plans} giáo án)` : ""} · tiêu chí thêm ${r.criteria.created} · gói học phí tạo ${r.packages.created} / cập nhật ${r.packages.updated} · lộ trình ${r.paths.created + r.paths.updated}${retire ? ` · ngừng bán ${r.retired.courses} khoá ngoài danh mục` : ""}.`);
      router.refresh();
    },
    onError: (e) => setMsg(e.message),
  }));

  const t = TH_TRACKS.find((x) => x.code === track)!;
  const ps = thProgramsOfTrack(track);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-ink-400">Khoá chuẩn</div><div className="text-2xl font-bold tabular-nums">{specs.length}</div><div className="text-xs text-ink-400">{specs.filter((s) => s.kind === "year").length} năm học · {specs.filter((s) => s.kind === "exam").length} luyện thi</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Đã nạp vào hệ thống</div><div className="text-2xl font-bold tabular-nums">{loaded}/{specs.length}</div><div className="text-xs text-ink-400">Đủ buổi và tiêu chí: {full}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Hình thức</div><div className="text-sm font-medium">{TH_DELIVERY}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Học phí {TH_PRICING.schoolYear} · 1 năm học</div><div className="text-sm"><b>{vnd(TH_PRICING.year.group.price)}</b> lớp nhóm · <b>{vnd(TH_PRICING.year.oneToOne.price)}</b> kèm 1:1</div><div className="text-xs text-ink-400">Combo 2 năm: {vnd(TH_PRICING.combo.group.price)} · Luyện thi {vnd(TH_PRICING.exam[15]!.group)} (15 buổi) / {vnd(TH_PRICING.exam[30]!.group)} (30 buổi)</div></div>
      </div>

      <div className="card p-4 text-sm">
        <div className="font-semibold">Tên buổi chuẩn trong mỗi học phần (15 buổi)</div>
        <ol className="mt-2 grid gap-1 text-xs text-ink-600 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 15 }, (_, i) => i + 1).map((k) => (
            <li key={k} className={`rounded-lg border px-2 py-1 ${k === 5 ? "border-amber-300 bg-amber-50" : k >= 13 ? "border-emerald-300 bg-emerald-50" : "border-black/5"}`}>
              <b className="tabular-nums">Buổi {k}</b> · {sessionTitle(1, k).replace(/^HP1 · /, "")}{k === 15 ? " · mốc học bạ" : ""}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-400">Tên trong giáo trình có tiền tố học phần, ví dụ “HP2 · Dự án sáng tạo 3”. Khoá năm học: “Năm 1: Lập trình RoboSim”; học phần: “HP1: RoboSim Basic”.</p>
      </div>

      {canSync && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Đồng bộ danh mục chuẩn</div>
            <div className="text-ink-600">Tạo / cập nhật khoá theo mã, giáo trình “Chuẩn TH STEAM {TH_PRICING.schoolYear}” đủ buổi, tiêu chí học bạ, gói học phí, lộ trình. Chạy lại an toàn; không xoá lớp, học viên, học bạ cũ; mô tả mức tiêu chí đã sửa tay được giữ.</div>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={retire} onChange={(e) => setRetire(e.target.checked)} /> Ngừng bán các khoá / gói / lộ trình ngoài danh mục ({otherActiveCourses} khoá đang mở) — không xoá</label>
          </div>
          <button className="btn-primary" disabled={sync.isPending} onClick={() => { setMsg(null); sync.mutate({ retireOthers: retire }); }}>{sync.isPending ? "Đang đồng bộ…" : "Đồng bộ danh mục chuẩn"}</button>
          {msg && <p className="w-full text-sm text-ink-600">{msg}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist">
        {TH_TRACKS.map((x) => (
          <button key={x.code} role="tab" aria-selected={x.code === track} onClick={() => setTrack(x.code)} className={x.code === track ? "btn-primary" : "btn-ghost"}>{x.name}</button>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="text-lg font-semibold">{t.name}</h2>{t.tagline && <p className="text-sm text-ink-600">{t.tagline}</p>}</div>
          {t.deckUrl && <a href={t.deckUrl} target="_blank" rel="noreferrer" className="btn-ghost text-sm">Bộ slide chương trình ↗</a>}
        </div>
      </div>

      {ps.map((p) => (
        <section key={p.code} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip" style={{ color: TH_LEVEL_COLOR[p.level].fg, background: TH_LEVEL_COLOR[p.level].bg }}>{TH_LEVEL_VI[p.level]} · {ageRange(p.ageFrom, p.ageTo)}</span>
            <h3 className="font-semibold">{p.name}</h3>
            <span className="font-mono text-xs text-ink-400">{p.code}</span>
            <span className="text-xs text-ink-400">{p.years.length} năm học · {p.years.length * TH_SESSIONS_PER_YEAR} buổi</span>
            {p.deckUrl && p.deckUrl !== t.deckUrl && <a href={p.deckUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">Bộ slide ↗</a>}
          </div>
          {p.years.map((y) => {
            const code = yearCourseCode(p, y.no);
            return (
              <div key={y.no} className="rounded-xl border border-black/5">
                <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-slate-50 px-3 py-2 text-sm">
                  <b>{yearCourseName(p, y)}</b><span className="text-ink-600">{y.title}</span><span className="text-xs text-ink-400">{ageRange(y.ageFrom, y.ageTo)} · {y.software}</span>
                  <Link href={`/courses?q=${code}`} className="font-mono text-xs text-brand-600 hover:underline">{code}</Link>
                  <span className="ml-auto"><CourseState code={code} sessions={TH_SESSIONS_PER_YEAR} state={state} /></span>
                </div>
                <div className="grid gap-px bg-black/5 md:grid-cols-3">
                  {y.modules.map((m) => (
                    <div key={m.no} className="space-y-1 bg-white p-3 text-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{TH_DIFFICULTY_VI[m.difficulty]} · buổi {(m.no - 1) * 15 + 1}–{m.no * 15}</div>
                      <div className="font-semibold">{moduleTitle(p, y, m)}</div>
                      <div className="text-ink-600">{m.name}</div>
                      <div><span className="text-ink-400">Con học: </span>{m.learn}</div>
                      <div><span className="text-ink-400">Sản phẩm: </span>{m.product}</div>
                      <div><span className="text-ink-400">Con làm được: </span>{m.canDo}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {p.contests.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Luyện thi (tự chọn)</div>
              {p.contests.map((c) => {
                const code = examCourseCode(p, c);
                return (
                  <div key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{examCourseName(p, c)}</span>
                    <span className="text-xs text-ink-400">{c.sessions} buổi · sau Năm {c.afterYear}{c.eligibility ? ` · ${c.eligibility}` : ""}</span>
                    <Link href={`/courses?q=${code}`} className="font-mono text-xs text-brand-600 hover:underline">{code}</Link>
                    <CourseState code={code} sessions={c.sessions} state={state} />
                  </div>
                );
              })}
            </div>
          ) : p.contestNote ? <p className="text-xs text-ink-600"><b>Luyện thi:</b> {p.contestNote}</p> : null}
          <details className="text-sm">
            <summary className="cursor-pointer text-brand-600">Con thay đổi gì sau mỗi năm học (mô tả 3 mức của tiêu chí học bạ)</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-ink-400"><tr><th className="p-2">Tiêu chí</th><th className="p-2">Cần cố gắng · trước khi học</th><th className="p-2">Đạt · sau năm 1</th><th className="p-2">Tốt · sau năm 2</th></tr></thead>
                <tbody className="divide-y divide-black/5">{p.growth.map((g) => <tr key={g.criterion}><td className="p-2 font-medium">{g.criterion}</td><td className="p-2">{g.before}</td><td className="p-2">{g.after1}</td><td className="p-2">{g.after2}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}

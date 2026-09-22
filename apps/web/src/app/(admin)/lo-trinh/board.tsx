"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Award, GripVertical, Plus, Printer, Trash2 } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { Drawer } from "@/components/drawer";
import { ErrorBox, OkBox } from "@/components/admin-ui";

type PathRow = RouterOutputs["certificates"]["paths"]["list"][number];
type Options = RouterOutputs["certificates"]["paths"]["options"];
type StudentsData = RouterOutputs["certificates"]["paths"]["students"];
type StudentRow = StudentsData["eligible"][number];

interface CourseItem { courseId: string; required: boolean }
interface FormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  criteriaText: string;
  certificateTemplateId: string;
  isActive: boolean;
  courses: CourseItem[];
}

const blank: FormState = { code: "", name: "", description: "", criteriaText: "", certificateTemplateId: "", isActive: true, courses: [] };
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

export function PathsBoard({ paths, options, initialPathId }: { paths: PathRow[]; options: Options; initialPathId: string | null }) {
  const [edit, setEdit] = useState<FormState | null>(null);
  const [selected, setSelected] = useState<string | null>(initialPathId);
  const current = paths.find((p) => p.id === selected) ?? null;

  const openEdit = (p: PathRow) =>
    setEdit({
      id: p.id, code: p.code, name: p.name, description: p.description ?? "", criteriaText: p.criteriaText ?? "",
      certificateTemplateId: p.certificateTemplateId ?? "", isActive: p.isActive,
      courses: p.courses.map((c) => ({ courseId: c.courseId, required: c.required })),
    });

  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="p-3">Mã</th><th className="p-3">Lộ trình</th><th className="p-3">Các khoá (theo thứ tự)</th><th className="p-3">Mẫu chứng nhận</th><th className="p-3">Đã cấp</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {paths.map((p) => (
              <tr key={p.id} className={`${p.isActive ? "" : "opacity-60"} ${p.id === selected ? "bg-brand-50/60" : ""}`}>
                <td className="p-3 font-mono text-xs">{p.code}</td>
                <td className="p-3">
                  <div className="font-semibold">{p.name}</div>
                  {!p.isActive && <span className="chip bg-slate-200 text-ink-600">Ngừng dùng</span>}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {p.courses.map((c, i) => (
                      <span key={c.courseId} className="inline-flex items-center gap-1">
                        {i > 0 && <span className="text-ink-400" aria-hidden>→</span>}
                        <span className={`chip ${c.required ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-ink-600"}`} title={c.name}>
                          {c.code}{c.required ? "" : " (tuỳ chọn)"}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-xs">{p.templateName ?? <span className="text-ink-400">Mẫu mặc định</span>}</td>
                <td className="p-3">{p.issuedCount}</td>
                <td className="whitespace-nowrap p-3 text-right">
                  <button className="text-xs font-semibold text-brand-600 underline" onClick={() => setSelected(p.id)}>Học viên</button>
                  {options.canManage && <> {" · "}<button className="text-xs text-brand-600 underline" onClick={() => openEdit(p)}>Sửa</button></>}
                </td>
              </tr>
            ))}
            {paths.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-ink-400">Chưa có lộ trình nào. Tạo lộ trình đầu tiên — ví dụ “Lộ trình Robotics nền tảng” gồm 2–3 khoá.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {options.canManage && (
        <button className="btn-primary" onClick={() => setEdit({ ...blank, certificateTemplateId: options.templates.find((t) => t.isDefault)?.id ?? "" })}>
          <Plus className="h-4 w-4" aria-hidden /> Tạo lộ trình
        </button>
      )}

      {current && <PathStudentsPanel key={current.id} path={current} />}

      {edit && <PathDrawer value={edit} options={options} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setSelected(id); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer tạo / sửa lộ trình                                            */
/* ------------------------------------------------------------------ */

function PathDrawer({ value, options, onClose, onSaved }: { value: FormState; options: Options; onClose: () => void; onSaved: (id: string) => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState<FormState>(value);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const save = useMutation(trpc.certificates.paths.upsert.mutationOptions({
    onSuccess: (row) => { router.refresh(); onSaved(row.id); },
    onError: (e) => setError(e.message),
  }));
  const courseById = useMemo(() => new Map(options.courses.map((c) => [c.id, c])), [options.courses]);
  const available = options.courses.filter((c) => c.isActive && !v.courses.some((x) => x.courseId === c.id));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= v.courses.length || from === to) return;
    const next = [...v.courses];
    const [it] = next.splice(from, 1);
    if (!it) return;
    next.splice(to, 0, it);
    setV({ ...v, courses: next });
  };
  const add = () => {
    if (!pick) return;
    setV({ ...v, courses: [...v.courses, { courseId: pick, required: true }] });
    setPick("");
  };
  const canSave = v.code.trim().length >= 2 && v.name.trim().length >= 3 && v.courses.length > 0 && v.courses.some((c) => c.required);

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={v.id ? `Sửa lộ trình ${v.code}` : "Tạo lộ trình học"}
      desc="Kéo để đổi thứ tự khoá (hoặc dùng nút lên / xuống). Khoá bắt buộc phải hoàn thành — đã được duyệt — mới đủ điều kiện nhận chứng nhận."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button
            className="btn-primary"
            disabled={!canSave || save.isPending}
            onClick={() => {
              setError(null);
              save.mutate({
                id: v.id, code: v.code, name: v.name, description: v.description || null, criteriaText: v.criteriaText || null,
                certificateTemplateId: v.certificateTemplateId || null, isActive: v.isActive, courses: v.courses,
              });
            }}
          >
            {save.isPending ? "Đang lưu…" : "Lưu lộ trình"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Mã *</span>
            <input className="input font-mono uppercase" value={v.code} maxLength={30} placeholder="LT-ROBO-NT" onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Tên lộ trình *</span>
            <input className="input" value={v.name} maxLength={160} placeholder="Lộ trình Robotics nền tảng" onChange={(e) => setV({ ...v, name: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="label">Mô tả</span>
          <textarea className="input min-h-16" value={v.description} maxLength={2000} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </label>

        <div>
          <span className="label">Các khoá trong lộ trình *</span>
          <ol className="space-y-1.5">
            {v.courses.map((c, i) => {
              const info = courseById.get(c.courseId);
              return (
                <li
                  key={c.courseId}
                  draggable
                  onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-2 rounded-xl border bg-card p-2 text-sm ${dragIndex === i ? "border-primary opacity-60" : "border-border"}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-400" aria-hidden />
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-ink-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{info?.code ?? "?"}</span> · {info?.name ?? "Khoá không còn"}
                    {info && <span className="text-xs text-ink-400"> · {info.totalSessions} buổi</span>}
                  </span>
                  <label className="flex shrink-0 items-center gap-1 text-xs">
                    <input type="checkbox" checked={c.required} onChange={(e) => setV({ ...v, courses: v.courses.map((x, k) => (k === i ? { ...x, required: e.target.checked } : x)) })} />
                    Bắt buộc
                  </label>
                  <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" disabled={i === 0} aria-label="Lên" onClick={() => move(i, i - 1)}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" disabled={i === v.courses.length - 1} aria-label="Xuống" onClick={() => move(i, i + 1)}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-red-700 hover:bg-red-50" aria-label="Bỏ khoá" onClick={() => setV({ ...v, courses: v.courses.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></button>
                </li>
              );
            })}
            {v.courses.length === 0 && <li className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Chưa chọn khoá nào.</li>}
          </ol>
          <div className="mt-2 flex gap-2">
            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">— Thêm khoá —</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            <button type="button" className="btn-ghost shrink-0" disabled={!pick} onClick={add}>Thêm</button>
          </div>
        </div>

        <label className="block">
          <span className="label">Điều kiện đạt (in lên giấy chứng nhận và trang xác thực)</span>
          <textarea
            className="input min-h-20"
            value={v.criteriaText}
            maxLength={600}
            placeholder="Ví dụ: Hoàn thành 2 khoá bắt buộc Sata1 và Sata4, chuyên cần từ 80%, hoàn thành dự án cuối khoá."
            onChange={(e) => setV({ ...v, criteriaText: e.target.value })}
          />
          <span className="mt-0.5 block text-right text-[11px] text-muted-foreground">{v.criteriaText.length}/600</span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Mẫu giấy chứng nhận</span>
            <select className="input" value={v.certificateTemplateId} onChange={(e) => setV({ ...v, certificateTemplateId: e.target.value })}>
              <option value="">Mẫu mặc định của trung tâm</option>
              {options.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (mặc định)" : ""}</option>)}
            </select>
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Đang dùng
          </label>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Học viên của lộ trình: Đủ điều kiện / Đã cấp / Đang học              */
/* ------------------------------------------------------------------ */

function PathStudentsPanel({ path }: { path: PathRow }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery(trpc.certificates.paths.students.queryOptions({ pathId: path.id }));
  const [pickEligible, setPickEligible] = useState<Set<string>>(new Set());
  const [pickIssued, setPickIssued] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string; printIds?: string[] } | null>(null);

  useEffect(() => { setPickEligible(new Set()); setPickIssued(new Set()); }, [q.data]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: trpc.certificates.paths.students.queryKey({ pathId: path.id }) });
    router.refresh();
  };
  const issue = useMutation(trpc.certificates.issue.mutationOptions({
    onSuccess: async (r) => {
      const skipped = r.skipped.length ? ` · bỏ qua ${r.skipped.length} em (${[...new Set(r.skipped.map((s) => s.reason))].join("; ")})` : "";
      setMsg({ ok: r.issued.length > 0, text: `Đã cấp ${r.issued.length} giấy chứng nhận${skipped}.`, printIds: r.issued.map((x) => x.id) });
      await refresh();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const revoke = useMutation(trpc.certificates.revoke.mutationOptions({
    onSuccess: async () => { setMsg({ ok: true, text: "Đã thu hồi giấy chứng nhận. Mã QR trên bản in cũ sẽ hiện “Đã thu hồi”." }); await refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  const printHref = (ids: string[]) => `/lo-trinh/in-chung-nhan?ids=${ids.join(",")}&back=${encodeURIComponent(`/lo-trinh?path=${path.id}`)}`;
  const toggle = (set: Set<string>, id: string, on: boolean) => { const n = new Set(set); if (on) n.add(id); else n.delete(id); return n; };

  const d = q.data;
  return (
    <section className="card space-y-4 p-4" aria-label={`Học viên của ${path.name}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Học viên · {path.name}</h2>
        <span className="text-xs text-muted-foreground">Chỉ tính hoàn thành khoá đã được duyệt; khoá tuỳ chọn không bắt buộc để đủ điều kiện.</span>
      </div>
      {msg && (msg.ok ? (
        <OkBox>
          {msg.text}{" "}
          {msg.printIds && msg.printIds.length > 0 && <Link href={printHref(msg.printIds)} className="font-semibold underline">In {msg.printIds.length} giấy vừa cấp</Link>}
        </OkBox>
      ) : <ErrorBox>{msg.text}</ErrorBox>)}
      {q.isLoading && <p className="text-sm text-muted-foreground">Đang tải danh sách học viên…</p>}
      {q.error && <ErrorBox>{q.error.message}</ErrorBox>}
      {d && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Đủ điều kiện – chưa cấp */}
          <Group title="Đủ điều kiện – chưa cấp" count={d.eligible.length} tone="accent">
            {d.eligible.length > 0 && d.canIssue && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={pickEligible.size === d.eligible.length} onChange={(e) => setPickEligible(e.target.checked ? new Set(d.eligible.map((r) => r.studentId)) : new Set())} /> Chọn tất cả
                </label>
                <button
                  className="btn-primary !px-3 !py-1.5 text-xs"
                  disabled={pickEligible.size === 0 || issue.isPending}
                  onClick={() => {
                    if (!window.confirm(`Cấp giấy chứng nhận “${path.name}” cho ${pickEligible.size} học viên? Số chứng nhận sinh tự động, không sửa được sau khi cấp.`)) return;
                    setMsg(null);
                    issue.mutate({ pathId: path.id, studentIds: [...pickEligible] });
                  }}
                >
                  <Award className="h-4 w-4" aria-hidden /> {issue.isPending ? "Đang cấp…" : `Cấp chứng nhận (${pickEligible.size})`}
                </button>
              </div>
            )}
            {d.eligible.map((r) => (
              <StudentLine key={r.studentId} r={r}>
                {d.canIssue && <input type="checkbox" aria-label={`Chọn ${r.fullName}`} checked={pickEligible.has(r.studentId)} onChange={(e) => setPickEligible(toggle(pickEligible, r.studentId, e.target.checked))} />}
              </StudentLine>
            ))}
            {d.eligible.length === 0 && <Muted>Chưa có em nào đủ điều kiện mà chưa được cấp.</Muted>}
          </Group>

          {/* Đã cấp */}
          <Group title="Đã cấp" count={d.issued.length} tone="green">
            {d.issued.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={pickIssued.size === d.issued.length} onChange={(e) => setPickIssued(e.target.checked ? new Set(d.issued.map((r) => r.certificate?.id ?? "").filter(Boolean)) : new Set())} /> Chọn tất cả
                </label>
                {pickIssued.size > 0 ? (
                  <Link href={printHref([...pickIssued])} className="btn-primary !px-3 !py-1.5 text-xs"><Printer className="h-4 w-4" aria-hidden /> In {pickIssued.size} giấy</Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Chọn để in hàng loạt</span>
                )}
              </div>
            )}
            {d.issued.map((r) => {
              const cert = r.certificate;
              if (!cert) return null;
              return (
                <StudentLine key={r.studentId} r={r}>
                  <input type="checkbox" aria-label={`Chọn ${r.fullName}`} checked={pickIssued.has(cert.id)} onChange={(e) => setPickIssued(toggle(pickIssued, cert.id, e.target.checked))} />
                  <div className="mt-1 w-full text-[11px] text-ink-600">
                    <span className="font-mono">{cert.number}</span> · {fmtDay(cert.issuedAt)} ·{" "}
                    <Link href={printHref([cert.id])} className="text-brand-600 underline">In</Link> ·{" "}
                    <a href={cert.verifyPath} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Xác thực</a>
                    {d.canIssue && (
                      <>
                        {" · "}
                        <button
                          className="text-red-700 underline disabled:opacity-40"
                          disabled={revoke.isPending}
                          onClick={() => {
                            const reason = window.prompt(`Thu hồi giấy chứng nhận ${cert.number} của ${r.fullName}?\nNhập lý do (tối thiểu 5 ký tự):`, "");
                            if (reason === null) return;
                            if (reason.trim().length < 5) { setMsg({ ok: false, text: "Lý do thu hồi tối thiểu 5 ký tự" }); return; }
                            revoke.mutate({ id: cert.id, reason: reason.trim() });
                          }}
                        >
                          Thu hồi
                        </button>
                      </>
                    )}
                  </div>
                </StudentLine>
              );
            })}
            {d.issued.length === 0 && <Muted>Chưa cấp giấy chứng nhận nào cho lộ trình này.</Muted>}
          </Group>

          {/* Đang học */}
          <Group title="Đang học" count={d.inProgress.length} tone="slate">
            {d.inProgress.map((r) => <StudentLine key={r.studentId} r={r} showProgress />)}
            {d.inProgress.length === 0 && <Muted>Không có em nào đang học dở lộ trình.</Muted>}
          </Group>
        </div>
      )}
    </section>
  );
}

function Group({ title, count, tone, children }: { title: string; count: number; tone: "accent" | "green" | "slate"; children: React.ReactNode }) {
  const head = tone === "accent" ? "bg-accent-50 text-accent-ink" : tone === "green" ? "bg-green-50 text-green-800" : "bg-slate-100 text-ink-600";
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border">
      <div className={`flex items-center justify-between rounded-t-2xl px-3 py-2 text-sm font-bold ${head}`}>
        <span>{title}</span><span className="chip bg-white/70">{count}</span>
      </div>
      <div className="max-h-[32rem] space-y-2 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function StudentLine({ r, children, showProgress = false }: { r: StudentRow; children?: React.ReactNode; showProgress?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-xl border border-black/5 p-2 text-sm">
      <div className="min-w-0 flex-1">
        <Link href={`/students/${r.studentId}`} className="font-semibold hover:underline">{r.fullName}</Link>
        <div className="text-[11px] text-muted-foreground">{[r.code, r.centerCode].filter(Boolean).join(" · ")}</div>
        {showProgress && (
          <div className="mt-1">
            <div className="text-xs font-semibold">{r.requiredCompleted}/{r.requiredTotal} khoá bắt buộc · {r.percent}%</div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${r.percent}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {r.courses.map((c) => (
                <span
                  key={c.courseId}
                  title={`${c.name} — ${c.stateLabel}${c.required ? "" : " (tuỳ chọn)"}`}
                  className={`chip !text-[10px] ${c.state === "completed" ? "bg-green-100 text-green-800" : c.state === "in_progress" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-ink-400"}`}
                >
                  {c.code}{c.state === "completed" ? " ✓" : c.state === "in_progress" ? " …" : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

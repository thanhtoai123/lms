"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { packagePriceOf, packageSavingPercent, packageUnitPrice, validateCoursePackage } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { vnd } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

type Row = {
  id: string; courseId: string; courseCode: string; courseName: string; courseSessions: number;
  code: string; name: string; level: string | null; sessions: number;
  listPrice: number; salePrice: number | null; price: number; savingPercent: number; unitPrice: number;
  description: string | null; isFeatured: boolean; isActive: boolean; sortOrder: number;
};
type Course = { id: string; code: string; name: string; totalSessions: number; listPrice: number };
type V = {
  id?: string; courseId: string; code: string; name: string; level: string; sessions: string;
  listPrice: string; salePrice: string; description: string; isFeatured: boolean; isActive: boolean; sortOrder: string;
};

const blankOf = (c: Course | undefined): V => ({
  courseId: c?.id ?? "", code: c ? `${c.code}-${c.totalSessions}` : "", name: c ? `${c.name} — trọn khoá ${c.totalSessions} buổi` : "",
  level: "", sessions: String(c?.totalSessions ?? 12), listPrice: String(c?.listPrice ?? 0), salePrice: "", description: "",
  isFeatured: false, isActive: true, sortOrder: "0",
});

export function PackagesTable({ rows, courses, canEdit }: { rows: Row[]; courses: Course[]; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [edit, setEdit] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(trpc.catalog.upsertCoursePackage.mutationOptions({
    onSuccess: () => { setEdit(null); setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  const toggle = useMutation(trpc.catalog.setCoursePackageActive.mutationOptions({
    onSuccess: () => { setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));

  const num = (s: string) => Math.round(Number(s) || 0);
  const draftErrors = (v: V) => {
    const course = courses.find((c) => c.id === v.courseId);
    return validateCoursePackage(
      { code: v.code, name: v.name, sessions: num(v.sessions), listPrice: num(v.listPrice), salePrice: v.salePrice.trim() === "" ? null : num(v.salePrice), sortOrder: num(v.sortOrder) },
      { courseSessions: course?.totalSessions ?? null },
    );
  };
  const submit = (v: V) => save.mutate({
    id: v.id, courseId: v.courseId, code: v.code, name: v.name, level: v.level.trim() || null, sessions: num(v.sessions),
    listPrice: num(v.listPrice), salePrice: v.salePrice.trim() === "" ? null : num(v.salePrice), description: v.description.trim() || null,
    isFeatured: v.isFeatured, isActive: v.isActive, sortOrder: num(v.sortOrder),
  });

  const editor = (v: V) => {
    const errs = draftErrors(v);
    const preview = { listPrice: num(v.listPrice), salePrice: v.salePrice.trim() === "" ? null : num(v.salePrice), sessions: num(v.sessions) };
    return (
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{v.id ? "Sửa gói bán" : "Thêm gói bán"}</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs text-ink-600">Khoá *
            <select className="input mt-1" value={v.courseId} onChange={(e) => {
              const c = courses.find((x) => x.id === e.target.value);
              setEdit(v.id ? { ...v, courseId: e.target.value } : { ...blankOf(c), isActive: v.isActive });
            }}>
              <option value="">— Chọn khoá —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600">Mã gói *<input className="input mt-1" value={v.code} onChange={(e) => setEdit({ ...v, code: e.target.value })} /></label>
          <label className="text-xs text-ink-600 sm:col-span-2">Tên gói *<input className="input mt-1" value={v.name} onChange={(e) => setEdit({ ...v, name: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Cấp độ<input className="input mt-1" placeholder="Cơ bản / Nâng cao…" value={v.level} onChange={(e) => setEdit({ ...v, level: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Số buổi *<input type="number" min={1} max={500} className="input mt-1" value={v.sessions} onChange={(e) => setEdit({ ...v, sessions: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Giá niêm yết (đ) *<input type="number" min={0} step={1000} className="input mt-1" value={v.listPrice} onChange={(e) => setEdit({ ...v, listPrice: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Giá ưu đãi (đ)<input type="number" min={0} step={1000} className="input mt-1" placeholder="Để trống = bán đúng giá" value={v.salePrice} onChange={(e) => setEdit({ ...v, salePrice: e.target.value })} /></label>
          <label className="text-xs text-ink-600 sm:col-span-4">Mô tả marketing<textarea className="input mt-1 min-h-16" value={v.description} onChange={(e) => setEdit({ ...v, description: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Thứ tự hiển thị<input type="number" min={0} max={999} className="input mt-1" value={v.sortOrder} onChange={(e) => setEdit({ ...v, sortOrder: e.target.value })} /></label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={v.isFeatured} onChange={(e) => setEdit({ ...v, isFeatured: e.target.checked })} /> Gói nổi bật</label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={v.isActive} onChange={(e) => setEdit({ ...v, isActive: e.target.checked })} /> Đang bán</label>
        </div>
        <div className="text-sm text-ink-600">
          Giá bán <b className="text-ink-900">{vnd(packagePriceOf(preview))}</b>
          {packageSavingPercent(preview) > 0 && <span className="ml-1 text-green-700">(−{packageSavingPercent(preview)}% so với niêm yết)</span>}
          {" · "}{vnd(packageUnitPrice(preview))}/buổi
        </div>
        {errs.length > 0 && <div className="text-sm text-red-700">{errs.join("; ")}</div>}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending || !v.courseId || errs.length > 0} onClick={() => submit(v)}>{save.isPending ? "Đang lưu…" : "Lưu gói"}</button>
          <button className="btn-ghost" onClick={() => { setEdit(null); setError(null); }}>Huỷ</button>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-3">
      {edit && editor(edit)}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex items-center justify-between gap-2 text-sm text-ink-600">
        <span>{rows.length} gói</span>
        <CsvButton
          filename="goi-khoa-hoc"
          headers={["Khoá", "Mã gói", "Tên gói", "Cấp độ", "Số buổi", "Giá niêm yết", "Giá ưu đãi", "Giá bán", "Đơn giá/buổi", "Nổi bật", "Đang bán"]}
          rows={rows.map((r) => [r.courseCode, r.code, r.name, r.level, r.sessions, r.listPrice, r.salePrice, r.price, r.unitPrice, r.isFeatured ? "x" : "", r.isActive ? "x" : ""])}
        />
      </div>
      {rows.length === 0 ? <Empty>Chưa có gói bán nào. Thêm gói để tư vấn viên chọn nhanh khi tạo đơn.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Khoá</th><th className="p-3">Gói</th><th className="p-3">Số buổi</th><th className="p-3 text-right">Giá niêm yết</th><th className="p-3 text-right">Giá bán</th><th className="p-3 text-right">Đơn giá/buổi</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-black/5 align-top">
              {rows.map((r) => (
                <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <td className="p-3 font-mono text-xs">{r.courseCode}</td>
                  <td className="p-3">
                    <div className="font-medium">{r.name}{r.isFeatured && <span className="chip ml-1 bg-amber-100 text-amber-800">Nổi bật</span>}</div>
                    <div className="font-mono text-[11px] text-ink-400">{r.code}{r.level ? ` · ${r.level}` : ""}</div>
                    {r.description && <div className="max-w-md text-xs text-ink-600">{r.description}</div>}
                  </td>
                  <td className="p-3 tabular-nums">{r.sessions}</td>
                  <td className="p-3 text-right tabular-nums">{vnd(r.listPrice)}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{vnd(r.price)}{r.savingPercent > 0 && <div className="text-[11px] font-normal text-green-700">−{r.savingPercent}%</div>}</td>
                  <td className="p-3 text-right tabular-nums text-ink-600">{vnd(r.unitPrice)}</td>
                  <td className="p-3"><span className={`chip ${r.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-ink-600"}`}>{r.isActive ? "Đang bán" : "Ngừng bán"}</span></td>
                  <td className="p-3 whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button className="text-xs text-brand-600 underline" onClick={() => setEdit({
                          id: r.id, courseId: r.courseId, code: r.code, name: r.name, level: r.level ?? "", sessions: String(r.sessions),
                          listPrice: String(r.listPrice), salePrice: r.salePrice == null ? "" : String(r.salePrice), description: r.description ?? "",
                          isFeatured: r.isFeatured, isActive: r.isActive, sortOrder: String(r.sortOrder),
                        })}>Sửa</button>
                        {" · "}
                        <button className="text-xs text-ink-600 underline" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive, reason: r.isActive ? "Ngừng bán gói" : "Mở bán lại gói" })}>
                          {r.isActive ? "Ngừng bán" : "Mở bán"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && !edit && <button className="btn-primary" onClick={() => setEdit(blankOf(courses[0]))}>+ Thêm gói bán</button>}
    </div>
  );
}

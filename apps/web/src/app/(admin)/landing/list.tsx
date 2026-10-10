"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Tpl = { key: string; label: string; desc: string; variant: string };
type Row = {
  id: string; slug: string; title: string; status: string; path: string; publishedAt: string | null; updatedAt: string; updatedBy: string | null;
  hasUnpublished: boolean; views30: number; leads30: number; publishedVersion: number;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: "Đang công khai", cls: "bg-emerald-100 text-emerald-800" },
  draft: { label: "Nháp", cls: "bg-amber-100 text-amber-800" },
  archived: { label: "Lưu trữ", cls: "bg-black/10 text-ink-600" },
};
const fmt = (d: string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function LandingList({ pages, templates, canEdit, archived }: { pages: Row[]; templates: Tpl[]; canEdit: boolean; archived: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tpl, setTpl] = useState(templates[0]?.key ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const create = useMutation(trpc.landing.create.mutationOptions({
    onSuccess: (r) => router.push(`/landing/${r.id}`),
    onError: (e) => setMsg(e.message),
  }));
  const dup = useMutation(trpc.landing.duplicate.mutationOptions({
    onSuccess: (r) => router.push(`/landing/${r.id}`),
    onError: (e) => setMsg(e.message),
  }));
  const arch = useMutation(trpc.landing.archive.mutationOptions({
    onSuccess: () => router.refresh(),
    onError: (e) => setMsg(e.message),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 text-sm">
          <a href="/landing" className={`chip ${!archived ? "bg-brand-600 text-white" : "bg-black/5"}`}>Đang dùng</a>
          <a href="/landing?luutru=1" className={`chip ${archived ? "bg-brand-600 text-white" : "bg-black/5"}`}>Lưu trữ</a>
        </div>
        {canEdit && !archived && <button type="button" className="btn-primary" onClick={() => { setOpen((o) => !o); setMsg(null); }}>{open ? "Đóng" : "+ Tạo landing mới"}</button>}
      </div>

      {open && canEdit && (
        <form
          className="card space-y-4 p-4"
          onSubmit={(e) => { e.preventDefault(); setMsg(null); create.mutate({ title, slug, templateKey: tpl }); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Tên trang (chỉ để quản lý)
              <input className="input mt-1" value={title} maxLength={150} required minLength={3} placeholder="Ví dụ: Trang chủ, Học thử tháng 10"
                onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
            </label>
            <label className="block text-sm">Đường dẫn
              <div className="mt-1 flex items-center gap-1">
                <span className="text-ink-600">/lp/</span>
                <input className="input" value={slug} maxLength={60} required placeholder="hoc-thu-thang-10" onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} />
              </div>
              <span className="text-xs text-ink-600">Dùng “trang-chu” để làm trang chủ của website (địa chỉ gốc “/”).</span>
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Chọn mẫu để bắt đầu</legend>
            <div className="grid gap-3 md:grid-cols-3">
              {templates.map((t) => (
                <label key={t.key} className={`cursor-pointer rounded-xl border-2 p-3 text-sm ${tpl === t.key ? "border-brand-600 bg-brand-50" : "border-black/10"}`}>
                  <input type="radio" name="tpl" className="mr-2" checked={tpl === t.key} onChange={() => setTpl(t.key)} />
                  <span className="font-semibold">{t.label}</span>
                  <span className="mt-1 block text-xs text-ink-600">{t.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={create.isPending}>{create.isPending ? "Đang tạo…" : "Tạo và mở trình soạn"}</button>
            <span className="text-xs text-ink-600">Mẫu chỉ là điểm bắt đầu: bạn sửa chữ, ảnh, bật/tắt và đổi thứ tự khối thoải mái.</span>
          </div>
        </form>
      )}
      {msg && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{msg}</p>}

      {pages.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-600">{archived ? "Chưa có trang lưu trữ." : "Chưa có landing nào. Bấm “Tạo landing mới” và chọn một mẫu."}</div>
      ) : (
        <ul className="space-y-3">
          {pages.map((p) => {
            const st = STATUS[p.status] ?? STATUS.draft!;
            return (
              <li key={p.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/landing/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.title}</a>
                    <span className={`chip ${st.cls}`}>{st.label}</span>
                    {p.hasUnpublished && <span className="chip bg-sky-100 text-sky-800">Có thay đổi chưa xuất bản</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-600">
                    <span className="font-mono">{p.path}</span> · Sửa {fmt(p.updatedAt)}{p.updatedBy ? ` · ${p.updatedBy}` : ""}
                    {p.status === "published" && <> · 30 ngày: <strong>{p.views30}</strong> lượt xem, <strong>{p.leads30}</strong> lead</>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <a href={`/landing/${p.id}`} className="btn-ghost !py-1.5">{canEdit ? "Sửa" : "Xem"}</a>
                  {p.status === "published" && <a href={p.path} target="_blank" rel="noopener" className="btn-ghost !py-1.5">Mở trang</a>}
                  {canEdit && (
                    <button type="button" className="btn-ghost !py-1.5" disabled={dup.isPending}
                      onClick={() => {
                        const t = window.prompt("Tên bản sao:", `${p.title} (bản sao)`);
                        if (!t) return;
                        const s = window.prompt("Đường dẫn của bản sao (chữ thường, không dấu):", slugify(t));
                        if (s) { setMsg(null); dup.mutate({ id: p.id, title: t, slug: s }); }
                      }}>Nhân bản</button>
                  )}
                  {canEdit && p.status !== "published" && (
                    <button type="button" className="btn-ghost !py-1.5" disabled={arch.isPending} onClick={() => { setMsg(null); arch.mutate({ id: p.id, archived: !archived }); }}>{archived ? "Khôi phục" : "Lưu trữ"}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

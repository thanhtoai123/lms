"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CHROME_LIMITS, SITE_GROUP_LABEL, SITE_NODES, type SiteChrome, type SiteGroup } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type PageRow = { id: string; slug: string; title: string; status: string; path: string; group: SiteGroup; hasUnpublished: boolean; updatedAt: string };
type Props = { canEdit: boolean; chrome: SiteChrome; counts: { news: number; jobs: number }; missingDemo: { slug: string; title: string }[]; pages: PageRow[] };

const GROUPS: SiteGroup[] = ["main", "course", "policy", "system"];
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

function State({ p }: { p: PageRow | undefined }) {
  if (!p) return <span className="chip bg-black/5 text-ink-600">Chưa tạo</span>;
  if (p.status === "published") return <span className="chip bg-emerald-100 text-emerald-800">Đã xuất bản{p.hasUnpublished ? " · có bản nháp mới" : ""}</span>;
  return <span className="chip bg-amber-100 text-amber-800">Nháp</span>;
}

export function WebsiteStructure({ canEdit, chrome, counts, missingDemo, pages }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [add, setAdd] = useState<"course" | "policy" | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [c, setC] = useState<SiteChrome>(chrome);
  const [dirty, setDirty] = useState(false);

  const demo = useMutation(trpc.website.createDemo.mutationOptions({
    onSuccess: (r) => { setMsg(r.created.length ? `Đã tạo ${r.created.length} trang demo (ở dạng nháp).` : "Không có trang nào cần tạo."); router.refresh(); },
    onError: (e) => setMsg(e.message),
  }));
  const create = useMutation(trpc.website.createPage.mutationOptions({
    onSuccess: (r) => router.push(`/landing/${r.id}`),
    onError: (e) => setMsg(e.message),
  }));
  const save = useMutation(trpc.website.saveChrome.mutationOptions({
    onSuccess: (r) => { setDirty(false); setMsg(r.changed ? "Đã lưu khung chung — mọi trang website dùng menu / chân trang mới." : "Không có thay đổi."); router.refresh(); },
    onError: (e) => setMsg(e.message),
  }));

  const by = new Map(pages.map((p) => [p.slug, p]));
  const set = <K extends keyof SiteChrome>(k: K, v: SiteChrome[K]) => { setC((s) => ({ ...s, [k]: v })); setDirty(true); };
  type ListKey = "nav" | "links" | "addresses";
  const setRow = (k: ListKey, i: number, patch: Record<string, string>) =>
    set(k, (c[k] as readonly object[]).map((r, j) => (j === i ? { ...r, ...patch } : r)) as never);
  const del = (k: ListKey, i: number) => set(k, (c[k] as readonly object[]).filter((_, j) => j !== i) as never);

  return (
    <div className="space-y-6">
      {msg && <p className="card p-3 text-sm" role="status">{msg}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Sơ đồ trang</h2>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {missingDemo.length > 0 && (
                <button type="button" className="btn-primary" disabled={demo.isPending} onClick={() => { setMsg(null); demo.mutate({}); }}>
                  Tạo {missingDemo.length} trang demo còn thiếu
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => { setAdd(add === "course" ? null : "course"); setName(""); setSlug(""); setTouched(false); }}>+ Thêm khoá học</button>
              <button type="button" className="btn-ghost" onClick={() => { setAdd(add === "policy" ? null : "policy"); setName(""); setSlug(""); setTouched(false); }}>+ Thêm trang chính sách</button>
            </div>
          )}
        </div>

        {add && canEdit && (
          <form className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); setMsg(null); create.mutate({ group: add, name, slug }); }}>
            <label className="block text-sm">{add === "course" ? "Tên khoá học" : "Tên trang chính sách"}
              <input className="input mt-1" required minLength={3} maxLength={150} value={name} onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} />
            </label>
            <label className="block text-sm">Đường dẫn
              <div className="mt-1 flex items-center gap-1">
                <span className="text-ink-600">{add === "course" ? "/khoa-hoc/" : "/chinh-sach/"}</span>
                <input className="input" required maxLength={50} value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} />
              </div>
            </label>
            <div className="flex items-end"><button className="btn-primary" disabled={create.isPending}>Tạo và soạn</button></div>
          </form>
        )}

        {GROUPS.map((g) => {
          const nodes = SITE_NODES.filter((n) => n.group === g);
          const known = new Set(nodes.flatMap((n) => (n.slug ? [n.slug] : [])));
          const extra = pages.filter((p) => p.group === g && !known.has(p.slug));
          return (
            <div key={g} className="card overflow-x-auto">
              <h3 className="border-b border-black/10 px-4 py-2 text-sm font-semibold">{SITE_GROUP_LABEL[g]}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {nodes.map((n) => {
                    const p = n.slug ? by.get(n.slug) : undefined;
                    return (
                      <tr key={n.key} className="border-b border-black/5 last:border-0">
                        <td className="px-4 py-2"><div className="font-medium">{n.label}</div><div className="text-xs text-ink-600">{n.desc}</div></td>
                        <td className="px-2 py-2 font-mono text-xs">{n.path}</td>
                        <td className="px-2 py-2">
                          {n.slug === null ? <span className="chip bg-sky-100 text-sky-800">Trang hệ thống{n.key === "news" ? ` · ${counts.news} bài` : n.key === "jobs" ? ` · ${counts.jobs} vị trí` : ""}</span> : <State p={p} />}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">
                          {p && <a className="text-brand-600" href={`/landing/${p.id}`}>Soạn</a>}
                          {n.manage && <a className="text-brand-600" href={n.manage}>Quản lý</a>}
                          {(p?.status === "published" || n.slug === null) && <a className="ml-3 text-brand-600" href={n.path} target="_blank" rel="noopener">Xem →</a>}
                        </td>
                      </tr>
                    );
                  })}
                  {extra.map((p) => (
                    <tr key={p.id} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-2 font-medium">{p.title}</td>
                      <td className="px-2 py-2 font-mono text-xs">{p.path}</td>
                      <td className="px-2 py-2"><State p={p} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <a className="text-brand-600" href={`/landing/${p.id}`}>Soạn</a>
                        {p.status === "published" && <a className="ml-3 text-brand-600" href={p.path} target="_blank" rel="noopener">Xem →</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      <section id="khung" className="card space-y-4 p-4">
        <div>
          <h2 className="text-lg font-semibold">Khung chung: đầu trang & chân trang</h2>
          <p className="text-sm text-ink-600">Sửa một lần, áp dụng cho mọi trang website (kể cả Tin tức, Tuyển dụng, Đăng ký). Landing quảng cáo “/lp/…” giữ đầu / chân trang riêng.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setMsg(null); save.mutate({ chrome: c }); }} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">Điện thoại<input className="input mt-1" maxLength={24} value={c.phone} disabled={!canEdit} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="block text-sm">Chữ nút chính<input className="input mt-1" maxLength={40} value={c.ctaLabel} disabled={!canEdit} onChange={(e) => set("ctaLabel", e.target.value)} /></label>
            <label className="block text-sm">Liên kết nút chính<input className="input mt-1" maxLength={400} value={c.ctaUrl} disabled={!canEdit} onChange={(e) => set("ctaUrl", e.target.value)} /></label>
          </div>

          <RowList title={`Menu (tối đa ${CHROME_LIMITS.nav})`} rows={c.nav} max={CHROME_LIMITS.nav} canEdit={canEdit} a="label" b="href" aLabel="Chữ" bLabel="Liên kết"
            onChange={(i, p) => setRow("nav", i, p)} onDel={(i) => del("nav", i)} onAdd={() => set("nav", [...c.nav, { label: "", href: "/" }])} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Giới thiệu ngắn ở chân trang<input className="input mt-1" maxLength={200} value={c.tagline} disabled={!canEdit} onChange={(e) => set("tagline", e.target.value)} /></label>
            <label className="block text-sm">Email<input className="input mt-1" maxLength={120} value={c.email} disabled={!canEdit} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="block text-sm">Pháp nhân<input className="input mt-1" maxLength={200} value={c.legal} disabled={!canEdit} onChange={(e) => set("legal", e.target.value)} /></label>
            <label className="block text-sm">Bản quyền<input className="input mt-1" maxLength={80} value={c.copyright} disabled={!canEdit} onChange={(e) => set("copyright", e.target.value)} /></label>
          </div>

          <RowList title={`Địa chỉ cơ sở (tối đa ${CHROME_LIMITS.addresses})`} rows={c.addresses} max={CHROME_LIMITS.addresses} canEdit={canEdit} a="label" b="text" aLabel="Tên cơ sở" bLabel="Địa chỉ"
            onChange={(i, p) => setRow("addresses", i, p)} onDel={(i) => del("addresses", i)} onAdd={() => set("addresses", [...c.addresses, { label: "", text: "" }])} />

          <RowList title={`Liên kết chân trang (tối đa ${CHROME_LIMITS.links})`} rows={c.links} max={CHROME_LIMITS.links} canEdit={canEdit} a="label" b="href" aLabel="Chữ" bLabel="Liên kết"
            onChange={(i, p) => setRow("links", i, p)} onDel={(i) => del("links", i)} onAdd={() => set("links", [...c.links, { label: "", href: "/" }])} />

          {canEdit && (
            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={save.isPending || !dirty}>Lưu khung chung</button>
              {dirty && <span className="text-xs text-amber-700">Chưa lưu</span>}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

function RowList({ title, rows, max, canEdit, a, b, aLabel, bLabel, onChange, onDel, onAdd }: {
  title: string; rows: readonly object[]; max: number; canEdit: boolean; a: string; b: string; aLabel: string; bLabel: string;
  onChange: (i: number, p: Record<string, string>) => void; onDel: (i: number) => void; onAdd: () => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      {rows.map((row, i) => {
        const r = row as Record<string, string>;
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input className="input" aria-label={aLabel} placeholder={aLabel} maxLength={200} value={r[a] ?? ""} disabled={!canEdit} onChange={(e) => onChange(i, { [a]: e.target.value })} />
            <input className="input" aria-label={bLabel} placeholder={bLabel} maxLength={400} value={r[b] ?? ""} disabled={!canEdit} onChange={(e) => onChange(i, { [b]: e.target.value })} />
            {canEdit && <button type="button" className="btn-ghost" onClick={() => onDel(i)}>Xoá</button>}
          </div>
        );
      })}
      {canEdit && rows.length < max && <button type="button" className="btn-ghost" onClick={onAdd}>+ Thêm dòng</button>}
    </fieldset>
  );
}

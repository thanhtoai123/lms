"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  LANDING_VARIANTS, SECTION_DEFS, SECTION_TYPES, VARIANT_LABEL, applyChrome, buildPalette, emptySection, normalizeLanding, renderStandalone, validateLanding,
  type LandingDoc, type LandingSection, type LandingVariant, type SectionType, type SiteChrome,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { FieldInput, SectionForm } from "./section-form";

type Brand = { name: string; primary: string; accent: string; logoUrl: string };
type PageData = {
  id: string; slug: string; status: string; path: string; version: number; publishedVersion: number; publishedAt: string | null;
  canRename: boolean; canEdit: boolean; hasUnpublished: boolean;
  /** Trang thuộc website: đầu / chân trang lấy từ khung chung */
  isSite: boolean; siteChrome: SiteChrome | null;
  draft: { title: string; variant: LandingVariant; seoTitle: string; seoDescription: string; seoImage: string; doc: LandingDoc };
  history: { version: number; createdAt: string; byName: string | null }[];
};

const fmt = (d: string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const uid = (type: string) => `${type}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.slice(0, 40);

export function LandingEditor({ page, brand }: { page: PageData; brand: Brand }) {
  const trpc = useTRPC();
  const router = useRouter();
  const canEdit = page.canEdit;

  const [title, setTitle] = useState(page.draft.title);
  const [slug, setSlug] = useState(page.slug);
  const [variant, setVariant] = useState<LandingVariant>(page.draft.variant);
  const [seoTitle, setSeoTitle] = useState(page.draft.seoTitle);
  const [seoDescription, setSeoDescription] = useState(page.draft.seoDescription);
  const [seoImage, setSeoImage] = useState(page.draft.seoImage);
  const [doc, setDoc] = useState<LandingDoc>(page.draft.doc);
  const [sel, setSel] = useState<string>(() => (page.draft.doc.sections.find((s) => s.type === "hero") ?? page.draft.doc.sections[0])?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [device, setDevice] = useState<"phone" | "desktop">("desktop");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [adding, setAdding] = useState("");

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => { setDirty(true); setMsg(null); };
  const check = useMemo(() => validateLanding(doc, { title, slug }), [doc, title, slug]);
  const palette = useMemo(() => buildPalette({ primary: brand.primary, accent: brand.accent }), [brand.primary, brand.accent]);
  const previewHtml = useMemo(
    () => renderStandalone(page.siteChrome ? applyChrome(doc, page.siteChrome) : doc, { slug, variant, mode: "export", homeHref: page.siteChrome ? "/" : undefined, brand: { name: brand.name, logoUrl: brand.logoUrl, palette } }, { title }),
    [doc, slug, variant, title, brand.name, brand.logoUrl, palette, page.siteChrome],
  );

  const selected = doc.sections.find((s) => s.id === sel) ?? null;
  const setSections = (fn: (s: LandingSection[]) => LandingSection[]) => { setDoc((d) => ({ sections: fn(d.sections) })); touch(); };
  const updateSection = (s: LandingSection) => setSections((arr) => arr.map((x) => (x.id === s.id ? s : x)));

  const mid = doc.sections.filter((s) => !SECTION_DEFS[s.type].fixed);
  const moveSection = (id: string, d: -1 | 1) => setSections((arr) => {
    const m = arr.filter((s) => !SECTION_DEFS[s.type].fixed);
    const i = m.findIndex((s) => s.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= m.length) return arr;
    const next = m.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    return [...arr.filter((s) => SECTION_DEFS[s.type].fixed === "top"), ...next, ...arr.filter((s) => SECTION_DEFS[s.type].fixed === "bottom")];
  });
  const removeSection = (id: string) => {
    setSections((arr) => arr.filter((s) => s.id !== id));
    if (sel === id) setSel(doc.sections.find((s) => s.type === "hero")?.id ?? "");
  };
  const addSection = (type: SectionType) => {
    const s = emptySection(type, uid(type));
    setSections((arr) => normalizeLanding({ sections: [...arr, s] }).sections);
    setSel(s.id);
    setAdding("");
  };
  const usedSingles = new Set(doc.sections.filter((s) => SECTION_DEFS[s.type].single).map((s) => s.type));

  const save = useMutation(trpc.landing.saveDraft.mutationOptions({}));
  const publish = useMutation(trpc.landing.publish.mutationOptions({}));
  const unpublish = useMutation(trpc.landing.unpublish.mutationOptions({}));
  const restore = useMutation(trpc.landing.restore.mutationOptions({}));
  const busy = save.isPending || publish.isPending || unpublish.isPending || restore.isPending;

  const saveInput = () => ({
    id: page.id, version: page.version, title, slug: page.canRename ? slug : undefined, variant, seoTitle, seoDescription, seoImage, doc,
  });
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : "Có lỗi, thử lại" });

  const doSave = async () => {
    setMsg(null);
    try {
      await save.mutateAsync(saveInput());
      setDirty(false);
      setMsg({ ok: true, text: "Đã lưu nháp. Trang công khai chưa đổi cho tới khi Xuất bản." });
      router.refresh();
    } catch (e) { fail(e); }
  };
  const doPublish = async () => {
    setMsg(null);
    try {
      if (dirty) { await save.mutateAsync(saveInput()); setDirty(false); }
      const r = await publish.mutateAsync({ id: page.id });
      setMsg({ ok: true, text: `Đã xuất bản (bản ${r.publishedVersion}) — trang công khai đã cập nhật.${r.warnings.length ? ` Lưu ý: ${r.warnings.join("; ")}` : ""}` });
      router.refresh();
    } catch (e) { fail(e); }
  };
  const doUnpublish = async () => {
    if (!window.confirm("Gỡ trang khỏi công khai? Người truy cập đường dẫn này sẽ thấy “không tìm thấy”. Nháp và lịch sử vẫn giữ.")) return;
    setMsg(null);
    try { await unpublish.mutateAsync({ id: page.id }); setMsg({ ok: true, text: "Đã gỡ khỏi công khai." }); router.refresh(); } catch (e) { fail(e); }
  };
  const doRestore = async (version: number) => {
    if (dirty && !window.confirm("Bạn đang có thay đổi chưa lưu — khôi phục sẽ thay bằng nội dung của phiên bản đã chọn. Tiếp tục?")) return;
    setMsg(null);
    try { await restore.mutateAsync({ id: page.id, version }); setDirty(false); setMsg({ ok: true, text: `Đã đưa bản ${version} về nháp. Xem lại rồi bấm Xuất bản nếu muốn dùng.` }); router.refresh(); } catch (e) { fail(e); }
  };

  const live = page.status === "published";
  const pending = dirty || page.hasUnpublished;

  return (
    <div className="space-y-4">
      <div className="card sticky top-0 z-10 flex flex-wrap items-center gap-3 p-3">
        <a href="/landing" className="text-sm text-brand-700">← Danh sách</a>
        <div className="min-w-0 flex-1">
          <input className="input !py-1.5 font-semibold" value={title} maxLength={150} disabled={!canEdit} aria-label="Tên trang" onChange={(e) => { setTitle(e.target.value); touch(); }} />
        </div>
        <span className={`chip ${live ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{live ? "Đang công khai" : "Nháp"}</span>
        {dirty && <span className="chip bg-sky-100 text-sky-800">Chưa lưu</span>}
        {!dirty && page.hasUnpublished && <span className="chip bg-sky-100 text-sky-800">Chưa xuất bản thay đổi</span>}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost !py-1.5" disabled={busy || !dirty} onClick={() => void doSave()}>{save.isPending ? "Đang lưu…" : "Lưu nháp"}</button>
            <button type="button" className="btn-primary !py-1.5" disabled={busy || !pending || check.errors.length > 0} title={check.errors.length ? "Còn lỗi cần sửa (xem khung “Kiểm tra trước khi xuất bản”)" : undefined} onClick={() => void doPublish()}>
              {publish.isPending ? "Đang xuất bản…" : live ? "Xuất bản thay đổi" : "Xuất bản"}
            </button>
          </div>
        )}
        {live && <a href={page.path} target="_blank" rel="noopener" className="btn-ghost !py-1.5">Mở trang</a>}
        {live && <a href={`/api/landing/${page.id}/export`} className="btn-ghost !py-1.5" download>Tải HTML</a>}
      </div>

      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <div className="flex gap-2 text-sm lg:hidden">
        <button type="button" className={`chip ${tab === "edit" ? "bg-brand-600 text-white" : "bg-black/5"}`} onClick={() => setTab("edit")}>Soạn</button>
        <button type="button" className={`chip ${tab === "preview" ? "bg-brand-600 text-white" : "bg-black/5"}`} onClick={() => setTab("preview")}>Xem trước</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className={`space-y-4 ${tab === "edit" ? "" : "hidden lg:block"}`}>
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <nav className="card space-y-1 p-2" aria-label="Các khối của trang">
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Khối của trang</div>
              {doc.sections.map((s) => {
                const def = SECTION_DEFS[s.type];
                const i = mid.findIndex((x) => x.id === s.id);
                const shared = page.isSite && !!def.fixed;
                return (
                  <div key={s.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${sel === s.id ? "bg-brand-100" : "hover:bg-black/5"}`}>
                    <input type="checkbox" checked={shared ? true : s.enabled} disabled={!canEdit || shared} aria-label={`Hiện khối ${def.label}`} onChange={(e) => updateSection({ ...s, enabled: e.target.checked })} />
                    <button type="button" className={`min-w-0 flex-1 truncate text-left ${s.enabled ? "" : "text-ink-600 line-through"}`} onClick={() => setSel(s.id)}>
                      {def.label}{shared && <span className="ml-1 text-[11px] text-ink-600">· dùng chung</span>}
                    </button>
                    {canEdit && !def.fixed && (
                      <span className="flex shrink-0 gap-0.5">
                        <button type="button" className="px-1 text-ink-600 disabled:opacity-30" aria-label="Lên" disabled={i <= 0} onClick={() => moveSection(s.id, -1)}>▲</button>
                        <button type="button" className="px-1 text-ink-600 disabled:opacity-30" aria-label="Xuống" disabled={i < 0 || i >= mid.length - 1} onClick={() => moveSection(s.id, 1)}>▼</button>
                        <button type="button" className="px-1 text-red-700" aria-label="Xoá khối" onClick={() => { if (window.confirm(`Xoá khối “${def.label}”? (Chỉ tắt đi nếu muốn giữ lại nội dung)`)) removeSection(s.id); }}>✕</button>
                      </span>
                    )}
                  </div>
                );
              })}
              {canEdit && (
                <div className="pt-2">
                  <select className="input !py-1.5 text-sm" value={adding} aria-label="Thêm khối" onChange={(e) => { if (e.target.value) addSection(e.target.value as SectionType); }}>
                    <option value="">+ Thêm khối…</option>
                    {SECTION_TYPES.filter((t) => !(SECTION_DEFS[t].single && usedSingles.has(t))).map((t) => <option key={t} value={t}>{SECTION_DEFS[t].label}</option>)}
                  </select>
                </div>
              )}
            </nav>

            <div className="card p-4">
              {selected && page.isSite && SECTION_DEFS[selected.type].fixed
                ? (
                  <div className="space-y-2 text-sm">
                    <h3 className="font-semibold">{SECTION_DEFS[selected.type].label} — dùng chung toàn website</h3>
                    <p className="text-ink-600">Đầu trang (logo, menu, điện thoại, nút) và chân trang (địa chỉ, liên hệ, chính sách) được sửa MỘT lần cho mọi trang của website, nên không sửa ở từng trang.</p>
                    <a href="/website#khung" className="btn-ghost inline-block !py-1.5">Sửa khung chung →</a>
                  </div>
                )
                : selected
                ? <SectionForm key={selected.id} section={selected} disabled={!canEdit} onChange={updateSection} />
                : <p className="text-sm text-ink-600">Chọn một khối ở bên trái để sửa nội dung.</p>}
            </div>
          </div>

          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Cài đặt trang, giao diện & SEO</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-sm">Đường dẫn
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-ink-600">{page.isSite ? page.path : "/lp/"}</span>
                  {!page.isSite && <input className="input" value={slug} maxLength={60} disabled={!canEdit || !page.canRename} onChange={(e) => { setSlug(e.target.value.toLowerCase()); touch(); }} />}
                </div>
                <span className="text-xs text-ink-600">{page.isSite ? "Đường dẫn của trang website được cố định theo cấu trúc, không đổi ở đây." : page.canRename ? "Đổi được cho tới lần xuất bản đầu tiên." : "Đã xuất bản nên khoá đường dẫn (tránh gãy liên kết). Muốn đổi: nhân bản sang đường dẫn mới."}</span>
              </label>
              <label className="block text-sm">Kiểu giao diện
                <select className="input mt-1" value={variant} disabled={!canEdit} onChange={(e) => { setVariant(e.target.value as LandingVariant); touch(); }}>
                  {LANDING_VARIANTS.map((v) => <option key={v} value={v}>{VARIANT_LABEL[v]}</option>)}
                </select>
                <span className="text-xs text-ink-600">Màu lấy tự động từ “Nhận diện thương hiệu” trong Cài đặt hệ thống.</span>
              </label>
              <div className="md:col-span-2 space-y-3">
                <FieldInput f={{ key: "seoTitle", label: "Tiêu đề hiện trên Google / tab trình duyệt", type: "text", max: 70 }} value={seoTitle} disabled={!canEdit} onChange={(v) => { setSeoTitle(v); touch(); }} />
                <FieldInput f={{ key: "seoDescription", label: "Mô tả hiện trên Google / khi chia sẻ", type: "textarea", max: 170 }} value={seoDescription} disabled={!canEdit} onChange={(v) => { setSeoDescription(v); touch(); }} />
                <FieldInput f={{ key: "seoImage", label: "Ảnh khi chia sẻ (Facebook / Zalo)", type: "image", max: 500 }} value={seoImage} disabled={!canEdit} onChange={(v) => { setSeoImage(v); touch(); }} />
              </div>
            </div>
          </details>

          <section className="card space-y-2 p-4" aria-label="Kiểm tra trước khi xuất bản">
            <h3 className="text-sm font-semibold">Kiểm tra trước khi xuất bản</h3>
            {check.errors.length === 0 && check.warnings.length === 0 && <p className="text-sm text-emerald-700">Sẵn sàng xuất bản.</p>}
            {check.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700">Cần sửa ({check.errors.length}) — chưa xuất bản được:</p>
                <ul className="ml-5 list-disc text-sm text-red-700">{check.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            {check.warnings.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700">Nên xem lại ({check.warnings.length}):</p>
                <ul className="ml-5 list-disc text-sm text-amber-700">{check.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </section>

          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Lịch sử xuất bản ({page.history.length})</summary>
            {page.history.length === 0 ? <p className="mt-2 text-sm text-ink-600">Chưa xuất bản lần nào.</p> : (
              <ul className="mt-2 space-y-1 text-sm">
                {page.history.map((h) => (
                  <li key={h.version} className="flex items-center justify-between gap-2">
                    <span>Bản {h.version}{h.version === page.publishedVersion && live ? " (đang dùng)" : ""} · {fmt(h.createdAt)} · {h.byName ?? "—"}</span>
                    {canEdit && <button type="button" className="text-brand-700" disabled={busy} onClick={() => void doRestore(h.version)}>Đưa về nháp</button>}
                  </li>
                ))}
              </ul>
            )}
            {live && canEdit && <button type="button" className="mt-3 text-sm text-red-700" disabled={busy} onClick={() => void doUnpublish()}>Gỡ khỏi công khai</button>}
          </details>
        </div>

        <div className={`${tab === "preview" ? "" : "hidden lg:block"}`}>
          <div className="card sticky top-[72px] p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Xem trước</h3>
              <div className="flex gap-1 text-sm">
                <button type="button" className={`chip ${device === "desktop" ? "bg-brand-600 text-white" : "bg-black/5"}`} onClick={() => setDevice("desktop")}>Máy tính</button>
                <button type="button" className={`chip ${device === "phone" ? "bg-brand-600 text-white" : "bg-black/5"}`} onClick={() => setDevice("phone")}>Điện thoại</button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-black/10 bg-black/5">
              <iframe
                title="Xem trước landing page"
                sandbox=""
                srcDoc={previewHtml}
                className="mx-auto block h-[70vh] bg-white"
                style={{ width: device === "phone" ? 390 : "100%", maxWidth: "100%" }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-600">Bản xem trước phản ánh nháp hiện tại. Form đăng ký thật chỉ hiện ở trang công khai.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

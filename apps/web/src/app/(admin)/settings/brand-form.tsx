"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  BRAND_DEFAULT_COLORS, BRAND_LOGO_MAX, brandColorWarnings, buildPalette, contrast, dominantColor, normalizeHex, suggestAccent, validateBrandColors,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Brand = { primary: string; accent: string; hasLogo: boolean; logoMime: string | null; version: number };

/** Đọc logo (PNG/JPG/WEBP/SVG) ra điểm ảnh nhỏ để tìm màu nổi bật — chạy hoàn toàn ở trình duyệt, không gửi đi đâu */
async function pixelsOf(url: string): Promise<Uint8ClampedArray | null> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try { await img.decode(); } catch { return null; }
  const S = 96;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  const r = Math.min(S / (img.naturalWidth || S), S / (img.naturalHeight || S));
  const w = (img.naturalWidth || S) * r, h = (img.naturalHeight || S) * r;
  g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  try { return g.getImageData(0, 0, S, S).data; } catch { return null; }
}

function Swatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="h-8 w-12 rounded-md border border-black/10" style={{ background: hex }} />
      <span className="text-[10px] text-ink-600">{label}</span>
    </div>
  );
}

export function BrandForm({ initial, canEdit, updatedLine }: { initial: Brand; canEdit: boolean; updatedLine: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [primary, setPrimary] = useState(initial.primary);
  const [accent, setAccent] = useState(initial.accent);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromLogo, setFromLogo] = useState<string | null>(null);

  const colors = { primary, accent };
  const errs = validateBrandColors(colors);
  const warns = errs.length ? [] : brandColorWarnings(colors);
  const valid = errs.length === 0;
  const pal = buildPalette(valid ? colors : BRAND_DEFAULT_COLORS);
  const dirty = normalizeHex(primary) !== initial.primary || normalizeHex(accent) !== initial.accent;
  const logoSrc = initial.hasLogo ? `/api/public/brand/logo?v=${initial.version}` : "/icon.svg";

  const save = useMutation(trpc.admin.saveBrandColors.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: r.changed ? "Đã lưu màu thương hiệu — toàn hệ thống đổi theo ngay." : "Không có thay đổi." }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const reset = useMutation(trpc.admin.resetBrandColors.mutationOptions({
    onSuccess: () => { setPrimary(BRAND_DEFAULT_COLORS.primary); setAccent(BRAND_DEFAULT_COLORS.accent); setMsg({ ok: true, text: "Đã khôi phục tím + cam mặc định." }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const removeLogo = useMutation(trpc.admin.removeBrandLogo.mutationOptions({
    onSuccess: () => { setFromLogo(null); setMsg({ ok: true, text: "Đã gỡ logo, hệ thống dùng biểu tượng mặc định." }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  async function suggestFrom(url: string) {
    const px = await pixelsOf(url);
    const d = px ? dominantColor(px) : null;
    setFromLogo(d);
    return d;
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMsg(null);
    if (f.size > BRAND_LOGO_MAX) { setMsg({ ok: false, text: "Logo tối đa 1MB" }); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/content/brand-logo", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; version?: number } | null;
      if (!res.ok || !j?.ok) { setMsg({ ok: false, text: j?.error ?? "Không tải được logo" }); return; }
      const d = await suggestFrom(URL.createObjectURL(f));
      setMsg({ ok: true, text: d ? "Đã tải logo. Bấm \"Lấy màu từ logo\" để phối màu giao diện theo logo." : "Đã tải logo (không tìm thấy màu nổi bật — hãy tự chọn màu chủ đạo)." });
      router.refresh();
    } finally { setBusy(false); }
  }

  async function useLogoColor() {
    const d = fromLogo ?? (initial.hasLogo ? await suggestFrom(logoSrc) : null);
    if (!d) { setMsg({ ok: false, text: "Không tìm thấy màu nổi bật trong logo — hãy chọn màu thủ công." }); return; }
    setPrimary(d);
    setAccent(suggestAccent(d));
    setMsg({ ok: true, text: "Đã điền màu lấy từ logo (chưa lưu). Xem thử bên dưới rồi bấm Lưu màu." });
  }

  const pending = save.isPending || reset.isPending || removeLogo.isPending || busy;
  const onPrimary = contrast(pal["--primary"]!, pal["--primary-foreground"]!);

  return (
    <section className="card space-y-4 p-4" aria-labelledby="brand-h">
      <div>
        <h2 id="brand-h" className="font-semibold">Nhận diện thương hiệu</h2>
        <p className="text-xs text-ink-600">Logo và màu chủ đạo áp dụng cho khu quản trị, khu giáo viên, cổng phụ huynh, trang đăng nhập, giấy chứng nhận và biểu tượng tab. {updatedLine}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Logo */}
        <div className="space-y-3">
          <div className="text-sm font-medium">Logo</div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="Logo hiện tại" className="h-16 w-16 rounded-xl border border-border bg-white object-contain p-1" />
            <div className="flex h-16 w-16 items-center justify-center rounded-xl p-1" style={{ background: pal["--primary"] }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="" className="h-full w-full rounded-lg bg-white object-contain p-0.5" />
            </div>
            <span className="text-xs text-ink-600">{initial.hasLogo ? "Logo đã tải lên" : "Đang dùng biểu tượng mặc định"}</span>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onPick} />
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => fileRef.current?.click()}>{initial.hasLogo ? "Đổi logo" : "Tải logo lên"}</button>
              {initial.hasLogo && <button type="button" className="btn-ghost text-red-700" disabled={pending} onClick={() => removeLogo.mutate()}>Gỡ logo</button>}
              <button type="button" className="btn-ghost" disabled={pending} onClick={useLogoColor}>Lấy màu từ logo</button>
            </div>
          )}
          <p className="text-xs text-ink-400">PNG, JPG, WEBP hoặc SVG, tối đa 1MB. Nên dùng logo vuông, nền trong suốt, tối thiểu 256×256 px. SVG chỉ nhận hình tĩnh (không script, không liên kết ngoài).</p>
          {fromLogo && <div className="flex items-center gap-2 text-xs"><span className="h-5 w-5 rounded border border-black/10" style={{ background: fromLogo }} />Màu nổi bật trong logo: <code>{fromLogo}</code></div>}
        </div>

        {/* Màu */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {([["Màu chủ đạo", primary, setPrimary, "Nút, liên kết, thanh bên, tiêu đề nổi bật"], ["Màu nhấn", accent, setAccent, "Điểm nhấn phụ, huy hiệu, học viên"]] as const).map(([label, val, set, hint]) => (
              <label key={label} className="text-sm">
                {label}
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" aria-label={label} value={normalizeHex(val) ?? "#000000"} disabled={!canEdit} onChange={(e) => set(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-border bg-white p-0.5 disabled:cursor-not-allowed" />
                  <input className="input w-full font-mono" value={val} maxLength={7} disabled={!canEdit} onChange={(e) => set(e.target.value.trim())} spellCheck={false} />
                </div>
                <span className="text-xs text-ink-400">{hint}</span>
              </label>
            ))}
          </div>
          {errs.map((e) => <p key={e} className="text-xs text-red-700">{e}</p>)}
          {warns.map((w) => <p key={w} className="rounded bg-amber-50 p-2 text-xs text-amber-800">{w}</p>)}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost" disabled={!valid} onClick={() => setAccent(suggestAccent(primary))}>Gợi ý màu nhấn hài hoà</button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => { if (window.confirm("Khôi phục tím + cam mặc định của Sata Robo?")) reset.mutate(); }}>Khôi phục mặc định</button>
            </div>
          )}
        </div>
      </div>

      {/* Xem thử: dựng bằng chính các lớp của hệ thống, biến màu đặt cục bộ nên chưa ảnh hưởng nơi khác cho tới khi lưu */}
      <div className="rounded-xl border border-border p-3" style={pal as React.CSSProperties} aria-label="Xem thử màu">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-600">
          <span>Xem thử{dirty ? " (chưa lưu)" : ""}</span>
          <span>Chữ trên nút: tương phản {onPrimary.toFixed(1)}:1 {onPrimary >= 4.5 ? "· đạt" : "· thấp"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary">Nút chính</button>
          <button type="button" className="btn-ghost">Nút phụ</button>
          <span className="chip bg-brand-50 text-brand-700">Nhãn</span>
          <span className="chip bg-accent-100 text-accent-700">Nhấn</span>
          <a className="text-sm font-semibold text-brand-600 underline" href="#brand-h" onClick={(e) => e.preventDefault()}>Liên kết</a>
          <span className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">Mục menu đang chọn</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Swatch label="50" hex={pal["--brand-50"]!} />
          <Swatch label="100" hex={pal["--brand-100"]!} />
          <Swatch label="200" hex={pal["--brand-200"]!} />
          <Swatch label="300" hex={pal["--brand-300"]!} />
          <Swatch label="Chủ đạo" hex={pal["--primary"]!} />
          <Swatch label="Đậm" hex={pal["--primary-dark"]!} />
          <Swatch label="Đậm hơn" hex={pal["--primary-darker"]!} />
          <Swatch label="Chữ" hex={pal["--primary-ink"]!} />
          <Swatch label="Nhấn" hex={pal["--accent"]!} />
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={!valid || !dirty || pending} onClick={() => { setMsg(null); save.mutate({ primary: normalizeHex(primary)!, accent: normalizeHex(accent)! }); }}>Lưu màu thương hiệu</button>
          {dirty && !pending && <button type="button" className="btn-ghost" onClick={() => { setPrimary(initial.primary); setAccent(initial.accent); setMsg(null); }}>Hoàn tác</button>}
          {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</span>}
        </div>
      )}
      {!canEdit && <p className="text-xs text-ink-600">Chỉ Quản trị hệ thống được đổi nhận diện thương hiệu.</p>}
    </section>
  );
}

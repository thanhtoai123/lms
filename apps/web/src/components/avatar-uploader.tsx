"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { AVATAR_SIZE } from "@satarobo/core";
import { StudentAvatar } from "./student-avatar";

/**
 * Đổi ảnh đại diện học viên. Ảnh được CẮT VUÔNG ở giữa, thu về {AVATAR_SIZE}px và mã hoá lại JPEG ngay trên máy
 * (nhẹ, không còn dữ liệu EXIF như vị trí chụp) rồi mới gửi lên. Dùng cho cả nhân sự và cổng phụ huynh — khác nhau
 * ở địa chỉ gửi (`endpoint`) và trường kèm theo (`fields`).
 */
export function AvatarUploader({
  endpoint, fields = {}, current, name, nickname, seed, size = 96, canEdit = true, compact = false, minimal = false, addLabel = "Thêm ảnh",
}: { /** Chỉ hiện nút máy ảnh trên ảnh, không có dòng chữ bên dưới */ minimal?: boolean; addLabel?: string; endpoint: string; fields?: Record<string, string>; current: string | null; name: string; nickname?: string | null; seed?: string | null; size?: number; canEdit?: boolean; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toJpeg(file: File): Promise<Blob> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Không đọc được ảnh")); i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      if (!side) throw new Error("Ảnh không hợp lệ");
      const out = Math.min(AVATAR_SIZE, side);
      const c = document.createElement("canvas");
      c.width = out; c.height = out;
      const g = c.getContext("2d");
      if (!g) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, out, out);
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Không nén được ảnh"))), "image/jpeg", 0.86));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErr("Chọn một tệp ảnh (JPG, PNG, WEBP, HEIC của điện thoại…)"); return; }
    setErr(null); setBusy(true);
    try {
      const blob = await toJpeg(f);
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append("file", new File([blob], "anh-dai-dien.jpg", { type: "image/jpeg" }));
      const r = await fetch(endpoint, { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; url?: string | null; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "Không lưu được ảnh");
      setPreview(j.url ?? URL.createObjectURL(blob));
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Không lưu được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "Không gỡ được ảnh");
      setPreview(null);
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Không gỡ được ảnh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex items-center gap-3" : "flex flex-col items-center gap-2"}>
      <div className="relative">
        <StudentAvatar src={preview} name={name} nickname={nickname} seed={seed} size={size} ring />
        {canEdit && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className={`absolute -bottom-1 -right-1 grid ${size < 72 ? "h-7 w-7" : "h-9 w-9"} place-items-center rounded-full border-2 border-white bg-accent text-accent-foreground shadow disabled:opacity-60`}
            aria-label={preview ? "Đổi ảnh đại diện" : "Thêm ảnh đại diện"} title={preview ? "Đổi ảnh" : "Thêm ảnh"}>
            <Camera className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {canEdit && !minimal && (
        <div className={`flex flex-wrap items-center gap-2 text-[13px] ${compact ? "" : "justify-center"}`}>
          <button type="button" className="font-semibold text-primary-ink disabled:opacity-60" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Đang lưu…" : preview ? "Đổi ảnh" : addLabel}
          </button>
          {preview && !busy && (
            <button type="button" className="inline-flex items-center gap-1 text-ink-600 hover:text-red-700" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />Gỡ ảnh
            </button>
          )}
        </div>
      )}
      {canEdit && <input ref={input} type="file" accept="image/*" className="hidden" onChange={onPick} aria-label="Chọn ảnh đại diện" />}
      {err && <p role="alert" className="text-[13px] text-red-700">{err}</p>}
    </div>
  );
}

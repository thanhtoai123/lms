"use client";

/**
 * Khối "Hồ sơ học tập" trên trang học viên (quản trị) + drawer chia sẻ — không thêm tab.
 *  - Xem hồ sơ / In – Lưu PDF (mở trang hồ sơ nội bộ).
 *  - Chia sẻ link riêng /hs/<token> theo phạm vi (toàn bộ / một khoá / khoảng ngày), hạn mặc định 180 ngày.
 *  - Danh sách link đã chia sẻ: trạng thái, lượt xem, thu hồi (bắt buộc lý do).
 *  - Xuất PDF lưu trữ phía máy chủ (chỉ hiện khi máy chủ bật PDF_RENDERER=playwright).
 */
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, BookOpenCheck, Copy, FileDown, Printer, Share2 } from "lucide-react";
import { PORTFOLIO_SHARE_SCOPES, PORTFOLIO_SHARE_SCOPE_VI, PORTFOLIO_SHARE_DAYS_DEFAULT, type PortfolioShareScope } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { Drawer } from "@/components/drawer";
import { ActionButton } from "@/components/action-button";
import { useToast } from "@/components/toast";

const fmt = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    return false;
  }
}

export function PortfolioBlock({ studentId, studentName }: { studentId: string; studentName: string }) {
  const trpc = useTRPC();
  const opts = useQuery(trpc.portfolio.options.queryOptions({ studentId }));
  const [open, setOpen] = useState(false);
  const o = opts.data;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-bold"><BookOpenCheck className="h-4 w-4 text-primary" aria-hidden /> Hồ sơ học tập</h2>
          <p className="text-xs text-muted-foreground">
            {opts.isLoading ? "Đang tải…" : o ? `${o.sheets} phiếu nhận xét buổi đã phát hành · ${o.enrollments.length} khoá` : opts.error?.message ?? ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/ho-so-hoc-tap/${studentId}`} className="btn-primary !py-1.5 text-xs">Xem hồ sơ</Link>
        <Link href={`/ho-so-hoc-tap/${studentId}?in=1`} className="btn-ghost !py-1.5 text-xs"><Printer className="h-3.5 w-3.5" aria-hidden /> In / Lưu PDF</Link>
        {o?.perms.share && (
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(true)}><Share2 className="h-3.5 w-3.5" aria-hidden /> Chia sẻ</button>
        )}
      </div>
      {o && <ShareDrawer open={open} onClose={() => setOpen(false)} studentId={studentId} studentName={studentName} enrollments={o.enrollments} canExport={o.perms.export} />}
    </section>
  );
}

export function ShareDrawer({
  open, onClose, studentId, studentName, enrollments, canExport,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  enrollments: { id: string; label: string }[];
  canExport: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const shares = useQuery({ ...trpc.portfolio.shares.queryOptions({ studentId }), enabled: open });
  const [scope, setScope] = useState<PortfolioShareScope>("all");
  const [enrollmentId, setEnrollmentId] = useState(enrollments[0]?.id ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<number>(PORTFOLIO_SHARE_DAYS_DEFAULT);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<{ url: string; message: string; expiresAt: Date | string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.portfolio.shares.queryKey({ studentId }) });

  const create = useMutation(trpc.portfolio.createShare.mutationOptions());
  const revoke = useMutation(trpc.portfolio.revokeShare.mutationOptions());
  const exportPdf = useMutation(trpc.portfolio.exportPdf.mutationOptions());

  const scopeInput = { scope, enrollmentId: scope === "course" ? enrollmentId || null : null, from: scope === "range" ? from || null : null, to: scope === "range" ? to || null : null };
  const previewQuery = scope === "course" && enrollmentId ? `?enrollmentId=${enrollmentId}` : scope === "range" && from && to ? `?from=${from}&to=${to}` : "";

  const doCreate = async () => {
    try {
      const r = await create.mutateAsync({ studentId, ...scopeInput, days, label: label.trim() || null });
      setCreated(r);
      const ok = await copyText(r.url);
      toast.ok(ok ? "Đã tạo link và sao chép vào bộ nhớ tạm" : "Đã tạo link chia sẻ");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const doShare = async (url: string, message: string) => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try { await nav.share({ title: `Hồ sơ học tập — ${studentName}`, text: message, url }); return; } catch { /* người dùng huỷ */ }
    }
    toast.show((await copyText(message)) ? "Đã sao chép tin nhắn kèm link" : "Không sao chép được — hãy chọn và sao chép thủ công");
  };
  const doRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync({ id, reason: reason.trim() });
      toast.ok("Đã thu hồi link — người nhận không mở được nữa");
      setRevoking(null);
      setReason("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const doExport = async () => {
    try {
      const r = await exportPdf.mutateAsync({ studentId, ...scopeInput });
      toast.ok(`Đã lưu bản PDF (${Math.round(r.sizeBytes / 1024)} KB) vào kho lưu trữ`);
      window.open(r.url, "_blank", "noopener");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Chia sẻ hồ sơ học tập" desc={`${studentName} — link riêng, có hạn, thu hồi được; không lộ SĐT / địa chỉ phụ huynh`} width="lg">
      <div className="space-y-5">
        <section className="space-y-2 rounded-xl border border-border p-3">
          <div className="text-sm font-bold">Tạo link mới</div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Phạm vi chia sẻ">
            {PORTFOLIO_SHARE_SCOPES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)}
                className={`chip cursor-pointer px-3 py-1.5 ${scope === s ? "bg-primary text-white" : "bg-muted text-foreground"}`}>{PORTFOLIO_SHARE_SCOPE_VI[s]}</button>
            ))}
          </div>
          {scope === "course" && (
            <select className="input" value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)} aria-label="Khoá học">
              {enrollments.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          )}
          {scope === "range" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">Từ ngày<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-xs">Đến ngày<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          )}
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <label className="text-xs">Hiệu lực (ngày)<input type="number" min={1} max={365} className="input mt-1" value={days} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || PORTFOLIO_SHARE_DAYS_DEFAULT)))} /></label>
            <label className="text-xs">Ghi chú nội bộ (gửi cho ai)<input className="input mt-1" maxLength={120} placeholder="Gửi mẹ qua Zalo" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onRun={doCreate} busyLabel="Đang tạo…"><Share2 className="h-4 w-4" aria-hidden /> Tạo link & sao chép</ActionButton>
            <Link href={`/ho-so-hoc-tap/${studentId}${previewQuery}`} className="btn-ghost min-h-10 text-sm">Xem trước</Link>
            {canExport && <ActionButton variant="ghost" onRun={doExport} busyLabel="Đang xuất PDF…"><FileDown className="h-4 w-4" aria-hidden /> Xuất PDF lưu trữ</ActionButton>}
          </div>
          {created && (
            <div className="space-y-1.5 rounded-lg bg-brand-50 p-2.5 text-sm">
              <div className="break-all font-mono text-xs">{created.url}</div>
              <div className="text-xs text-muted-foreground">Hiệu lực đến {fmt(created.expiresAt)}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost !py-1 text-xs" onClick={async () => toast.show((await copyText(created.url)) ? "Đã sao chép link" : "Không sao chép được")}><Copy className="h-3.5 w-3.5" aria-hidden /> Sao chép link</button>
                <button type="button" className="btn-primary !py-1 text-xs" onClick={() => void doShare(created.url, created.message)}><Share2 className="h-3.5 w-3.5" aria-hidden /> Chia sẻ (Zalo…)</button>
              </div>
              <p className="rounded bg-white p-2 text-xs">{created.message}</p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-sm font-bold">Link đã chia sẻ</div>
          {shares.isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
          {shares.data && shares.data.shares.length === 0 && <p className="text-sm text-muted-foreground">Chưa chia sẻ link nào.</p>}
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(shares.data?.shares ?? []).map((s) => (
              <li key={s.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{s.scopeLabel}{s.label ? <span className="font-normal text-muted-foreground"> · {s.label}</span> : null}</div>
                  <span className={`chip ${s.state === "ok" ? "bg-green-100 text-green-800" : s.state === "revoked" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{s.stateLabel}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Tạo {fmt(s.createdAt)}{s.createdByName ? ` bởi ${s.createdByName}` : ""} · hết hạn {fmt(s.expiresAt)} · <b>{s.viewCount}</b> lượt xem{s.lastViewedAt ? ` (gần nhất ${fmt(s.lastViewedAt)})` : ""}
                </div>
                {s.revokeReason && <div className="text-xs text-red-700">Lý do thu hồi: {s.revokeReason}</div>}
                {s.state === "ok" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {s.url && <button type="button" className="btn-ghost !py-1 text-xs" onClick={async () => toast.show((await copyText(s.url ?? "")) ? "Đã sao chép link" : "Không sao chép được")}><Copy className="h-3.5 w-3.5" aria-hidden /> Sao chép</button>}
                    {revoking === s.id ? (
                      <span className="flex flex-1 flex-wrap gap-1">
                        <input className="input !py-1 text-xs" placeholder="Lý do thu hồi *" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                        <ActionButton variant="ghost" className="!min-h-8 text-xs text-red-700" disabled={reason.trim().length < 3} onRun={() => doRevoke(s.id)} busyLabel="Đang thu hồi…">Xác nhận thu hồi</ActionButton>
                        <button type="button" className="text-xs text-muted-foreground" onClick={() => setRevoking(null)}>Huỷ</button>
                      </span>
                    ) : (
                      <button type="button" className="btn-ghost !py-1 text-xs text-red-700" onClick={() => { setRevoking(s.id); setReason(""); }}><Ban className="h-3.5 w-3.5" aria-hidden /> Thu hồi</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {shares.data && shares.data.exports.length > 0 && (
          <section className="space-y-2">
            <div className="text-sm font-bold">Bản PDF lưu trữ</div>
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {shares.data.exports.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>{x.scopeLabel} · {fmt(x.createdAt)}{x.createdByName ? ` · ${x.createdByName}` : ""} · {Math.round(x.sizeBytes / 1024)} KB</span>
                  <a href={x.url} target="_blank" rel="noopener" className="text-xs font-semibold text-primary underline">Mở PDF</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}

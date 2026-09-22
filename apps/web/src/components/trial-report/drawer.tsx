"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarPlus, Copy, Eye, FileText, Pencil, Printer, Send, Share2 } from "lucide-react";
import {
  TRIAL_READINESS, TRIAL_READINESS_VI, TRIAL_READINESS_HINT, TRIAL_REPORT_STATUS_VI, TRIAL_REPORT_COMMENT_MIN, TRIAL_REPORT_COMMENT_MAX,
  TRIAL_REPORT_NOTE_MAX, TRIAL_REPORT_LEVEL_MAX,
  applyValues, validateTrialReport, trialReportShareMessage,
  type TrialReadiness, type TrialReportView, type TrialReportStatus,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { Drawer } from "@/components/drawer";
import { ActionButton } from "@/components/action-button";
import { useToast } from "@/components/toast";
import { TrialReportSheet } from "./sheet";

type Report = RouterOutputs["admissions"]["trialReports"]["get"];

/** Nguồn phiếu: buổi thử lẻ / học viên lớp trải nghiệm / lead (+ bé) */
export type TrialReportSource =
  | { trialBookingId: string }
  | { trialClassEnrollmentId: string }
  | { leadId: string; childId?: string | null };

interface Form {
  values: Record<string, number | null>;
  strengths: string;
  growth: string;
  productNote: string;
  readiness: TrialReadiness | null;
  recommendedCourseId: string;
  recommendedLevel: string;
  recommendationNote: string;
  pathway: boolean;
  competitionPotential: boolean;
  courseId: string;
}

const fromReport = (d: Report): Form => ({
  values: { ...d.values },
  strengths: d.strengths,
  growth: d.growth,
  productNote: d.productNote,
  readiness: d.readiness,
  recommendedCourseId: d.recommendedCourseId ?? "",
  recommendedLevel: d.recommendedLevel,
  recommendationNote: d.recommendationNote,
  pathway: d.pathway,
  competitionPotential: d.competitionPotential,
  courseId: d.courseId ?? "",
});

const STATUS_CHIP: Record<TrialReportStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-green-100 text-green-800",
  revoked: "bg-red-100 text-red-700",
};
export function TrialReportStatusChip({ status }: { status: TrialReportStatus }) {
  return <span className={`chip ${STATUS_CHIP[status]}`}>{TRIAL_REPORT_STATUS_VI[status]}</span>;
}

/** Màu nút khi được chọn — nấc thấp cam nhấn, nấc giữa tím nhạt, nấc cao tím thương hiệu */
const TONE_ON = [
  "border-accent-500 bg-accent-500 text-white",
  "border-brand-400 bg-brand-400 text-white",
  "border-primary bg-primary text-white",
] as const;
const tone = (i: number, n: number) => (n <= 1 ? 2 : Math.round((i / (n - 1)) * 2));

const msg = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Lỗi không xác định");

/** Sao chép vào bộ nhớ tạm; trình duyệt chặn Clipboard API thì dùng cách cũ */
async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const fmtDateTime = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
};

/**
 * Nút "Phiếu đánh giá" — một chạm mở drawer; drawer tự mở phiếu đang có của buổi thử,
 * chưa có thì tạo bản nháp điền sẵn.
 */
export function TrialReportButton({
  source, label = "Phiếu đánh giá", className, autoOpen = false, onChanged,
}: {
  source: TrialReportSource;
  label?: string;
  className?: string;
  autoOpen?: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <>
      <button type="button" className={className ?? "btn-ghost !px-2 !py-1 text-xs"} onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" aria-hidden /> {label}
      </button>
      {open && <TrialReportDrawer source={source} onClose={() => { setOpen(false); onChanged?.(); }} />}
    </>
  );
}

export function TrialReportDrawer({ source, reportId, onClose }: { source?: TrialReportSource; reportId?: string; onClose: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [id, setId] = useState<string | null>(reportId ?? null);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [revoking, setRevoking] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [origin, setOrigin] = useState("");
  const started = useRef(false);

  const openM = useMutation(trpc.admissions.trialReports.open.mutationOptions());
  const updateM = useMutation(trpc.admissions.trialReports.update.mutationOptions());
  const publishM = useMutation(trpc.admissions.trialReports.publish.mutationOptions());
  const revokeM = useMutation(trpc.admissions.trialReports.revoke.mutationOptions());
  const extendM = useMutation(trpc.admissions.trialReports.extend.mutationOptions());
  const q = useQuery({ ...trpc.admissions.trialReports.get.queryOptions({ id: id ?? "" }), enabled: !!id });

  useEffect(() => setOrigin(window.location.origin), []);

  // Một chạm: có nguồn mà chưa có id → mở / tạo phiếu ngay khi drawer hiện
  useEffect(() => {
    if (id || !source || started.current) return;
    started.current = true;
    openM.mutateAsync({ ...source })
      .then((r) => setId(r.id))
      .catch((e: unknown) => setOpenErr(msg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Nạp lại biểu mẫu từ máy chủ khi không có thay đổi chưa lưu
  useEffect(() => {
    if (q.data && !dirty) setForm(fromReport(q.data));
  }, [q.data, dirty]);

  const refresh = async () => {
    if (!id) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: trpc.admissions.trialReports.get.queryKey({ id }) }),
      qc.invalidateQueries({ queryKey: trpc.admissions.trialReports.list.queryKey() }),
    ]);
  };

  const close = () => {
    if (dirty && !window.confirm("Phiếu có thay đổi chưa lưu. Vẫn đóng?")) return;
    onClose();
  };

  const d = q.data;
  const title = d ? `Phiếu đánh giá · ${d.childName}` : "Phiếu đánh giá buổi học thử";
  const desc = d ? `${d.code} · ${TRIAL_REPORT_STATUS_VI[d.status]}` : undefined;

  if (openErr || q.error) {
    return (
      <Drawer open onClose={onClose} title={title} width="lg">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{openErr ?? q.error?.message}</div>
      </Drawer>
    );
  }
  if (!d || !form) {
    return (
      <Drawer open onClose={onClose} title={title} width="lg">
        <div className="space-y-3" aria-busy>
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          <p className="text-center text-xs text-muted-foreground">Đang mở phiếu…</p>
        </div>
      </Drawer>
    );
  }

  const canEdit = d.perms.edit;
  const set = (p: Partial<Form>) => { setForm((f) => (f ? { ...f, ...p } : f)); setDirty(true); };
  const setText = (k: "strengths" | "growth" | "productNote", v: string) =>
    set(k === "strengths" ? { strengths: v } : k === "growth" ? { growth: v } : { productNote: v });
  const setValue = (key: string, v: number | null) => { setForm((f) => (f ? { ...f, values: { ...f.values, [key]: v } } : f)); setDirty(true); };
  const answers = applyValues(d.answers, form.values);
  const publishErrs = validateTrialReport({
    mode: "publish", answers, strengths: form.strengths, growth: form.growth, productNote: form.productNote, readiness: form.readiness,
    recommendedCourseId: form.recommendedCourseId || null, recommendedLevel: form.recommendedLevel, recommendationNote: form.recommendationNote,
  });
  const course = (cid: string) => d.courses.find((c) => c.id === cid) ?? null;
  const preview: TrialReportView = {
    ...d.view,
    answers,
    strengths: form.strengths.trim() || null,
    growth: form.growth.trim() || null,
    productNote: form.productNote.trim() || null,
    readiness: form.readiness,
    recommendedCourseName: course(form.recommendedCourseId)?.name ?? null,
    recommendedLevel: form.recommendedLevel.trim() || null,
    recommendationNote: form.recommendationNote.trim() || null,
    pathway: form.pathway,
    competitionPotential: form.competitionPotential,
    courseName: form.courseId ? course(form.courseId)?.name ?? d.view.courseName : null,
  };
  const shareUrl = d.share.path ? `${origin || ""}${d.share.path}` : null;
  const shareMessage = shareUrl ? trialReportShareMessage(d.childName, shareUrl) : null;

  const save = async () => {
    await updateM.mutateAsync({
      id: d.id,
      values: form.values,
      strengths: form.strengths,
      growth: form.growth,
      productNote: form.productNote,
      readiness: form.readiness,
      recommendedCourseId: form.recommendedCourseId || null,
      recommendedLevel: form.recommendedLevel,
      recommendationNote: form.recommendationNote,
      pathway: form.pathway,
      competitionPotential: form.competitionPotential,
      courseId: form.courseId || null,
    });
    await refresh();
    setDirty(false);
  };

  const onSave = async () => {
    try {
      await save();
      toast.ok(d.status === "published" ? "Đã lưu — phụ huynh thấy nội dung mới ngay trên link" : "Đã lưu nháp");
    } catch (e) {
      toast.error("Chưa lưu được", { detail: msg(e) });
    }
  };

  const onPublish = async () => {
    try {
      if (dirty) await save();
      const r = await publishM.mutateAsync({ id: d.id });
      const url = `${window.location.origin}${r.path}`;
      const copied = await copyText(url);
      await refresh();
      toast.ok(copied ? "Đã phát hành — link đã được sao chép" : "Đã phát hành phiếu", {
        detail: [copied ? null : "Bấm \"Sao chép\" ở khung link để gửi phụ huynh.", r.emailQueued ? "Đã xếp email gửi phụ huynh." : null].filter(Boolean).join(" ") || undefined,
      });
    } catch (e) {
      toast.error("Chưa phát hành được", { detail: msg(e) });
    }
  };

  const onPrint = async () => {
    // Mở cửa sổ ngay trong cú bấm (tránh bị chặn popup), lưu xong mới trỏ tới trang in
    const w = window.open("about:blank", "_blank");
    try {
      if (dirty) await save();
    } catch (e) {
      w?.close();
      toast.error("Chưa lưu được nên chưa in", { detail: msg(e) });
      return;
    }
    const url = `/phieu-danh-gia/${d.id}`;
    if (w) w.location.href = url;
    else window.location.assign(url);
  };

  const onShare = async () => {
    if (!shareMessage) return;
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: "Phiếu đánh giá buổi học thử", text: shareMessage });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
      }
    }
    const ok = await copyText(shareMessage);
    if (ok) toast.ok("Đã sao chép tin nhắn kèm link — dán vào Zalo cho phụ huynh");
    else toast.error("Không sao chép được — hãy chọn và sao chép thủ công");
  };

  const onRecreate = async () => {
    try {
      const src = d.trialBookingId ? { trialBookingId: d.trialBookingId }
        : d.trialClassEnrollmentId ? { trialClassEnrollmentId: d.trialClassEnrollmentId }
          : { leadId: d.leadId, childId: d.childId };
      const r = await openM.mutateAsync(src);
      setDirty(false);
      setId(r.id);
      await qc.invalidateQueries({ queryKey: trpc.admissions.trialReports.list.queryKey() });
      toast.ok("Đã lập phiếu mới (chép nội dung phiếu cũ để sửa)");
    } catch (e) {
      toast.error("Chưa lập được phiếu mới", { detail: msg(e) });
    }
  };

  const footer = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      {canEdit && (
        <ActionButton variant="ghost" onRun={onSave} busyLabel="Đang lưu…" disabled={!dirty}>
          {d.status === "published" ? "Lưu thay đổi" : "Lưu nháp"}
        </ActionButton>
      )}
      <button type="button" className="btn-ghost min-h-10" onClick={() => setMode(mode === "edit" ? "preview" : "edit")}>
        {mode === "edit" ? <><Eye className="h-4 w-4" aria-hidden /> Xem trước</> : <><Pencil className="h-4 w-4" aria-hidden /> Sửa phiếu</>}
      </button>
      {d.perms.publish && (
        <ActionButton onRun={onPublish} busyLabel="Đang phát hành…" disabled={publishErrs.length > 0} title={publishErrs.join("\n") || undefined} className="col-span-2 sm:col-span-1">
          <Send className="h-4 w-4" aria-hidden /> Phát hành &amp; sao chép link
        </ActionButton>
      )}
      <ActionButton variant="ghost" onRun={onPrint} busyLabel="Đang mở…" className={d.perms.publish ? "col-span-2 sm:col-span-1" : ""}>
        <Printer className="h-4 w-4" aria-hidden /> In / Lưu PDF
      </ActionButton>
    </div>
  );

  return (
    <Drawer open onClose={close} title={title} desc={desc} width="lg" footer={footer}>
      <div className="space-y-5">
        {/* Link đã phát hành: sao chép / chia sẻ / tin nhắn Zalo / theo dõi phụ huynh */}
        {d.status === "published" && shareUrl && (
          <section className="space-y-3 rounded-xl border border-green-200 bg-green-50/60 p-3" aria-label="Link gửi phụ huynh">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-green-900">Link gửi phụ huynh</h3>
              <span className={`chip ${d.share.state === "ok" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {d.share.state === "ok" ? `Hiệu lực đến ${fmtDateTime(d.share.expiresAt)}` : "Đã hết hạn"}
              </span>
            </div>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={shareUrl} aria-label="Link phiếu đánh giá" onFocus={(e) => e.currentTarget.select()} />
              <ActionButton variant="ghost" onRun={async () => { const ok = await copyText(shareUrl); if (ok) toast.ok("Đã sao chép link"); else toast.error("Không sao chép được"); }}>
                <Copy className="h-4 w-4" aria-hidden /> Sao chép
              </ActionButton>
            </div>
            <div>
              <label className="label" htmlFor="pdg-msg">Tin nhắn soạn sẵn (dán Zalo)</label>
              <textarea id="pdg-msg" className="input min-h-16 text-sm" readOnly value={shareMessage ?? ""} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton onRun={onShare}><Share2 className="h-4 w-4" aria-hidden /> Chia sẻ</ActionButton>
              <ActionButton variant="ghost" onRun={async () => { const ok = shareMessage ? await copyText(shareMessage) : false; if (ok) toast.ok("Đã sao chép tin nhắn"); else toast.error("Không sao chép được"); }}>
                <Copy className="h-4 w-4" aria-hidden /> Sao chép tin nhắn
              </ActionButton>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-card p-2"><dt className="text-muted-foreground">Lượt xem</dt><dd className="text-base font-bold">{d.share.viewCount}</dd>{d.share.lastViewedAt && <dd className="text-muted-foreground">gần nhất {fmtDateTime(d.share.lastViewedAt)}</dd>}</div>
              <div className="rounded-lg bg-card p-2">
                <dt className="text-muted-foreground">Phụ huynh đăng ký tư vấn</dt>
                <dd className={`text-sm font-bold ${d.share.parentResponse ? "text-green-700" : "text-muted-foreground"}`}>{d.share.parentResponse ? `Đã bấm · ${fmtDateTime(d.share.parentRespondedAt)}` : "Chưa bấm"}</dd>
              </div>
            </dl>
            {d.perms.manageLink && (
              revoking ? (
                <div className="space-y-2 rounded-lg border border-red-200 bg-card p-2">
                  <label className="label" htmlFor="pdg-revoke">Lý do thu hồi (bắt buộc)</label>
                  <input id="pdg-revoke" className="input" autoFocus maxLength={300} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="VD: gửi nhầm phụ huynh, cần sửa lớn…" />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-ghost min-h-10" onClick={() => { setRevoking(false); setRevokeReason(""); }}>Thôi</button>
                    <ActionButton
                      className="!bg-red-600 hover:!bg-red-700"
                      disabled={revokeReason.trim().length < 3}
                      busyLabel="Đang thu hồi…"
                      onRun={async () => {
                        try {
                          await revokeM.mutateAsync({ id: d.id, reason: revokeReason.trim() });
                          setRevoking(false);
                          setRevokeReason("");
                          await refresh();
                          toast.ok("Đã thu hồi link — phụ huynh mở lại sẽ thấy thông báo đã thu hồi");
                        } catch (e) {
                          toast.error("Chưa thu hồi được", { detail: msg(e) });
                        }
                      }}
                    >
                      <Ban className="h-4 w-4" aria-hidden /> Thu hồi link
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="quiet"
                    busyLabel="Đang gia hạn…"
                    onRun={async () => {
                      try {
                        await extendM.mutateAsync({ id: d.id, days: 30 });
                        await refresh();
                        toast.ok("Đã gia hạn link thêm 30 ngày");
                      } catch (e) {
                        toast.error("Chưa gia hạn được", { detail: msg(e) });
                      }
                    }}
                  >
                    <CalendarPlus className="h-4 w-4" aria-hidden /> Gia hạn 30 ngày
                  </ActionButton>
                  <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setRevoking(true)}>
                    <Ban className="h-4 w-4" aria-hidden /> Thu hồi link
                  </button>
                </div>
              )
            )}
          </section>
        )}

        {d.status === "revoked" && (
          <section className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div><b>Link đã thu hồi</b> lúc {fmtDateTime(d.share.revokedAt)}{d.share.revokeReason ? ` — ${d.share.revokeReason}` : ""}.</div>
            {d.perms.recreate && <ActionButton onRun={onRecreate} busyLabel="Đang lập…">Lập phiếu mới</ActionButton>}
          </section>
        )}

        {d.status === "published" && canEdit && dirty && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">Phiếu đã gửi phụ huynh — lưu thay đổi thì phụ huynh thấy nội dung mới ngay và thao tác được ghi nhật ký.</p>
        )}
        {d.status === "draft" && !d.perms.publish && (
          <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">Bạn điền và lưu phiếu; tư vấn phụ trách sẽ phát hành và gửi link cho phụ huynh.</p>
        )}

        {mode === "preview" ? (
          <div className="-mx-2 sm:mx-0">
            <TrialReportSheet report={preview} preview />
          </div>
        ) : (
          <fieldset disabled={!canEdit} className="space-y-5">
            {/* Tiêu chí: mỗi tiêu chí một hàng 3 nút lớn — chạm một lần là chọn */}
            {answers.groups.map((g) => (
              <section key={g.key} className="space-y-3" aria-label={g.title}>
                <h3 className="text-sm font-extrabold text-foreground">{g.title}</h3>
                {g.criteria.map((c) => {
                  const v = form.values[c.key] ?? null;
                  return (
                    <div key={c.key}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{c.label}</span>
                        {v == null && <span className="text-[11px] font-semibold text-accent-700">chưa chấm</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={c.label}>
                        {c.levels.map((l, i) => {
                          const on = v === l.value;
                          return (
                            <button
                              key={l.value}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setValue(c.key, on ? null : l.value)}
                              className={`min-h-11 rounded-xl border-2 px-2 py-2 text-sm font-bold leading-tight transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? TONE_ON[tone(i, c.levels.length)] : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary-soft"}`}
                            >
                              {l.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}

            {/* Nhận xét bằng lời — phụ huynh đọc nhiều nhất */}
            <section className="space-y-3" aria-label="Nhận xét của giáo viên">
              <div>
                <h3 className="text-sm font-extrabold text-foreground">Nhận xét của giáo viên</h3>
                <p className="text-xs text-muted-foreground">Viết ít nhất một ô từ {TRIAL_REPORT_COMMENT_MIN} ký tự. Lời cụ thể, tích cực — phụ huynh đọc phần này đầu tiên.</p>
              </div>
              {([
                ["strengths", "Điểm nổi bật của bé", "VD: Bé tự lắp xong xe robot, rất tò mò hỏi vì sao bánh xe quay…"],
                ["growth", "Bé có thể phát triển thêm", "VD: Bé cần luyện thêm thao tác kéo thả chuột và mạnh dạn phát biểu…"],
                ["productNote", "Sản phẩm bé làm được trong buổi", "VD: Xe robot né vật cản chạy được 2 vòng sân…"],
              ] as const).map(([k, label, ph]) => (
                <label key={k} className="block">
                  <span className="mb-1 flex items-baseline justify-between text-sm font-semibold text-foreground">
                    {label}
                    <span className={`text-[11px] font-normal ${form[k].trim().length >= TRIAL_REPORT_COMMENT_MIN ? "text-green-700" : "text-muted-foreground"}`}>{form[k].trim().length}/{TRIAL_REPORT_COMMENT_MAX}</span>
                  </span>
                  <textarea className="input min-h-20" maxLength={TRIAL_REPORT_COMMENT_MAX} placeholder={ph} value={form[k]} onChange={(e) => setText(k, e.target.value)} />
                </label>
              ))}
            </section>

            {/* Kết quả 3 mức hành động được */}
            <section className="space-y-2" aria-label="Kết quả đánh giá">
              <h3 className="text-sm font-extrabold text-foreground">Kết quả đánh giá</h3>
              <div className="grid gap-2" role="radiogroup" aria-label="Kết quả đánh giá">
                {TRIAL_READINESS.map((k) => {
                  const on = form.readiness === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set({ readiness: on ? null : k })}
                      className={`min-h-11 rounded-xl border-2 px-3 py-2 text-left transition ${on ? "border-primary bg-primary-soft" : "border-border bg-card hover:border-primary/40"}`}
                    >
                      <div className={`text-sm font-bold ${on ? "text-primary" : "text-foreground"}`}>{TRIAL_READINESS_VI[k]}</div>
                      <div className="text-xs text-muted-foreground">{TRIAL_READINESS_HINT[k]}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Khoá học đề xuất cụ thể */}
            <section className="space-y-2" aria-label="Khoá học đề xuất">
              <h3 className="text-sm font-extrabold text-foreground">Khoá học đề xuất{form.readiness === "ready" && <span className="text-red-600"> *</span>}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-muted-foreground">Khoá học
                  <select
                    className="input mt-1"
                    value={form.recommendedCourseId}
                    onChange={(e) => {
                      const c = course(e.target.value);
                      set({ recommendedCourseId: e.target.value, ...(c?.level && !form.recommendedLevel.trim() ? { recommendedLevel: c.level } : {}) });
                    }}
                  >
                    <option value="">— Chưa chọn —</option>
                    {d.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-muted-foreground">Cấp độ bắt đầu
                  <input className="input mt-1" maxLength={TRIAL_REPORT_LEVEL_MAX} value={form.recommendedLevel} onChange={(e) => set({ recommendedLevel: e.target.value })} placeholder="VD: Cấp 1 — Làm quen" />
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">Lý do ngắn
                <input className="input mt-1" maxLength={TRIAL_REPORT_NOTE_MAX} value={form.recommendationNote} onChange={(e) => set({ recommendationNote: e.target.value })} placeholder="VD: Bé thao tác nhanh, hợp lộ trình lắp ráp + lập trình kéo thả" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle on={form.pathway} onChange={(v) => set({ pathway: v })} label="Định hướng lộ trình phát triển tư duy công nghệ dài hạn" />
                <Toggle on={form.competitionPotential} onChange={(v) => set({ competitionPotential: v })} label="Tiềm năng đội tuyển thi đấu" />
              </div>
            </section>

            <section className="space-y-2" aria-label="Thông tin buổi">
              <h3 className="text-sm font-extrabold text-foreground">Bộ môn trải nghiệm</h3>
              <select className="input" value={form.courseId} onChange={(e) => set({ courseId: e.target.value })}>
                <option value="">— Không ghi —</option>
                {d.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Tên bé, ngày giờ buổi, giáo viên và cơ sở đã điền sẵn từ buổi học thử.</p>
            </section>
          </fieldset>
        )}

        {d.status === "draft" && d.perms.publish && publishErrs.length > 0 && (
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">Cần hoàn tất trước khi phát hành:</div>
            <ul className="list-disc space-y-0.5 pl-4">{publishErrs.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition ${on ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground"}`}
    >
      <span>{label}</span>
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-primary" : "bg-muted-foreground/30"}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

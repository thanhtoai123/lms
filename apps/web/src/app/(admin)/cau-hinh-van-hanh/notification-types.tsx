"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_GROUPS, NOTIFICATION_PRIORITY_VI, ROLE_LABEL_VI, type NotificationPriority, type Role } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const PRIORITY_CHIP: Record<NotificationPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  normal: "bg-sky-100 text-sky-800",
  info: "bg-slate-100 text-slate-600",
};

/** Tab "Danh mục thông báo" — chọn loại nào được đẩy; mọi thay đổi bắt buộc ghi lý do */
export function NotificationTypesPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.opsConfig.notificationTypes.queryOptions());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const save = useMutation(trpc.opsConfig.saveNotificationType.mutationOptions({
    onSettled: () => { setBusy(null); qc.invalidateQueries({ queryKey: trpc.opsConfig.notificationTypes.queryKey() }); },
  }));

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error) return <div className="card p-6 text-sm text-red-700">{q.error.message}</div>;
  const items = q.data ?? [];
  const pushOn = items.filter((i) => i.pushEnabled && i.isActive).length;

  const toggle = (prefix: string, patch: { pushEnabled?: boolean; isActive?: boolean }) => {
    const cur = items.find((i) => i.prefix === prefix);
    if (!cur) return;
    setBusy(prefix);
    save.mutate({ prefix, pushEnabled: patch.pushEnabled ?? cur.pushEnabled, isActive: patch.isActive ?? cur.isActive, reason });
  };

  const groups = Object.entries(NOTIFICATION_GROUPS) as [keyof typeof NOTIFICATION_GROUPS, string][];

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4 text-sm">
        <p className="text-ink-600">
          <b>{items.length} loại thông báo</b> — {pushOn === 0 ? <b>không loại nào được đẩy</b> : <>{pushOn} loại được đẩy tới thiết bị</>}. Loại tắt vẫn hiện trong app (không mất việc),
          chỉ ngừng đẩy. Loại chưa khai báo thì mặc định vẫn gửi trong app và <b>không</b> đẩy.
        </p>
        <label className="block text-sm">Lý do thay đổi <span className="text-ink-400">(bắt buộc — ghi vào nhật ký trước khi bật/tắt)</span>
          <input className="input mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: giảm thông báo đẩy cho nhóm tư vấn theo yêu cầu Hội sở" maxLength={300} />
        </label>
        {save.error && <p className="text-sm text-red-700">{save.error.message}</p>}
        {save.isSuccess && save.data?.changed && <p className="text-sm text-green-700">Đã lưu.</p>}
      </div>

      {groups.map(([key, label]) => {
        const rows = items.filter((i) => i.groupKey === key);
        if (!rows.length) return null;
        return (
          <section key={key} className="card overflow-x-auto">
            <h3 className="border-b border-black/5 p-3 font-semibold">{label} <span className="text-xs font-normal text-ink-400">({rows.length} loại)</span></h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr><th className="p-3">Mã loại</th><th className="p-3">Tên</th><th className="p-3">Mức</th><th className="p-3">Người nhận</th><th className="p-3 text-center">Đang bật</th><th className="p-3 text-center">Được đẩy</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((t) => (
                  <tr key={t.prefix} className={t.isActive ? "" : "opacity-60"}>
                    <td className="p-3"><code className="font-mono text-xs">{t.prefix}</code></td>
                    <td className="p-3">{t.label}{t.configured && <span className="ml-1 text-[10px] text-ink-400">(đã chỉnh)</span>}</td>
                    <td className="p-3"><span className={`chip ${PRIORITY_CHIP[t.priority as NotificationPriority]}`}>{NOTIFICATION_PRIORITY_VI[t.priority as NotificationPriority]}</span></td>
                    <td className="p-3 text-xs text-ink-600">{t.recipients.length ? t.recipients.map((r) => ROLE_LABEL_VI[r as Role] ?? r).join(", ") : <span className="text-ink-400">Theo nghiệp vụ (người tạo / người phụ trách)</span>}</td>
                    <td className="p-3 text-center"><input type="checkbox" checked={t.isActive} disabled={!reason.trim() || busy === t.prefix} onChange={(e) => toggle(t.prefix, { isActive: e.target.checked })} aria-label={`Bật loại ${t.label}`} /></td>
                    <td className="p-3 text-center"><input type="checkbox" checked={t.pushEnabled} disabled={!reason.trim() || !t.isActive || busy === t.prefix} onChange={(e) => toggle(t.prefix, { pushEnabled: e.target.checked })} aria-label={`Đẩy loại ${t.label}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {!reason.trim() && <p className="text-sm text-amber-700">Nhập lý do ở trên để mở các ô bật / tắt.</p>}
    </div>
  );
}

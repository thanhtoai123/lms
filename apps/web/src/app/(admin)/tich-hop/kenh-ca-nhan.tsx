"use client";

/**
 * THẺ ZALO CÁ NHÂN — khai báo các nick chạy trên công cụ ngoài (ZCRM) để hệ thống nhận hội thoại về.
 *
 * Hệ thống KHÔNG tự đăng nhập Zalo: rủi ro khoá nick phải nằm ngoài máy chủ học vụ. Ở đây chỉ khai
 * báo một bí mật cho mỗi nick, dán đường webhook sang công cụ, rồi hội thoại tự chảy về.
 * Khoá/bí mật đã lưu không bao giờ hiện lại — chỉ hiện "đã đặt / chưa đặt".
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export type NickKhaiBao = {
  id: string; label: string; slug: string; status: string; active: boolean;
  baseUrl: string | null; dailyCap: number; sentToday: number; imLang: boolean;
  lastSeenAt: string | Date | null; lastError: string | null;
  apiKeySet: boolean; webhookSecretSet: boolean;
};

const RONG = { id: null as string | null, label: "", baseUrl: "", apiKey: "", webhookSecret: "", dailyCap: 180 };

export function KenhCaNhanCard({ nicks, goc, canEdit }: { nicks: NickKhaiBao[]; goc: string; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState(RONG);
  const [mo, setMo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const luu = useMutation(trpc.messaging.saveChannelAccount.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã lưu. Dán đường webhook bên dưới vào phần Cài đặt → Webhook của công cụ." }); setF(RONG); setMo(false); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const tat = useMutation(trpc.messaging.removeChannelAccount.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã ngắt nick khỏi hệ thống (hội thoại cũ vẫn giữ)." }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  return (
    <div className="card border-l-4 border-l-violet-400 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Zalo cá nhân (công cụ ngoài)</h2>
          <p className="text-xs text-ink-600">Nhận hội thoại, khách mới và trạng thái nick từ ZCRM về hệ thống. Hệ thống chỉ đọc — không đăng nhập Zalo.</p>
        </div>
        <span className={`chip ${nicks.some((n) => n.status === "online" && !n.imLang) ? "bg-green-100 text-green-800" : nicks.length ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
          {nicks.length ? `${nicks.filter((n) => n.status === "online" && !n.imLang).length}/${nicks.length} nick đang chạy` : "Chưa khai báo"}
        </span>
      </div>

      {nicks.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-ink-400"><tr><th className="py-1">Nick</th><th className="py-1">Trạng thái</th><th className="py-1">Tin hôm nay</th><th className="py-1">Đường webhook</th><th /></tr></thead>
          <tbody className="divide-y divide-black/5">
            {nicks.map((n) => (
              <tr key={n.id}>
                <td className="py-1.5 font-medium">{n.label}{!n.webhookSecretSet && <span className="ml-1 text-red-700">· chưa đặt bí mật</span>}</td>
                <td className="py-1.5">
                  <span className={`chip ${n.imLang ? "bg-amber-100 text-amber-800" : n.status === "online" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                    {n.imLang ? "im lặng > 30 phút" : n.status === "online" ? "đang chạy" : "chưa có tín hiệu"}
                  </span>
                  {n.lastError && <div className="mt-0.5 text-red-700">{n.lastError}</div>}
                </td>
                <td className="py-1.5 tabular-nums">{n.sentToday}/{n.dailyCap}</td>
                <td className="py-1.5"><code className="rounded bg-black/5 px-1.5 py-0.5 text-[11px]">{goc}/api/webhooks/kenh/{n.slug}</code></td>
                <td className="py-1.5 text-right">
                  {canEdit && (
                    <>
                      <button type="button" className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => { setF({ id: n.id, label: n.label, baseUrl: n.baseUrl ?? "", apiKey: "", webhookSecret: "", dailyCap: n.dailyCap }); setMo(true); }}>Sửa</button>
                      <button type="button" className="btn-ghost !px-2 !py-0.5 text-[11px] text-red-700" disabled={tat.isPending} onClick={() => tat.mutate({ id: n.id })}>Ngắt</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <div className="mt-3">
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setMo((v) => !v); if (mo) setF(RONG); }}>
            {mo ? "Đóng" : f.id ? "Sửa nick" : "Thêm nick Zalo"}
          </button>
        </div>
      )}

      {mo && canEdit && (
        <div className="mt-2 space-y-2 rounded-lg bg-black/[0.03] p-3 text-xs">
          <p className="text-ink-600">
            Bên ZCRM vào <b>Cài đặt → Webhook</b>, dán đường bên trên và <b>bí mật</b> khai ở đây (gửi kèm header
            <code className="mx-1 rounded bg-black/5 px-1">X-Webhook-Secret</code> hoặc ký HMAC-SHA256 vào
            <code className="mx-1 rounded bg-black/5 px-1">X-Signature</code>). Chọn các sự kiện
            <i> message.received · message.sent · contact.created · zalo.connected · zalo.disconnected</i>.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>Tên nick (để nhận ra người dùng)
              <input className="input mt-0.5 !py-1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Nick CS2 — chị Hà" />
            </label>
            <label>Trần tin/ngày
              <input className="input mt-0.5 !py-1" type="number" min={1} max={1000} value={f.dailyCap} onChange={(e) => setF({ ...f, dailyCap: Number(e.target.value) || 180 })} />
            </label>
            <label>Địa chỉ API của công cụ (tuỳ chọn, để dành cho đợt gửi tin)
              <input className="input mt-0.5 !py-1 font-mono" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="http://10.0.0.5:3080" />
            </label>
            <label>API key của công cụ {f.id && <span className="text-ink-400">(để trống nếu giữ nguyên)</span>}
              <input className="input mt-0.5 !py-1 font-mono" type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} />
            </label>
            <label className="sm:col-span-2">Bí mật webhook {f.id && <span className="text-ink-400">(để trống nếu giữ nguyên)</span>}
              <input className="input mt-0.5 !py-1 font-mono" type="password" autoComplete="off" value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} placeholder="chuỗi ngẫu nhiên ≥ 24 ký tự" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button" className="btn-primary !py-1 text-xs" disabled={luu.isPending || f.label.trim().length < 2}
              onClick={() => luu.mutate({
                id: f.id, channel: "zalo_ca_nhan", label: f.label.trim(), baseUrl: f.baseUrl.trim() || null,
                apiKey: f.apiKey.trim() || null, webhookSecret: f.webhookSecret.trim() || null, dailyCap: f.dailyCap,
              })}
            >
              {luu.isPending ? "Đang lưu…" : "Lưu nick"}
            </button>
            <span className="text-ink-400">Khoá được mã hoá trước khi lưu và không hiển thị lại.</span>
          </div>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

"use client";

/**
 * THẺ ZALO OA — khai báo ứng dụng và theo dõi hạn token.
 *
 * Vì sao phải có màn này: access token của Zalo chỉ sống **25 giờ**, refresh token **dùng một lần**
 * (xài xong Zalo trả token mới). Để trong tệp `.env` thì mỗi ngày phải sửa tệp + khởi động lại máy
 * chủ; quên một hôm là toàn bộ tin Zalo im lặng không ai biết. Khai báo ở đây thì hệ thống tự làm
 * mới trước 2 giờ và màn này cho biết còn bao lâu.
 *
 * Giá trị khoá KHÔNG BAO GIỜ hiện lại sau khi lưu — chỉ hiện "đã đặt / chưa đặt".
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Trang = {
  configured: boolean;
  usable: boolean;
  expiresAt: string | Date | null;
  refreshedAt: string | Date | null;
  minutesLeft: number | null;
  lastError: string | null;
  oaId: string | null;
  appId: string | null;
  fromEnv: boolean;
};

function conLai(phut: number | null) {
  if (phut === null) return "—";
  if (phut <= 0) return "đã hết hạn";
  const gio = Math.floor(phut / 60);
  return gio >= 1 ? `còn ${gio} giờ ${phut % 60} phút` : `còn ${phut} phút`;
}

export function ZaloOaCard({ state, canEdit }: { state: Trang; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [f, setF] = useState({ appId: state.appId ?? "", oaId: state.oaId ?? "", secretKey: "", refreshToken: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const luu = useMutation(trpc.admin.zaloCredentials.mutationOptions({
    onSuccess: (r) => {
      setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: "Đã lưu khai báo và lấy token mới." });
      setF((x) => ({ ...x, secretKey: "", refreshToken: "" }));
      router.refresh();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const lamMoi = useMutation(trpc.admin.zaloTokenRefresh.mutationOptions({
    onSuccess: (r) => { setMsg(r.ok ? { ok: true, text: "Đã làm mới token." } : { ok: false, text: r.error ?? "Không làm mới được" }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  const sapHet = (state.minutesLeft ?? 0) <= 120;
  return (
    <div className="mt-3 border-t border-black/5 pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Token OA:</span>
        {state.fromEnv ? (
          <span className="chip bg-amber-100 text-amber-800">Đang dùng token trong biến môi trường (không tự làm mới)</span>
        ) : !state.configured ? (
          <span className="chip bg-slate-100 text-slate-600">Chưa khai báo ứng dụng</span>
        ) : state.usable ? (
          <span className={`chip ${sapHet ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{conLai(state.minutesLeft)}</span>
        ) : (
          <span className="chip bg-red-100 text-red-700">Hết hạn / chưa lấy được token</span>
        )}
        {canEdit && state.configured && (
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" disabled={lamMoi.isPending} onClick={() => lamMoi.mutate()}>
            {lamMoi.isPending ? "Đang làm mới…" : "Làm mới ngay"}
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setMo((v) => !v)}>
            {mo ? "Đóng" : state.configured ? "Sửa khai báo" : "Khai báo ứng dụng"}
          </button>
        )}
      </div>
      {state.lastError && <p className="mt-1 text-red-700">Lỗi làm mới gần nhất: {state.lastError}</p>}

      {mo && canEdit && (
        <div className="mt-2 space-y-2 rounded-lg bg-black/[0.03] p-3">
          <p className="text-ink-600">
            Lấy ở <b>developers.zalo.me</b>: tạo ứng dụng → cấp quyền cho OA → nhận <code className="font-mono">refresh_token</code>.
            Dán vào đây, hệ thống tự đổi lấy access token và tự làm mới từ đó về sau.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>app_id
              <input className="input mt-0.5 !py-1 font-mono" value={f.appId} onChange={(e) => setF({ ...f, appId: e.target.value })} placeholder="1234567890123456789" />
            </label>
            <label>OA id (tuỳ chọn)
              <input className="input mt-0.5 !py-1 font-mono" value={f.oaId} onChange={(e) => setF({ ...f, oaId: e.target.value })} />
            </label>
            <label>secret_key {state.configured && <span className="text-ink-400">(đã đặt — để trống nếu giữ nguyên)</span>}
              <input className="input mt-0.5 !py-1 font-mono" type="password" autoComplete="off" value={f.secretKey} onChange={(e) => setF({ ...f, secretKey: e.target.value })} />
            </label>
            <label>refresh_token {state.configured && <span className="text-ink-400">(để trống nếu giữ nguyên)</span>}
              <input className="input mt-0.5 !py-1 font-mono" type="password" autoComplete="off" value={f.refreshToken} onChange={(e) => setF({ ...f, refreshToken: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary !py-1 text-xs"
              disabled={luu.isPending || !/^\d{5,25}$/.test(f.appId.trim())}
              onClick={() => luu.mutate({ appId: f.appId.trim(), oaId: f.oaId.trim() || null, secretKey: f.secretKey.trim() || null, refreshToken: f.refreshToken.trim() || null })}
            >
              {luu.isPending ? "Đang lưu…" : "Lưu khai báo"}
            </button>
            <span className="text-ink-400">Khoá được mã hoá trước khi lưu và không hiển thị lại.</span>
          </div>
        </div>
      )}
      {msg && <p className={`mt-1 ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

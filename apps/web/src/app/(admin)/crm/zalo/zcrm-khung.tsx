import Link from "next/link";
import { Empty } from "@/components/ui";

type Zcrm = { id: string; label: string; url: string; nguon: string; nhungDuoc: boolean; lyDo: string[] };

/**
 * GIAO DIỆN ZCRM NHÚNG — chat nhiều nick, bạn bè, lịch hẹn… của ZCRM ngay trong màn Zalo CRM.
 *
 * ZCRM chạy ở máy chủ riêng; trang này chỉ đặt một khung trỏ tới nó. Mã ZCRM không nằm trong hệ
 * thống (AGPL-3.0), và nhờ khung thuộc MIỀN KHÁC nên JavaScript của ZCRM không đụng được phiên đăng
 * nhập quản trị. Đăng nhập ZCRM là tài khoản ZCRM riêng của nhân viên.
 */
export function ZcrmKhung({ ds, chon, nguonLms }: { ds: Zcrm[]; chon?: string; nguonLms: string }) {
  if (ds.length === 0) {
    return (
      <div className="card p-6">
        <Empty>
          Chưa khai báo ZCRM nào. Vào <Link href="/tich-hop" className="font-semibold text-brand-600">Tích hợp → Zalo cá nhân</Link>, thêm một dòng và điền
          <b> địa chỉ API của ZCRM</b> (vd https://zcrm.trungtam.vn) — giao diện ZCRM sẽ hiện ở đây.
        </Empty>
      </div>
    );
  }
  const z = ds.find((x) => x.id === chon) ?? ds[0]!;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {ds.length > 1 && ds.map((x) => (
          <Link key={x.id} href={`/crm/zalo?xem=zcrm&nick=${x.id}`} className={`chip ${x.id === z.id ? "bg-brand-600 text-white" : "bg-black/5 text-ink-600"}`}>{x.label}</Link>
        ))}
        <span className="font-mono text-ink-400">{z.nguon}</span>
        <a href={z.url} target="_blank" rel="noopener noreferrer" className="btn-ghost ml-auto !py-1 text-xs">Mở ZCRM ở tab mới ↗</a>
      </div>
      {z.nhungDuoc ? (
        <iframe
          src={z.url}
          title={`Zalo CRM — ${z.label}`}
          className="h-[calc(100vh-190px)] min-h-[560px] w-full rounded-xl border border-black/10 bg-white"
          // Khung khác miền: ZCRM chạy trong nguồn của chính nó, không chạm được trang quản trị
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          allow="clipboard-read; clipboard-write; microphone; camera; fullscreen"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="card space-y-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Chưa nhúng được giao diện ZCRM vào đây — trình duyệt sẽ chặn khung.</p>
          <ul className="list-disc pl-5">{z.lyDo.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p>
            ZCRM v3.4 mặc định <b>cấm mọi trang nhúng nó</b> (<code>X-Frame-Options: DENY</code>, <code>frame-ancestors &apos;none&apos;</code>).
            Cách xử lý không cần sửa mã ZCRM: đặt ZCRM sau proxy (Caddy / nginx) và đổi hai header đó cho riêng miền quản trị.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-white/70 p-3 text-xs text-ink-800">{`# Caddy — ZCRM ở ${z.nguon}
${z.nguon.replace(/^https?:\/\//, "")} {
  reverse_proxy 127.0.0.1:3080
  header -X-Frame-Options
  header Content-Security-Policy "frame-ancestors ${nguonLms}"
}

# nginx
proxy_hide_header X-Frame-Options;
proxy_hide_header Content-Security-Policy;
add_header Content-Security-Policy "frame-ancestors ${nguonLms}" always;`}</pre>
          <p>
            Phía hệ thống: đặt biến <code>ZCRM_ORIGINS={z.nguon}</code> rồi khởi động lại. Nên để ZCRM cùng tên miền gốc với trang quản trị
            (vd <code>zcrm.</code> và <code>admin.</code> cùng một miền) để trình duyệt giữ đăng nhập ZCRM trong khung.
          </p>
          <a href={z.url} target="_blank" rel="noopener noreferrer" className="btn-primary inline-block !py-1.5 text-xs">Trong lúc chờ: mở ZCRM ở tab mới ↗</a>
        </div>
      )}
    </div>
  );
}

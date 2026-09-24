import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zalo CRM" };

const ZNS_MODE_VI: Record<string, string> = { off: "Tắt", sandbox: "Giả lập", live: "Gửi thật" };

function tokenChip(t: { configured: boolean; usable: boolean; fromEnv: boolean; minutesLeft: number | null }) {
  if (t.fromEnv) return { cls: "bg-amber-100 text-amber-800", text: "Token đặt tay (không tự làm mới)" };
  if (!t.configured) return { cls: "bg-slate-100 text-slate-600", text: "Chưa khai báo OA" };
  if (!t.usable) return { cls: "bg-red-100 text-red-700", text: "Token hết hạn" };
  const m = t.minutesLeft ?? 0;
  const h = Math.floor(m / 60);
  return { cls: m < 120 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800", text: `Token còn ${h >= 1 ? `${h} giờ` : `${m} phút`}` };
}

/**
 * ZALO CRM — kênh Zalo gom về một màn.
 * Bốn câu hỏi của người bán hàng: kênh còn sống không · ai đang chờ · sắp hết khung 48 giờ chưa ·
 * khách từ Zalo ra tiền chưa. Các màn cũ (Hộp thư, Giám sát hội thoại, Thông báo phụ huynh) giữ nguyên.
 */
export default async function ZaloCrmPage({ searchParams }: { searchParams: Promise<{ ngay?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "message:read")) return <NoAccess title="Zalo CRM" perm="message:read" />;
  const days = Number(sp.ngay) || 30;
  const d = await caller.messaging.zaloCrm({ days });
  const tk = tokenChip(d.token);
  const chuaGan = d.hoiThoai.filter((c) => !c.leadId);
  const sapHet = d.hoiThoai.filter((c) => c.sapHet);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Zalo CRM"
        desc={`Toàn bộ kênh Zalo trên một màn: kết nối OA, hội thoại đang chờ, khung trả lời miễn phí ${d.windowHours} giờ, tin theo mẫu (ZNS) và khách từ Zalo đã ra tiền chưa.`}
        actions={
          <>
            <Link href="/tin-nhan?channel=zalo" className="btn-primary">Mở hộp thư Zalo →</Link>
            <Link href="/tich-hop" className="btn-ghost">Kết nối OA</Link>
          </>
        }
      />

      {/* Việc phải xử lý ngay — đặt trên cùng vì đây là lý do mở màn này */}
      {d.canhBao.length > 0 && (
        <div className="space-y-2">
          {d.canhBao.map((c, i) => (
            <div key={i} className={`card p-3 text-sm ${c.muc === "chan" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {c.text}
              {c.href && <Link href={c.href} className="ml-2 font-semibold underline">Xử lý →</Link>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`chip ${tk.cls}`}>{tk.text}</span>
        <span className="chip bg-slate-100 text-slate-700">ZNS: {ZNS_MODE_VI[d.zns.mode] ?? d.zns.mode} · {d.zns.soMau} mẫu</span>
        <span className="chip bg-slate-100 text-slate-700">
          Webhook 24h: {d.webhook.trong24h} sự kiện{d.webhook.tuChoi24h ? ` · ${d.webhook.tuChoi24h} bị từ chối` : ""}
          {d.webhook.nhanGanNhat ? ` · gần nhất ${dtVN(d.webhook.nhanGanNhat)}` : " · chưa nhận lần nào"}
        </span>
        <span className="ml-auto flex gap-1">
          {[7, 30, 90].map((n) => (
            <Link key={n} href={`/crm/zalo?ngay=${n}`} className={`chip ${days === n ? "bg-brand-600 text-white" : "bg-black/5 text-ink-600"}`}>{n} ngày</Link>
          ))}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={`Hội thoại ${days} ngày`} value={d.hoiThoaiDem.tong} />
        <Kpi label="Đang mở" value={d.hoiThoaiDem.dangMo} tone={d.hoiThoaiDem.dangMo ? "warn" : "default"} />
        <Kpi label="Chưa gắn lead" value={d.hoiThoaiDem.chuaGanLead} tone={d.hoiThoaiDem.chuaGanLead ? "warn" : "good"} hint="Khách nhắn nhưng chưa vào phễu" />
        <Kpi label="Lead từ Zalo" value={d.lead.tong} tone="brand" />
        <Kpi label="Đã ghi danh" value={d.lead.daGhiDanh} tone="good" hint={d.lead.tong ? `${Math.round((d.lead.daGhiDanh / d.lead.tong) * 100)}% lead Zalo` : undefined} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label={`Tin khách gửi (${days} ngày)`} value={d.tin.den} />
        <Kpi label="Tin trung tâm trả lời" value={d.tin.di} />
        <Kpi label="Tin lỗi / không gửi được" value={d.tin.loi} tone={d.tin.loi ? "bad" : "good"} />
      </div>

      {sapHet.length > 0 && (
        <Section title={`Sắp hết khung trả lời miễn phí (${sapHet.length})`}>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Khách</th><th className={th}>Còn lại</th><th className={th}>Tin gần nhất</th><th className={th}>Phụ trách</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {sapHet.map((c) => (
                <tr key={c.id} className="bg-amber-50/60">
                  <td className="p-3"><Link href={`/tin-nhan?id=${c.id}`} className="font-medium text-brand-600">{c.ten}</Link></td>
                  <td className="p-3 text-xs font-semibold text-amber-800">{c.conLai}</td>
                  <td className="max-w-sm truncate p-3 text-xs">{c.preview}</td>
                  <td className="p-3 text-xs">{c.nguoiPhuTrach ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-ink-600">
            Quá {d.windowHours} giờ kể từ tin cuối của khách, Zalo không cho nhắn tự do nữa — chỉ còn tin theo mẫu đã duyệt (tốn phí).
          </p>
        </Section>
      )}

      <Section title={`Hội thoại Zalo đang mở (${d.hoiThoai.length})`}>
        {d.hoiThoai.length === 0 ? <div className="p-4"><Empty>Chưa có hội thoại Zalo nào đang mở.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Khách</th><th className={th}>Khung trả lời</th><th className={th}>Chờ</th><th className={th}>Tin gần nhất</th><th className={th}>Lead</th><th className={th}>Phụ trách</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.hoiThoai.map((c) => (
                <tr key={c.id} className="hover:bg-black/[0.02]">
                  <td className="p-3">
                    <Link href={`/tin-nhan?id=${c.id}`} className="font-medium text-brand-600">{c.ten}</Link>
                    <div className="text-[11px] text-ink-400">{dtVN(c.lastMessageAt)}</div>
                  </td>
                  <td className="p-3 text-xs">
                    {c.trongKhung
                      ? <span className={c.sapHet ? "font-semibold text-amber-800" : "text-green-700"}>còn {c.conLai}</span>
                      : <span className="text-ink-400">hết khung — dùng tin mẫu</span>}
                  </td>
                  <td className="p-3 text-xs">{c.cho !== null ? <span className={c.cho > 60 ? "font-semibold text-red-700" : ""}>{c.cho}′</span> : "—"}</td>
                  <td className="max-w-xs truncate p-3 text-xs">{c.preview}</td>
                  <td className="p-3 text-xs">
                    {c.leadId
                      ? <Link href={`/leads/${c.leadId}`} className="text-brand-600">{c.leadStatusLabel}</Link>
                      : <span className="chip bg-amber-100 text-amber-800">chưa gắn</span>}
                  </td>
                  <td className="p-3 text-xs">{c.nguoiPhuTrach ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {chuaGan.length > 0 && (
          <p className="border-t border-black/5 p-3 text-xs text-ink-600">
            <b>{chuaGan.length} hội thoại chưa gắn lead.</b> Mở hội thoại → “Tạo lead từ hội thoại” để khách vào phễu (cần tick xác nhận khách đồng ý).
          </p>
        )}
      </Section>

      <Section title={`Tin theo mẫu (ZNS) — ${days} ngày`} actions={<Link href="/cau-hinh-van-hanh?tab=zalo" className="text-xs text-brand-600">Cấu hình mẫu →</Link>}>
        <div className="grid grid-cols-3 gap-3 p-3">
          <Kpi label="Đã gửi" value={d.zns.daGui} tone="good" />
          <Kpi label="Đang chờ gửi" value={d.zns.cho} tone={d.zns.cho ? "warn" : "default"} />
          <Kpi label="Lỗi" value={d.zns.loi} tone={d.zns.loi ? "bad" : "default"} />
        </div>
        {d.zns.theoMau.length === 0 ? <div className="p-4"><Empty>Chưa gửi tin mẫu nào trong kỳ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Mẫu</th><th className={th}>Số tin</th><th className={th}>Lỗi</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.zns.theoMau.map((m) => (
                <tr key={m.mau}>
                  <td className="p-3 text-xs font-medium">{m.mau}</td>
                  <td className="p-3 text-xs tabular-nums">{m.n}</td>
                  <td className={`p-3 text-xs tabular-nums ${m.loi ? "font-semibold text-red-700" : "text-ink-400"}`}>{m.loi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

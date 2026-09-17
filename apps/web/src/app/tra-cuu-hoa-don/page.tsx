import { getDb } from "@satarobo/db";
import { publicInvoiceLookup } from "@satarobo/api";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tra cứu hoá đơn — Sata Robo", robots: { index: false } };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

export default async function LookupPage({ searchParams }: { searchParams: Promise<{ ma?: string }> }) {
  const sp = await searchParams;
  const code = (sp.ma ?? "").trim().slice(0, 40);
  const r = code ? await publicInvoiceLookup(getDb(), code) : null;
  return (
    <PublicShell>
      <h1 className="text-2xl font-bold">Tra cứu hoá đơn điện tử</h1>
      <form className="card mt-4 flex gap-2 p-4">
        <input name="ma" defaultValue={code} className="input flex-1 font-mono uppercase" placeholder="Mã tra cứu in trên email / hoá đơn" required />
        <button className="btn-primary">Tra cứu</button>
      </form>
      {code && !r && <div className="card mt-4 p-4 text-sm">Không tìm thấy hoá đơn với mã này.</div>}
      {r && (
        <div className="card mt-4 space-y-2 p-5 text-sm">
          {r.sandbox && <div className="rounded bg-amber-100 p-2 text-center text-xs font-semibold">BẢN THỬ NGHIỆM — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ</div>}
          <div className="font-semibold">{r.kindLabel} · ký hiệu {r.templateCode}{r.serial} · số {String(r.number ?? "").padStart(7, "0")} · {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : ""}</div>
          <div>Trạng thái: <b>{r.statusLabel}</b>{r.status !== "issued" ? " — vui lòng xem hoá đơn điều chỉnh / thay thế mới nhất" : ""}</div>
          {r.original && <div className="text-xs">Liên quan hoá đơn ký hiệu {r.original.serial} số {r.original.number}{r.reason ? ` — ${r.reason}` : ""}</div>}
          <div className="text-xs">Đơn vị bán: {r.seller.name} · MST {r.seller.taxCode} · {r.center}</div>
          <div className="text-xs">Người mua: {r.buyer}{r.buyerTaxCode ? ` · MST ${r.buyerTaxCode}` : ""}</div>
          <table className="w-full text-xs"><tbody>{r.lines.map((l, i) => <tr key={i} className="border-b border-black/5"><td className="py-1">{l.name}</td><td className="text-right">{vnd(l.amount)}</td><td className="text-right">{l.taxRate === "KCT" ? "KCT" : `${l.taxRate}%`}</td></tr>)}</tbody></table>
          <div className="text-right font-semibold">Tổng: {vnd(r.total)}{r.vat ? ` (thuế ${vnd(r.vat)})` : ""}</div>
          <div className="text-xs">Bằng chữ: {r.totalInWords}</div>
        </div>
      )}
    </PublicShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";
import { vnd, fmtD } from "@/components/finance-ui";
import { PrintButton } from "./print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phiếu thu" };

const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function read3(n: number, full: boolean): string {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
  const out: string[] = [];
  if (h > 0 || full) out.push(`${ONES[h]} trăm`);
  if (t > 1) out.push(`${ONES[t]} mươi`);
  else if (t === 1) out.push("mười");
  else if (u > 0 && (h > 0 || full)) out.push("lẻ");
  if (u > 0) out.push(t > 1 && u === 1 ? "mốt" : t >= 1 && u === 5 ? "lăm" : ONES[u]!);
  return out.join(" ");
}
function vndInWords(n: number): string {
  if (n === 0) return "Không đồng";
  const units = ["", " nghìn", " triệu", " tỷ"];
  const parts: string[] = [];
  let i = 0;
  let x = Math.round(n);
  while (x > 0) {
    const g = x % 1000;
    if (g > 0) parts.unshift(read3(g, x >= 1000) + units[i]);
    x = Math.floor(x / 1000);
    i++;
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + " đồng";
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const r = await caller.finance.receipt({ paymentId: id }).catch((e: { message?: string }) => ({ error: e?.message ?? "Không mở được phiếu thu" }));
  if ("error" in r) {
    if (r.error.includes("Không tìm thấy")) notFound();
    return <div className="card p-6 text-sm">{r.error} <Link href="/payments" className="underline">Quay lại</Link></div>;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex justify-between print:hidden">
        <Link href={`/orders/${r.orderId}`} className="text-sm text-ink-600">← Đơn {r.orderCode}</Link>
        <PrintButton />
      </div>
      <article className="card space-y-4 p-8 print:border-0 print:shadow-none">
        <header className="flex justify-between gap-4 text-sm">
          <div><div className="font-bold">SATA ROBO — {r.centerName}</div><div className="text-ink-600">{r.centerAddress ?? ""}</div>{r.centerPhone && <div className="text-ink-600">ĐT: {r.centerPhone}</div>}</div>
          <div className="text-right"><div>Số: <b className="font-mono">{r.p.receiptNo}</b></div><div>Ngày: {fmtD(r.p.paidAt)}</div></div>
        </header>
        <h1 className="text-center text-2xl font-bold tracking-wide">PHIẾU THU</h1>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt>Người nộp tiền:</dt><dd className="font-semibold">{r.p.payerName ?? r.customerName}</dd>
          <dt>Điện thoại:</dt><dd>{r.customerPhone}</dd>
          <dt>Học viên:</dt><dd>{r.studentName ?? "—"}</dd>
          <dt>Lý do nộp:</dt><dd>{r.items.map((i) => i.description).join("; ")} (đơn {r.orderCode})</dd>
          <dt>Số tiền:</dt><dd className="text-lg font-bold">{vnd(r.p.amount)}</dd>
          <dt>Bằng chữ:</dt><dd className="italic">{vndInWords(r.p.amount)}</dd>
          <dt>Hình thức:</dt><dd>{r.methodName ?? "—"}</dd>
          <dt>Đã thu luỹ kế:</dt><dd>{vnd(r.paidToDate)} / {vnd(r.orderTotal)} · còn lại {vnd(r.remaining)}</dd>
        </dl>
        <footer className="grid grid-cols-2 gap-4 pt-8 text-center text-sm">
          <div><div className="font-semibold">Người lập / thu tiền</div><div className="pt-14">{r.recorderName ?? ""}</div></div>
          <div><div className="font-semibold">Kế toán</div><div className="pt-14">{r.deciderName ?? ""}</div></div>
        </footer>
      </article>
    </div>
  );
}

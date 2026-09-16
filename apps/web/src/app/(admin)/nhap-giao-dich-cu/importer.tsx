"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd, fmtD } from "@/components/finance-ui";
import { CsvFileInput } from "@/components/csv-file-input";
import { CsvButton } from "@/components/csv-button";
import type { RouterOutputs } from "@/lib/trpc/types";

type Preview = RouterOutputs["finance"]["legacyPreview"];

const TEMPLATE_HEADERS = ["ma_don", "ma_hv", "ma_lop", "tong_don", "so_tien", "ngay_thu", "phuong_thuc", "so_phieu", "nguoi_nop", "ghi_chu"];
const TEMPLATE_ROWS = [
  ["", "CS1-26-000001", "CS1.SATA4.26.001", "9600000", "4800000", "15/08/2026", "TM-CS1", "PT-CU-0001", "Phụ huynh A", "Đợt 1"],
  ["DH26-000003", "", "", "", "2000000", "20/08/2026", "CK-VCB", "PT-CU-0002", "", ""],
];

export function LegacyImporter() {
  const trpc = useTRPC();
  const router = useRouter();
  const [csv, setCsv] = useState<{ text: string; name: string | null } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [onlyErr, setOnlyErr] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pv = useMutation(trpc.finance.legacyPreview.mutationOptions({ onSuccess: setPreview, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const imp = useMutation(trpc.finance.legacyImport.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã nhập ${r.payments} khoản (${vnd(r.amount)}) vào ${r.orders} đơn, lập mới ${r.newOrders} đơn. Bỏ qua: ${r.errors} lỗi, ${r.duplicates} trùng.` }); setPreview(null); setCsv(null); setNote(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const run = (text: string, name: string | null) => { setMsg(null); setPreview(null); setCsv({ text, name }); pv.mutate({ csv: text }); };
  const rows = preview ? (onlyErr ? preview.rows.filter((r) => r.status !== "ok") : preview.rows) : [];
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">1. Chọn file CSV</h2>
        <CsvButton filename="mau-nhap-giao-dich-cu" headers={TEMPLATE_HEADERS} rows={TEMPLATE_ROWS} label="Tải file mẫu" />
      </div>
      <p className="text-xs text-ink-600">
        Mỗi dòng: <b>ma_don</b> (đơn đã có) <i>hoặc</i> <b>ma_hv + ma_lop</b> (hệ thống tìm ghi danh; chưa có đơn thì lập đơn với <b>tong_don</b>, bỏ trống = giá gói theo số buổi).
        Bắt buộc: <b>so_tien</b>, <b>ngay_thu</b> (dd/mm/yyyy), <b>phuong_thuc</b> (mã hoặc tên), <b>so_phieu</b>. Tổng các khoản không được vượt tổng đơn.
      </p>
      <CsvFileInput onText={run} disabled={pv.isPending || imp.isPending} />
      {pv.isPending && <div className="text-sm text-ink-600">Đang kiểm tra…</div>}
      {preview && (preview.headerErrors.length ? <div className="text-sm text-red-700">{preview.headerErrors.join("; ")}</div> : (
        <div className="space-y-2">
          <h2 className="font-semibold">2. Kiểm tra</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{preview.summary.rows} dòng</span>
            <span className="text-green-700">Hợp lệ {preview.summary.ok} · {vnd(preview.summary.amount)}</span>
            <span className="text-red-700">Lỗi {preview.summary.errors}</span>
            <span className="text-ink-400">Trùng {preview.summary.duplicates}</span>
            {preview.summary.newOrders > 0 && <span>Lập mới {preview.summary.newOrders} đơn</span>}
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} /> Chỉ xem dòng lỗi</label>
            <CsvButton filename="kiem-tra-nhap" label="Tải kết quả kiểm tra" headers={["Dòng", "Kết quả", "Lỗi", "Đơn", "Học viên", "Cơ sở", "Số tiền", "Ngày", "Phương thức", "Số phiếu"]} rows={preview.rows.map((r) => [r.line, r.status, r.errors.join("; "), r.orderCode, r.studentName, r.centerCode, r.row?.amount, r.row?.paidAt, r.methodName, r.row?.legacyReceipt])} />
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-ink-400"><tr><th className="p-2">Dòng</th><th className="p-2">Đơn</th><th className="p-2">Học viên</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Ngày</th><th className="p-2">Phương thức</th><th className="p-2">Phiếu cũ</th><th className="p-2">Kết quả</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((r) => (
                  <tr key={r.line} className={r.status === "error" ? "bg-red-50/60" : r.status === "duplicate" ? "text-ink-400" : ""}>
                    <td className="p-2">{r.line}</td>
                    <td className="p-2 font-mono">{r.orderCode ?? "—"}{r.newOrder && <div className="font-sans text-ink-600">{r.newOrder.courseCode} · {vnd(r.newOrder.total)}</div>}</td>
                    <td className="p-2">{r.studentName ?? "—"}{r.centerCode ? ` · ${r.centerCode}` : ""}</td>
                    <td className="p-2 text-right tabular-nums">{r.row ? vnd(r.row.amount) : "—"}</td>
                    <td className="p-2">{r.row ? fmtD(r.row.paidAt) : "—"}</td>
                    <td className="p-2">{r.methodName ?? r.row?.method ?? "—"}</td>
                    <td className="p-2 font-mono">{r.row?.legacyReceipt ?? "—"}</td>
                    <td className="p-2">{r.status === "ok" ? <span className="text-green-700">OK</span> : <span className={r.status === "error" ? "text-red-700" : ""}>{r.errors.join("; ")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="font-semibold">3. Nhập</h2>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" placeholder="Ghi chú lô nhập (bắt buộc), VD: Phiếu thu tháng 8/2026 từ admin cũ" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={!csv || note.trim().length < 5 || imp.isPending || preview.summary.ok === 0} onClick={() => csv && imp.mutate({ csv: csv.text, note: note.trim(), fileName: csv.name })}>
              Nhập {preview.summary.ok} dòng hợp lệ
            </button>
          </div>
          {preview.summary.errors > 0 && <p className="text-xs text-amber-700">Dòng lỗi sẽ bị bỏ qua — sửa file rồi nhập lại (dòng đã nhập sẽ được nhận là trùng).</p>}
        </div>
      ))}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}

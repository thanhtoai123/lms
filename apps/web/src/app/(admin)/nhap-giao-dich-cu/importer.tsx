"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { parseLegacyTuitionTable, LEGACY_TUITION_TEMPLATE, LEGACY_LINE_STATUS_VI, type LegacyTuitionRow } from "@satarobo/core";
import { vnd, fmtD } from "@/components/finance-ui";
import { CsvFileInput } from "@/components/csv-file-input";
import { CsvButton } from "@/components/csv-button";
import type { RouterOutputs } from "@/lib/trpc/types";

type Resolved = RouterOutputs["finance"]["legacyResolve"];

const TEMPLATE_ROWS = [
  ["HV-CU-001", "Nguyễn Hoàng Đức", "0905123456", "Đang học", "15/08/2026", "SATA4", "CS1", "4.800.000", "Đợt 1"],
  ["HV-CU-002", "Trần Bảo Ngọc", "0912000000", "Đang học", "20/08/2026", "SATA2", "CS2", "2.000.000", ""],
];

const STATUS_CLS: Record<string, string> = {
  will_write: "text-green-700",
  already_paid: "text-ink-400",
  needs_choice: "text-amber-800",
  not_found: "text-red-700",
  error: "text-red-700",
};

export function LegacyImporter({ sales }: { sales: { id: string; fullName: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [sheet, setSheet] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<LegacyTuitionRow[]>([]);
  const [parseErrors, setParseErrors] = useState<{ line: number; errors: string[] }[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [force, setForce] = useState<number[]>([]);
  const [saleUserId, setSaleUserId] = useState("");
  const [note, setNote] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const today = useMemo(() => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), []);
  const resolve = useMutation(trpc.finance.legacyResolve.mutationOptions({ onSuccess: setResolved, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const write = useMutation(trpc.finance.legacyWrite.mutationOptions({
    onSuccess: (r) => {
      setMsg({ ok: true, text: `Đã ghi ${r.payments} khoản (${vnd(r.amount)}) vào ${r.orders} đơn, lập mới ${r.newOrders} đơn. Khoản đang ở trạng thái chờ kế toán — xác nhận cả lượt ở màn Thanh toán.` });
      setResolved(null); setRows([]); setNote(""); router.refresh();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  const read = (text: string, name: string | null) => {
    setMsg(null); setResolved(null); setChoices({}); setForce([]);
    const r = parseLegacyTuitionTable(text, today, { sheet: sheet.trim() || name || null });
    setHeaderErrors(r.headerErrors);
    setFileName(name);
    setRows(r.rows.map((x) => x.row).filter((x): x is LegacyTuitionRow => !!x));
    setParseErrors(r.rows.filter((x) => x.errors.length).map((x) => ({ line: x.line, errors: x.errors })));
  };

  const run = (nextChoices = choices, nextForce = force) => {
    setMsg(null);
    resolve.mutate({ rows, choices: nextChoices, force: nextForce });
  };
  const pick = (line: number, enrollmentId: string) => {
    const next = { ...choices, [String(line)]: enrollmentId };
    setChoices(next);
    run(next, force);
  };
  const toggleForce = (line: number) => {
    const next = force.includes(line) ? force.filter((x) => x !== line) : [...force, line];
    setForce(next);
    run(choices, next);
  };

  const lines = resolved ? (onlyOpen ? resolved.lines.filter((l) => l.status !== "will_write") : resolved.lines) : [];
  const s = resolved?.summary;

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Bước 1 · Chọn file</h2>
        <CsvButton filename="mau-hoc-phi-cu" headers={LEGACY_TUITION_TEMPLATE} rows={TEMPLATE_ROWS} label="Tải file mẫu" />
      </div>
      <p className="text-xs text-ink-600">
        File được đọc <b>ngay trong trình duyệt</b>; chỉ tên, số điện thoại, số tiền, ngày và ghi chú được gửi lên máy chủ — CCCD và địa chỉ trong file không rời máy bạn.
        Khớp theo <b>số điện thoại phụ huynh + họ tên</b>: mã học viên trong file và mã trên hệ thống là hai hệ đánh số khác nhau.
        Excel nhiều sheet: lưu từng sheet thành CSV (hoặc dán từng sheet) và điền tên sheet bên dưới.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-600">Tên sheet (tháng / cơ sở)<input className="input mt-1" placeholder="VD: Tháng 7 2026 CS1" value={sheet} onChange={(e) => setSheet(e.target.value)} /></label>
      </div>
      <CsvFileInput onText={read} disabled={resolve.isPending || write.isPending} />
      {headerErrors.length > 0 && <div className="text-sm text-red-700">{headerErrors.join("; ")}</div>}
      {parseErrors.length > 0 && <div className="text-xs text-amber-800">{parseErrors.length} dòng lỗi định dạng sẽ bị bỏ: {parseErrors.slice(0, 5).map((e) => `dòng ${e.line}: ${e.errors.join(", ")}`).join(" · ")}</div>}
      {rows.length > 0 && !resolved && (
        <button className="btn-primary" disabled={resolve.isPending} onClick={() => run()}>Đối chiếu {rows.length} dòng với hệ thống</button>
      )}

      {resolved && s && (
        <div className="space-y-2">
          <h2 className="font-semibold">Bước 2 · Đối chiếu</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-green-700">Sẽ ghi {s.will_write} · {vnd(s.amount)}</span>
            <span className="text-ink-400">Đã có tiền — bỏ qua {s.already_paid}</span>
            <span className="text-amber-800">Cần chọn {s.needs_choice}</span>
            <span className="text-red-700">Không tìm thấy {s.not_found}{s.errors ? ` · lỗi ${s.errors}` : ""}</span>
            <span>Lập mới {s.newOrders} đơn</span>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Chỉ xem dòng cần xử lý</label>
            <CsvButton filename="doi-chieu-hoc-phi-cu" label="Tải kết quả đối chiếu"
              headers={["Dòng", "Sheet", "Học viên (file)", "SĐT", "Số tiền", "Ngày", "Kết quả", "Học viên (hệ thống)", "Cơ sở", "Đơn"]}
              rows={resolved.lines.map((l) => [l.line, l.row?.sheet, l.row?.name, l.row?.phone, l.row?.amount, l.row?.paidAt, LEGACY_LINE_STATUS_VI[l.status as "will_write"] ?? l.status, l.studentName, l.centerCode, l.orderCode])} />
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-ink-400">
                <tr><th className="p-2">Dòng</th><th className="p-2">Học viên (file)</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Ngày</th><th className="p-2">Khớp hồ sơ</th><th className="p-2">Kết quả</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {lines.map((l) => (
                  <tr key={l.line} className={l.status === "not_found" || l.status === "error" ? "bg-red-50/60" : l.status === "needs_choice" ? "bg-amber-50/60" : ""}>
                    <td className="p-2">{l.line}{l.row?.sheet && <div className="text-ink-400">{l.row.sheet}</div>}</td>
                    <td className="p-2">{l.row?.name}<div className="text-ink-400">{l.row?.phone ?? "không có SĐT"}{l.row?.courseText ? ` · ${l.row.courseText}` : ""}</div></td>
                    <td className="p-2 text-right tabular-nums">{vnd(l.row?.amount ?? 0)}</td>
                    <td className="p-2">{l.row ? fmtD(l.row.paidAt) : "—"}</td>
                    <td className="p-2">
                      {l.status === "needs_choice" ? (
                        <select className="input !py-1 text-xs" value={choices[String(l.line)] ?? ""} onChange={(e) => e.target.value && pick(l.line, e.target.value)}>
                          <option value="">— Chọn hồ sơ —</option>
                          {l.candidates.map((c) => <option key={c.enrollmentId} value={c.enrollmentId}>{c.studentName} · {c.classCode} · {c.centerCode}{c.parentName ? ` · PH ${c.parentName}` : ""}</option>)}
                        </select>
                      ) : l.studentName && l.enrollmentId ? (
                        <>{l.studentName}<div className="text-ink-400">{l.centerCode}{l.orderCode ? ` · ${l.orderCode}` : " · sẽ lập đơn mới"}</div>{choices[String(l.line)] && <div className="text-brand-600">Đã chọn tay</div>}</>
                      ) : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="p-2">
                      <span className={STATUS_CLS[l.status]}>{LEGACY_LINE_STATUS_VI[l.status as "will_write"] ?? l.errors.join("; ")}</span>
                      {l.errors.length > 0 && l.status !== "not_found" && <div className="text-red-700">{l.errors.join("; ")}</div>}
                      {l.status === "already_paid" && <button className="block text-brand-600" onClick={() => toggleForce(l.line)}>Vẫn ghi</button>}
                      {l.status === "will_write" && force.includes(l.line) && <button className="block text-amber-800" onClick={() => toggleForce(l.line)}>Sẽ ghi chồng — bấm để huỷ</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="font-semibold">Bước 3 · Gán sale &amp; ghi</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-600">Sale phụ trách *
              <select className="input mt-1" value={saleUserId} onChange={(e) => setSaleUserId(e.target.value)}>
                <option value="">— Chọn sale —</option>
                {sales.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </label>
            <input className="input flex-1" placeholder="Ghi chú lượt nhập (bắt buộc), VD: Học phí tháng 7–8/2026 từ admin cũ" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={write.isPending || !saleUserId || note.trim().length < 5 || s.will_write === 0}
              onClick={() => write.mutate({ rows, choices, force, saleUserId, note: note.trim(), fileName })}>
              Ghi {s.will_write} dòng · {vnd(s.amount)}
            </button>
          </div>
          {!saleUserId && <p className="text-xs text-red-700">Chưa gán sale phụ trách cho lượt nhập.</p>}
          <p className="text-xs text-ink-600">Mỗi em một đơn, mỗi đợt một khoản giữ đúng ngày đóng; khoản ở trạng thái <b>chờ kế toán</b> (không tự vào doanh thu).</p>
        </div>
      )}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { RECON_METRICS, RECON_METRIC_VI, type ReconMetric } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { CsvFileInput } from "@/components/csv-file-input";
import { CsvButton } from "@/components/csv-button";

const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) =>
  m ? <div className={`rounded-xl border p-3 text-sm ${m.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{m.text}</div> : null;

function Status({ status, errors }: { status: string; errors: string[] }) {
  if (status === "ok") return <span className="text-green-700">OK</span>;
  return <span className={status === "error" ? "text-red-700" : "text-ink-400"}>{errors.join("; ")}</span>;
}

function ImportFooter({ ok, errors, pending, onImport }: { ok: number; errors: number; pending: boolean; onImport: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1" placeholder="Ghi chú lô nhập (bắt buộc), VD: Xuất từ admin cũ ngày 17/09, CS1" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary" disabled={note.trim().length < 5 || pending || ok === 0} onClick={() => onImport(note.trim())}>Nhập {ok} dòng hợp lệ</button>
      </div>
      {errors > 0 && <p className="text-xs text-amber-700">Dòng lỗi sẽ bị bỏ qua — sửa file rồi nhập lại (dòng đã nhập được nhận là trùng).</p>}
    </div>
  );
}

export function StudentImporter() {
  const trpc = useTRPC();
  const router = useRouter();
  const [file, setFile] = useState<{ text: string; name: string | null } | null>(null);
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pv = useMutation(trpc.migration.previewStudents.mutationOptions({ onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const imp = useMutation(trpc.migration.importStudents.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã tạo ${r.created} học viên, ghép ${r.linked} học viên có sẵn, gắn ${r.parentsLinked} phụ huynh. Bỏ qua ${r.errors} lỗi, ${r.duplicates} trùng.` }); pv.reset(); setFile(null); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const p = pv.data;
  const rows = p ? (onlyIssue ? p.rows.filter((r) => r.status !== "ok" || r.warnings.length) : p.rows) : [];
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">File học viên (CSV)</h2>
        <CsvButton filename="mau-hoc-vien-he-cu" label="Tải file mẫu" headers={["ma_hv", "ho_ten", "ngay_sinh", "gioi_tinh", "khoi", "truong", "co_so", "trang_thai", "ten_ph", "sdt_ph", "email_ph", "quan_he", "ten_ph_2", "sdt_ph_2", "suc_khoe", "ghi_chu"]}
          rows={[["HV00123", "Nguyễn Văn A", "05/03/2017", "Nam", "3", "Tiểu học ABC", "CS1", "Đang học", "Nguyễn Thị B", "0900000001", "", "Mẹ", "", "", "", ""]]} />
      </div>
      <p className="text-xs text-ink-600">Bắt buộc: <b>ma_hv</b> (mã ở hệ cũ — giữ làm mã học viên nếu chưa trùng), <b>ho_ten</b>, <b>co_so</b> (mã cơ sở), <b>sdt_ph</b>. Trạng thái nhận: đang học, học thử, bảo lưu, nghỉ, tốt nghiệp, tiềm năng. Phụ huynh gộp theo SĐT; học viên trùng tên + SĐT phụ huynh đã có sẽ được ghép, không tạo mới. Đồng ý đăng ảnh không mang sang — xin lại qua cổng phụ huynh.</p>
      <CsvFileInput disabled={pv.isPending || imp.isPending} onText={(text, name) => { setMsg(null); setFile({ text, name }); pv.mutate({ csv: text }); }} />
      {pv.isPending && <div className="text-sm text-ink-600">Đang kiểm tra…</div>}
      {p && (p.headerErrors.length ? <div className="text-sm text-red-700">{p.headerErrors.join("; ")}</div> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{p.summary.rows} dòng</span>
            <span className="text-green-700">Tạo mới {p.summary.create}</span>
            <span className="text-sky-700">Ghép {p.summary.link}</span>
            <span className="text-red-700">Lỗi {p.summary.errors}</span>
            <span className="text-ink-400">Trùng {p.summary.duplicates}</span>
            <span className="text-amber-700">Cảnh báo {p.summary.warnings}</span>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyIssue} onChange={(e) => setOnlyIssue(e.target.checked)} /> Chỉ dòng có vấn đề</label>
            <CsvButton filename="kiem-tra-hoc-vien" label="Tải kết quả kiểm tra" headers={["Dòng", "Kết quả", "Lỗi", "Cảnh báo", "Mã cũ", "Họ tên", "Cơ sở"]} rows={p.rows.map((r) => [r.line, r.status, r.errors.join("; "), r.warnings.join("; "), r.legacyCode, r.fullName, r.center])} />
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-ink-400"><tr><th className="p-2">Dòng</th><th className="p-2">Mã cũ</th><th className="p-2">Học viên</th><th className="p-2">Cơ sở</th><th className="p-2">Phụ huynh</th><th className="p-2">Xử lý</th><th className="p-2">Kết quả</th></tr></thead>
              <tbody className="divide-y divide-black/5">{rows.map((r) => (
                <tr key={r.line} className={r.status === "error" ? "bg-red-50/60" : r.status === "duplicate" ? "text-ink-400" : ""}>
                  <td className="p-2">{r.line}</td><td className="p-2 font-mono">{r.legacyCode ?? "—"}</td><td className="p-2">{r.fullName ?? "—"}{r.dob && <span className="text-ink-400"> · {r.dob.split("-").reverse().join("/")}</span>}</td>
                  <td className="p-2">{r.center ?? "—"}</td><td className="p-2">{r.parentName ?? "—"}{r.hasParent2 && " (+1)"}</td>
                  <td className="p-2">{r.action === "create" ? "Tạo mới" : r.action === "link" ? `Ghép ${r.existingCode ?? ""}` : "—"}</td>
                  <td className="p-2"><Status status={r.status} errors={r.errors} />{r.warnings.length > 0 && <div className="text-amber-700">{r.warnings.join("; ")}</div>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ImportFooter ok={p.summary.ok} errors={p.summary.errors} pending={imp.isPending} onImport={(note) => file && imp.mutate({ csv: file.text, note, fileName: file.name })} />
        </div>
      ))}
      <Msg m={msg} />
    </section>
  );
}

export function EnrollmentImporter() {
  const trpc = useTRPC();
  const router = useRouter();
  const [file, setFile] = useState<{ text: string; name: string | null } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pv = useMutation(trpc.migration.previewEnrollments.mutationOptions({ onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const imp = useMutation(trpc.migration.importEnrollments.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã nhập ${r.enrollments} ghi danh (mang sang ${r.carriedSessions} buổi đã học). Bỏ qua ${r.errors} lỗi, ${r.duplicates} trùng.` }); pv.reset(); setFile(null); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const p = pv.data;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">File ghi danh (CSV)</h2>
        <CsvButton filename="mau-ghi-danh-he-cu" label="Tải file mẫu" headers={["ma_hv", "ma_lop", "so_buoi_goi", "da_hoc", "con_lai", "trang_thai", "ngay_ghi_danh", "bao_luu_den", "ghi_chu"]}
          rows={[["HV00123", "CS1.SATA4.26.001", "48", "10", "38", "Đang học", "01/02/2026", "", ""], ["HV00124", "CS1.SATA4.26.001", "24", "", "20", "Bảo lưu", "01/03/2026", "30/10/2026", ""]]} />
      </div>
      <p className="text-xs text-ink-600">Lớp phải có sẵn trên hệ mới (đúng mã lớp). Số buổi đã học ở hệ cũ được ghi vào ghi danh; điểm danh trên hệ mới bắt đầu từ buổi chưa học tiếp theo của lớp, nên số buổi còn lại = gói − đã học − số buổi điểm danh mới.</p>
      <CsvFileInput disabled={pv.isPending || imp.isPending} onText={(text, name) => { setMsg(null); setFile({ text, name }); pv.mutate({ csv: text }); }} />
      {pv.isPending && <div className="text-sm text-ink-600">Đang kiểm tra…</div>}
      {p && (p.headerErrors.length ? <div className="text-sm text-red-700">{p.headerErrors.join("; ")}</div> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{p.summary.rows} dòng</span>
            <span className="text-green-700">Hợp lệ {p.summary.ok} · còn {p.summary.remaining} buổi</span>
            <span className="text-red-700">Lỗi {p.summary.errors}</span>
            <span className="text-ink-400">Trùng {p.summary.duplicates}</span>
            <CsvButton filename="kiem-tra-ghi-danh" label="Tải kết quả kiểm tra" headers={["Dòng", "Kết quả", "Lỗi", "Cảnh báo", "Mã HV", "Lớp", "Gói", "Đã học"]} rows={p.rows.map((r) => [r.line, r.status, r.errors.join("; "), r.warnings.join("; "), r.studentCode, r.classCode, r.packageSessions, r.usedSessions])} />
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-ink-400"><tr><th className="p-2">Dòng</th><th className="p-2">Học viên</th><th className="p-2">Lớp</th><th className="p-2 text-right">Đã học / gói</th><th className="p-2">Trạng thái</th><th className="p-2">Vào lớp từ buổi</th><th className="p-2">Kết quả</th></tr></thead>
              <tbody className="divide-y divide-black/5">{p.rows.map((r) => (
                <tr key={r.line} className={r.status === "error" ? "bg-red-50/60" : r.status === "duplicate" ? "text-ink-400" : ""}>
                  <td className="p-2">{r.line}</td><td className="p-2"><span className="font-mono">{r.studentCode ?? "—"}</span> {r.studentName}</td><td className="p-2 font-mono">{r.classCode ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.usedSessions ?? "—"}/{r.packageSessions ?? "—"}</td><td className="p-2">{r.enrollmentStatus ?? "—"}</td><td className="p-2">{r.startSequenceNo ?? "—"}</td>
                  <td className="p-2"><Status status={r.status} errors={r.errors} />{r.warnings.length > 0 && <div className="text-amber-700">{r.warnings.join("; ")}</div>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ImportFooter ok={p.summary.ok} errors={p.summary.errors} pending={imp.isPending} onImport={(note) => file && imp.mutate({ csv: file.text, note, fileName: file.name })} />
        </div>
      ))}
      <Msg m={msg} />
    </section>
  );
}

export function ReconForm({ centerId }: { centerId: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState<Partial<Record<ReconMetric, string>>>({});
  const [note, setNote] = useState("");
  const m = useMutation(trpc.migration.saveRecon.mutationOptions({ onSuccess: () => { setV({}); setNote(""); router.refresh(); } }));
  const toNum = (s: string | undefined) => (s && s.trim() ? Number(s.replace(/[.,\s]/g, "")) : null);
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ centerId, note: note || null, legacy: Object.fromEntries(RECON_METRICS.map((k) => [k, toNum(v[k])])) as Record<ReconMetric, number | null> }); }}>
      <div className="font-semibold">Số liệu hệ cũ {centerId ? "(cơ sở đang chọn)" : "(toàn hệ thống)"}</div>
      {RECON_METRICS.map((k) => (
        <label key={k} className="flex items-center justify-between gap-2"><span>{RECON_METRIC_VI[k]}</span><input inputMode="numeric" className="input max-w-[160px] text-right" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="bỏ trống = không so" /></label>
      ))}
      <input className="input" placeholder="Ghi chú (nguồn số liệu, giờ xem)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary" disabled={m.isPending}>So và lưu</button>
      {m.data && <div className={m.data.ok ? "text-green-700" : "text-red-700"}>{m.data.ok ? `Khớp ${m.data.compared} chỉ số` : `Lệch: ${m.data.rows.filter((r) => r.ok === false).map((r) => `${r.label} (${r.diff! > 0 ? "+" : ""}${r.diff})`).join(", ")}`}</div>}
      {m.error && <div className="text-red-700">{m.error.message}</div>}
    </form>
  );
}

const KIND_VI = { missing: "Chưa có trên hệ mới", remaining: "Lệch buổi còn lại", debt: "Lệch công nợ" } as const;

export function CompareStudents({ centerId }: { centerId: string | null }) {
  const trpc = useTRPC();
  const m = useMutation(trpc.migration.compareStudents.mutationOptions());
  const d = m.data;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">So từng học viên</h2>
        <CsvButton filename="mau-doi-soat-hoc-vien" label="Tải file mẫu" headers={["ma_hv", "ma_lop", "con_lai", "cong_no"]} rows={[["HV00123", "CS1.SATA4.26.001", "38", "0"]]} />
      </div>
      <p className="text-xs text-ink-600">Xuất danh sách buổi còn lại / công nợ từ hệ cũ và chọn file. Kết quả không lưu — tải về để xử lý từng dòng.</p>
      <CsvFileInput disabled={m.isPending} onText={(text) => m.mutate({ csv: text, centerId })} />
      {m.isPending && <div className="text-sm text-ink-600">Đang so…</div>}
      {m.error && <div className="text-sm text-red-700">{m.error.message}</div>}
      {d && (d.headerErrors.length ? <div className="text-sm text-red-700">{d.headerErrors.join("; ")}</div> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Đã so {d.checked} dòng</span>
            <span className={d.diffs.length ? "text-red-700" : "text-green-700"}>{d.diffs.length ? `${d.diffs.length} chênh lệch` : "Khớp toàn bộ"}</span>
            {d.lineErrors.length > 0 && <span className="text-amber-700">{d.lineErrors.length} dòng lỗi</span>}
            {d.diffs.length > 0 && <CsvButton filename="chenh-lech-hoc-vien" label="Tải chênh lệch" headers={["Mã HV", "Lớp", "Loại", "Hệ cũ", "Hệ mới"]} rows={d.diffs.map((x) => [x.studentCode, x.classCode, KIND_VI[x.kind], x.legacy, x.current])} />}
          </div>
          {d.diffs.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-xl border border-black/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white text-left text-ink-400"><tr><th className="p-2">Mã HV</th><th className="p-2">Lớp</th><th className="p-2">Loại</th><th className="p-2 text-right">Hệ cũ</th><th className="p-2 text-right">Hệ mới</th></tr></thead>
                <tbody className="divide-y divide-black/5">{d.diffs.map((x, i) => (
                  <tr key={i}><td className="p-2 font-mono">{x.studentCode}</td><td className="p-2 font-mono">{x.classCode ?? "—"}</td><td className="p-2">{KIND_VI[x.kind]}</td><td className="p-2 text-right tabular-nums">{x.legacy ?? "—"}</td><td className="p-2 text-right tabular-nums">{x.current ?? "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

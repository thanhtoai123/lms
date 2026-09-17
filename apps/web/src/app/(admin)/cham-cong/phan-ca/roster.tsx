"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { originLabel, originMark, units, wdOf, dmy } from "@/components/hr-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Roster = RouterOutputs["hr"]["roster"];

const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function RosterMonth({ centerId, period, data }: { centerId: string; period: string; data: Roster }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [sel, setSel] = useState<{ staffId: string; date: string } | null>(null);
  const [tab, setTab] = useState<"grid" | "template" | "import">("grid");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const assign = useMutation(trpc.hr.assignShifts.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã xếp ${r.set} ô, xoá ${r.cleared} ô` }); setSel(null); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const gen = useMutation(trpc.hr.generateRoster.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Sinh lưới: ${r.created} ô mới · ${r.updated} ô cập nhật · giữ ${r.kept} ô sửa tay / từ đơn` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const locked = !!data.lockedPeriod;
  const canEdit = data.canEdit && !locked;
  const holiday = new Set(data.holidays.map((h) => h.date));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-black/5">Ô đã xếp: {data.filled}</span>
        <span className="chip bg-black/5">Sửa tay: {data.manualCells}</span>
        <span className="chip bg-black/5">Từ đơn đã duyệt: {data.requestCells}</span>
        {locked && <span className="chip bg-slate-800 text-white">Kỳ {data.lockedPeriod} đã chốt — không sửa được</span>}
        <div className="ml-auto flex gap-1">
          {(["grid", "template", "import"] as const).map((t) => (
            <button key={t} className={`chip ${tab === t ? "bg-brand-100 text-brand-800" : "bg-black/5"}`} onClick={() => setTab(t)}>
              {t === "grid" ? "Lưới tháng" : t === "template" ? "Khung ca tuần" : "Nhập từ Sheet"}
            </button>
          ))}
        </div>
      </div>
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}

      {tab === "grid" && (
        <>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button className="btn-ghost !py-1 text-xs" disabled={gen.isPending} onClick={() => gen.mutate({ centerId, period })}>Sinh lưới từ khung ca tuần</button>
              <span className="text-ink-400">Ô sửa tay và ô từ đơn đã duyệt không bị ghi đè.</span>
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-ink-400">
                  <th className="sticky left-0 z-10 bg-white p-2 text-left">Nhân sự</th>
                  {data.dates.map((d) => (
                    <th key={d} className={`px-0.5 py-1 text-center font-normal ${wdOf(d) === "CN" || holiday.has(d) ? "text-red-500" : ""}`}><div>{wdOf(d)}</div><div>{d.slice(8)}</div></th>
                  ))}
                  <th className="p-2 text-right">Công</th><th className="p-2 text-right">Nghỉ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2">
                      <a href={`/nhan-su/${r.id}`} className="font-medium text-brand-700">{r.fullName}</a>
                      <div className="text-ink-400">{r.code}{r.exempt ? " · miễn công" : ""}</div>
                    </td>
                    {r.days.map((c) => (
                      <td key={c.date} className="px-0.5 py-1 text-center">
                        <button
                          title={`${c.shift ? `${c.shift.code} · ${c.shift.name} ${c.shift.clock}` : "chưa xếp"} · ${originLabel(c.origin)}`}
                          onClick={() => canEdit && setSel({ staffId: r.id, date: c.date })}
                          className={`relative h-7 w-9 rounded text-[10px] ${c.shift ? (c.shift.units === 0 ? "bg-slate-200 text-slate-600" : "bg-brand-50 text-brand-800") : "text-ink-300 hover:bg-black/5"} ${sel?.staffId === r.id && sel.date === c.date ? "ring-2 ring-brand-500" : ""}`}
                        >
                          {c.shift?.code ?? "—"}
                          {c.origin && c.origin !== "template" && <span className="absolute -right-0.5 -top-1 text-[9px] text-amber-700">{originMark(c.origin)}</span>}
                        </button>
                      </td>
                    ))}
                    <td className="p-2 text-right tabular-nums font-semibold">{units(r.units)}</td>
                    <td className="p-2 text-right tabular-nums">{r.offDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sel && (
            <div className="card space-y-2 p-3 text-sm">
              <div className="flex items-center justify-between">
                <b>{data.rows.find((r) => r.id === sel.staffId)?.fullName} · {dmy(sel.date)}</b>
                <button className="text-ink-600" onClick={() => setSel(null)}>Đóng</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {data.shifts.map((s) => (
                  <button key={s.id} className="chip bg-black/5 hover:bg-brand-100" disabled={assign.isPending}
                    onClick={() => assign.mutate({ centerId, entries: [{ staffId: sel.staffId, date: sel.date, shiftId: s.id }], origin: "manual" })}>
                    {s.code} <span className="text-ink-400">{s.units}c</span>
                  </button>
                ))}
                <button className="chip bg-red-50 text-red-700" disabled={assign.isPending}
                  onClick={() => assign.mutate({ centerId, entries: [{ staffId: sel.staffId, date: sel.date, shiftId: null }], origin: "manual" })}>Xoá ca</button>
              </div>
              <p className="text-xs text-ink-400">Ô đặt tay được đánh dấu “T” và không bị sinh lưới / nhập Sheet ghi đè.</p>
            </div>
          )}
        </>
      )}

      {tab === "template" && <TemplateGrid centerId={centerId} data={data} canEdit={data.canEdit} onMsg={setMsg} />}
      {tab === "import" && <ImportSheet centerId={centerId} period={period} canEdit={canEdit} onMsg={setMsg} imports={data.imports} />}
    </div>
  );
}

function TemplateGrid({ centerId, data, canEdit, onMsg }: { centerId: string; data: Roster; canEdit: boolean; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(data.templates.map((t) => [`${t.staffId}|${t.weekday}`, t.shiftId ?? ""])));
  const save = useMutation(trpc.hr.saveTemplates.mutationOptions({
    onSuccess: (r) => { onMsg({ ok: true, text: `Đã lưu khung ca tuần (${r.saved} ô)` }); router.refresh(); },
    onError: (e) => onMsg({ ok: false, text: e.message }),
  }));
  const set = (staffId: string, wd: number, v: string) => setDraft((d) => ({ ...d, [`${staffId}|${wd}`]: v }));
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">Khung ca tuần là mẫu để sinh lưới tháng: mỗi người × thứ = một mã ca. Sinh lưới không đụng vào ô sửa tay và ô từ đơn đã duyệt.</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-ink-400"><th className="p-2 text-left">Nhân sự</th>{[1, 2, 3, 4, 5, 6, 7].map((w) => <th key={w} className="p-2">{WD[w]}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5">
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2">{r.fullName}<div className="text-ink-400">{r.code}</div></td>
                {[1, 2, 3, 4, 5, 6, 7].map((w) => (
                  <td key={w} className="p-1">
                    <select className="input !py-1 text-xs" disabled={!canEdit} value={draft[`${r.id}|${w}`] ?? ""} onChange={(e) => set(r.id, w, e.target.value)}>
                      <option value="">—</option>
                      {data.shifts.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({
          centerId,
          entries: Object.entries(draft).map(([k, v]) => { const [staffId, wd] = k.split("|"); return { staffId: staffId!, weekday: Number(wd), shiftId: v || null }; }),
        })}>Lưu khung ca tuần</button>
      )}
    </div>
  );
}

function ImportSheet({ centerId, period, canEdit, onMsg, imports }: { centerId: string; period: string; canEdit: boolean; onMsg: (m: { ok: boolean; text: string }) => void; imports: Roster["imports"] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<{ created: number; updated: number; keptManual: number; skipped: number; unknownNames: string[]; unknownCodes: string[] } | null>(null);
  const run = useMutation(trpc.hr.importRoster.mutationOptions({
    onSuccess: (r) => {
      setPreview(r);
      if (r.applied) { onMsg({ ok: true, text: `Đã nhập: ${r.created} ô mới · ${r.updated} cập nhật · giữ ${r.keptManual} ô sửa tay / từ đơn · bỏ ${r.skipped} dòng` }); router.refresh(); }
    },
    onError: (e) => onMsg({ ok: false, text: e.message }),
  }));
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        Dán trực tiếp từ Google Sheet (chọn vùng → Ctrl+C → dán vào ô dưới) hoặc dán nội dung CSV. Dòng đầu là tiêu đề: cột 1 là Họ tên / Mã NV, các cột sau là ngày 1, 2, 3… của tháng {period}.
        Ô trống = bỏ qua. Ô sửa tay và ô từ đơn đã duyệt không bị file đè; chạy lại cùng file là an toàn.
      </p>
      <textarea className="input h-40 font-mono text-xs" value={content} onChange={(e) => { setContent(e.target.value); setPreview(null); }} placeholder={"Họ tên\t1\t2\t3\nNguyễn Văn A\tHC\tHC\tX"} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={!content.trim() || run.isPending} onClick={() => run.mutate({ centerId, period, content, dryRun: true })}>Xem trước</button>
        <button className="btn-primary" disabled={!canEdit || !content.trim() || run.isPending || !preview} onClick={() => run.mutate({ centerId, period, content })}>Nhập lịch</button>
      </div>
      {preview && (
        <div className="card p-3 text-sm">
          <div>{preview.created} ô mới · {preview.updated} ô cập nhật · giữ {preview.keptManual} ô sửa tay / từ đơn · bỏ {preview.skipped} dòng không khớp tên</div>
          {preview.unknownNames.length > 0 && <div className="text-amber-700">Không khớp tên: {preview.unknownNames.join(", ")}</div>}
          {preview.unknownCodes.length > 0 && <div className="text-amber-700">Mã ca chưa khai: {preview.unknownCodes.join(", ")}</div>}
        </div>
      )}
      {imports.length > 0 && (
        <div className="text-xs text-ink-500">
          <div className="font-semibold">Lần nhập gần đây</div>
          {imports.map((i) => <div key={i.id}>{new Date(i.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {i.byName ?? "—"} · kỳ {i.period} · {i.created} mới · {i.updated} cập nhật · giữ {i.keptManual} ô</div>)}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { EnrollmentChip, ErrorBox, OkBox, fmtDate } from "@/components/admin-ui";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";
import { TRANSFER_REQUEST_VI } from "@satarobo/core";

type Center = { id: string; code: string; name: string };

/** Wizard: học viên → lớp hiện tại → cơ sở đích → tìm lớp phù hợp → lý do → tạo yêu cầu chuyển lớp */
export function TransferWizard({ centers, initialStudent }: { centers: Center[]; initialStudent: PickedStudent | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const [student, setStudent] = useState<PickedStudent | null>(initialStudent);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [toCenterId, setToCenterId] = useState("");
  const [search, setSearch] = useState(false);
  const [includeOtherCourses, setIncludeOtherCourses] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [waiver, setWaiver] = useState("");
  const [startSeq, setStartSeq] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const open = useQuery({ ...trpc.students.openEnrollments.queryOptions({ studentId: student?.id ?? "00000000-0000-0000-0000-000000000000" }), enabled: !!student });
  const eligible = useQuery({
    ...trpc.students.eligibleClasses.queryOptions({ enrollmentId, toCenterId: toCenterId || null, includeOtherCourses }),
    enabled: search && !!enrollmentId,
    retry: false,
  });
  const create = useMutation(trpc.students.createTransferRequest.mutationOptions({
    onSuccess: (r) => {
      setOk(r.status === "waitlisted" ? `Đã tạo yêu cầu — lớp đích hết chỗ, vào danh sách chờ (thứ ${r.waitlistRank}).` : "Đã tạo yêu cầu chuyển lớp — chờ quản lý duyệt.");
      setError(null); setTargetId(""); setReason("");
      qc.invalidateQueries({ queryKey: trpc.students.transferRequests.queryKey() });
      router.refresh();
    },
    onError: (e) => { setError(e.message); setOk(null); },
  }));

  const source = open.data?.find((e) => e.id === enrollmentId);
  const items = eligible.data?.items ?? [];
  const target = items.find((c) => c.id === targetId);

  return (
    <div className="space-y-4">
      <section className="card space-y-2 p-5">
        <h2 className="font-bold">1. Học viên & lớp hiện tại</h2>
        <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollmentId(""); setTargetId(""); setSearch(false); }} />
        {student && (
          <div className="space-y-1">
            {open.isLoading && <div className="text-xs text-ink-400">Đang tải…</div>}
            {open.data?.length === 0 && <div className="text-sm text-ink-400">Học viên không có đăng ký nào đang mở.</div>}
            {open.data?.map((e) => (
              <label key={e.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${enrollmentId === e.id ? "border-brand-600 bg-brand-50" : "border-black/5"}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" checked={enrollmentId === e.id} onChange={() => { setEnrollmentId(e.id); setTargetId(""); setSearch(false); }} />
                  <span>
                    <span className="font-medium">{e.className}</span>
                    <span className="block text-xs text-ink-400">{e.classCode} · {e.courseCode} · {e.centerCode} · đã học {e.consumed}/{e.packageSessions}, còn {e.remaining}</span>
                  </span>
                </span>
                <EnrollmentChip status={e.status} />
              </label>
            ))}
          </div>
        )}
      </section>

      {source && (
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">2. Cơ sở đích & lớp phù hợp</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-600">Cơ sở đích
              <select className="input mt-1 max-w-[220px]" value={toCenterId} onChange={(e) => { setToCenterId(e.target.value); setSearch(false); }}>
                <option value="">Mọi cơ sở</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={includeOtherCourses} onChange={(e) => { setIncludeOtherCourses(e.target.checked); setSearch(false); }} /> Hiện cả lớp khác khoá (quản lý miễn kèm lý do)</label>
            <button className="btn-ghost" onClick={() => { setSearch(true); setError(null); }}>Tìm lớp đích phù hợp</button>
          </div>
          {eligible.isFetching && <div className="text-sm text-ink-400">Đang tìm…</div>}
          {eligible.error && <ErrorBox>{eligible.error.message}</ErrorBox>}
          {search && eligible.data && (
            <>
              <p className="text-xs text-ink-600">Lớp đích phải <b>cùng khoá</b> và <b>không vượt tiến độ</b> học viên (lớp hiện tại đã học {eligible.data.source.progress} bài). Lớp hết chỗ vẫn đăng ký được — yêu cầu vào danh sách chờ.</p>
              <div className="max-h-80 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/5">
                {items.map((c) => (
                  <label key={c.id} className={`flex cursor-pointer items-start justify-between gap-3 p-3 text-sm ${targetId === c.id ? "bg-brand-50" : c.eligible ? "hover:bg-black/[0.02]" : "opacity-60"}`}>
                    <span className="flex items-start gap-2">
                      <input type="radio" disabled={!c.eligible} checked={targetId === c.id} onChange={() => { setTargetId(c.id); setStartSeq(String(c.startSequenceNo ?? c.lessonsDone + 1)); }} />
                      <span>
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-xs text-ink-400">{c.code} · {c.courseCode}{c.sameCourse ? "" : " (khác khoá)"} · {c.centerCode}{c.crossCenter ? " (khác cơ sở)" : ""} · {c.schedule ?? "—"}</span>
                        {!c.eligible && <span className="block text-xs text-red-700">{c.errors.join("; ")}</span>}
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs ${c.waitlist ? "text-amber-700" : ""}`}>{c.label}</span>
                  </label>
                ))}
                {items.length === 0 && <div className="p-3 text-sm text-ink-400">Không có lớp phù hợp — thử bỏ lọc cơ sở.</div>}
              </div>
            </>
          )}
        </section>
      )}

      {source && target && (
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">3. Lý do & tạo yêu cầu</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-black/[0.03] p-3"><div className="label">Từ</div>{source.classCode}<div className="text-xs text-ink-400">{source.centerCode}</div></div>
            <div className="rounded-xl bg-black/[0.03] p-3"><div className="label">Đến</div>{target.code}<div className="text-xs text-ink-400">{target.centerCode} · {target.label}</div></div>
            <div className="rounded-xl bg-brand-50 p-3"><div className="label">Mang sang</div><span className="text-2xl font-bold text-brand-700">{source.remaining}</span> buổi</div>
          </div>
          {target.waitlist && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Lớp đích đã đầy — yêu cầu sẽ vào danh sách chờ và được báo khi có chỗ.</div>}
          {!target.sameCourse && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Lớp đích khác khoá — cần quản lý cơ sở nhập lý do miễn điều kiện.</div>}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              create.mutate({ enrollmentId, toClassId: targetId, reason: reason.trim(), waiverReason: waiver.trim() || null, startSequenceNo: startSeq ? Number(startSeq) : null });
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
              <div><label className="label">Lý do chuyển *</label><input className="input" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Đổi lịch học, chuyển nhà, lên trình độ…" /></div>
              <div><label className="label">Vào lớp đích từ buổi</label><input type="number" min={1} className="input" value={startSeq} onChange={(e) => setStartSeq(e.target.value)} /></div>
            </div>
            {(!target.sameCourse || waiver) && (
              <input className="input" maxLength={300} placeholder="Lý do miễn điều kiện cùng khoá (quản lý cơ sở)" value={waiver} onChange={(e) => setWaiver(e.target.value)} />
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            <button className="btn-primary" disabled={create.isPending || reason.trim().length < 5}>{create.isPending ? "Đang gửi…" : "Tạo yêu cầu chuyển lớp"}</button>
          </form>
        </section>
      )}

      {ok && <OkBox>{ok}</OkBox>}
      <PendingRequests />
    </div>
  );
}

/** Bảng "Yêu cầu đang chờ" — quản lý duyệt / từ chối */
export function PendingRequests() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useQuery(trpc.students.transferRequests.queryOptions({ status: "open" }));
  const done = (text: string) => {
    setMsg({ ok: true, text });
    setOpenId(null); setNote("");
    qc.invalidateQueries({ queryKey: trpc.students.transferRequests.queryKey() });
    router.refresh();
  };
  const onError = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const approve = useMutation(trpc.students.approveTransfer.mutationOptions({ onSuccess: (r) => done(`Đã duyệt — ghi danh mới mang sang ${r.carrySessions} buổi.`), onError }));
  const reject = useMutation(trpc.students.rejectTransfer.mutationOptions({ onSuccess: () => done("Đã từ chối yêu cầu."), onError }));
  const cancel = useMutation(trpc.students.cancelTransferRequest.mutationOptions({ onSuccess: () => done("Đã rút yêu cầu."), onError }));
  const rows = list.data ?? [];

  return (
    <section className="card space-y-2 p-5">
      <h2 className="font-bold">Yêu cầu đang chờ ({rows.length})</h2>
      {msg && (msg.ok ? <OkBox>{msg.text}</OkBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      {list.isLoading && <div className="text-sm text-ink-400">Đang tải…</div>}
      {rows.length === 0 && !list.isLoading && <p className="text-sm text-ink-400">Không có yêu cầu nào đang chờ.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-2">Học viên</th><th className="p-2">Chuyển</th><th className="p-2">Trạng thái</th><th className="p-2">Lý do</th><th className="p-2">Ngày</th><th className="p-2">Thao tác</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="p-2">{r.studentName}<div className="font-mono text-[11px] text-ink-400">{r.studentCode}</div></td>
                  <td className="p-2 text-xs">{r.fromClassCode} ({r.fromCenterCode}) → {r.toClassCode} ({r.toCenterCode})<div className="text-ink-400">còn {r.seatsLeft} chỗ{r.waitlistRank ? ` · chờ thứ ${r.waitlistRank}` : ""}{r.startSequenceNo ? ` · vào từ buổi ${r.startSequenceNo}` : ""}</div></td>
                  <td className="p-2"><span className={`chip ${r.status === "waitlisted" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{TRANSFER_REQUEST_VI[r.status]}</span></td>
                  <td className="p-2 text-xs">{r.reason}{r.waiverReason && <div className="text-amber-800">Miễn cùng khoá: {r.waiverReason}</div>}<div className="text-ink-400">{r.requesterName ?? ""}</div></td>
                  <td className="p-2 text-xs">{fmtDate(r.createdAt)}</td>
                  <td className="p-2">
                    {r.canDecide ? (
                      openId === r.id ? (
                        <div className="w-56 space-y-1">
                          <input className="input !py-1 text-xs" maxLength={300} placeholder="Ghi chú / lý do từ chối (≥5)" value={note} onChange={(e) => setNote(e.target.value)} />
                          <div className="flex flex-wrap gap-1">
                            <button className="btn-primary !px-2 !py-1 text-xs" disabled={approve.isPending} onClick={() => approve.mutate({ requestId: r.id, note: note.trim() || null })}>Duyệt</button>
                            <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={reject.isPending || note.trim().length < 5} onClick={() => reject.mutate({ requestId: r.id, reason: note.trim() })}>Từ chối</button>
                            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpenId(null)}>Thôi</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setOpenId(r.id); setMsg(null); }}>Duyệt / Từ chối</button>
                      )
                    ) : (
                      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={cancel.isPending} onClick={() => cancel.mutate({ requestId: r.id, reason: null })}>Rút yêu cầu</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

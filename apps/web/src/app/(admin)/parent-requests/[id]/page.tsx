import Link from "next/link";
import { notFound } from "next/navigation";
import { PARENT_REQUEST_TYPE_VI, CONTACT_CHANNEL_VI, PARENT_REQUEST_STATUS_VI, type ParentRequestStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { PReqChip, SlaBadge, dtVN } from "@/components/care-ui";
import { RequestActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu phụ huynh" };
const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

export default async function ParentRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const r = /^[0-9a-f-]{36}$/.test(id) ? await caller.care.request({ id }).catch(() => null) : null;
  if (!r) notFound();
  return (
    <div className="space-y-4">
      <Link href="/parent-requests" className="text-sm text-ink-600">← Yêu cầu phụ huynh</Link>
      <PageHeader title={`${r.code} · ${PARENT_REQUEST_TYPE_VI[r.type]}`} desc={`${CONTACT_CHANNEL_VI[r.channel]} · tạo ${dtVN(r.createdAt)} · hạn ${dtVN(r.dueAt)}`} actions={<div className="flex items-center gap-2"><PReqChip status={r.status} /><SlaBadge sla={r.sla} /></div>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-1 p-4 text-sm lg:col-span-2">
          <h2 className="font-semibold">Nội dung</h2>
          <p className="whitespace-pre-wrap">{r.content}</p>
          <div className="grid gap-1 pt-2 text-xs text-ink-600 sm:grid-cols-2">
            <div>Học viên: <Link className="text-brand-600" href={`/students/${r.studentId}`}>{r.studentName}</Link> {r.studentCode}</div>
            <div>Phụ huynh: {r.parentName ?? "—"} {r.parentPhone ?? ""}</div>
            <div>Lớp: {r.classId ? <Link className="text-brand-600" href={`/classes/${r.classId}`}>{r.classCode}</Link> : r.centerCode}</div>
            {r.session && <div>Buổi xin nghỉ: buổi {r.session.sequenceNo} · {dmy(r.session.date)} {r.session.startTime.slice(0, 5)} ({r.session.status})</div>}
            {r.missed && <div>Buổi cần học bù: buổi {r.missed.sequenceNo} · {dmy(r.missed.date)}</div>}
            {r.dateFrom && <div>Bảo lưu: {dmy(r.dateFrom)} → {dmy(r.dateTo)}</div>}
          </div>
          {r.resolution && <div className="mt-2 rounded-xl bg-green-50 p-3 text-sm">Kết quả: {r.resolution}</div>}
          {r.linked && <div className="mt-2 text-sm">Việc liên quan: <Link className="text-brand-600 underline" href={r.linked.href}>mở {r.linked.kind === "makeup_request" ? "Học bù" : r.linked.kind === "refund" ? "Hoàn tiền" : r.linked.kind === "transfer" ? "Chuyển lớp" : "hồ sơ học viên"}</Link></div>}
        </section>
        <section className="card space-y-2 p-4">
          <h2 className="font-semibold">Xử lý</h2>
          {r.hint && <p className="text-xs text-ink-600">{r.hint}</p>}
          <RequestActions id={r.id} actions={r.actions} assignees={r.assignees} assigneeId={r.assigneeId} />
        </section>
      </div>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Lịch sử</h2>
        <ol className="space-y-2 text-sm">
          {r.events.map((e) => (
            <li key={e.id} className="border-l-2 border-brand-200 pl-3">
              <div className="text-xs text-ink-400">{dtVN(e.createdAt)} · {e.actorName ?? "Hệ thống"}</div>
              <div>{e.action}{e.toStatus ? ` → ${PARENT_REQUEST_STATUS_VI[e.toStatus as ParentRequestStatus]}` : ""}{e.note ? `: ${e.note}` : ""}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

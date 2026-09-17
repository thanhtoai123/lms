import Link from "next/link";
import { hasPermission, PROPOSAL_STATUSES, PROPOSAL_STATUS_VI, type Actor, type ProposalStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { NewProposal, ProposalPanel } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đề xuất sửa giáo án" };
const CHIP: Record<ProposalStatus, string> = { submitted: "bg-blue-100 text-blue-700", in_review: "bg-amber-100 text-amber-800", approved: "bg-violet-100 text-violet-800", rejected: "bg-red-100 text-red-700", applied: "bg-green-100 text-green-800", withdrawn: "bg-slate-100 text-slate-500" };
const FIELD_VI: Record<string, string> = { title: "tên bài", objectives: "mục tiêu", materials: "học cụ" };

type SP = { status?: string; mine?: string; id?: string; new?: string; lesson?: string; class?: string };

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || (!hasPermission(actor, "curriculum:propose") && !hasPermission(actor, "curriculum:read"))) return <NoAccess title="Đề xuất sửa giáo án" perm="curriculum:propose" />;
  const status = PROPOSAL_STATUSES.includes(sp.status as ProposalStatus) ? (sp.status as ProposalStatus) : undefined;
  const d = await caller.content.proposals({ status, mine: sp.mine === "1" });
  const lessonOpts = d.canPropose ? await caller.content.proposalLessons().catch(() => []) : [];
  const detail = sp.id ? await caller.content.proposal({ id: sp.id }).catch(() => null) : null;
  const q = (patch: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ status: sp.status, mine: sp.mine, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = u.toString();
    return `/de-xuat-giao-an${s ? `?${s}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Đề xuất sửa giáo án" desc="Giáo viên đề xuất chỉnh tên bài / mục tiêu / học cụ; Đào tạo xem xét, duyệt và áp dụng vào giáo trình (có kiểm tra xung đột nếu giáo án đã đổi)." />
      {d.canPropose && <NewProposal lessons={lessonOpts.map((l) => ({ id: l.id, label: `${l.courseCode} · ${l.curriculumName} · Bài ${l.sequenceNo}: ${l.title}`, title: l.title, objectives: l.objectives, materials: l.materials }))} initialOpen={sp.new === "1"} initialLesson={sp.lesson} classId={sp.class} />}
      {detail && (
        <ProposalPanel
          p={{
            id: detail.id, code: detail.code, typeLabel: detail.typeLabel, status: detail.status as ProposalStatus, statusLabel: detail.statusLabel, reason: detail.reason, byName: detail.byName, reviewerName: detail.reviewerName,
            createdAt: detail.createdAt.toISOString(), lessonSeq: detail.lessonSeq, snapshot: detail.snapshot, patch: detail.patch, current: detail.current, fields: detail.fields, conflicts: detail.conflicts,
            decisionNote: detail.decisionNote, can: detail.can, comments: detail.comments.map((c) => ({ id: c.id, body: c.body, byName: c.byName, createdAt: c.createdAt.toISOString() })),
          }}
          closeHref={q({})}
        />
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={q({ status: undefined })} className={`chip ${!status ? "bg-brand-600 text-white" : "bg-black/5"}`}>Đang xử lý ({(d.counts?.submitted ?? 0) + (d.counts?.in_review ?? 0) + (d.counts?.approved ?? 0)})</Link>
        {PROPOSAL_STATUSES.map((s) => <Link key={s} href={q({ status: s })} className={`chip ${status === s ? "bg-brand-600 text-white" : "bg-black/5"}`}>{PROPOSAL_STATUS_VI[s]}</Link>)}
        {d.reviewer && <Link href={q({ mine: sp.mine === "1" ? undefined : "1" })} className={`chip ${sp.mine === "1" ? "bg-brand-600 text-white" : "bg-black/5"}`}>Của tôi</Link>}
      </div>
      {d.items.length === 0 ? <Empty>Không có đề xuất.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Đề xuất</th><th className="p-3">Bài học</th><th className="p-3">Người gửi</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((p) => (
                <tr key={p.id} className={sp.id === p.id ? "bg-brand-50" : ""}>
                  <td className="p-3"><Link href={q({ id: p.id })} className="font-mono font-medium text-brand-600">{p.code}</Link><div className="text-xs">{p.typeLabel}{p.fields.length ? ` · sửa ${p.fields.map((f) => FIELD_VI[f]).join(", ")}` : ""}</div><div className="line-clamp-1 text-xs text-ink-400">{p.reason}</div></td>
                  <td className="p-3 text-xs">{p.courseCode} · {p.curriculumName}<div>Bài {p.lessonSeq}: {p.lessonTitle}</div></td>
                  <td className="p-3 text-xs">{p.byName}<div className="text-ink-400">{dtVN(p.createdAt)}{p.comments ? ` · ${p.comments} bình luận` : ""}</div></td>
                  <td className="p-3"><span className={`chip ${CHIP[p.status as ProposalStatus]}`}>{p.statusLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

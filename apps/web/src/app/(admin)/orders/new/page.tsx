import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { OrderForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tạo đơn hàng" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ enrollmentId?: string; leadId?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:create")) return <NoAccess title="Tạo đơn hàng" perm="finance:create" />;
  const [ref, methods, courses, draft] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.finance.methods({ activeOnly: true }),
    caller.catalog.courseOptions(),
    sp.enrollmentId ? caller.finance.orderDraft({ enrollmentId: sp.enrollmentId }).catch(() => null) : Promise.resolve(null),
  ]);
  const leadDraft = !sp.enrollmentId && sp.leadId ? await caller.finance.orderDraftFromLead({ leadId: sp.leadId }).catch(() => null) : null;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const listPrices = await caller.catalog.courses({ active: true });
  return (
    <div className="max-w-5xl space-y-4">
      <Link href="/orders" className="text-sm text-ink-600">← Đơn hàng</Link>
      <PageHeader title="Tạo đơn hàng" desc="Đơn học phí nên tạo từ đăng ký học (tự điền phụ huynh, học viên, khoá và giá gói theo số buổi). CCCD / địa chỉ chỉ lưu ở phần riêng tư và luôn được che." />
      {draft?.existingOrders.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Đăng ký này đã có đơn: {draft.existingOrders.map((o) => <Link key={o.id} href={`/orders/${o.id}`} className="ml-1 font-mono font-semibold underline">{o.code}</Link>)}
        </div>
      ) : null}
      {sp.leadId && !leadDraft && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Không mở được lead để tạo đơn (không tồn tại hoặc không có quyền).</div>}
      {leadDraft?.existingOrders.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Lead này đã có đơn: {leadDraft.existingOrders.map((o) => <Link key={o.id} href={`/orders/${o.id}`} className="ml-1 font-mono font-semibold underline">{o.code}</Link>)}
        </div>
      ) : null}
      <OrderForm
        centers={ref.centers}
        methods={methods.map((m) => ({ id: m.id, name: m.name, centerId: m.centerId, allowFor: m.allowFor, kind: m.kind }))}
        courses={courses.filter((c) => c.isActive).map((c) => ({ ...c, listPrice: listPrices.find((x) => x.id === c.id)?.listPrice ?? 0 }))}
        today={today}
        draft={draft ? {
          enrollmentId: draft.enrollmentId, centerId: draft.centerId, studentId: draft.studentId, studentName: draft.studentName, classCode: draft.classCode,
          courseId: draft.courseId, courseCode: draft.courseCode, packageSessions: draft.packageSessions, unitPrice: draft.unitPrice,
          parent: draft.parent,
        } : null}
        leadDraft={leadDraft ? {
          leadId: leadDraft.leadId, centerId: leadDraft.centerId, parentName: leadDraft.parentName, phone: leadDraft.phone, email: leadDraft.email,
          children: leadDraft.children, items: leadDraft.items,
        } : null}
      />
    </div>
  );
}

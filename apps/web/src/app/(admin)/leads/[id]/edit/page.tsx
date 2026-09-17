import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { LeadEditForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sửa thông tin lead" };

export default async function LeadEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const lead = await caller.admissions.leads.get({ id }).catch(() => null);
  if (!lead) notFound();
  const ref = await caller.academics.classes.referenceData();
  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/leads/${id}`} className="text-sm text-ink-600">← {lead.parentName}</Link>
      <PageHeader title="Sửa thông tin lead" desc="Đổi số điện thoại sẽ kiểm tra trùng với lead khác. Khoá quan tâm lấy theo từng con — sửa ở khối “Con của phụ huynh” bên dưới." />
      {!lead.perms.update ? (
        <div className="card p-6 text-sm text-ink-600">Bạn không có quyền sửa lead này.</div>
      ) : (
        <LeadEditForm
          lead={{
            id: lead.id, parentName: lead.parentName, phone: lead.phone, email: lead.email, centerId: lead.centerId, source: lead.source, notes: lead.notes,
            facebookUrl: lead.facebookUrl, childName: lead.childName, childGrade: lead.childGrade, courseCode: lead.course?.code ?? null, converted: !!lead.convertedAt,
            legacyChildName: lead.childName, children: lead.children,
          }}
          centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
          courses={ref.courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        />
      )}
    </div>
  );
}

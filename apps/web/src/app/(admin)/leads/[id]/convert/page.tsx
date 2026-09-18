import Link from "next/link";
import { notFound } from "next/navigation";
import { LEAD_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { ConvertForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển đổi lead" };

export default async function ConvertPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hocbong?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const lead = await caller.admissions.leads.get({ id }).catch(() => null);
  if (!lead) notFound();
  const [classes, courses, packages] = await Promise.all([
    caller.academics.classes.list({}),
    caller.catalog.courses({ active: true }),
    caller.catalog.coursePackageOptions().catch(() => []),
  ]);
  const byCode = new Map(courses.map((c) => [c.code, c] as const));
  return (
    <div className="max-w-5xl space-y-4">
      <Link href={`/leads/${id}`} className="text-sm text-ink-600">← {lead.parentName}</Link>
      <PageHeader title="Chuyển đổi lead → học viên" desc={`${lead.parentName} · ${lead.phone} · Trạng thái: ${LEAD_STATUS_VI[lead.status]}`} />
      {!lead.perms.convert ? (
        <div className="card p-6 text-sm text-ink-600">Bạn không có quyền ghi danh ở cơ sở của lead này.</div>
      ) : (
        <ConvertForm
          lead={{
            id: lead.id, parentName: lead.parentName, phone: lead.phone, email: lead.email, status: lead.status, centerId: lead.centerId, centerCode: lead.center?.code ?? null,
            childName: lead.childName, childGrade: lead.childGrade, courseCode: lead.course?.code ?? null,
            children: lead.children.map((c) => ({ id: c.id, fullName: c.fullName, grade: c.grade, courseCode: c.courseCode, converted: !!c.convertedStudentId })),
            payment: { paid: lead.payment.paid, total: lead.payment.total, outstanding: lead.payment.outstanding, recorded: lead.payment.recorded, orders: lead.payment.count, gate: lead.payment.gate },
            canCreateOrder: lead.perms.createOrder,
          }}
          classes={classes
            .filter((c) => c.status === "recruiting" || c.status === "running")
            .map((c) => {
              const course = byCode.get(c.courseCode);
              return { id: c.id, code: c.code, name: c.name, centerId: c.centerId, centerCode: c.centerCode, courseCode: c.courseCode, enrolled: c.enrolled, capacity: c.capacity, listPrice: course?.listPrice ?? null, totalSessions: course?.totalSessions ?? c.plannedSessions ?? null };
            })}
          packages={packages.map((p) => ({ id: p.id, courseCode: p.courseCode, name: p.name, sessions: p.sessions, price: p.price, savingPercent: p.savingPercent }))}
          scholarshipMode={sp.hocbong === "1"}
        />
      )}
    </div>
  );
}

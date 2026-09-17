import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { SurveyEditor } from "../editor";
import { DEFAULT_QUESTIONS } from "../defaults";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tạo khảo sát" };

export default async function NewSurveyPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:create")) return <NoAccess title="Tạo khảo sát" perm="care:create" />;
  const ref = await caller.academics.classes.referenceData();
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/khao-sat" className="text-sm text-ink-600">← Khảo sát</Link>
      <PageHeader title="Tạo khảo sát" desc="Có sẵn 3 câu mẫu (NPS, giáo viên, góp ý). Lưu nháp rồi kích hoạt để gửi." />
      <SurveyEditor locked={false} centers={ref.centers.map((c) => ({ id: c.id, code: c.code }))} initial={{ title: "", description: "Giúp Sata Robo phục vụ bé tốt hơn", centerId: ref.centers.length === 1 ? ref.centers[0]!.id : "", trigger: "manual", triggerValue: 4, questions: DEFAULT_QUESTIONS }} />
    </div>
  );
}

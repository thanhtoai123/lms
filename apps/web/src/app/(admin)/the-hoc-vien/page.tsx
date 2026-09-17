import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { ReissueCard, PrintButton } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thẻ học viên" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ class?: string; student?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "student:read")) return <NoAccess title="Thẻ học viên" perm="student:read" />;
  const classes = await caller.academics.classes.list({});
  const classId = sp.class && UUID.test(sp.class) ? sp.class : undefined;
  const studentId = sp.student && UUID.test(sp.student) ? sp.student : undefined;
  const cards = classId || studentId ? await caller.card.print({ classId, studentIds: studentId ? [studentId] : undefined }) : [];
  const canReissue = hasPermission(actor, "student:update");
  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-4">
        <PageHeader title="Thẻ học viên (QR)" desc="In thẻ theo lớp, ép plastic, phát cho học viên. Giáo viên mở buổi học trong app → “Quét thẻ QR” để điểm danh (quá 15 phút sau giờ bắt đầu tự ghi đi muộn). Mất thẻ: cấp lại — thẻ cũ hết hiệu lực ngay." actions={cards.length ? <PrintButton /> : null} />
        <form className="card flex flex-wrap items-end gap-2 p-3 text-sm">
          <label>Lớp<select name="class" defaultValue={classId ?? ""} className="input mt-1 min-w-[240px]"><option value="">— chọn lớp —</option>{classes.filter((c) => ["running", "recruiting"].includes(c.status)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
          <button className="btn-primary">Xem thẻ</button>
        </form>
      </div>
      {!cards.length ? <div className="print:hidden"><Empty>Chọn lớp để in thẻ.</Empty></div> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {cards.map((c) => (
            <div key={c.id} className="card flex flex-col items-center break-inside-avoid p-3 text-center print:border print:border-black/30 print:shadow-none">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">Sata Robo</div>
              <div className="w-40 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: c.svg }} />
              <div className="font-semibold">{c.fullName}</div>
              <div className="font-mono text-[11px] text-ink-600">{c.code ?? ""}{c.classCode ? ` · ${c.classCode}` : ""}</div>
              <div className="text-[10px] text-ink-400">{c.centerName ?? ""} · thẻ lần {c.cardVersion}</div>
              {canReissue && <div className="mt-2 print:hidden"><ReissueCard studentId={c.id} /></div>}
              <Link href={`/students/${c.id}`} className="mt-1 text-[11px] text-brand-600 print:hidden">Hồ sơ</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

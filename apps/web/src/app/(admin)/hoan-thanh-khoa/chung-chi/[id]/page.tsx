import { getServerCaller } from "@/lib/trpc/server";
import { PrintButton } from "./print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chứng chỉ" };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const c = await caller.learning.certificate({ id });
  const issued = c.issuedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="space-y-3">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <article className="mx-auto aspect-[1.414/1] max-w-4xl rounded-2xl border-8 border-double border-brand-600 bg-white p-10 text-center shadow-sm print:shadow-none">
        <div className="text-sm font-bold tracking-[0.3em] text-brand-600">SATA ROBO</div>
        <h1 className="mt-6 text-4xl font-extrabold text-brand-700">CHỨNG NHẬN HOÀN THÀNH KHOÁ HỌC</h1>
        <p className="mt-8 text-ink-600">Trân trọng chứng nhận học viên</p>
        <p className="mt-2 text-4xl font-bold">{c.studentName}</p>
        {c.dateOfBirth && <p className="mt-1 text-sm text-ink-600">Ngày sinh: {c.dateOfBirth.split("-").reverse().join("/")}</p>}
        <p className="mt-6 text-ink-600">đã hoàn thành khoá học</p>
        <p className="mt-2 text-2xl font-semibold">{c.courseName}</p>
        <p className="mt-1 text-sm text-ink-600">{c.totalSessions} buổi · Xếp loại: <b>{c.grade}</b></p>
        {c.revokedAt && <p className="mt-4 font-bold text-red-700">CHỨNG CHỈ ĐÃ BỊ THU HỒI</p>}
        <div className="mt-10 flex items-end justify-between text-sm">
          <div className="text-left"><div className="text-ink-400">Số chứng chỉ</div><div className="font-mono font-semibold">{c.certificateNo}</div></div>
          <div className="text-right"><div className="text-ink-400">{c.centerName}, ngày {issued}</div><div className="mt-10 font-semibold">Giám đốc trung tâm</div></div>
        </div>
      </article>
    </div>
  );
}

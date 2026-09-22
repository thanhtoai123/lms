import { headers } from "next/headers";
import { BadgeCheck, CircleX, ExternalLink } from "lucide-react";
import { getDb } from "@satarobo/db";
import { publicCertificate, type PublicCertificateResult } from "@satarobo/api";
import { CERTIFICATE_TOKEN_RE } from "@satarobo/core";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Xác thực giấy chứng nhận — Sata Robo" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer" as const,
};

type State = PublicCertificateResult | { state: "rate_limited" };

/**
 * Trang XÁC THỰC GIẤY CHỨNG NHẬN mở từ mã QR in trên giấy — không cần đăng nhập, token là quyền.
 * Kiểm định dạng token TRƯỚC khi chạm CSDL; trần tần suất theo IP chặn máy dò token.
 * Hiển thị đúng bộ trường tối thiểu của Open Badges 3.0: thành tích, điều kiện đạt, người nhận, ngày cấp,
 * mã định danh, đơn vị cấp, bằng chứng (hồ sơ học tập — chỉ khi đang có link chia sẻ còn hiệu lực).
 * KHÔNG hiện SĐT / email phụ huynh, ngày sinh, mã học viên, lý do thu hồi.
 */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let s: State = { state: "not_found" };
  if (CERTIFICATE_TOKEN_RE.test(token)) {
    const gate = await sharedRateLimit("certificateVerifyIp", "ip", clientIp(new Headers(await headers())), "cn-verify");
    s = gate ? { state: "rate_limited" } : await publicCertificate(getDb(), token);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-background px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 bg-gradient-to-br from-primary to-primary-darker px-5 py-4 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
          <div>
            <div className="text-lg font-extrabold">Sata Robo</div>
            <div className="text-xs text-white/80">Xác thực giấy chứng nhận</div>
          </div>
        </div>
        {s.state === "ok" ? <Verified cert={s.cert} /> : <Missing rateLimited={s.state === "rate_limited"} />}
      </div>
      <p className="mx-auto mt-4 max-w-xl px-2 text-center text-[11px] text-muted-foreground">
        Giấy chứng nhận hoàn thành do trung tâm Sata Robo cấp cho học viên các khoá kỹ năng STEM / Robotics — không phải văn bằng,
        chứng chỉ thuộc hệ thống giáo dục quốc dân. Thông tin trên trang này được đối chiếu trực tiếp với sổ chứng nhận của trung tâm.
      </p>
    </main>
  );
}

function Verified({ cert }: { cert: Extract<PublicCertificateResult, { state: "ok" }>["cert"] }) {
  const valid = cert.status === "valid";
  const tel = cert.issuer.phone ? cert.issuer.phone.replace(/[^\d+]/g, "") : "";
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${valid ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`} role="status">
        {valid ? <BadgeCheck className="h-7 w-7 shrink-0" aria-hidden /> : <CircleX className="h-7 w-7 shrink-0" aria-hidden />}
        <div>
          <div className="text-lg font-extrabold">{valid ? "Hợp lệ" : "Đã thu hồi"}</div>
          <div className="text-sm">
            {valid
              ? "Giấy chứng nhận này do trung tâm cấp và đang còn hiệu lực."
              : `Giấy chứng nhận này đã bị trung tâm thu hồi${cert.revokedDate ? ` ngày ${cert.revokedDate}` : ""} và không còn giá trị.`}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cert.kindLabel}</div>
        <h1 className="text-xl font-extrabold text-primary">{cert.achievement}</h1>
        {cert.description && <p className="mt-1 text-sm text-foreground/80">{cert.description}</p>}
      </div>

      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted-foreground">Người nhận</dt>
        <dd className="text-base font-bold">{cert.recipient}</dd>
        <dt className="text-muted-foreground">Điều kiện đạt</dt>
        <dd>
          {cert.criteriaText}
          {cert.courses.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {cert.courses.map((c) => <li key={c.code} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-primary">{c.name}</li>)}
            </ul>
          )}
        </dd>
        <dt className="text-muted-foreground">Ngày cấp</dt>
        <dd>{cert.issuedDate}</dd>
        <dt className="text-muted-foreground">Số chứng nhận</dt>
        <dd className="font-mono font-semibold">{cert.number}</dd>
        <dt className="text-muted-foreground">Đơn vị cấp</dt>
        <dd>
          <div className="font-semibold">{cert.issuer.name}</div>
          <div>{cert.issuer.centerName}</div>
          {cert.issuer.address && <div className="text-foreground/80">{cert.issuer.address}</div>}
          {cert.issuer.phone && <a href={`tel:${tel}`} className="font-semibold text-primary underline">{cert.issuer.phone}</a>}
        </dd>
      </dl>

      {valid && cert.portfolioPath && (
        <a href={cert.portfolioPath} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow hover:bg-primary-dark">
          Xem hồ sơ học tập <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      )}
    </div>
  );
}

function Missing({ rateLimited }: { rateLimited: boolean }) {
  return (
    <div className="space-y-2 p-6 text-center">
      <h1 className="text-lg font-bold text-foreground">{rateLimited ? "Vui lòng thử lại sau ít phút" : "Không tìm thấy giấy chứng nhận"}</h1>
      <p className="text-sm text-muted-foreground">
        {rateLimited
          ? "Trang được mở quá nhiều lần trong thời gian ngắn từ cùng một mạng."
          : "Mã QR có thể bị mờ hoặc liên kết bị thiếu ký tự. Hãy quét lại mã trên giấy chứng nhận, hoặc liên hệ trung tâm để được xác nhận."}
      </p>
    </div>
  );
}

import Link from "next/link";
import { getDb } from "@satarobo/db";
import { publicJobs } from "@satarobo/api";
import { DEPARTMENT_VI, EMPLOYMENT_TYPE_VI, type Department, type EmploymentType } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";
import { PageHero, viDate } from "@/components/site/page-hero";
import { salaryLabel } from "./salary";

export const revalidate = 120;
export const metadata = { title: { absolute: "Tuyển dụng — TH STEAM Academy" }, alternates: { canonical: "/tuyen-dung" }, description: "Cùng TH STEAM Academy dạy Robotics, AI, Thiết kế đồ họa và Lập trình online cho học sinh 8–18 tuổi trên toàn quốc. Xem vị trí đang tuyển và nộp hồ sơ." };

export default async function JobsPublicPage() {
  const items = await publicJobs(getDb());
  return (
    <PublicShell landing>
      <SiteTracker />
      <PageHero
        crumbs={[{ label: "Trang chủ", href: "/" }, { label: "Tuyển dụng" }]}
        title="Cùng mang công nghệ đến các bạn nhỏ"
        lead="TH STEAM Academy tìm giáo viên và cộng sự dạy Robotics, AI, Thiết kế đồ họa và Lập trình online cho học sinh trên toàn quốc."
        meta={[{ text: `${items.length} vị trí đang tuyển`, gold: true }, { text: "Làm việc trực tuyến" }, { text: "Giáo trình và đào tạo sẵn" }]}
      />
      <section className="lp-sec lp-page">
        <div className="lp-wrap">
          {items.length === 0 ? (
            <div className="lp-empty"><strong>Hiện chưa có vị trí đang tuyển</strong>Bạn quay lại sau, hoặc gửi giới thiệu bản thân qua hotline 0971 29 30 31.</div>
          ) : (
            <ul className="lp-jobs">
              {items.map((j) => (
                <li key={j.slug}>
                  <Link href={`/tuyen-dung/${j.slug}`} className="lp-job">
                    <div>
                      <h2>{j.title}</h2>
                      <p className="lp-job-sub">{DEPARTMENT_VI[j.department as Department] ?? j.department} · {j.centerName ?? "Toàn hệ thống"}</p>
                      <ul className="lp-tags">
                        <li className="is-green">{salaryLabel(j)}</li>
                        <li>{EMPLOYMENT_TYPE_VI[j.employmentType as EmploymentType]}</li>
                        <li>Cần {j.openings} người</li>
                        {j.deadline && <li className="is-gold">Hạn nộp {viDate(j.deadline)}</li>}
                      </ul>
                    </div>
                    <span className="lp-job-go">Xem và ứng tuyển →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
